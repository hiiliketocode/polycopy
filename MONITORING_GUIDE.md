# Backfill Job Monitoring Guide

## Quick Status Check

Run this to see current progress:
```bash
./monitor-backfill-progress.sh
```

## Real-Time Trade Counts

Check how many trades are in BigQuery:
```bash
./check-trades-progress.sh
```

Watch it update every 30 seconds:
```bash
watch -n 30 ./check-trades-progress.sh
```

## View Live Logs

**Option 1: Streaming logs (best for real-time)**
```bash
gcloud logging tail "resource.type=cloud_run_job AND resource.labels.job_name=dome-backfill-job" --project=gen-lang-client-0299056258
```

**Option 2: Recent logs**
```bash
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=dome-backfill-job" --limit=100 --project=gen-lang-client-0299056258 --format="table(timestamp,textPayload)"
```

**Option 3: Filter for progress messages**
```bash
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=dome-backfill-job" --limit=500 --project=gen-lang-client-0299056258 --format="value(textPayload)" | grep -E "(Processing Wallet|Wallet complete|Batch Upload|trades|Found|Uploading)"
```

## Query BigQuery Directly

**Total trades:**
```bash
bq query --use_legacy_sql=false --project_id=gen-lang-client-0299056258 \
  "SELECT COUNT(*) as total_trades FROM \`gen-lang-client-0299056258.polycopy_v1.trades\`"
```

**Trades per wallet:**
```bash
bq query --use_legacy_sql=false --project_id=gen-lang-client-0299056258 \
  "SELECT wallet_address, COUNT(*) as trade_count FROM \`gen-lang-client-0299056258.polycopy_v1.trades\` GROUP BY wallet_address ORDER BY trade_count DESC LIMIT 10"
```

**Recent trades (last hour):**
```bash
bq query --use_legacy_sql=false --project_id=gen-lang-client-0299056258 \
  "SELECT COUNT(*) as recent_trades FROM \`gen-lang-client-0299056258.polycopy_v1.trades\` WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)"
```

**Progress summary:**
```bash
bq query --use_legacy_sql=false --project_id=gen-lang-client-0299056258 \
  "SELECT 
    COUNT(*) as total_trades,
    COUNT(DISTINCT wallet_address) as unique_wallets,
    COUNT(DISTINCT condition_id) as unique_markets,
    MIN(timestamp) as earliest_trade,
    MAX(timestamp) as latest_trade
  FROM \`gen-lang-client-0299056258.polycopy_v1.trades\`"
```

## Cloud Console

**Jobs Dashboard:**
https://console.cloud.google.com/run/jobs/list?project=gen-lang-client-0299056258

**Logs Viewer:**
https://console.cloud.google.com/logs/query?project=gen-lang-client-0299056258&query=resource.type%3D%22cloud_run_job%22%20resource.labels.job_name%3D%22dome-backfill-job%22

**BigQuery Console:**
https://console.cloud.google.com/bigquery?project=gen-lang-client-0299056258

## What to Expect

The job processes wallets in batches:
1. **Initialization**: Loads existing IDs (can take a few minutes)
2. **Processing**: Processes wallets one by one
   - Logs: `Processing Wallet X/1003: 0x...`
   - Logs: `Wallet complete: N trades in Xs`
3. **Batch Uploads**: Every 10 wallets, uploads to BigQuery
   - Logs: `Batch Upload (X/1003 wallets processed)`
   - Logs: `Uploading N rows to table...`
4. **Completion**: Final summary
   - Logs: `Backfill Complete!`
   - Logs: `Total: X trades processed`

## Expected Timeline

- **1003 wallets** × **~0.1s per API call** × **multiple pages per wallet** = **Several hours**
- The job has a **24-hour timeout**, so it should complete

## Troubleshooting

**No trades showing up?**
- Check if the job is still running: `gcloud run jobs executions list --job=dome-backfill-job --region=us-central1`
- Check logs for errors: Look for "ERROR" in logs
- The first batch upload happens after 10 wallets are processed

**Job seems stuck?**
- Check execution status: `gcloud run jobs executions describe <execution-name> --region=us-central1`
- Look for API errors in logs
- The job may be waiting on API rate limits
