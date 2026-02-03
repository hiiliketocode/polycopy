# Incremental Sync Setup Guide

This guide sets up an incremental sync job that runs **every 30 minutes** to keep trades, markets, and events up-to-date in BigQuery.

## What It Does

✅ **Fetches all wallets** from:
- BigQuery `traders` table
- Supabase user wallets (profiles, turnkey_wallets, clob_credentials, user_wallets)

✅ **Incremental sync** - Only fetches trades since last checkpoint timestamp

✅ **Deduplication** - Uses BigQuery MERGE to avoid duplicates:
- Trades: Deduplicated by `id`
- Markets: Deduplicated by `condition_id` (updates existing)
- Events: Deduplicated by `event_slug` (updates existing)

✅ **Updates open markets** - Refreshes data for markets that are still open

✅ **Checkpoint tracking** - Stores sync time in `daily_sync_checkpoint` table

## Prerequisites

1. **Google Cloud SDK** (`gcloud`) installed and authenticated
2. **Docker** installed and running
3. **Environment Variables**:
   - `DOME_API_KEY` (required)
   - `NEXT_PUBLIC_SUPABASE_URL` (optional - for user wallets)
   - `SUPABASE_SERVICE_ROLE_KEY` (optional - for user wallets)

## Step-by-Step Setup

### Step 1: Set Environment Variables

```bash
# Required
export DOME_API_KEY="your-dome-api-key-here"

# Optional (for user wallets from Supabase)
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

### Step 2: Deploy the Job

Run the deployment script:

```bash
./deploy-incremental-sync.sh
```

This script will:
1. ✅ Authenticate Docker with Artifact Registry
2. ✅ Create/verify Artifact Registry repository
3. ✅ Build Docker image with the sync script
4. ✅ Push image to Artifact Registry
5. ✅ Deploy Cloud Run Job (`incremental-sync-trades-markets`)
6. ✅ Set up BigQuery permissions
7. ✅ Create Cloud Scheduler job (runs every 30 minutes)

**Expected output:**
```
=== Deploying Incremental Sync Job (Every 30 Minutes) ===
Step 1: Authenticating Docker...
Step 2: Ensuring Artifact Registry repository...
Step 3: Creating Dockerfile...
Step 4: Building Docker image...
Step 5: Pushing image to Artifact Registry...
Step 6: Deploying Cloud Run Job...
Step 7: Ensuring BigQuery permissions...
Step 8: Setting up Cloud Scheduler (runs every 30 minutes)...
=== Deployment Complete! ===
```

### Step 3: Test the Job

Run the test script to execute the job manually and verify it works:

```bash
./test-incremental-sync.sh
```

This will:
1. Show current state (latest trade timestamp, last checkpoint)
2. Execute the job manually
3. Monitor execution progress
4. Show results (new trades, markets, events)
5. Display recent logs

**Expected output:**
```
=== Testing Incremental Sync Job ===
Step 1: Checking current state...
📊 Latest trade timestamp: [shows current state]
📅 Last checkpoint: [shows checkpoint]
Step 2: Executing job manually...
✅ Job execution started: [execution-name]
Step 3: Monitoring job execution...
✅ Job completed!
Step 4: Checking results...
📊 Latest trade timestamp (after sync): [updated timestamp]
📅 Latest checkpoint (after sync): [new checkpoint with counts]
Step 5: Recent logs...
[shows log output]
=== Test Complete ===
```

### Step 4: Verify It's Running

Check the Cloud Scheduler:

```bash
gcloud scheduler jobs describe incremental-sync-trades-markets \
    --location=us-central1 \
    --project=gen-lang-client-0299056258
```

Check recent executions:

```bash
gcloud run jobs executions list \
    --job=incremental-sync-trades-markets \
    --region=us-central1 \
    --project=gen-lang-client-0299056258 \
    --limit=5
```

## Monitoring

### Check Latest Trades

```bash
bq query --use_legacy_sql=false \
    "SELECT MAX(timestamp) as latest_trade, 
            TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(timestamp), MINUTE) as minutes_ago 
     FROM \`gen-lang-client-0299056258.polycopy_v1.trades\`"
```

### Check Checkpoint Status

