#!/bin/bash
# Combine all JSONL files and load to BigQuery
# Much simpler than DTS!

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

# Step 1: Combine all JSONL files
echo "Step 1: Combining all JSONL files..."
echo "This may take a few minutes for 830+ files..."
gsutil compose gs://${BUCKET}/trades/*.jsonl ${COMBINED_FILE} 2>&1 || {
    echo "Compose failed (might be too many files), trying alternative method..."
    # Alternative: Use gsutil cat to combine
    echo "Using alternative method: downloading and combining..."
    TEMP_DIR=$(mktemp -d)
    echo "Downloading files to ${TEMP_DIR}..."
    gsutil -m cp gs://${BUCKET}/trades/*.jsonl ${TEMP_DIR}/ 2>&1 | tail -5
    echo "Combining files..."
    cat ${TEMP_DIR}/*.jsonl > ${TEMP_DIR}/combined.jsonl
    echo "Uploading combined file..."
    gsutil cp ${TEMP_DIR}/combined.jsonl ${COMBINED_FILE}
    rm -rf ${TEMP_DIR}
}

echo ""
echo "✅ Combined file created: ${COMBINED_FILE}"
echo ""

# Step 2: Load to BigQuery
echo "Step 2: Loading combined file to BigQuery..."
bq load \
    --source_format=NEWLINE_DELIMITED_JSON \
    --write_disposition=WRITE_APPEND \
    --project_id=${PROJECT_ID} \
    ${DATASET}.${TABLE} \
    ${COMBINED_FILE}

echo ""
echo "✅ Done! All trades loaded to ${DATASET}.${TABLE}"
echo ""
echo "To verify:"
echo "  bq query --use_legacy_sql=false \"SELECT COUNT(*) FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`\""
