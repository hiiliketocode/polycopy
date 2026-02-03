# How to Check Incremental Sync in Google Cloud Console

## ✅ Deployment Status: SUCCESS!

Your incremental sync job is deployed and scheduled. Here's how to check everything in Google Cloud Console.

## Quick Links

- **Cloud Run Jobs**: https://console.cloud.google.com/run/jobs?project=gen-lang-client-0299056258
- **Cloud Scheduler**: https://console.cloud.google.com/cloudscheduler?project=gen-lang-client-0299056258
- **BigQuery**: https://console.cloud.google.com/bigquery?project=gen-lang-client-0299056258
- **Logs**: https://console.cloud.google.com/logs/query?project=gen-lang-client-0299056258

---

## 1. Check Cloud Run Job Status

### Via Console:
1. Go to: https://console.cloud.google.com/run/jobs?project=gen-lang-client-0299056258
2. Click on **`incremental-sync-trades-markets`**
3. You'll see:
   - **Status**: Should show "Ready" or "Active"
   - **Last execution**: When it last ran
   - **Configuration**: Memory (2GB), CPU (2), Timeout (30 min)

### Check Recent Executions:
1. In the job details page, click **"Executions"** tab
2. You'll see a list of all runs with:
   - Start time
   - Completion time
   - Status (Succeeded/Failed)
   - Duration

### Manual Execution:
1. Click **"EXECUTE"** button at the top
2. Click **"EXECUTE JOB"** to run it immediately

---

## 2. Check Cloud Scheduler (Cron Job)

### Via Console:
1. Go to: https://console.cloud.google.com/cloudscheduler?project=gen-lang-client-0299056258
2. Find **`incremental-sync-trades-markets`**
3. You'll see:
   - **Schedule**: `*/30 * * * *` (every 30 minutes)
   - **State**: Should be "ENABLED" (green)
   - **Last run**: When it last triggered
   - **Next run**: When it will run next

### View Execution History:
1. Click on the scheduler job name
2. Scroll down to **"Execution history"**
3. See all past executions with status

### Enable/Disable:
- Click the toggle switch to enable/disable the scheduler
- Or click **"PAUSE"** / **"RESUME"** button

---

## 3. Check Logs

### Via Console:
1. Go to: https://console.cloud.google.com/logs/query?project=gen-lang-client-0299056258
2. Use this query:
   ```
   resource.type="cloud_run_job"
   resource.labels.job_name="incremental-sync-trades-markets"
   ```
3. Click **"Run query"**
4. You'll see:
   - All log entries from the job
   - Timestamps
   - Log levels (INFO, ERROR, etc.)
   - Output from the Python script

### Filter by Execution:
Add to the query:
```
resource.type="cloud_run_job"
resource.labels.job_name="incremental-sync-trades-markets"
labels."run.googleapis.com/execution_name"="EXECUTION_NAME_HERE"
```

### View Real-time Logs:
1. In the logs page, click **"Live tail"** toggle
2. See logs as they happen in real-time

---

## 4. Check BigQuery Data

### Check Latest Trades:
1. Go to: https://console.cloud.google.com/bigquery?project=gen-lang-client-0299056258
2. Run this query:
   ```sql
   SELECT 
     MAX(timestamp) as latest_trade,
     TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(timestamp), MINUTE) as minutes_ago,
     COUNT(*) as total_trades
   FROM `gen-lang-client-0299056258.polycopy_v1.trades`
   ```
3. Click **"Run"**
4. Check `minutes_ago` - should be less than 30 minutes if sync is working

### Check Checkpoint Table:
```sql
SELECT 
  last_sync_time,
  trades_fetched,
  markets_fetched,
  events_fetched,
  wallets_processed,
  sync_duration_seconds
FROM `gen-lang-client-0299056258.polycopy_v1.daily_sync_checkpoint`
ORDER BY last_sync_time DESC
LIMIT 5
```

This shows:
- When sync last ran
- How many trades/markets/events were fetched
- How many wallets were processed
- How long it took

### Check Recent Trades Added:
```sql
SELECT 
  COUNT(*) as new_trades,
  MIN(timestamp) as earliest,
  MAX(timestamp) as latest
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)
```

---

## 5. Monitor Job Health

### Check Execution Success Rate:
1. Go to Cloud Run Jobs page
2. Click on `incremental-sync-trades-markets`
3. Click **"Executions"** tab
4. Look at recent executions:
   - ✅ Green checkmark = Success
   - ❌ Red X = Failed
   - ⏳ Clock = Running

### Check for Errors:
1. Go to Logs: https://console.cloud.google.com/logs/query?project=gen-lang-client-0299056258
2. Use query:
   ```
   resource.type="cloud_run_job"
   resource.labels.job_name="incremental-sync-trades-markets"
   severity>=ERROR
   ```
3. Review any error messages

---

## 6. Verify It's Working

### Step-by-Step Verification:

1. **Check Scheduler is Enabled**
   - Go to Cloud Scheduler
   - Verify `incremental-sync-trades-markets` shows "ENABLED"

2. **Check Last Execution**
   - Go to Cloud Run Jobs → Executions
   - Verify there's a recent execution (within last hour)
   - Check it succeeded (green checkmark)

3. **Check Latest Trade Timestamp**
   - Run BigQuery query above
   - `minutes_ago` should be less than 30 minutes
   - If it's more than 30 minutes, check logs for errors

4. **Check Checkpoint**
   - Run checkpoint query
   - `last_sync_time` should be recent (within last hour)
   - `trades_fetched` should be > 0 if there were new trades

---

## 7. Troubleshooting

### Job Not Running?
1. Check Cloud Scheduler is enabled
2. Check Cloud Run Job exists and is ready
3. Check logs for errors

### No New Trades?
1. Check checkpoint - maybe no new trades since last sync
2. Check logs for API errors
3. Verify DOME_API_KEY is set correctly

### Job Failing?
1. Check logs for error messages
2. Check BigQuery permissions
3. Verify environment variables are set

### View Full Error Details:
1. Go to Cloud Run Jobs
2. Click on failed execution
3. Click **"View logs"** or **"View details"**

---

## Quick Command Reference

### Via Terminal (if you prefer):

```bash
# Check job status
gcloud run jobs describe incremental-sync-trades-markets \
    --region=us-central1 \
    --project=gen-lang-client-0299056258

# List recent executions
gcloud run jobs executions list \
    --job=incremental-sync-trades-markets \
    --region=us-central1 \
    --project=gen-lang-client-0299056258 \
    --limit=5

# Check scheduler
gcloud scheduler jobs describe incremental-sync-trades-markets \
    --location=us-central1 \
    --project=gen-lang-client-0299056258

# View logs
gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=incremental-sync-trades-markets" \
    --limit=50 \
    --project=gen-lang-client-0299056258

# Run manually
gcloud run jobs execute incremental-sync-trades-markets \
    --region=us-central1 \
    --project=gen-lang-client-0299056258
```

---

## Summary

✅ **Job Name**: `incremental-sync-trades-markets`  
✅ **Schedule**: Every 30 minutes (`*/30 * * * *`)  
✅ **Region**: `us-central1`  
✅ **Project**: `gen-lang-client-0299056258`  

The job will automatically:
- Run every 30 minutes
- Fetch all wallets from traders table + Supabase
- Get trades since last checkpoint
- Update markets and events (no duplicates)
- Track progress in checkpoint table

You can monitor everything via the Google Cloud Console links above!
