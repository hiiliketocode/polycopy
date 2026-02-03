# Catch-Up Job Guide

## Purpose

This job fills the gap between Jan 29, 2026 04:22:50 UTC (last trade before gap) and when the incremental sync started running.

## What It Does

✅ Fetches ALL trades from Jan 29, 2026 04:22:50 UTC onwards  
✅ Processes ALL wallets from traders table (1,001+ wallets)  
✅ Fetches markets and events for new condition_ids  
✅ Uses MERGE to avoid duplicates  
✅ Loads everything to BigQuery

## Deployment

The job is already deployed as `catchup-trades-gap` in Cloud Run Jobs.

## Running the Job

### Option 1: Run Manually via Command Line

```bash
gcloud run jobs execute catchup-trades-gap \
    --region=us-central1 \
    --project=gen-lang-client-0299056258
```

### Option 2: Run via Google Cloud Console

1. Go to: https://console.cloud.google.com/run/jobs?project=gen-lang-client-0299056258
2. Click on `catchup-trades-gap`
3. Click **"EXECUTE"** button
4. Click **"EXECUTE JOB"**

## Monitoring

### Check Job Status

```bash
gcloud run jobs executions list \
    --job=catchup-trades-gap \
    --region=us-central1 \
    --project=gen-lang-client-0299056258 \
    --limit=5
```

### View Logs

```bash
gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=catchup-trades-gap" \
    --limit=100 \
    --project=gen-lang-client-0299056258 \
    --format=json
```

### Check Progress in BigQuery

```sql
-- Check how many trades were added
SELECT 
  COUNT(*) as total_trades,
  COUNT(DISTINCT wallet_address) as unique_wallets,
  MIN(timestamp) as earliest,
  MAX(timestamp) as latest
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE timestamp >= TIMESTAMP('2026-01-29 04:22:50')
```

## Expected Runtime

- **Duration**: 1-3 hours (depending on number of trades)
- **Memory**: 4GB
- **CPU**: 4 vCPU
- **Timeout**: 3 hours (10,800 seconds)

## What to Expect

The job will:
1. Process all 1,001+ wallets from traders table
2. Fetch trades from Jan 29 onwards for each wallet
3. Collect unique condition_ids
4. Fetch markets for new condition_ids
5. Extract events from markets
6. Load everything to BigQuery with deduplication

## After Completion

Once the catch-up job completes:
- ✅ All trades from Jan 29 onwards will be in BigQuery
- ✅ The incremental sync will continue to keep data up-to-date
- ✅ No more gaps in trade data

## Troubleshooting

### Job Times Out

If the job times out (3 hours), you can:
1. Check logs to see how many wallets were processed
2. Re-run the job - it will skip duplicates using MERGE
3. Or increase timeout in deployment script

### Check What Was Processed

```sql
-- See latest trades added
SELECT 
  MAX(timestamp) as latest_trade,
  COUNT(*) as trades_since_jan29
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE timestamp >= TIMESTAMP('2026-01-29 04:22:50')
```

## Notes

- This is a **one-time job** - run it once to fill the gap
- The incremental sync will handle all future updates
- The job uses MERGE so it's safe to run multiple times (won't create duplicates)
