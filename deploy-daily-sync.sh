#!/bin/bash

# Deploy script for daily-sync-trades-markets.py
# Runs incremental sync of trades, markets, and events daily

set -e

PROJECT_ID="gen-lang-client-0299056258"
REGION="us-central1"
REPOSITORY="polycopy-backfill"
IMAGE_NAME="daily-sync-trades-markets"
JOB_NAME="daily-sync-trades-markets"
SERVICE_ACCOUNT="supabase-polyscore-api@${PROJECT_ID}.iam.gserviceaccount.com"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Deploying Daily Sync Job to Cloud Run ===${NC}\n"

# Check for required environment variables
if [ -z "$DOME_API_KEY" ]; then
    echo -e "${YELLOW}Warning: DOME_API_KEY not set. Will need to set it in Cloud Run job.${NC}"
fi

if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    echo -e "${YELLOW}Warning: NEXT_PUBLIC_SUPABASE_URL not set. User wallets will be skipped.${NC}"
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${YELLOW}Warning: SUPABASE_SERVICE_ROLE_KEY not set. User wallets will be skipped.${NC}"
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

# Step 3: Create Dockerfile for daily sync
echo -e "\n${YELLOW}Step 3: Creating Dockerfile...${NC}"
cat > Dockerfile.daily-sync <<EOF
FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy daily sync script
COPY daily-sync-trades-markets.py .

# Run with unbuffered output
CMD ["python", "-u", "daily-sync-trades-markets.py"]
EOF

# Step 4: Build Docker image
echo -e "\n${YELLOW}Step 4: Building Docker image...${NC}"
docker build --platform linux/amd64 -f Dockerfile.daily-sync \
    -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest .

# Step 5: Push image
echo -e "\n${YELLOW}Step 5: Pushing image...${NC}"
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest

# Step 6: Deploy Cloud Run Job
echo -e "\n${YELLOW}Step 6: Deploying Cloud Run Job...${NC}"
gcloud run jobs deploy ${JOB_NAME} \
    --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --service-account=${SERVICE_ACCOUNT} \
    --max-retries=3 \
    --task-timeout=3600 \
    --tasks=1 \
    --parallelism=1 \
    --set-env-vars="DOME_API_KEY=${DOME_API_KEY:-},NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-},SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY:-}" \
    --memory=2Gi \
    --cpu=2

# Step 7: Grant BigQuery permissions (if not already granted)
echo -e "\n${YELLOW}Step 7: Ensuring BigQuery permissions...${NC}"
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/bigquery.dataEditor" 2>/dev/null || echo "Permissions already set"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/bigquery.jobUser" 2>/dev/null || echo "Permissions already set"

# Step 8: Create Cloud Scheduler for daily execution
echo -e "\n${YELLOW}Step 8: Setting up Cloud Scheduler for daily execution...${NC}"
SCHEDULER_NAME="daily-sync-trades-markets"

# Delete existing scheduler if it exists
gcloud scheduler jobs delete ${SCHEDULER_NAME} \
    --location=${REGION} \
    --project=${PROJECT_ID} 2>/dev/null || true

# Create scheduler to run daily at 2 AM UTC
gcloud scheduler jobs create http ${SCHEDULER_NAME} \
    --location=${REGION} \
    --schedule="0 2 * * *" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email=${SERVICE_ACCOUNT} \
    --project=${PROJECT_ID} \
    --description="Daily incremental sync of trades, markets, and events" \
    --time-zone="UTC" \
    --headers="Content-Type=application/json" \
    --message-body='{}'

echo -e "\n${GREEN}=== Deployment Complete! ===${NC}"
echo -e "\nJob will automatically run daily at 2 AM UTC via Cloud Scheduler."
echo -e "It will sync new trades since the last checkpoint."
echo -e "\nTo execute manually:"
echo -e "  ${YELLOW}gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID}${NC}"
echo -e "\nTo view logs:"
echo -e "  ${YELLOW}gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --limit=50 --project=${PROJECT_ID}${NC}"
echo -e "\nTo check checkpoint:"
echo -e "  ${YELLOW}bq query --use_legacy_sql=false \"SELECT * FROM \\\`gen-lang-client-0299056258.polycopy_v1.daily_sync_checkpoint\\\` ORDER BY last_sync_time DESC LIMIT 1\"${NC}"

# Cleanup temp Dockerfile
rm -f Dockerfile.daily-sync
