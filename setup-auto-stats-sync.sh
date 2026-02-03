#!/bin/bash

# Setup automatic stats sync after incremental sync completes
# Option 1: Separate Cloud Run Job triggered by Cloud Scheduler
# Option 2: Integrated into incremental sync (already done)

set -e

PROJECT_ID="gen-lang-client-0299056258"
REGION="us-central1"
SERVICE_ACCOUNT="supabase-polyscore-api@${PROJECT_ID}.iam.gserviceaccount.com"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Setting Up Automatic Stats Sync ===${NC}\n"

echo -e "${YELLOW}Option 1: Deploy as separate Cloud Run Job (Recommended)${NC}"
echo "This creates a separate job that runs after incremental sync completes."
echo ""

# Load env vars
export $(grep -v '^#' .env.local | grep -v '^$' | xargs)

# Deploy stats sync job
./deploy-stats-sync-job.sh

# Create Cloud Scheduler to run stats sync 5 minutes after incremental sync
echo -e "\n${YELLOW}Creating Cloud Scheduler to run stats sync after incremental sync...${NC}"
SCHEDULER_NAME="sync-trader-stats-after-incremental"

# Delete existing if exists
gcloud scheduler jobs delete ${SCHEDULER_NAME} \
    --location=${REGION} \
    --project=${PROJECT_ID} 2>/dev/null || true

# Create scheduler - runs 5 minutes after incremental sync (at :05 and :35 past each hour)
gcloud scheduler jobs create http ${SCHEDULER_NAME} \
    --location=${REGION} \
    --schedule="5,35 * * * *" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/sync-trader-stats-from-bigquery:run" \
    --http-method=POST \
    --oauth-service-account-email=${SERVICE_ACCOUNT} \
    --project=${PROJECT_ID} \
    --description="Sync trader stats from BigQuery to Supabase after incremental sync completes" \
    --time-zone="UTC" \
    --headers="Content-Type=application/json" \
    --message-body='{}'

echo -e "\n${GREEN}=== Setup Complete! ===${NC}"
echo -e "\n✅ Stats sync job deployed: sync-trader-stats-from-bigquery"
echo -e "✅ Scheduler created: ${SCHEDULER_NAME}"
echo -e "\nThe stats sync will run:"
echo -e "  • 5 minutes after incremental sync (at :05 and :35 past each hour)"
echo -e "  • Updates trader_global_stats table"
echo -e "  • Updates trader_profile_stats table"
echo -e "\n${YELLOW}Note:${NC} The incremental sync job also includes inline stats sync"
echo -e "as a backup. This separate job ensures stats are always updated even"
echo -e "if the inline sync times out."
