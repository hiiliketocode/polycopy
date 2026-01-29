# Manual DTS Setup Guide

## Step-by-Step Instructions

### Step 1: Open BigQuery Transfers Console
Go to: https://console.cloud.google.com/bigquery/transfers?project=gen-lang-client-0299056258

### Step 2: Click "Create Transfer"
- Click the **"+ CREATE TRANSFER"** button at the top

### Step 3: Select Source
- **Source:** Select **"Google Cloud Storage"**
- Click **"Continue"**

### Step 4: Configure Transfer Settings

Fill in these exact values:

**Display name:**
```
GCS to Trades Staging
```

**Source URI:**
```
gs://gen-lang-client-0299056258-backfill-temp/trades/*.jsonl
```

**Destination settings:**
- **Dataset:** `polycopy_v1`
- **Table name:** `trades_staging`

**File format:**
- Select: **"JSON (Newline delimited)**

**Write preference:**
- Select: **"Append to table"**

**Advanced options (optional):**
- **Max bad records:** `0` (fail on errors)
- **Skip leading rows:** Leave blank

**Schedule:**
- Select: **"On-demand"** (manual runs only)
- This means you'll trigger it manually when needed

### Step 5: Create Transfer
- Click **"CREATE"** button
- Wait for confirmation

### Step 6: Trigger Transfer for Existing Files
After creation:
1. Find your transfer in the list
2. Click on **"GCS to Trades Staging"**
3. Click **"RUN NOW"** or **"TRANSFER NOW"** button
4. This will load all 795 existing files

### Step 7: Monitor Transfer
- Watch the transfer status (should show "Running" then "Success")
- Check BigQuery staging table for new data
- Transfer may take 10-30 minutes depending on file count

## What This Does

- **Loads all files** matching `gs://gen-lang-client-0299056258-backfill-temp/trades/*.jsonl`
- **Transfers to** `polycopy_v1.trades_staging`
- **Bypasses quota limits** - DTS has separate quotas (10,000 files per transfer)
- **Appends data** - Won't overwrite existing data

## After Setup

The backfill script will automatically use this DTS config for future runs (if it detects it exists).

## Troubleshooting

If you see errors:
- Check that GCS bucket exists: `gs://gen-lang-client-0299056258-backfill-temp`
- Verify files exist: `gsutil ls gs://gen-lang-client-0299056258-backfill-temp/trades/`
- Check table exists: `bq show polycopy_v1.trades_staging`
