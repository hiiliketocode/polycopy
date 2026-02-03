#!/bin/bash

# Deploy script for incremental sync of trades, markets, and events
# Runs every 30 minutes to keep data up-to-date

set -e

PROJECT_ID="gen-lang-client-0299056258"
REGION="us-central1"
REPOSITORY="polycopy-backfill"
IMAGE_NAME="incremental-sync-trades-markets"
JOB_NAME="incremental-sync-trades-markets"
SERVICE_ACCOUNT="supabase-polyscore-api@${PROJECT_ID}.iam.gserviceaccount.com"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}=== Deploying Incremental Sync Job (Every 30 Minutes) ===${NC}\n"

# Check for required environment variables
if [ -z "$DOME_API_KEY" ]; then
    echo -e "${RED}Error: DOME_API_KEY is required${NC}"
    echo "Please set it: export DOME_API_KEY='your-api-key'"
    exit 1
fi

if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    echo -e "${YELLOW}Warning: NEXT_PUBLIC_SUPABASE_URL not set. User wallets from Supabase will be skipped.${NC}"
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${YELLOW}Warning: SUPABASE_SERVICE_ROLE_KEY not set. User wallets from Supabase will be skipped.${NC}"
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

# Step 3: Create Dockerfile for incremental sync
echo -e "\n${YELLOW}Step 3: Creating Dockerfile...${NC}"
cat > Dockerfile.incremental-sync <<EOF
FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy daily sync script (it already handles incremental sync)
COPY daily-sync-trades-markets.py .

# Copy stats sync script (for inline stats sync)
COPY sync-trader-stats-from-bigquery.py .

# Run with unbuffered output
CMD ["python", "-u", "daily-sync-trades-markets.py"]
EOF

# Step 4: Build Docker image
echo -e "\n${YELLOW}Step 4: Building Docker image...${NC}"
docker build --platform linux/amd64 -f Dockerfile.incremental-sync \
    -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest .

# Step 5: Push image
echo -e "\n${YELLOW}Step 5: Pushing image to Artifact Registry...${NC}"
docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest

# Step 6: Deploy Cloud Run Job
echo -e "\n${YELLOW}Step 6: Deploying Cloud Run Job...${NC}"
gcloud run jobs deploy ${JOB_NAME} \
    --image=${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --service-account=${SERVICE_ACCOUNT} \
    --max-retries=2 \
    --task-timeout=1800 \
    --tasks=1 \
    --parallelism=1 \
    --set-env-vars="DOME_API_KEY=${DOME_API_KEY},NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL:-},SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY:-}" \
    --memory=2Gi \
    --cpu=2

# Step 7: Grant BigQuery permissions (if not already granted)
echo -e "\n${YELLOW}Step 7: Ensuring BigQuery permissions...${NC}"
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/bigquery.dataEditor" 2>/dev/null || echo "BigQuery dataEditor permission already set"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT}" \
    --role="roles/bigquery.jobUser" 2>/dev/null || echo "BigQuery jobUser permission already set"

# Step 8: Create Cloud Scheduler for every 30 minutes
echo -e "\n${YELLOW}Step 8: Setting up Cloud Scheduler (runs every 30 minutes)...${NC}"
SCHEDULER_NAME="incremental-sync-trades-markets"

# Delete existing scheduler if it exists (ignore errors)
gcloud scheduler jobs delete ${SCHEDULER_NAME} \
    --location=${REGION} \
    --project=${PROJECT_ID} 2>/dev/null || echo "Scheduler doesn't exist or already deleted, continuing..."

# Create scheduler to run every 30 minutes
gcloud scheduler jobs create http ${SCHEDULER_NAME} \
    --location=${REGION} \
    --schedule="*/30 * * * *" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email=${SERVICE_ACCOUNT} \
    --project=${PROJECT_ID} \
    --description="Incremental sync of trades, markets, and events every 30 minutes. Fetches all trades since last checkpoint for all wallets." \
    --time-zone="UTC" \
    --headers="Content-Type=application/json" \
    --message-body='{}'

echo -e "\n${GREEN}=== Deployment Complete! ===${NC}"
echo -e "\n✅ Job deployed: ${JOB_NAME}"
echo -e "✅ Scheduler created: ${SCHEDULER_NAME} (runs every 30 minutes)"
echo -e "\nThe job will:"
echo -e "  • Fetch all wallets from traders table and Supabase"
echo -e "  • Get trades since last checkpoint timestamp"
echo -e "  • Fetch new markets and events"
echo -e "  • Update open markets"
echo -e "  • Use MERGE to avoid duplicates"
echo -e "\n${YELLOW}To test immediately (run manually):${NC}"
echo -e "  gcloud run jobs execute ${JOB_NAME} --region=${REGION} --project=${PROJECT_ID}"
echo -e "\n${YELLOW}To view logs:${NC}"
echo -e "  gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --limit=50 --project=${PROJECT_ID} --format=json"
echo -e "\n${YELLOW}To check checkpoint status:${NC}"
echo -e "  bq query --use_legacy_sql=false \"SELECT last_sync_time, trades_fetched, markets_fetched, events_fetched FROM \\\`gen-lang-client-0299056258.polycopy_v1.daily_sync_checkpoint\\\` ORDER BY last_sync_time DESC LIMIT 5\""
echo -e "\n${YELLOW}To check latest trades:${NC}"
echo -e "  bq query --use_legacy_sql=false \"SELECT MAX(timestamp) as latest_trade, TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(timestamp), MINUTE) as minutes_ago FROM \\\`gen-lang-client-0299056258.polycopy_v1.trades\\\`\""

# Cleanup temp Dockerfile
rm -f Dockerfile.incremental-sync
