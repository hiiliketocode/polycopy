#!/bin/bash
# Deduplicate markets and events tables
# Markets: deduplicate on condition_id (keep latest by last_updated)
# Events: deduplicate on event_slug (keep latest by created_at)

set -e

PROJECT_ID="gen-lang-client-0299056258"
DATASET="polycopy_v1"
MARKETS_TABLE="${PROJECT_ID}.${DATASET}.markets"
EVENTS_TABLE="${PROJECT_ID}.${DATASET}.events"

echo "=========================================="
echo "Deduplicating Markets and Events Tables"
echo "=========================================="
echo ""

# ===== MARKETS =====
echo "MARKETS TABLE"
echo "============="
echo ""

# Check duplicates
echo "Step 1: Checking markets duplicates..."
MARKETS_CHECK=$(bq query --use_legacy_sql=false --format=csv "
SELECT 
    COUNT(*) as total,
    COUNT(DISTINCT condition_id) as unique_ids,
    COUNT(*) - COUNT(DISTINCT condition_id) as duplicates
FROM \`${MARKETS_TABLE}\`
" 2>&1 | tail -1)

MARKETS_TOTAL=$(echo $MARKETS_CHECK | cut -d',' -f1)
MARKETS_UNIQUE=$(echo $MARKETS_CHECK | cut -d',' -f2)
MARKETS_DUP=$(echo $MARKETS_CHECK | cut -d',' -f3)

echo "  Total: ${MARKETS_TOTAL}"
echo "  Unique condition_ids: ${MARKETS_UNIQUE}"
echo "  Duplicates: ${MARKETS_DUP}"
echo ""

if [ "$MARKETS_DUP" -gt "0" ]; then
    echo "Step 2: Deduplicating markets..."
    echo "  Keeping latest record per condition_id (ORDER BY last_updated DESC)"
    echo "  This may take a few minutes..."
    echo ""
    
    # Use CREATE OR REPLACE to deduplicate (markets table is not partitioned)
    MARKETS_DEDUP_QUERY="
    CREATE OR REPLACE TABLE \`${MARKETS_TABLE}\`
    AS
    SELECT *
    FROM \`${MARKETS_TABLE}\`
    QUALIFY ROW_NUMBER() OVER (PARTITION BY condition_id ORDER BY last_updated DESC) = 1
    "
    
    bq query --use_legacy_sql=false --project_id=${PROJECT_ID} "${MARKETS_DEDUP_QUERY}" 2>&1 | grep -v "Waiting\|Current status" || true
    
    echo ""
    echo "✅ Markets deduplication complete!"
    echo ""
    
    # Verify
    MARKETS_FINAL=$(bq query --use_legacy_sql=false --format=csv "
    SELECT COUNT(*) as total, COUNT(DISTINCT condition_id) as unique_ids
    FROM \`${MARKETS_TABLE}\`
    " 2>&1 | tail -1)
    
    MARKETS_FINAL_TOTAL=$(echo $MARKETS_FINAL | cut -d',' -f1)
    MARKETS_FINAL_UNIQUE=$(echo $MARKETS_FINAL | cut -d',' -f2)
    
    echo "  Final: ${MARKETS_FINAL_TOTAL} rows, ${MARKETS_FINAL_UNIQUE} unique"
    echo "  Removed: $((MARKETS_TOTAL - MARKETS_FINAL_TOTAL)) duplicates"
    echo ""
else
    echo "✅ Markets table already deduplicated!"
    echo ""
fi

# ===== EVENTS =====
echo "EVENTS TABLE"
echo "============"
echo ""

# Check duplicates
echo "Step 1: Checking events duplicates..."
EVENTS_CHECK=$(bq query --use_legacy_sql=false --format=csv "
SELECT 
    COUNT(*) as total,
    COUNT(DISTINCT event_slug) as unique_ids,
    COUNT(*) - COUNT(DISTINCT event_slug) as duplicates
FROM \`${EVENTS_TABLE}\`
" 2>&1 | tail -1)

EVENTS_TOTAL=$(echo $EVENTS_CHECK | cut -d',' -f1)
EVENTS_UNIQUE=$(echo $EVENTS_CHECK | cut -d',' -f2)
EVENTS_DUP=$(echo $EVENTS_CHECK | cut -d',' -f3)

echo "  Total: ${EVENTS_TOTAL}"
echo "  Unique event_slugs: ${EVENTS_UNIQUE}"
echo "  Duplicates: ${EVENTS_DUP}"
echo ""

if [ "$EVENTS_DUP" -gt "0" ]; then
    echo "Step 2: Deduplicating events..."
    echo "  Keeping latest record per event_slug (ORDER BY created_at DESC)"
    echo "  This may take a few minutes..."
    echo ""
    
    # Use CREATE OR REPLACE to deduplicate (events table is not partitioned)
    EVENTS_DEDUP_QUERY="
    CREATE OR REPLACE TABLE \`${EVENTS_TABLE}\`
    AS
    SELECT *
    FROM \`${EVENTS_TABLE}\`
    QUALIFY ROW_NUMBER() OVER (PARTITION BY event_slug ORDER BY created_at DESC) = 1
    "
    
    bq query --use_legacy_sql=false --project_id=${PROJECT_ID} "${EVENTS_DEDUP_QUERY}" 2>&1 | grep -v "Waiting\|Current status" || true
    
    echo ""
    echo "✅ Events deduplication complete!"
    echo ""
    
    # Verify
    EVENTS_FINAL=$(bq query --use_legacy_sql=false --format=csv "
    SELECT COUNT(*) as total, COUNT(DISTINCT event_slug) as unique_ids
    FROM \`${EVENTS_TABLE}\`
    " 2>&1 | tail -1)
    
    EVENTS_FINAL_TOTAL=$(echo $EVENTS_FINAL | cut -d',' -f1)
    EVENTS_FINAL_UNIQUE=$(echo $EVENTS_FINAL | cut -d',' -f2)
    
    echo "  Final: ${EVENTS_FINAL_TOTAL} rows, ${EVENTS_FINAL_UNIQUE} unique"
    echo "  Removed: $((EVENTS_TOTAL - EVENTS_FINAL_TOTAL)) duplicates"
    echo ""
else
    echo "✅ Events table already deduplicated!"
    echo ""
fi

# Summary
echo "=========================================="
echo "✅ Summary"
echo "=========================================="
echo ""
echo "Markets:"
echo "  Before: ${MARKETS_TOTAL} rows (${MARKETS_DUP} duplicates)"
if [ "$MARKETS_DUP" -gt "0" ]; then
    echo "  After: ${MARKETS_FINAL_TOTAL} rows (0 duplicates)"
fi
echo ""
echo "Events:"
echo "  Before: ${EVENTS_TOTAL} rows (${EVENTS_DUP} duplicates)"
if [ "$EVENTS_DUP" -gt "0" ]; then
    echo "  After: ${EVENTS_FINAL_TOTAL} rows (0 duplicates)"
fi
echo ""
echo "✅ All tables deduplicated!"
echo ""
