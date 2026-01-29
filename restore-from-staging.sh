#!/bin/bash
# Restore production table from staging with proper deduplication
# Uses TRUNCATE + INSERT to preserve partitioning

set -e

PROJECT_ID="gen-lang-client-0299056258"
DATASET="polycopy_v1"
STAGING_TABLE="${PROJECT_ID}.${DATASET}.trades_staging"
PRODUCTION_TABLE="${PROJECT_ID}.${DATASET}.trades"

echo "=========================================="
echo "Restoring Production Table from Staging"
echo "=========================================="
echo ""

# Step 1: Check staging
echo "Step 1: Checking staging table..."
STAGING_CHECK=$(bq query --use_legacy_sql=false --format=csv "
SELECT COUNT(*) as total, COUNT(DISTINCT id) as unique_ids
FROM \`${STAGING_TABLE}\`
" 2>&1 | tail -1)

STAGING_TOTAL=$(echo $STAGING_CHECK | cut -d',' -f1)
STAGING_UNIQUE=$(echo $STAGING_CHECK | cut -d',' -f2)

echo "  Staging: ${STAGING_TOTAL} rows, ${STAGING_UNIQUE} unique IDs"
echo ""

# Step 2: Truncate production (preserves schema/partitioning)
echo "Step 2: Truncating production table..."
echo "  (This preserves partitioning and schema)"
bq query --use_legacy_sql=false --project_id=${PROJECT_ID} "
TRUNCATE TABLE \`${PRODUCTION_TABLE}\`
" 2>&1 | grep -v "Waiting\|Current status" || true

echo "✅ Production table truncated"
echo ""

# Step 3: Insert deduplicated data from staging
echo "Step 3: Inserting deduplicated data from staging..."
echo "  This will:"
echo "    • Deduplicate on 'id' field"
echo "    • Keep latest record (ORDER BY timestamp DESC)"
echo "  This may take several minutes..."
echo ""

INSERT_QUERY="
INSERT INTO \`${PRODUCTION_TABLE}\`
SELECT *
FROM \`${STAGING_TABLE}\`
QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp DESC) = 1
"

bq query --use_legacy_sql=false --project_id=${PROJECT_ID} "${INSERT_QUERY}" 2>&1 | grep -v "Waiting\|Current status" || true

echo ""
echo "✅ Insert complete!"
echo ""

# Step 4: Verify
echo "Step 4: Verifying..."
FINAL_CHECK=$(bq query --use_legacy_sql=false --format=csv "
SELECT COUNT(*) as total, COUNT(DISTINCT id) as unique_ids, COUNT(*) - COUNT(DISTINCT id) as duplicates
FROM \`${PRODUCTION_TABLE}\`
" 2>&1 | tail -1)

FINAL_TOTAL=$(echo $FINAL_CHECK | cut -d',' -f1)
FINAL_UNIQUE=$(echo $FINAL_CHECK | cut -d',' -f2)
FINAL_DUP=$(echo $FINAL_CHECK | cut -d',' -f3)

echo "  Production: ${FINAL_TOTAL} rows, ${FINAL_UNIQUE} unique IDs, ${FINAL_DUP} duplicates"
echo ""

echo "=========================================="
echo "✅ Summary"
echo "=========================================="
echo "  Staging unique IDs: ${STAGING_UNIQUE}"
echo "  Production unique IDs: ${FINAL_UNIQUE}"
echo ""

if [ "$FINAL_UNIQUE" -eq "$STAGING_UNIQUE" ] && [ "$FINAL_DUP" -eq "0" ]; then
    echo "✅ Success! Production table restored and deduplicated!"
else
    echo "⚠️  Mismatch detected. Check manually."
fi

echo ""
echo "Done!"
