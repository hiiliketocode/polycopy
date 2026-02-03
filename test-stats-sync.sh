#!/bin/bash

# Test the stats sync job locally or remotely

set -e

PROJECT_ID="gen-lang-client-0299056258"
REGION="us-central1"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Testing Trader Stats Sync ===${NC}\n"

# Load env vars
export $(grep -v '^#' .env.local | grep -v '^$' | xargs)

# Check if tables exist
echo -e "${YELLOW}Step 1: Checking if tables exist in Supabase...${NC}"
echo "Please verify tables exist:"
echo "  - trader_global_stats"
echo "  - trader_profile_stats"
echo ""
echo "If not, run create-trader-stats-tables.sql in Supabase SQL Editor"
echo ""

# Test locally first
if [ "$1" == "local" ]; then
    echo -e "${YELLOW}Step 2: Testing locally...${NC}"
    python3 sync-trader-stats-from-bigquery.py
else
    echo -e "${YELLOW}Step 2: Executing Cloud Run Job...${NC}"
    EXECUTION=$(gcloud run jobs execute sync-trader-stats-from-bigquery \
        --region=${REGION} \
        --project=${PROJECT_ID} \
        --format="value(metadata.name)" 2>&1)
    
    echo -e "${GREEN}✅ Job started: ${EXECUTION}${NC}"
    echo ""
    echo -e "${YELLOW}Step 3: Waiting 15 seconds for logs...${NC}"
    sleep 15
    
    echo -e "\n${YELLOW}Recent logs:${NC}"
    gcloud logging read \
        "resource.type=cloud_run_job AND resource.labels.job_name=sync-trader-stats-from-bigquery" \
        --limit=50 \
        --project=${PROJECT_ID} \
        --format="table(timestamp,textPayload,jsonPayload.message)" \
        --freshness=5m 2>&1 | grep -E "(Step|✅|❌|⚠️|Error|error|Complete|Wallets|stats)" | head -30
    
    echo ""
    echo -e "${GREEN}=== Test Complete ===${NC}"
    echo ""
    echo "To view full logs:"
    echo "  gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=sync-trader-stats-from-bigquery\" --limit=100 --project=${PROJECT_ID}"
    echo ""
    echo "To check Supabase tables:"
    echo "  SELECT COUNT(*) FROM trader_global_stats;"
    echo "  SELECT COUNT(*) FROM trader_profile_stats;"
fi
