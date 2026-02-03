#!/bin/bash

# Deploy standalone stats sync job (runs after incremental sync)

set -e

PROJECT_ID="gen-lang-client-0299056258"
REGION="us-central1"
REPOSITORY="polycopy-backfill"
IMAGE_NAME="sync-trader-stats"
JOB_NAME="sync-trader-stats-from-bigquery"
SERVICE_ACCOUNT="supabase-polyscore-api@${PROJECT_ID}.iam.gserviceaccount.com"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Deploying Trader Stats Sync Job ===${NC}\n"

if [ -z "$DOME_API_KEY" ]; then
    echo -e "${YELLOW}Warning: DOME_API_KEY not set${NC}"
fi

if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${YELLOW}Warning: Supabase credentials not set - stats sync will be skipped${NC}"
fi

# Step 1: Authenticate Docker
echo -e "${YELLOW}Step 1: Authenticating Docker...${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

# Step 2: Create Dockerfile
echo -e "\n${YELLOW}Step 2: Creating Dockerfile...${NC}"
cat > Dockerfile.stats-sync <<EOF
FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy stats sync script
COPY sync-trader-stats-from-bigquery.py .

# Run with unbuffered output
CMD ["python", "-u", "sync-trader-stats-from-bigquery.py"]
EOF

# Step 3: Build Docker image
echo -e "\n${YELLOW}Step 3: Building Docker image...${NC}"
docker build --platform linux/amd64 -f Dockerfile.stats-sync \
    -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest .

# Step 4: Push image
echo -e "\n${YELLOW}Step 4: Pushing image...${NC}"
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest

# Step 5: Deploy Cloud Run Job
echo -e "\n${YELLOW}Step 5: Deploying Cloud Run Job...${NC}"
gcloud run jobs deploy ${JOB_NAME} \
    --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --service-account=${SERVICE_ACCOUNT} \
    --max-retries=2 \
    --task-timeout=1800 \
    --tasks=1 \
    --parallelism=1 \
    --set-env-vars="NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-},SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY:-}" \
    --memory=2Gi \
    --cpu=2

echo -e "\n${GREEN}=== Deployment Complete! ===${NC}"
echo -e "\nTo execute manually:"
echo -e "  ${YELLOW}gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID}${NC}"

# Cleanup
rm -f Dockerfile.stats-sync
