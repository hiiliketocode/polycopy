# Dome Backfill Job Deployment Guide

This guide explains how to deploy the long-running backfill job to Google Cloud Run.

## Files Created

1. **backfill.py** - The main Python script that processes trades from the Dome API
2. **requirements.txt** - Python dependencies
3. **Dockerfile** - Container definition for Cloud Run
4. **deploy-backfill.sh** - Automated deployment script

## Prerequisites

1. Google Cloud SDK (`gcloud`) installed and authenticated
2. Docker installed and running
3. `DOME_API_KEY` environment variable set
4. Appropriate IAM permissions for:
   - Artifact Registry
   - Cloud Run Jobs
   - BigQuery (for the service account)

## Quick Deployment (Automated)

```bash
# Set your DOME API key
export DOME_API_KEY="your-api-key-here"

# Run the deployment script
./deploy-backfill.sh
```

## Manual Deployment Steps

If you prefer to run the commands manually:

### 1. Authenticate Docker with Artifact Registry

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
```

### 2. Create Artifact Registry Repository (if needed)

```bash
gcloud artifacts repositories create polycopy-backfill \
    --repository-format=docker \
    --location=us-central1 \
    --project=gen-lang-client-0299056258
```

### 3. Build the Docker Image

```bash
docker build -t us-central1-docker.pkg.dev/gen-lang-client-0299056258/polycopy-backfill/backfill-job:latest .
```

### 4. Push the Image to Artifact Registry

```bash
docker push us-central1-docker.pkg.dev/gen-lang-client-0299056258/polycopy-backfill/backfill-job:latest
```

### 5. Deploy as Cloud Run Job

```bash
gcloud run jobs deploy dome-backfill-job \
    --image=us-central1-docker.pkg.dev/gen-lang-client-0299056258/polycopy-backfill/backfill-job:latest \
    --region=us-central1 \
    --project=gen-lang-client-0299056258 \
    --service-account=supabase-polyscore-api@gen-lang-client-0299056258.iam.gserviceaccount.com \
    --max-retries=0 \
    --task-timeout=86400 \
    --tasks=1 \
    --set-env-vars="DOME_API_KEY=${DOME_API_KEY}" \
    --memory=2Gi \
    --cpu=2
```

## Executing the Job

After deployment, execute the job:

```bash
gcloud run jobs execute dome-backfill-job \
    --region=us-central1 \
    --project=gen-lang-client-0299056258
```

## Monitoring the Job

### View Logs

```bash
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=dome-backfill-job" \
    --limit=50 \
    --project=gen-lang-client-0299056258
```

### Check Job Status

```bash
gcloud run jobs executions list \
    --job=dome-backfill-job \
    --region=us-central1 \
    --project=gen-lang-client-0299056258
```

## Configuration Details

- **Project ID**: `gen-lang-client-0299056258`
- **Region**: `us-central1` (can be changed in the script)
- **Service Account**: `supabase-polyscore-api@gen-lang-client-0299056258.iam.gserviceaccount.com`
- **Timeout**: 24 hours (86400 seconds)
- **Memory**: 2Gi
- **CPU**: 2 vCPU
- **Tasks**: 1 (single task execution)

## How It Works

1. **Deduplication**: Before processing, the script queries BigQuery to fetch all existing `event_slugs` and `condition_ids` to prevent duplicate API calls and data entry.

2. **Trader Processing**: The script queries the `polycopy_v1.traders` table to get the list of wallet addresses to process.

3. **API Pagination**: For each wallet, it paginates through the Dome API's `/get-trade-history` endpoint using cursors.

4. **Data Normalization**: Trades are separated into three lists:
   - `trades` - Individual trade records
   - `markets` - Market metadata
   - `events` - Event metadata

5. **Batch Upload**: After processing all trades for a wallet, it performs bulk "APPEND" jobs to the three BigQuery tables using `load_table_from_json`.

6. **Rate Limiting**: Includes a 0.5 second delay between API calls to respect rate limits.

## Troubleshooting

### Authentication Issues

If you encounter authentication errors:
```bash
gcloud auth login
gcloud auth application-default login
```

### Service Account Permissions

Ensure the service account has the following roles:
- `roles/bigquery.dataEditor`
- `roles/bigquery.jobUser`
- `roles/run.invoker` (if needed)

### BigQuery Table Access

Verify that the service account has access to:
- `polycopy_v1.traders` (read)
- `polycopy_v1.events` (write)
- `polycopy_v1.markets` (write)
- `polycopy_v1.trades` (write)

## Cost Considerations

- Cloud Run Jobs are billed for actual execution time
- BigQuery load jobs are free (data storage and querying are billed separately)
- Consider monitoring costs if processing millions of trades
