# Backfill Job Setup

## Current Issue
The `polycopy_v1.traders` table doesn't exist in BigQuery yet. You have two options:

## Option 1: Create Traders Table in BigQuery (Recommended)

Create a table in BigQuery with your trader wallet addresses:

```sql
CREATE TABLE `gen-lang-client-0299056258.polycopy_v1.traders` (
  wallet_address STRING NOT NULL
);

-- Insert your wallet addresses
INSERT INTO `gen-lang-client-0299056258.polycopy_v1.traders` (wallet_address)
VALUES
  ('0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee'),
  ('0x0d3b10b8eac8b089c6e4a695e65d8e044167c46b'),
  -- Add more wallet addresses here
;
```

Then redeploy and run the job - it will automatically use the table.

## Option 2: Use Environment Variable (Quick Test)

Deploy with wallet addresses directly:

```bash
export DOME_API_KEY="bee6330e5f143b9de00363c368bcd9a7290fd7c7"
export WALLET_ADDRESSES="0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee,0x0d3b10b8eac8b089c6e4a695e65d8e044167c46b"

gcloud run jobs deploy dome-backfill-job \
    --image=us-central1-docker.pkg.dev/gen-lang-client-0299056258/polycopy-backfill/backfill-job:latest \
    --region=us-central1 \
    --project=gen-lang-client-0299056258 \
    --service-account=supabase-polyscore-api@gen-lang-client-0299056258.iam.gserviceaccount.com \
    --max-retries=0 \
    --task-timeout=86400 \
    --tasks=1 \
    --set-env-vars="DOME_API_KEY=${DOME_API_KEY},WALLET_ADDRESSES=${WALLET_ADDRESSES}" \
    --memory=2Gi \
    --cpu=2
```

## Monitoring

After deployment, monitor with:

```bash
# Real-time logs
./monitor-backfill.sh

# Or view in console
https://console.cloud.google.com/run/detail/us-central1/dome-backfill-job/logs?project=gen-lang-client-0299056258
```
