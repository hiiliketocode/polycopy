#!/bin/bash

# Configuration
PROJECT_ID="gen-lang-client-0299056258"
REGION="us-central1"
JOB_NAME="dome-backfill-job"
DOME_API_KEY="bee6330e5f143b9de00363c368bcd9a7290fd7c7"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Executing Dome Backfill Job ===${NC}\n"

# Execute the job
echo -e "${YELLOW}Starting job execution...${NC}"
EXECUTION_NAME=$(gcloud run jobs execute ${JOB_NAME} \
    --region=${REGION} \
    --project=${PROJECT_ID} \
    --format="value(metadata.name)" \
    2>&1)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Job started successfully!${NC}"
    echo -e "Execution name: ${EXECUTION_NAME}"
    echo -e "\n${BLUE}=== Monitoring Commands ===${NC}"
    echo -e "\n1. Watch logs in real-time:"
    echo -e "   ${YELLOW}./monitor-backfill.sh${NC}"
    echo -e "\n2. Check job status:"
    echo -e "   ${YELLOW}gcloud run jobs executions describe ${EXECUTION_NAME} --region=${REGION} --project=${PROJECT_ID}${NC}"
    echo -e "\n3. View recent logs:"
    echo -e "   ${YELLOW}gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}\" --limit=100 --project=${PROJECT_ID}${NC}"
    echo -e "\n4. View logs in Cloud Console:"
    echo -e "   ${YELLOW}https://console.cloud.google.com/run/detail/${REGION}/${JOB_NAME}/logs?project=${PROJECT_ID}${NC}"
else
    echo -e "${RED}Failed to start job. Make sure it's deployed first with: ./deploy-backfill.sh${NC}"
    exit 1
fi
