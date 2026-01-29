#!/bin/bash
# Copy staging table to production with deduplication
# Uses the same logic as backfill_v3_hybrid.py

set -e

PROJECT_ID="gen-lang-client-0299056258"
DATASET="polycopy_v1"
STAGING_TABLE="${PROJECT_ID}.${DATASET}.trades_staging"
PRODUCTION_TABLE="${PROJECT_ID}.${DATASET}.trades"

echo "=========================================="
echo "Copying Staging to Production with Deduplication"
echo "=========================================="
echo ""

# Step 1: Check staging table count
echo "Step 1: Checking staging table..."
STAGING_COUNT=$(bq query --use_legacy_sql=false --format=csv "SELECT COUNT(*) as cnt FROM \`${STAGING_TABLE}\`" 2>&1 | tail -1)
echo "  Staging table: ${STAGING_COUNT:,} rows"
echo ""

if [ "$STAGING_COUNT" -eq "0" ]; then
    echo "❌ No data in staging table!"
    exit 1
fi

# Step 2: Check production table count (before)
echo "Step 2: Checking production table (before)..."
PROD_COUNT_BEFORE=$(bq query --use_legacy_sql=false --format=csv "SELECT COUNT(*) as cnt FROM \`${PRODUCTION_TABLE}\`" 2>&1 | tail -1)
echo "  Production table (before): ${PROD_COUNT_BEFORE:,} rows"
echo ""

# Step 3: Copy with deduplication
echo "Step 3: Copying with deduplication..."
echo "  This will:"
echo "    • Deduplicate on 'id' field"
echo "    • Keep latest record (ORDER BY timestamp DESC)"
echo "    • Insert only new records"
echo "  This may take several minutes..."
echo ""

COPY_QUERY="
INSERT INTO \`${PRODUCTION_TABLE}\`
SELECT *
FROM \`${STAGING_TABLE}\`
QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp DESC) = 1
"

bq query --use_legacy_sql=false --project_id=${PROJECT_ID} "${COPY_QUERY}" 2>&1

echo ""
echo "✅ Copy complete!"
echo ""

# Step 4: Check production table count (after)
echo "Step 4: Checking production table (after)..."
PROD_COUNT_AFTER=$(bq query --use_legacy_sql=false --format=csv "SELECT COUNT(*) as cnt FROM \`${PRODUCTION_TABLE}\`" 2>&1 | tail -1)
echo "  Production table (after): ${PROD_COUNT_AFTER:,} rows"
echo ""

# Step 5: Calculate deduplication stats
NEW_ROWS=$((PROD_COUNT_AFTER - PROD_COUNT_BEFORE))
DUPLICATES=$((STAGING_COUNT - NEW_ROWS))

echo "=========================================="
echo "✅ Summary"
echo "=========================================="
echo "  Staging rows: ${STAGING_COUNT:,}"
echo "  Production before: ${PROD_COUNT_BEFORE:,}"
echo "  Production after: ${PROD_COUNT_AFTER:,}"
echo "  New rows added: ${NEW_ROWS:,}"
echo "  Duplicates removed: ${DUPLICATES:,}"
echo ""

if [ "$DUPLICATES" -gt 0 ]; then
    echo "✅ Deduplication worked! Removed ${DUPLICATES:,} duplicate rows"
fi

echo ""
echo "Done! All trades are now in the production table."
