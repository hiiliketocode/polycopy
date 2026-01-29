# Quick Start: Deploy and Run Backfill Job

## Step 1: Deploy the Job (First Time Only)

```bash
export DOME_API_KEY="bee6330e5f143b9de00363c368bcd9a7290fd7c7"
./deploy-backfill.sh
```

This will:
- Build the Docker image
- Push to Artifact Registry
- Deploy as Cloud Run Job

## Step 2: Execute the Job

```bash
./run-backfill.sh
```

Or manually:
```bash
gcloud run jobs execute dome-backfill-job \
    --region=us-central1 \
    --project=gen-lang-client-0299056258
```

## Step 3: Monitor the Job

### Option A: Real-time Log Streaming
```bash
./monitor-backfill.sh
```

### Option B: View Recent Logs
```bash
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=dome-backfill-job" \
    --limit=100 \
    --project=gen-lang-client-0299056258 \
    --format="table(timestamp,textPayload)"
```

### Option C: Check Job Status
```bash
# List all executions
gcloud run jobs executions list \
    --job=dome-backfill-job \
    --region=us-central1 \
    --project=gen-lang-client-0299056258

# Get details of latest execution
LATEST=$(gcloud run jobs executions list --job=dome-backfill-job --region=us-central1 --project=gen-lang-client-0299056258 --limit=1 --format="value(metadata.name)")
gcloud run jobs executions describe $LATEST \
    --region=us-central1 \
    --project=gen-lang-client-0299056258
```

### Option D: Cloud Console
Open in browser:
```
https://console.cloud.google.com/run/detail/us-central1/dome-backfill-job/logs?project=gen-lang-client-0299056258
```

## Useful Commands

### View Job Configuration
```bash
gcloud run jobs describe dome-backfill-job \
    --region=us-central1 \
    --project=gen-lang-client-0299056258
```

### Cancel Running Execution
```bash
LATEST=$(gcloud run jobs executions list --job=dome-backfill-job --region=us-central1 --project=gen-lang-client-0299056258 --limit=1 --format="value(metadata.name)")
gcloud run jobs executions cancel $LATEST \
    --region=us-central1 \
    --project=gen-lang-client-0299056258
```

### Filter Logs by Keyword
```bash
# Find errors
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=dome-backfill-job AND severity>=ERROR" \
    --limit=50 \
    --project=gen-lang-client-0299056258

# Find progress updates
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=dome-backfill-job AND textPayload=~\"Processing Wallet\"" \
    --limit=50 \
    --project=gen-lang-client-0299056258
```

## Expected Output

The job will log:
- Number of traders found
- Progress for each wallet (X/Y wallets processed)
- Trades fetched per wallet
- Upload progress to BigQuery
- Performance metrics (trades/sec)
- Completion summary

## Troubleshooting

### Job fails to start
- Check service account permissions
- Verify DOME_API_KEY is set
- Check BigQuery table access

### Job times out
- Increase timeout in deploy script (currently 24 hours)
- Check if processing is stuck on a specific wallet

### No logs appearing
- Wait a few seconds for logs to propagate
- Check execution status to ensure job is running
