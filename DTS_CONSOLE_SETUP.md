# DTS Setup via Google Cloud Console

## Quick Setup (5 minutes)

### Step 1: Open BigQuery Transfers
Go to: https://console.cloud.google.com/bigquery/transfers?project=gen-lang-client-0299056258

### Step 2: Create Transfer
Click **"Create Transfer"** button

### Step 3: Configure Transfer

**Source:**
- Select: **Google Cloud Storage**

**Source URI:**
```
gs://gen-lang-client-0299056258-backfill-temp/trades/*.jsonl
```

**Destination:**
- Dataset: `polycopy_v1`
- Table: `trades_staging`

**File Format:**
- Select: **JSON (Newline delimited)**

**Write Preference:**
- Select: **Append to table**

**Schedule:**
- Select: **On-demand** (manual runs only)

### Step 4: Create and Run
1. Click **"Create"**
2. Once created, click **"Run Now"** to load existing 589 files

## What This Does

- Loads all files matching `gs://gen-lang-client-0299056258-backfill-temp/trades/*.jsonl`
- Transfers them to `polycopy_v1.trades_staging`
- **Bypasses load job quota limits** (uses separate DTS quotas)
- Can handle up to 10,000 files per transfer

## After Setup

The backfill script will automatically use this DTS config for future runs.
You can also trigger it manually anytime via the Console.
