#!/bin/bash
# Deploy script to fetch missing markets/events

set -e

PROJECT_ID="gen-lang-client-0299056258"
REGION="us-central1"
REPOSITORY="polycopy-backfill"
IMAGE_NAME="fetch-markets-events"
JOB_NAME="fetch-markets-events"
SERVICE_ACCOUNT="supabase-polyscore-api@${PROJECT_ID}.iam.gserviceaccount.com"

echo "=== Deploying Markets/Events Fetcher to Cloud Run ==="
echo ""

# Check for DOME_API_KEY
if [ -z "$DOME_API_KEY" ]; then
    echo "⚠️  Warning: DOME_API_KEY not set. Will need to set it in Cloud Run job."
fi

# Step 1: Authenticate Docker
echo "Step 1: Authenticating Docker..."
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

# Step 2: Build Docker image
echo ""
echo "Step 2: Building Docker image..."
docker build --platform linux/amd64 -f Dockerfile.markets \
    -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest .

# Step 3: Push image
echo ""
echo "Step 3: Pushing image..."
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest

# Step 4: Deploy Cloud Run Job
echo ""
echo "Step 4: Deploying Cloud Run Job..."
gcloud run jobs deploy ${JOB_NAME} \
    --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --service-account=${SERVICE_ACCOUNT} \
    --max-retries=1 \
    --task-timeout=1800 \
    --tasks=1 \
    --parallelism=1 \
    --set-env-vars="DOME_API_KEY=${DOME_API_KEY:-}" \
    --memory=2Gi \
    --cpu=2

echo ""
echo "=== Deployment Complete! ==="
echo ""
echo "To execute:"
echo "  gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID}"
echo ""
echo "To view logs:"
echo "  gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --limit=50 --project=${PROJECT_ID}"