```bash
bq query --use_legacy_sql=false \
    "SELECT last_sync_time, 
            trades_fetched, 
            markets_fetched, 
            events_fetched, 
            wallets_processed,
            sync_duration_seconds
     FROM \`gen-lang-client-0299056258.polycopy_v1.daily_sync_checkpoint\` 
     ORDER BY last_sync_time DESC 
     LIMIT 5"
```

### View Logs

```bash
gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=incremental-sync-trades-markets" \
    --limit=50 \
    --project=gen-lang-client-0299056258 \
    --format=json
```

### Real-time Log Streaming

```bash
gcloud logging tail \
    "resource.type=cloud_run_job AND resource.labels.job_name=incremental-sync-trades-markets" \
    --project=gen-lang-client-0299056258
```

## Manual Execution

To run the job manually (outside of the scheduled 30-minute interval):

```bash
gcloud run jobs execute incremental-sync-trades-markets \
    --region=us-central1 \
    --project=gen-lang-client-0299056258
```

## How It Works

1. **Checkpoint System**: 
   - Reads `last_sync_time` from `daily_sync_checkpoint` table
   - If no checkpoint exists, uses 24-hour lookback window
   - After sync, updates checkpoint with new timestamp

2. **Wallet Collection**:
   - Queries BigQuery `traders` table for wallet addresses
   - Optionally queries Supabase for user wallets
   - Combines into unique set

3. **Trade Fetching**:
   - For each wallet, calls Dome API `/polymarket/orders` endpoint
   - Uses `since` parameter with last checkpoint timestamp
   - Paginates through all results

4. **Market & Event Fetching**:
   - Extracts unique `condition_id` values from new trades
   - Fetches market data for new condition_ids
   - Also fetches open markets to update their data
   - Extracts events from market data

5. **Deduplication**:
   - **Trades**: MERGE on `id` - only inserts new trades
   - **Markets**: MERGE on `condition_id` - inserts new, updates existing
   - **Events**: MERGE on `event_slug` - inserts new, updates existing

6. **Checkpoint Update**:
   - Records sync completion time
   - Stores counts: trades_fetched, markets_fetched, events_fetched, wallets_processed
   - Stores duration in seconds

## Configuration

The job is configured with:
- **Schedule**: Every 30 minutes (`*/30 * * * *`)
- **Timeout**: 30 minutes (1800 seconds)
- **Memory**: 2GB
- **CPU**: 2 vCPU
- **Max Retries**: 2
- **Rate Limit**: 20 requests/second (0.05s delay)

## Troubleshooting

### Job Not Running

Check scheduler status:
```bash
gcloud scheduler jobs describe incremental-sync-trades-markets \
    --location=us-central1 \
    --project=gen-lang-client-0299056258
```

Check if scheduler is enabled:
```bash
gcloud scheduler jobs list --location=us-central1 --project=gen-lang-client-0299056258
```

### No New Trades

1. Check if checkpoint is recent:
```bash
bq query --use_legacy_sql=false \
    "SELECT last_sync_time FROM \`gen-lang-client-0299056258.polycopy_v1.daily_sync_checkpoint\` ORDER BY last_sync_time DESC LIMIT 1"
```

2. Check logs for errors:
```bash
gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=incremental-sync-trades-markets AND severity>=ERROR" \
    --limit=20 \
    --project=gen-lang-client-0299056258
```

### Authentication Errors

Ensure service account has permissions:
```bash
gcloud projects get-iam-policy gen-lang-client-0299056258 \
    --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:supabase-polyscore-api@gen-lang-client-0299056258.iam.gserviceaccount.com"
```

Should have:
- `roles/bigquery.dataEditor`
- `roles/bigquery.jobUser`

## Cost Estimation

- **Cloud Run Job**: ~$0.01-0.05 per run (30-minute job, 2GB RAM, 2 CPU)
- **Cloud Scheduler**: Free (up to 3 jobs)
- **BigQuery**: Storage and query costs (minimal for incremental sync)
- **Total**: ~$0.50-2.50/month (48 runs × $0.01-0.05)

## Next Steps

After deployment:
1. ✅ Run test script to verify it works
2. ✅ Monitor first few runs to ensure proper operation
3. ✅ Check that trades are being synced within 30 minutes
4. ✅ Verify markets and events are being updated
5. ✅ Set up alerts if needed (optional)
