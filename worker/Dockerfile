# Runpod serverless worker: ComfyUI + FLUX.1-schnell (image), LTX-Video (video), Kokoro (voice)
# Base: Runpod CUDA image with Python + torch preinstalled.
FROM runpod/base:0.6.2-cuda12.1.0

WORKDIR /

# --- System deps ---
RUN apt-get update && apt-get install -y git ffmpeg libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

# --- ComfyUI ---
RUN git clone https://github.com/comfyanonymous/ComfyUI.git /ComfyUI
RUN pip install --no-cache-dir -r /ComfyUI/requirements.txt

# --- Custom nodes ---
# LTX-Video sampling ships in ComfyUI core (LTXV* nodes). These two are custom:
#   - VideoHelperSuite: VHS_VideoCombine (mp4 muxing) used by workflows/video.json
#   - comfyui-kokoro: KokoroGenerate used by workflows/voice.json
RUN git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git /ComfyUI/custom_nodes/ComfyUI-VideoHelperSuite && \
    pip install --no-cache-dir -r /ComfyUI/custom_nodes/ComfyUI-VideoHelperSuite/requirements.txt || true
RUN git clone https://github.com/stavsap/comfyui-kokoro.git /ComfyUI/custom_nodes/comfyui-kokoro && \
    pip install --no-cache-dir -r /ComfyUI/custom_nodes/comfyui-kokoro/requirements.txt || true

# --- Worker deps ---
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" requests websocket-client pydantic

# --- Model download at BUILD time (bake into image so cold start is fast) ---
# NOTE: models are large. For dev, comment these out and use a Runpod network volume instead.
COPY download_models.sh /download_models.sh
RUN chmod +x /download_models.sh && /download_models.sh

# --- Pin torch to a CUDA 12.1 build ---
# Cloud Run's L4 host driver is CUDA 12.2; ComfyUI's requirements pull a cu124 torch
# that fails with "driver too old". cu121 wheels run fine on the 12.2 driver.
# Placed AFTER the model-download layer so that big layer stays cached on rebuild.
RUN pip install --no-cache-dir --force-reinstall \
    torch==2.5.1 torchvision==0.20.1 torchaudio==2.5.1 \
    --index-url https://download.pytorch.org/whl/cu121

# --- HTTP server (Cloud Run) ---
COPY server.py /server.py
COPY workflows /workflows
ENV WORKFLOW_DIR=/workflows

# Cloud Run sends traffic to $PORT (default 8080).
ENV PORT=8080
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT} --app-dir /"]
