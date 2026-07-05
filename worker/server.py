"""
Cloud Run GPU worker — HTTP server wrapping ComfyUI.

Cloud Run sends an HTTP POST; we run the matching workflow graph and return the
output inline. ComfyUI is started once on cold start and reused while the
instance stays warm.

  POST /generate
  { "modality":"image"|"video"|"voice",
    "prompt":"...",
    "params": { "width":1024,"height":1024,"seconds":5,"voice":"af_heart","seed":0 } }
  -> { "modality":..., "ext":"png", "b64":"..." }

  GET /health -> 200 once ComfyUI answers (used by Cloud Run startup probe).
"""
import json, os, time, uuid, base64, subprocess, threading, urllib.request, urllib.parse
import websocket  # websocket-client
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel

# Shared secret. Set WORKER_SECRET on the Cloud Run service; the web backend sends it.
WORKER_SECRET = os.environ.get("WORKER_SECRET", "")

COMFY_HOST = "127.0.0.1:8188"
WORKFLOW_DIR = os.environ.get("WORKFLOW_DIR", "/workflows")
_ready = threading.Event()


def _start_comfy():
    subprocess.Popen(
        ["python", "/ComfyUI/main.py", "--listen", "127.0.0.1", "--port", "8188"],
        cwd="/ComfyUI",
    )
    for _ in range(600):  # model load on GPU can be slow on cold start
        try:
            urllib.request.urlopen(f"http://{COMFY_HOST}/system_stats", timeout=2)
            _ready.set()
            print("ComfyUI up")
            return
        except Exception:
            time.sleep(1)
    print("ComfyUI failed to start")


def _apply_params(wf, prompt, params):
    raw = json.dumps(wf)
    seed = params.get("seed") or int.from_bytes(os.urandom(4), "big")
    repl = {
        "$PROMPT": prompt.replace('"', "'"),
        "$SEED": str(seed),
        "$WIDTH": str(params.get("width", 1024)),
        "$HEIGHT": str(params.get("height", 1024)),
        "$FRAMES": str(int(params.get("seconds", 5) * 24) + 1),
        "$VOICE": params.get("voice", "af_heart"),
    }
    for k, v in repl.items():
        raw = raw.replace(k, v)
    return json.loads(raw)


def _run(modality, prompt, params):
    with open(os.path.join(WORKFLOW_DIR, f"{modality}.json")) as f:
        wf = _apply_params(json.load(f), prompt, params)

    client_id = str(uuid.uuid4())
    body = json.dumps({"prompt": wf, "client_id": client_id}).encode()
    req = urllib.request.Request(
        f"http://{COMFY_HOST}/prompt", data=body,
        headers={"Content-Type": "application/json"},
    )
    prompt_id = json.loads(urllib.request.urlopen(req).read())["prompt_id"]

    ws = websocket.WebSocket()
    ws.connect(f"ws://{COMFY_HOST}/ws?clientId={client_id}")
    while True:
        msg = ws.recv()
        if not isinstance(msg, str):
            continue
        m = json.loads(msg)
        d = m.get("data", {})
        if m.get("type") == "executing" and d.get("node") is None and d.get("prompt_id") == prompt_id:
            break
    ws.close()

    h = json.loads(urllib.request.urlopen(f"http://{COMFY_HOST}/history/{prompt_id}").read())[prompt_id]
    for node in h["outputs"].values():
        for key in ("images", "gifs", "audio", "videos"):
            if key in node:
                f = node[key][0]
                q = urllib.parse.urlencode(
                    {"filename": f["filename"], "subfolder": f.get("subfolder", ""),
                     "type": f.get("type", "output")}
                )
                data = urllib.request.urlopen(f"http://{COMFY_HOST}/view?{q}").read()
                return data, f["filename"].split(".")[-1]
    raise RuntimeError("no output produced")


app = FastAPI()


@app.on_event("startup")
def _boot():
    threading.Thread(target=_start_comfy, daemon=True).start()


class Job(BaseModel):
    modality: str
    prompt: str
    params: dict = {}


@app.get("/health")
def health():
    return {"ready": _ready.is_set()}


@app.post("/generate")
def generate(job: Job, x_worker_secret: str = Header(default="")):
    if WORKER_SECRET and x_worker_secret != WORKER_SECRET:
        raise HTTPException(401, "bad secret")
    if job.modality not in ("image", "video", "voice"):
        raise HTTPException(400, "bad modality")
    if not _ready.wait(timeout=300):
        raise HTTPException(503, "comfy not ready")
    data, ext = _run(job.modality, job.prompt, job.params or {})
    return {"modality": job.modality, "ext": ext, "b64": base64.b64encode(data).decode()}
