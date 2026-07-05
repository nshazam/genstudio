# GenStudio — self-hosted image + video + voice SaaS

A Higgsfield-style generation product you own end-to-end. No paid inference API.
You run open-weight, **Apache-2.0** models (output is legally yours to resell) on
**Cloud Run GPU** (scale-to-zero: pay per second of generation, nothing when idle),
funded by your **$300 GCP credits**, and sell access via credits.

```
User ─▶ Next.js (Vercel) ─▶ /api/generate ─▶ Cloud Run GPU, L4 (ComfyUI)
          │  Supabase auth + credit ledger        │  FLUX-schnell / LTX-Video / Kokoro
          │  Stripe billing                        ▼   (private, ID-token auth)
          └────────────────────────────── R2 storage ─▶ URL ─▶ user
```

## Models (all Apache-2.0 → safe to sell output)
| Modality | Model | Notes |
|---|---|---|
| Image | FLUX.1-schnell | 4-step, ~2-4s/gen on L4 |
| Video | LTX-Video 2B | fast T2V, 5s clips, ~60-90s on L4 |
| Voice | Kokoro-82M | tiny, ~1-2s/gen |

Do **not** swap in FLUX-dev (non-commercial) or any OpenRAIL/CC-NC model — that
breaks your right to sell the output.

## Repo layout
- `worker/` — Cloud Run GPU container. ComfyUI + models + `server.py` (HTTP).
- `web/`    — Next.js app: auth, credits, Stripe, generate UI.

---
## Bring-up order

### 1. Prototype the models for FREE first (before spending a credit)
Open `worker/prototype.ipynb` in Google Colab (T4 GPU) → Run all. It installs the
same ComfyUI + custom nodes and runs the **actual** `worker/workflows/*.json`.
If a node errors, fix the graph in the ComfyUI UI, **Save (API Format)**, and
overwrite the JSON — that export is the source of truth `server.py` runs.

### 2. Deploy the GPU worker (Cloud Run, uses your GCP credits)
```
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
# Request GPU quota: Console → Quotas → "Total Nvidia L4 GPU allocation, per project per region"
#   in us-central1 → raise to ≥1 (usually granted fast).
export WORKER_SECRET=$(openssl rand -hex 24)   # remember this; web needs the same value
cd worker && bash deploy.sh
```
`deploy.sh` builds via Cloud Build (no local Docker/GPU needed), deploys with an
L4 GPU, scale-to-zero, private. It prints the **Worker URL** → put in `web/.env.local`.
Then grant your web service account `roles/run.invoker` (command in `deploy.sh`).
Tip: models are baked into the image (simple, bigger image). For faster cold starts
later, move them to a GCS volume mount instead.

### 3. Database (Supabase, free tier)
Create a project → SQL editor → paste `web/supabase/schema.sql` → run.
Gives: profiles, credit ledger, jobs, atomic `spend_credits`/`add_credits`, RLS,
auto-profile-on-signup trigger.

### 4. Storage (Cloudflare R2, free tier 10GB)
Create bucket `genstudio`, an S3 API token, bind a public domain. Fill R2_* env.

### 5. Billing (Stripe)
Create 3 credit-pack Prices. `/app/billing` has the buy buttons; `/api/checkout`
opens Checkout; `/api/webhooks/stripe` grants credits on `checkout.session.completed`.
Fill STRIPE_* env, register the webhook.

### 6. Web app
```
cd web
cp .env.example .env.local   # fill everything (incl. WORKER_URL, WORKER_SECRET, SA JSON)
npm install
npm run dev                  # http://localhost:3000/signin then /generate
```
Deploy to Vercel. Set the same env vars there. Point the Stripe webhook at the Vercel URL.
Note: video gen can exceed Vercel Hobby's 60s function limit — use Pro (300s) or
move video onto a queue.

---
## Unit economics (know this cold)
- Cloud Run L4 GPU instance ≈ **$0.60-0.70/hr while active**, **$0 idle** (scale-to-zero).
- image ≈ 3s → ~$0.0006 · video 5s clip ≈ 60-90s → ~$0.012-0.014 · voice ≈ 2s → ~$0.0004.
  (These are *cheaper* than Runpod A100 because L4 is a smaller card and Cloud Run
  bills per-second at instance rate.)
- Sell credits ~**$0.10** each. `web/lib/pricing.ts`: image=1, voice=1, video=5 credits.
  → gross margin ~95%+, **before** cold-start overhead.
- Cold start (model load into GPU) is the real tax: ~30-90s on first request after idle.
  Keep `--min-instances 0` (free when idle) and accept it, OR set `--min-instances 1`
  only while actively selling (≈ $470/mo — watch your credits) to keep it warm.

## Where your $300 GCP credits go
Everything: Cloud Run GPU serving + Cloud Build + Artifact Registry. Supabase/R2/Stripe
are separate free tiers. $300 ≈ ~450 active GPU-hours = thousands of generations for launch.
Fund ongoing serving from revenue once credits run low.

## Honest status of this scaffold
Runnable skeleton, not turnkey. What still needs your hands:
1. Verify/replace the 3 workflow JSONs from a live ComfyUI export (step 1).
2. Confirm the Kokoro custom-node class name (`KokoroGenerate`) matches the node installed.
3. First real end-to-end test = image (cheapest) → voice → video.
4. GPU quota approval in GCP before `deploy.sh` will succeed.
```
