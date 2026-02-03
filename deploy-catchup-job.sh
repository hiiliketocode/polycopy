#!/bin/bash

# Deploy catch-up job to fill gap from Jan 29 to Feb 2

set -e

PROJECT_ID="gen-lang-client-0299056258"
REGION="us-central1"
REPOSITORY="polycopy-backfill"
IMAGE_NAME="catchup-trades-gap"
JOB_NAME="catchup-trades-gap"
SERVICE_ACCOUNT="supabase-polyscore-api@${PROJECT_ID}.iam.gserviceaccount.com"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Deploying Catch-Up Job ===${NC}\n"

if [ -z "$DOME_API_KEY" ]; then
    echo -e "${YELLOW}Warning: DOME_API_KEY not set${NC}"
fi

# Step 1: Authenticate Docker
echo -e "${YELLOW}Step 1: Authenticating Docker...${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

# Step 2: Create Dockerfile
echo -e "\n${YELLOW}Step 2: Creating Dockerfile...${NC}"
cat > Dockerfile.catchup <<EOF
FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy catch-up script
COPY catchup-trades-gap.py .

# Run with unbuffered output
CMD ["python", "-u", "catchup-trades-gap.py"]
EOF

# Step 3: Build Docker image
echo -e "\n${YELLOW}Step 3: Building Docker image...${NC}"
docker build --platform linux/amd64 -f Dockerfile.catchup \
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
    --max-retries=1 \
    --task-timeout=10800 \
    --tasks=1 \
    --parallelism=1 \
    --set-env-vars="DOME_API_KEY=${DOME_API_KEY:-}" \
    --memory=4Gi \
    --cpu=4

echo -e "\n${GREEN}=== Deployment Complete! ===${NC}"
echo -e "\nTo execute the catch-up job:"
echo -e "  ${YELLOW}gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID}${NC}"
echo -e "\nThis will backfill all trades from Jan 29, 2026 04:22:50 UTC onwards."

# Cleanup
rm -f Dockerfile.catchup
