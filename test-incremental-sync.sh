#!/bin/bash

# Test script for incremental sync job
# Runs the job manually and monitors progress

PROJECT_ID="gen-lang-client-0299056258"
REGION="us-central1"
JOB_NAME="incremental-sync-trades-markets"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Testing Incremental Sync Job ===${NC}\n"

# Step 1: Check current state
echo -e "${YELLOW}Step 1: Checking current state...${NC}"
echo -e "\n📊 Latest trade timestamp:"
bq query --use_legacy_sql=false --format=prettyjson --project_id=${PROJECT_ID} \
    "SELECT MAX(timestamp) as latest_trade, TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(timestamp), MINUTE) as minutes_ago FROM \`gen-lang-client-0299056258.polycopy_v1.trades\`" 2>&1 | grep -A 2 "latest_trade\|minutes_ago" || echo "  (No trades found)"

echo -e "\n📅 Last checkpoint:"
bq query --use_legacy_sql=false --format=prettyjson --project_id=${PROJECT_ID} \
    "SELECT last_sync_time, trades_fetched, markets_fetched, events_fetched, wallets_processed FROM \`gen-lang-client-0299056258.polycopy_v1.daily_sync_checkpoint\` ORDER BY last_sync_time DESC LIMIT 1" 2>&1 | grep -A 5 "last_sync_time\|trades_fetched\|markets_fetched\|events_fetched\|wallets_processed" || echo "  (No checkpoint found)"

# Step 2: Execute the job
echo -e "\n${YELLOW}Step 2: Executing job manually...${NC}"
EXECUTION_NAME=$(gcloud run jobs execute ${JOB_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(metadata.name)" 2>&1)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Job execution started: ${EXECUTION_NAME}${NC}"
else
    echo -e "${RED}❌ Failed to start job execution${NC}"
    exit 1
fi

# Step 3: Wait and monitor
echo -e "\n${YELLOW}Step 3: Monitoring job execution (this may take a few minutes)...${NC}"
echo -e "Waiting for job to start..."

# Wait for job to be running
sleep 5

# Check execution status
for i in {1..60}; do
    STATUS=$(gcloud run jobs executions describe ${EXECUTION_NAME} \
        --job=${JOB_NAME} \
        --region=${REGION} \
        --project=${PROJECT_ID} \
        --format="value(status.conditions[0].type):value(status.conditions[0].status)" 2>&1)
    
    if echo "$STATUS" | grep -q "Complete.*True"; then
        echo -e "${GREEN}✅ Job completed!${NC}"
        break
    elif echo "$STATUS" | grep -q "Failed\|False"; then
        echo -e "${RED}❌ Job failed${NC}"
        break
    fi
    
    if [ $i -eq 1 ]; then
        echo -n "  Status: "
    fi
    echo -n "."
    sleep 5
done

echo ""

# Step 4: Check results
echo -e "\n${YELLOW}Step 4: Checking results...${NC}"

echo -e "\n📊 Latest trade timestamp (after sync):"
bq query --use_legacy_sql=false --format=prettyjson --project_id=${PROJECT_ID} \
    "SELECT MAX(timestamp) as latest_trade, TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(timestamp), MINUTE) as minutes_ago FROM \`gen-lang-client-0299056258.polycopy_v1.trades\`" 2>&1 | grep -A 2 "latest_trade\|minutes_ago" || echo "  (No trades found)"

echo -e "\n📅 Latest checkpoint (after sync):"
bq query --use_legacy_sql=false --format=prettyjson --project_id=${PROJECT_ID} \
    "SELECT last_sync_time, trades_fetched, markets_fetched, events_fetched, wallets_processed, sync_duration_seconds FROM \`gen-lang-client-0299056258.polycopy_v1.daily_sync_checkpoint\` ORDER BY last_sync_time DESC LIMIT 1" 2>&1 | grep -A 6 "last_sync_time\|trades_fetched\|markets_fetched\|events_fetched\|wallets_processed\|sync_duration" || echo "  (No checkpoint found)"

# Step 5: Show logs
echo -e "\n${YELLOW}Step 5: Recent logs (last 20 lines):${NC}"
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME} AND resource.labels.location=${REGION}" \
    --limit=20 \
    --project=${PROJECT_ID} \
    --format="table(timestamp, textPayload)" \
    --freshness=10m 2>&1 | tail -20

echo -e "\n${BLUE}=== Test Complete ===${NC}"
echo -e "\nTo view full logs:"
echo -e "  gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --limit=100 --project=${PROJECT_ID}"
