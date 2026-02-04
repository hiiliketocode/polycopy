#!/bin/bash
# ============================================================================
# Daily Refresh Script: i_wish_i_copied_that Table
# Purpose: Run incremental update daily to add new trades
# Usage: Run via cron or Cloud Scheduler
# ============================================================================

set -e  # Exit on error

# Configuration
PROJECT_ID="gen-lang-client-0299056258"
DATASET="polycopy_v1"
TABLE="i_wish_i_copied_that"
SQL_FILE="create-i-wish-i-copied-that-incremental.sql"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================================================"
echo "Daily Refresh: $DATASET.$TABLE"
echo "Timestamp: $(date)"
echo "============================================================================"

# Check if SQL file exists
if [ ! -f "$SQL_FILE" ]; then
    echo -e "${RED}ERROR: SQL file not found: $SQL_FILE${NC}"
    exit 1
fi

# Run incremental update
echo -e "${YELLOW}Running incremental update...${NC}"
bq query \
    --use_legacy_sql=false \
    --project_id="$PROJECT_ID" \
    --format=prettyjson \
    < "$SQL_FILE"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Incremental update completed successfully${NC}"
    
    # Get count of new trades added
    NEW_COUNT=$(bq query \
        --use_legacy_sql=false \
        --project_id="$PROJECT_ID" \
        --format=csv \
        --max_rows=1 \
        "SELECT COUNT(*) as new_trades FROM \`$PROJECT_ID.$DATASET.$TABLE\` WHERE DATE(created_at) = CURRENT_DATE()" \
        | tail -n +2)
    
    echo -e "${GREEN}New trades added today: $NEW_COUNT${NC}"
    
    # Get total unprocessed trades
    UNPROCESSED=$(bq query \
        --use_legacy_sql=false \
        --project_id="$PROJECT_ID" \
        --format=csv \
        --max_rows=1 \
        "SELECT COUNT(*) as unprocessed FROM \`$PROJECT_ID.$DATASET.$TABLE\` WHERE last_processed_at IS NULL" \
        | tail -n +2)
    
    echo -e "${GREEN}Total unprocessed trades: $UNPROCESSED${NC}"
else
    echo -e "${RED}✗ Incremental update failed${NC}"
    exit 1
fi

echo "============================================================================"
echo "Refresh completed: $(date)"
echo "============================================================================"
