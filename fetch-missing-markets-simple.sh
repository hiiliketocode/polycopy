#!/bin/bash
# Fetch missing markets/events using bq and curl
# Simpler approach that doesn't need Python libraries

set -e

PROJECT_ID="gen-lang-client-0299056258"
DATASET="polycopy_v1"
DOME_API_KEY="${DOME_API_KEY}"

if [ -z "$DOME_API_KEY" ]; then
    echo "❌ DOME_API_KEY not set"
    exit 1
fi

echo "=========================================="
echo "Fetching Missing Markets from Dome API"
echo "=========================================="
echo ""

# Step 1: Get missing condition_ids
echo "Step 1: Finding missing condition_ids..."
MISSING_IDS=$(bq query --use_legacy_sql=false --format=csv "
SELECT DISTINCT t.condition_id
FROM \`${PROJECT_ID}.${DATASET}.trades\` t
LEFT JOIN \`${PROJECT_ID}.${DATASET}.markets\` m ON t.condition_id = m.condition_id
WHERE t.condition_id IS NOT NULL
  AND m.condition_id IS NULL
LIMIT 1000
" 2>&1 | tail -n +2)

MISSING_COUNT=$(echo "$MISSING_IDS" | wc -l | xargs)
echo "  Found ${MISSING_COUNT} missing condition_ids"
echo ""

if [ "$MISSING_COUNT" -eq "0" ]; then
    echo "✅ All condition_ids already have markets!"
    exit 0
fi

echo "⚠️  Note: This script fetches markets but loading to BigQuery"
echo "   requires Python libraries. Consider running fetch-missing-markets-events.py"
echo "   in Cloud Run where dependencies are installed."
echo ""
echo "Or use the backfill script's Phase 3 by ensuring it runs for all wallets."
echo ""

# For now, just show what needs to be fetched
echo "Missing condition_ids (first 10):"
echo "$MISSING_IDS" | head -10
echo ""

echo "To fetch these markets, you can:"
echo "  1. Run fetch-missing-markets-events.py in Cloud Run"
echo "  2. Or ensure backfill Phase 3 runs for all wallets"
echo ""
