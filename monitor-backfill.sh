#!/bin/bash

# Configuration
PROJECT_ID="gen-lang-client-0299056258"
REGION="us-central1"
JOB_NAME="dome-backfill-job"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Monitoring Dome Backfill Job ===${NC}\n"
echo -e "Press Ctrl+C to stop monitoring\n"

# Function to get latest execution
get_latest_execution() {
    gcloud run jobs executions list \
        --job=${JOB_NAME} \
        --region=${REGION} \
        --project=${PROJECT_ID} \
        --limit=1 \
        --format="value(metadata.name)" 2>/dev/null
}

# Function to get execution status
get_execution_status() {
    local exec_name=$1
    gcloud run jobs executions describe ${exec_name} \
        --region=${REGION} \
        --project=${PROJECT_ID} \
        --format="value(status.conditions[0].type,status.conditions[0].status)" 2>/dev/null
}

# Get latest execution
LATEST_EXEC=$(get_latest_execution)

if [ -z "$LATEST_EXEC" ]; then
    echo -e "${YELLOW}No executions found. The job may not have been run yet.${NC}"
    echo -e "Run it with: ./run-backfill.sh"
    exit 1
fi

echo -e "${GREEN}Latest execution: ${LATEST_EXEC}${NC}\n"

# Monitor logs with tail
echo -e "${BLUE}Streaming logs (last 50 lines)...${NC}\n"
gcloud logging tail "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}" \
    --project=${PROJECT_ID} \
    --format="table(timestamp,textPayload)" \
    --limit=50
