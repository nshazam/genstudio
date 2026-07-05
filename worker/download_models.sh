#!/usr/bin/env bash
# Download open-weight, COMMERCIAL-LICENSE-SAFE models into ComfyUI dirs.
# All three below are Apache-2.0 => output is yours to sell.
set -e
C=/ComfyUI/models

mkdir -p $C/checkpoints $C/vae $C/clip $C/unet $C/text_encoders $C/kokoro

# ---- Image: FLUX.1-schnell (Apache-2.0) ----
# fp8 single-file build keeps VRAM ~12GB.
wget -c -O $C/checkpoints/flux1-schnell-fp8.safetensors \
  "https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors"

# ---- Video: LTX-Video 2B (Apache-2.0) ----
wget -c -O $C/checkpoints/ltx-video-2b-v0.9.5.safetensors \
  "https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltx-video-2b-v0.9.5.safetensors"
# LTX needs a T5 text encoder:
wget -c -O $C/text_encoders/t5xxl_fp8_e4m3fn.safetensors \
  "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors"

# ---- Voice: Kokoro-82M (Apache-2.0) ----
wget -c -O $C/kokoro/kokoro-v1_0.pth \
  "https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/kokoro-v1_0.pth"
wget -c -O $C/kokoro/voices-v1_0.bin \
  "https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/voices/af_heart.pt" || true

echo "models done"
