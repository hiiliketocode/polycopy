# Daily Sync Job Deployment Guide

This document describes how to deploy and run the daily incremental sync job for trades, markets, and events.

## Overview

The `daily-sync-trades-markets.py` script performs incremental synchronization of:
- **Trades**: New trades since last checkpoint for all wallets
- **Markets**: New markets and updates to open (not resolved) markets
- **Events**: Events extracted from markets

## Features

- ✅ Fetches wallets from:
  - BigQuery `traders` table
  - Supabase user wallets (`profiles`, `turnkey_wallets`, `clob_credentials`, `user_wallets`)
- ✅ Incremental sync using checkpointing
- ✅ Deduplication using BigQuery MERGE
- ✅ Updates open markets to get latest data
- ✅ Robust error handling and retries

## Prerequisites

1. **Google Cloud Project**: `gen-lang-client-0299056258`
2. **BigQuery Dataset**: `polycopy_v1`
3. **Environment Variables**:
   - `DOME_API_KEY`: Dome API key for fetching trades/markets
   - `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key (for user wallets)

## Local Testing

1. **Install dependencies**:
   ```bash
   pip install google-cloud-bigquery supabase requests
   ```

2. **Set environment variables**:
   ```bash
   export DOME_API_KEY="your-dome-api-key"
   export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
   ```

3. **Run the script**:
   ```bash
   python3 daily-sync-trades-markets.py
   ```

## Cloud Run Job Deployment

### Step 1: Create Dockerfile

Create a `Dockerfile.daily-sync`:

```dockerfile
FROM python:3.9-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy script
COPY daily-sync-trades-markets.py .

# Run script
CMD ["python", "-u", "daily-sync-trades-markets.py"]
```

### Step 2: Build and Deploy

```bash
# Set variables
PROJECT_ID="gen-lang-client-0299056258"
JOB_NAME="daily-sync-trades-markets"
REGION="us-central1"
SERVICE_ACCOUNT="bigquery-job-runner@${PROJECT_ID}.iam.gserviceaccount.com"

# Build image
gcloud builds submit --tag gcr.io/${PROJECT_ID}/${JOB_NAME}

# Create Cloud Run Job
gcloud run jobs create ${JOB_NAME} \
  --image gcr.io/${PROJECT_ID}/${JOB_NAME} \
  --region ${REGION} \
  --service-account ${SERVICE_ACCOUNT} \
  --set-env-vars DOME_API_KEY="${DOME_API_KEY}" \
  --set-env-vars NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}" \
  --set-env-vars SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY}" \
  --max-retries 3 \
  --task-timeout 3600 \
  --memory 2Gi \
  --cpu 2 \
  --tasks 1 \
  --parallelism 1

# Grant BigQuery permissions
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/bigquery.jobUser"
```

### Step 3: Schedule with Cloud Scheduler

```bash
# Create Cloud Scheduler job (runs daily at 2 AM UTC)
gcloud scheduler jobs create http daily-sync-trades-markets \
  --location=${REGION} \
  --schedule="0 2 * * *" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
  --http-method=POST \
  --oauth-service-account-email=${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com \
  --time-zone="UTC"
```

Or use Cloud Scheduler with Cloud Run Jobs API:

```bash
gcloud scheduler jobs create http daily-sync-trades-markets \
  --location=${REGION} \
  --schedule="0 2 * * *" \
  --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
  --http-method=POST \
  --oauth-service-account-email=${SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com \
  --time-zone="UTC" \
  --headers="Content-Type=application/json" \
  --message-body='{}'
```

## Manual Execution

To run the job manually:

```bash
# Execute the job
gcloud run jobs execute ${JOB_NAME} --region ${REGION}

# Check logs
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=${JOB_NAME}" --limit 50 --format json
```

## Monitoring

### Check Last Sync Time

```sql
SELECT last_sync_time, sync_duration_seconds, trades_fetched, markets_fetched, events_fetched, wallets_processed
FROM `gen-lang-client-0299056258.polycopy_v1.daily_sync_checkpoint`
ORDER BY last_sync_time DESC
LIMIT 1
```

### Check Recent Trades

```sql
SELECT COUNT(*) as new_trades, MIN(timestamp) as earliest, MAX(timestamp) as latest
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
```

### Check Open Markets Updated

```sql
SELECT COUNT(*) as open_markets
FROM `gen-lang-client-0299056258.polycopy_v1.markets`
WHERE status = 'open'
  AND last_updated >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
```

## Troubleshooting

### Checkpoint Not Updating

If checkpoint fails, check BigQuery permissions:
```bash
gcloud projects get-iam-policy ${PROJECT_ID} \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:${SERVICE_ACCOUNT}"
```

### Missing User Wallets

If user wallets aren't being fetched, verify Supabase credentials:
```bash
# Test Supabase connection
python3 -c "
from supabase import create_client
import os
client = create_client(os.getenv('NEXT_PUBLIC_SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_ROLE_KEY'))
print(client.table('profiles').select('id').limit(1).execute())
"
```

### Rate Limiting

If hitting Dome API rate limits, increase `API_RATE_LIMIT_DELAY`:
```python
API_RATE_LIMIT_DELAY = 0.1  # Reduce to 10 RPS
```

## Configuration

### Environment Variables

- `DOME_API_KEY`: Required. Dome API key.
- `NEXT_PUBLIC_SUPABASE_URL`: Optional. Supabase URL for user wallets.
- `SUPABASE_SERVICE_ROLE_KEY`: Optional. Supabase service role key.

### Script Constants

- `DEFAULT_LOOKBACK_HOURS`: Default lookback window if no checkpoint exists (24 hours)
- `API_RATE_LIMIT_DELAY`: Delay between API requests (0.05s = 20 RPS)
- `BATCH_SIZE`: Batch size for market fetching (100)

## Performance

- **Typical runtime**: 5-15 minutes (depends on number of wallets and new trades)
- **Memory**: 2GB recommended
- **CPU**: 2 vCPU recommended
- **Timeout**: 3600 seconds (1 hour)

## Cost Estimation

- **Cloud Run Job**: ~$0.10-0.50 per run (depending on runtime)
- **BigQuery**: Storage and query costs (minimal for incremental sync)
- **Dome API**: Free tier or paid based on usage

## Next Steps

1. Deploy the job to Cloud Run
2. Set up Cloud Scheduler for daily execution
3. Monitor first few runs to ensure proper operation
4. Adjust schedule/timeout as needed
