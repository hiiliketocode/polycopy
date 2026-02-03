#!/bin/bash

# Complete setup script - loads env vars and deploys incremental sync

set -e

PROJECT_DIR="/Users/rawdonmessenger/PolyCopy"
cd "$PROJECT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Complete Incremental Sync Setup ===${NC}\n"

# Step 1: Load environment variables from .env.local
echo -e "${YELLOW}Step 1: Loading environment variables from .env.local...${NC}"

if [ ! -f .env.local ]; then
    echo -e "${RED}❌ Error: .env.local file not found!${NC}"
    echo "Please create .env.local with:"
    echo "  DOME_API_KEY=your-key"
    echo "  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co"
    echo "  SUPABASE_SERVICE_ROLE_KEY=your-key"
    exit 1
fi

# Load variables from .env.local (handles comments and empty lines)
export $(grep -v '^#' .env.local | grep -v '^$' | xargs)

# Verify required variables
if [ -z "$DOME_API_KEY" ]; then
    echo -e "${RED}❌ Error: DOME_API_KEY not found in .env.local${NC}"
    exit 1
fi

echo -e "${GREEN}✅ DOME_API_KEY: ${DOME_API_KEY:0:10}...${NC}"

if [ -z "$NEXT_PUBLIC_SUPABASE_URL" ]; then
    echo -e "${YELLOW}⚠️  NEXT_PUBLIC_SUPABASE_URL not set (optional - user wallets will be skipped)${NC}"
else
    echo -e "${GREEN}✅ NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}${NC}"
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${YELLOW}⚠️  SUPABASE_SERVICE_ROLE_KEY not set (optional - user wallets will be skipped)${NC}"
else
    echo -e "${GREEN}✅ SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY:0:10}...${NC}"
fi

# Step 2: Verify gcloud is authenticated
echo -e "\n${YELLOW}Step 2: Verifying Google Cloud authentication...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1 > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not authenticated with gcloud${NC}"
    echo "Please run: gcloud auth login"
    exit 1
fi

ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1)
echo -e "${GREEN}✅ Authenticated as: ${ACTIVE_ACCOUNT}${NC}"

# Step 3: Verify Docker is running
echo -e "\n${YELLOW}Step 3: Verifying Docker is running...${NC}"
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker is not running${NC}"
    echo "Please start Docker Desktop"
    exit 1
fi
echo -e "${GREEN}✅ Docker is running${NC}"

# Step 4: Run deployment script
echo -e "\n${YELLOW}Step 4: Deploying incremental sync job...${NC}"
echo -e "${BLUE}This will take a few minutes (building Docker image, pushing, deploying)...${NC}\n"

# Export variables for the deployment script
export DOME_API_KEY
export NEXT_PUBLIC_SUPABASE_URL
export SUPABASE_SERVICE_ROLE_KEY

# Run the deployment script
./deploy-incremental-sync.sh

# Step 5: Test the deployment
echo -e "\n${YELLOW}Step 5: Testing the deployment...${NC}"
echo -e "${BLUE}Running test script to verify everything works...${NC}\n"

./test-incremental-sync.sh

echo -e "\n${GREEN}=== Setup Complete! ===${NC}"
echo -e "\n✅ Incremental sync job is now running every 30 minutes"
echo -e "✅ It will fetch all trades since the last checkpoint"
echo -e "✅ Markets and events will be updated without duplicates"
echo -e "\nTo check status:"
echo -e "  ${BLUE}./test-incremental-sync.sh${NC}"
echo -e "\nTo view logs:"
echo -e "  ${BLUE}gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=incremental-sync-trades-markets\" --limit=50 --project=gen-lang-client-0299056258${NC}"
