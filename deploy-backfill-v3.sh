#!/bin/bash

# Deploy script for backfill_v3_hybrid.py
# Optimized for speed, reliability, and auto-restart

set -e

PROJECT_ID="gen-lang-client-0299056258"
REGION="us-central1"
REPOSITORY="polycopy-backfill"
IMAGE_NAME="backfill-v3"
JOB_NAME="dome-backfill-v3"
SERVICE_ACCOUNT="supabase-polyscore-api@${PROJECT_ID}.iam.gserviceaccount.com"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Deploying Backfill v3 (Hybrid) to Cloud Run ===${NC}\n"

# Check for DOME_API_KEY
if [ -z "$DOME_API_KEY" ]; then
    echo -e "${YELLOW}Warning: DOME_API_KEY not set. Will need to set it in Cloud Run job.${NC}"
fi

# Step 1: Authenticate Docker
echo -e "${YELLOW}Step 1: Authenticating Docker...${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

# Step 2: Ensure Artifact Registry exists
echo -e "\n${YELLOW}Step 2: Ensuring Artifact Registry repository...${NC}"
gcloud artifacts repositories create ${REPOSITORY} \
    --repository-format=docker \
    --location=${REGION} \
    --project=${PROJECT_ID} 2>/dev/null || echo "Repository exists, continuing..."

# Step 3: Build Docker image (use backfill_v3_hybrid.py)
echo -e "\n${YELLOW}Step 3: Building Docker image...${NC}"
# Create temporary Dockerfile that uses v3
cat > Dockerfile.v3 <<EOF
FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy v3 script
COPY backfill_v3_hybrid.py backfill.py

# Run with unbuffered output
CMD ["python", "-u", "backfill.py"]
EOF

docker build --platform linux/amd64 -f Dockerfile.v3 \
    -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest .

# Step 4: Push image
echo -e "\n${YELLOW}Step 4: Pushing image...${NC}"
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest

# Step 5: Deploy Cloud Run Job with optimized settings
echo -e "\n${YELLOW}Step 5: Deploying Cloud Run Job...${NC}"
gcloud run jobs deploy ${JOB_NAME} \
    --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --service-account=${SERVICE_ACCOUNT} \
    --max-retries=3 \
    --task-timeout=86400 \
    --tasks=1 \
    --parallelism=1 \
    --set-env-vars="DOME_API_KEY=${DOME_API_KEY:-},USE_STAGING_TABLE=true,MAX_WORKERS=10,API_RATE_LIMIT_DELAY=0.05,VERIFY_CHECKPOINTS=true" \
    --memory=4Gi \
    --cpu=4

# Step 6: Create Cloud Scheduler for auto-restart
echo -e "\n${YELLOW}Step 6: Setting up Cloud Scheduler for auto-restart...${NC}"
SCHEDULER_NAME="backfill-v3-auto-restart"

# Delete existing scheduler if it exists
gcloud scheduler jobs delete ${SCHEDULER_NAME} \
    --location=${REGION} \
    --project=${PROJECT_ID} 2>/dev/null || true

# Create scheduler to run every 30 minutes
gcloud scheduler jobs create http ${SCHEDULER_NAME} \
    --location=${REGION} \
    --schedule="*/30 * * * *" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email=${SERVICE_ACCOUNT} \
    --project=${PROJECT_ID} \
    --description="Auto-restart backfill v3 job every 30 minutes if not running" \
    --time-zone="America/Los_Angeles"

echo -e "\n${GREEN}=== Deployment Complete! ===${NC}"
echo -e "\nJob will automatically restart every 30 minutes via Cloud Scheduler."
echo -e "It will resume exactly where it left off using checkpoint table."
echo -e "\nTo execute manually:"
echo -e "  ${YELLOW}gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID}${NC}"
echo -e "\nTo view logs:"
echo -e "  ${YELLOW}gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --limit=50 --project=${PROJECT_ID}${NC}"

# Cleanup temp Dockerfile
rm -f Dockerfile.v3
