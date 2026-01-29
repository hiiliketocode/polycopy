#!/bin/bash
# Deduplicate production trades table
# Keeps latest record for each id (by timestamp)

set -e

PROJECT_ID="gen-lang-client-0299056258"
DATASET="polycopy_v1"
TABLE="${PROJECT_ID}.${DATASET}.trades"

echo "=========================================="
echo "Deduplicating Production Trades Table"
echo "=========================================="
echo ""

# Step 1: Check for duplicates
echo "Step 1: Checking for duplicates..."
DUPLICATE_CHECK=$(bq query --use_legacy_sql=false --format=csv "
SELECT 
    COUNT(*) as total_rows,
    COUNT(DISTINCT id) as unique_ids,
    COUNT(*) - COUNT(DISTINCT id) as duplicate_count
FROM \`${TABLE}\`
" 2>&1 | tail -1)

TOTAL_ROWS=$(echo $DUPLICATE_CHECK | cut -d',' -f1)
UNIQUE_IDS=$(echo $DUPLICATE_CHECK | cut -d',' -f2)
DUPLICATES=$(echo $DUPLICATE_CHECK | cut -d',' -f3)

echo "  Total rows: ${TOTAL_ROWS}"
echo "  Unique IDs: ${UNIQUE_IDS}"
echo "  Duplicates: ${DUPLICATES}"
echo ""

if [ "$DUPLICATES" -eq "0" ]; then
    echo "✅ No duplicates found! Table is already deduplicated."
    exit 0
fi

echo "Found ${DUPLICATES} duplicate rows"
echo ""

# Step 2: Delete duplicates (preserves partitioning)
echo "Step 2: Deleting duplicate rows..."
echo "  This will:"
echo "    • Keep latest record for each id (ORDER BY timestamp DESC)"
echo "    • Delete all duplicate rows"
echo "  This may take several minutes..."
echo ""

# Use DELETE with CTE to remove duplicates in place (preserves partitioning)
# Delete all rows that are NOT the latest for each id
DELETE_QUERY="
DELETE FROM \`${TABLE}\` t
WHERE EXISTS (
  SELECT 1
  FROM (
    SELECT id, timestamp,
           ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp DESC) as rn
    FROM \`${TABLE}\`
  ) ranked
  WHERE ranked.id = t.id
    AND ranked.timestamp = t.timestamp
    AND ranked.rn > 1
)
"

echo "Running DELETE query (this may take a while for 115M duplicates)..."
bq query --use_legacy_sql=false --project_id=${PROJECT_ID} "${DELETE_QUERY}" 2>&1

echo ""
echo "✅ Deduplication complete!"
echo ""

# Step 3: Verify
echo "Step 3: Verifying deduplication..."
FINAL_CHECK=$(bq query --use_legacy_sql=false --format=csv "
SELECT 
    COUNT(*) as total_rows,
    COUNT(DISTINCT id) as unique_ids,
    COUNT(*) - COUNT(DISTINCT id) as duplicate_count
FROM \`${TABLE}\`
" 2>&1 | tail -1)

FINAL_ROWS=$(echo $FINAL_CHECK | cut -d',' -f1)
FINAL_UNIQUE=$(echo $FINAL_CHECK | cut -d',' -f2)
FINAL_DUP=$(echo $FINAL_CHECK | cut -d',' -f3)

echo "  Final rows: ${FINAL_ROWS}"
echo "  Unique IDs: ${FINAL_UNIQUE}"
echo "  Remaining duplicates: ${FINAL_DUP}"
echo ""

echo "=========================================="
echo "✅ Summary"
echo "=========================================="
echo "  Before: ${TOTAL_ROWS} rows (${DUPLICATES} duplicates)"
echo "  After: ${FINAL_ROWS} rows (${FINAL_DUP} duplicates)"
echo "  Removed: $((TOTAL_ROWS - FINAL_ROWS)) duplicate rows"
echo ""

if [ "$FINAL_DUP" -eq "0" ]; then
    echo "✅ Table is now fully deduplicated!"
else
    echo "⚠️  Some duplicates may remain (check manually)"
fi

echo ""
echo "Done!"
