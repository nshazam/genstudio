#!/usr/bin/env bash
# Deploy the worker to Cloud Run with an NVIDIA L4 GPU. Funded by your GCP credits.
# Prereq once:
#   gcloud auth login
#   gcloud config set project YOUR_PROJECT_ID
#   gcloud services enable run.googleapis.com artifactregistry.googleapis.com
#   # Request GPU quota: Console -> IAM & Admin -> Quotas -> "Total Nvidia L4 GPU allocation,
#   # per project per region" in a GPU region (e.g. us-central1) -> raise to >=1. Usually granted fast.
set -e

PROJECT=$(gcloud config get-value project)
REGION=us-central1                 # must be a Cloud Run GPU region
REPO=genstudio
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPO/worker:latest"

# 1. Artifact Registry repo (one time; ignore error if it exists)
gcloud artifacts repositories create $REPO \
  --repository-format=docker --location=$REGION 2>/dev/null || true

# 2. Build the image with Cloud Build (no local Docker/GPU needed)
gcloud builds submit --tag "$IMAGE" .

# 3. Deploy to Cloud Run with GPU, scale-to-zero
gcloud run deploy genstudio-worker \
  --image "$IMAGE" \
  --region "$REGION" \
  --gpu 1 --gpu-type nvidia-l4 \
  --cpu 8 --memory 32Gi \
  --no-cpu-throttling \
  --concurrency 1 \
  --min-instances 0 \
  --max-instances 3 \
  --timeout 900 \
  --port 8080 \
  --no-allow-unauthenticated \
  --set-env-vars "WORKER_SECRET=$WORKER_SECRET"   # export WORKER_SECRET first; defense-in-depth header

# Grant the web backend's service account permission to invoke this private service:
#   gcloud run services add-iam-policy-binding genstudio-worker --region us-central1 \
#     --member="serviceAccount:WEB_SA@$PROJECT.iam.gserviceaccount.com" --role=roles/run.invoker

echo
echo "Worker URL:"
gcloud run services describe genstudio-worker --region "$REGION" --format='value(status.url)'
echo "Put that URL in web/.env.local as WORKER_URL"
