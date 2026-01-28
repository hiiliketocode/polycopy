#!/bin/bash

# Configuration
PROJECT_ID="gen-lang-client-0299056258"
REGION="us-central1"
REPOSITORY="polycopy-backfill"
IMAGE_NAME="backfill-job"
JOB_NAME="dome-backfill-job"
SERVICE_ACCOUNT="supabase-polyscore-api@${PROJECT_ID}.iam.gserviceaccount.com"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Deploying Dome Backfill Job to Cloud Run ===${NC}\n"

# Step 1: Authenticate Docker with Artifact Registry
echo -e "${YELLOW}Step 1: Authenticating Docker with Artifact Registry...${NC}"
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Step 2: Create Artifact Registry repository if it doesn't exist
echo -e "\n${YELLOW}Step 2: Ensuring Artifact Registry repository exists...${NC}"
gcloud artifacts repositories create ${REPOSITORY} \
    --repository-format=docker \
    --location=${REGION} \
    --project=${PROJECT_ID} 2>/dev/null || echo "Repository already exists, continuing..."

# Step 3: Build the Docker image
echo -e "\n${YELLOW}Step 3: Building Docker image...${NC}"
docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest .

# Step 4: Push the image to Artifact Registry
echo -e "\n${YELLOW}Step 4: Pushing image to Artifact Registry...${NC}"
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest

# Step 5: Deploy as Cloud Run Job
echo -e "\n${YELLOW}Step 5: Deploying Cloud Run Job...${NC}"
gcloud run jobs deploy ${JOB_NAME} \
    --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --service-account=${SERVICE_ACCOUNT} \
    --max-retries=0 \
    --task-timeout=86400 \
    --tasks=1 \
    --set-env-vars="DOME_API_KEY=${DOME_API_KEY}" \
    --memory=2Gi \
    --cpu=2

echo -e "\n${GREEN}=== Deployment Complete! ===${NC}"
echo -e "\nTo execute the job, run:"
echo -e "  ${YELLOW}gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID}${NC}"
echo -e "\nTo view logs, run:"
echo -e "  ${YELLOW}gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --limit=50 --project=${PROJECT_ID}${NC}"
