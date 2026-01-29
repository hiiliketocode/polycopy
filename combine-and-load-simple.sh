#!/bin/bash
# Simple script to combine JSONL files and load to BigQuery
# Uses gsutil and bq commands (no Python packages needed)

set -e

PROJECT_ID="gen-lang-client-0299056258"
BUCKET="gen-lang-client-0299056258-backfill-temp"
DATASET="polycopy_v1"
TABLE="trades_staging"
COMBINED_FILE="gs://${BUCKET}/trades_combined.jsonl"

echo "=========================================="
echo "Combining JSONL Files and Loading to BigQuery"
echo "=========================================="
echo ""

# Step 1: Count files
echo "Step 1: Counting JSONL files..."
FILE_COUNT=$(gsutil ls "gs://${BUCKET}/trades/*.jsonl" 2>&1 | wc -l | xargs)
echo "  Found ${FILE_COUNT} JSONL files"
echo ""

if [ "$FILE_COUNT" -eq "0" ]; then
    echo "❌ No JSONL files found!"
    exit 1
fi

# Step 2: Combine using gsutil compose
# Note: compose can handle up to 32 files at a time
# For many files, we'll need to do it in batches
echo "Step 2: Combining files..."
echo "  (Using GCS compose - efficient, no download needed)"
echo ""

# Create a temp directory for batch files
TEMP_DIR=$(mktemp -d)
BATCH_SIZE=32
BATCH_NUM=0
BATCH_FILES=()

# Process files in batches
gsutil ls "gs://${BUCKET}/trades/*.jsonl" | while IFS= read -r file; do
    BATCH_FILES+=("$file")
    
    if [ ${#BATCH_FILES[@]} -eq $BATCH_SIZE ]; then
        # Compose this batch
        BATCH_FILE="gs://${BUCKET}/trades/_batch_${BATCH_NUM}.jsonl"
        echo "  Combining batch $((BATCH_NUM + 1)) (${#BATCH_FILES[@]} files)..."
        
        # Use gsutil compose
        gsutil compose "${BATCH_FILES[@]}" "${BATCH_FILE}" 2>&1 | grep -v "Copying\|Composing" || true
        
        BATCH_FILES=()
        BATCH_NUM=$((BATCH_NUM + 1))
    fi
done

# Handle remaining files
if [ ${#BATCH_FILES[@]} -gt 0 ]; then
    BATCH_FILE="gs://${BUCKET}/trades/_batch_${BATCH_NUM}.jsonl"
    echo "  Combining final batch (${#BATCH_FILES[@]} files)..."
    gsutil compose "${BATCH_FILES[@]}" "${BATCH_FILE}" 2>&1 | grep -v "Copying\|Composing" || true
    BATCH_NUM=$((BATCH_NUM + 1))
fi

# If we have multiple batches, combine them
if [ $BATCH_NUM -gt 1 ]; then
    echo "  Combining ${BATCH_NUM} batches into final file..."
    BATCH_LIST=$(gsutil ls "gs://${BUCKET}/trades/_batch_*.jsonl" | tr '\n' ' ')
    gsutil compose $BATCH_LIST "${COMBINED_FILE}" 2>&1 | grep -v "Copying\|Composing" || true
    
    # Clean up batch files
    echo "  Cleaning up batch files..."
    gsutil -m rm "gs://${BUCKET}/trades/_batch_*.jsonl" 2>&1 | grep -v "Removing" || true
else
    # Only one batch, rename it
    FIRST_BATCH=$(gsutil ls "gs://${BUCKET}/trades/_batch_*.jsonl" | head -1)
    gsutil mv "${FIRST_BATCH}" "${COMBINED_FILE}" 2>&1 | grep -v "Copying\|Moving" || true
fi

echo ""
echo "✅ Combined file created: ${COMBINED_FILE}"
echo ""

# Step 3: Load to BigQuery
echo "Step 3: Loading to BigQuery..."
echo "  This may take several minutes..."
bq load \
    --source_format=NEWLINE_DELIMITED_JSON \
    --noreplace \
    --project_id=${PROJECT_ID} \
    ${DATASET}.${TABLE} \
    ${COMBINED_FILE} 2>&1

echo ""
echo "=========================================="
echo "✅ SUCCESS!"
echo "=========================================="
echo ""
echo "To verify:"
echo "  bq query --use_legacy_sql=false \"SELECT COUNT(*) FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`\""
echo ""
