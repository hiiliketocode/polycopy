# BigQuery Data Transfer Service Setup Guide

## Overview

BigQuery Data Transfer Service (DTS) bypasses the "imports or query appends per table" quota limit by using separate quota limits. This allows us to transfer data from GCS to BigQuery without hitting load job quotas.

## Benefits

- ✅ **Separate quota limits** (10,000 files per transfer, 15 TB per run)
- ✅ **Bypasses load job quota** ("imports per table" limit)
- ✅ **Automated transfers** (scheduled or manual)
- ✅ **Handles batching automatically**

## Setup Steps

### 1. Install DTS Library

```bash
pip install google-cloud-bigquery-datatransfer
```

### 2. Enable DTS API

```bash
gcloud services enable bigquerydatatransfer.googleapis.com --project=gen-lang-client-0299056258
```

### 3. Run Setup Script

```bash
python setup-dts-transfer.py
```

This will create a transfer configuration that:
- Transfers from: `gs://gen-lang-client-0299056258-backfill-temp/trades/*.jsonl`
- To: `polycopy_v1.trades_staging`
- Format: NEWLINE_DELIMITED_JSON
- Write mode: WRITE_APPEND

### 4. Verify Transfer Configuration

```bash
bq ls --transfer_config --transfer_location=us --project_id=gen-lang-client-0299056258
```

### 5. Test Manual Transfer

```bash
python setup-dts-transfer.py run
```

Or via gcloud:

```bash
bq mk --transfer_run \
  --transfer_config=projects/gen-lang-client-0299056258/locations/us/transferConfigs/gcs-to-trades-staging \
  --run_time=now
```

## How It Works

1. **Backfill script fetches trades** → Writes to GCS as JSONL files
2. **DTS automatically transfers** → All files matching pattern are loaded
3. **No quota limits** → DTS uses separate quotas (10K files per transfer)

## Configuration

The backfill script uses DTS by default (`USE_DTS=true`). To disable:

```bash
export USE_DTS=false
```

If DTS is unavailable or fails, the script automatically falls back to batched load jobs.

## Monitoring

Check transfer status:

```bash
bq show --transfer_run \
  --transfer_location=us \
  --transfer_config=projects/gen-lang-client-0299056258/locations/us/transferConfigs/gcs-to-trades-staging \
  --run_id=<RUN_ID>
```

Or via Python:

```python
from google.cloud import bigquery_datatransfer

client = bigquery_datatransfer.DataTransferServiceClient()
run = client.get_transfer_run(
    name="projects/gen-lang-client-0299056258/locations/us/transferConfigs/gcs-to-trades-staging/runs/<RUN_ID>"
)
print(f"Status: {run.state}")
```

## Troubleshooting

### Transfer not found
- Run `setup-dts-transfer.py` to create the configuration
- Ensure DTS API is enabled

### Transfer fails
- Check GCS bucket permissions
- Verify file format matches (JSONL)
- Check BigQuery table schema matches

### Fallback to load jobs
- If DTS fails, script automatically uses batched load jobs
- Check logs for DTS error messages

## Next Steps

1. ✅ Run setup script
2. ✅ Deploy updated backfill script
3. ✅ Test with a small batch
4. ✅ Monitor transfer status
