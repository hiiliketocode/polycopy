#!/bin/bash

# Configuration
PROJECT_ID="gen-lang-client-0299056258"
JOB_NAME="dome-backfill-job"
REGION="us-central1"
DATASET="polycopy_v1"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}=== Backfill Job Progress Monitor ===${NC}\n"

# Get latest execution
LATEST_EXEC=$(gcloud run jobs executions list \
    --job=${JOB_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --limit=1 \
    --format="value(name)" 2>/dev/null)

if [ -z "$LATEST_EXEC" ]; then
    echo -e "${YELLOW}No executions found.${NC}"
    exit 1
fi

echo -e "${CYAN}Latest Execution: ${LATEST_EXEC}${NC}\n"

# Check execution status
STATUS=$(gcloud run jobs executions describe ${LATEST_EXEC} \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(status.conditions[?(@.type=='Completed')].status)" 2>/dev/null)

if [ "$STATUS" = "True" ]; then
    echo -e "${GREEN}✓ Job Completed${NC}\n"
elif [ "$STATUS" = "False" ]; then
    echo -e "${YELLOW}⚠ Job Failed${NC}\n"
else
    echo -e "${CYAN}→ Job Running...${NC}\n"
fi

# Get progress from logs
echo -e "${BLUE}--- Recent Progress (from logs) ---${NC}"
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME} AND labels.\"run.googleapis.com/execution_name\"=${LATEST_EXEC}" \
    --limit=50 \
    --project=${PROJECT_ID} \
    --format="value(textPayload)" \
    --freshness=10m 2>/dev/null | \
    grep -E "(Processing Wallet|Wallet complete|Batch Upload|trades|Found|Uploading|Complete)" | \
    tail -10 | \
    sed 's/^/  /'

echo ""

# Query BigQuery for actual counts
echo -e "${BLUE}--- Current Data in BigQuery ---${NC}"

# Trades count
TRADES_COUNT=$(bq query --use_legacy_sql=false --format=csv --project_id=${PROJECT_ID} \
    "SELECT COUNT(*) as cnt FROM \`${PROJECT_ID}.${DATASET}.trades\`" 2>/dev/null | tail -1)
if [ ! -z "$TRADES_COUNT" ] && [ "$TRADES_COUNT" != "cnt" ]; then
    echo -e "  ${GREEN}Trades:${NC} $(printf "%'d" ${TRADES_COUNT})"
else
    echo -e "  ${YELLOW}Trades:${NC} Unable to query"
fi

# Markets count
MARKETS_COUNT=$(bq query --use_legacy_sql=false --format=csv --project_id=${PROJECT_ID} \
    "SELECT COUNT(*) as cnt FROM \`${PROJECT_ID}.${DATASET}.markets\`" 2>/dev/null | tail -1)
if [ ! -z "$MARKETS_COUNT" ] && [ "$MARKETS_COUNT" != "cnt" ]; then
    echo -e "  ${GREEN}Markets:${NC} $(printf "%'d" ${MARKETS_COUNT})"
else
    echo -e "  ${YELLOW}Markets:${NC} Unable to query"
fi

# Events count
EVENTS_COUNT=$(bq query --use_legacy_sql=false --format=csv --project_id=${PROJECT_ID} \
    "SELECT COUNT(*) as cnt FROM \`${PROJECT_ID}.${DATASET}.events\`" 2>/dev/null | tail -1)
if [ ! -z "$EVENTS_COUNT" ] && [ "$EVENTS_COUNT" != "cnt" ]; then
    echo -e "  ${GREEN}Events:${NC} $(printf "%'d" ${EVENTS_COUNT})"
else
    echo -e "  ${YELLOW}Events:${NC} Unable to query"
fi

# Unique wallets with trades
WALLETS_WITH_TRADES=$(bq query --use_legacy_sql=false --format=csv --project_id=${PROJECT_ID} \
    "SELECT COUNT(DISTINCT wallet_address) as cnt FROM \`${PROJECT_ID}.${DATASET}.trades\`" 2>/dev/null | tail -1)
if [ ! -z "$WALLETS_WITH_TRADES" ] && [ "$WALLETS_WITH_TRADES" != "cnt" ]; then
    echo -e "  ${GREEN}Wallets with trades:${NC} $(printf "%'d" ${WALLETS_WITH_TRADES})"
fi

echo ""
echo -e "${CYAN}--- View Live Logs ---${NC}"
echo -e "  Run: ${YELLOW}./monitor-backfill.sh${NC}"
echo -e "  Or: ${YELLOW}gcloud logging tail \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --project=${PROJECT_ID}${NC}"
