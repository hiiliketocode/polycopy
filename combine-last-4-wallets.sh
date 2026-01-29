#!/bin/bash
# Combine last 4 wallets and load via DTS

set -e

PROJECT_ID="gen-lang-client-0299056258"
BUCKET="gen-lang-client-0299056258-backfill-temp"
DATASET="polycopy_v1"
TABLE="trades_staging"

# Last 4 wallets
WALLETS=(
    "0xc390fa385403669645a20d81fc672a25d1ad28bd"
    "0x6031b6eed1c97e853c6e0f03ad3ce3529351f96d"
    "0x63ce342161250d705dc0b16df89036c8e5f9ba9a"
    "0x961afce6bd9aec79c5cf09d2d4dac2b434b23361"
)

COMBINED_FILE="gs://${BUCKET}/trades_last4_combined.jsonl"

echo "=========================================="
echo "Combining Last 4 Wallets and Loading via DTS"
echo "=========================================="
echo ""

# Step 1: Check which files exist
echo "Step 1: Checking which wallet files exist..."
EXISTING_FILES=()
for wallet in "${WALLETS[@]}"; do
    FILE="gs://${BUCKET}/trades/${wallet}.jsonl"
    if gsutil ls "$FILE" >/dev/null 2>&1; then
        EXISTING_FILES+=("$FILE")
        echo "  ✅ Found: ${wallet}.jsonl"
    else
        echo "  ⏳ Not yet: ${wallet}.jsonl (backfill still processing)"
    fi
done

echo ""
if [ ${#EXISTING_FILES[@]} -eq 0 ]; then
    echo "❌ No files found yet. The backfill job is still processing these wallets."
    echo "   Wait for the backfill to finish, then run this script again."
    exit 1
fi

echo "Found ${#EXISTING_FILES[@]} out of 4 files"
echo ""

# Step 2: Combine files
if [ ${#EXISTING_FILES[@]} -eq 1 ]; then
    echo "Step 2: Only one file - copying to combined file..."
    gsutil cp "${EXISTING_FILES[0]}" "${COMBINED_FILE}" 2>&1 | grep -v "Copying" || true
else
    echo "Step 2: Combining ${#EXISTING_FILES[@]} files..."
    gsutil compose "${EXISTING_FILES[@]}" "${COMBINED_FILE}" 2>&1 | grep -v "Composing" || true
fi

echo ""
echo "✅ Combined file created: ${COMBINED_FILE}"
echo ""

# Step 3: Load via DTS
echo "Step 3: Loading via DTS..."
echo ""
echo "Option 1: Add to existing DTS transfer"
echo "  • The existing DTS is set to: gs://${BUCKET}/trades/*.jsonl"
echo "  • It will automatically pick up new files matching the pattern"
echo "  • Just trigger 'RUN NOW' on the existing transfer"
echo ""
echo "Option 2: Create new DTS transfer for this specific file"
echo "  • Source: ${COMBINED_FILE}"
echo "  • Destination: ${DATASET}.${TABLE}"
echo ""
echo "Recommended: Option 1 (simpler)"
echo ""
echo "To trigger existing DTS:"
echo "  1. Go to: https://console.cloud.google.com/bigquery/transfers?project=${PROJECT_ID}"
echo "  2. Click 'GCS to Trades Staging'"
echo "  3. Click 'RUN NOW'"
echo ""
echo "Or if you want to load this specific file now, we can use bq load"
echo "(but that might hit quota - DTS is better)"
