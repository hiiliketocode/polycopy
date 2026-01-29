# How to Increase BigQuery Load Job Quota

## Current Situation
- **Quota Name**: Number of imports or query appends per table
- **Current Limit**: ~1,000 load jobs per day per table
- **Status**: Quota exhausted (blocking backfill job)
- **Table Affected**: `polycopy_v1.trades_staging`
- **Project**: `gen-lang-client-0299056258`

## Method 1: Google Cloud Console (Recommended - Easiest)

### Step-by-Step:

1. **Open Quotas Page**:
   ```
   https://console.cloud.google.com/iam-admin/quotas?project=gen-lang-client-0299056258
   ```

2. **Filter Quotas**:
   - In the search/filter box, type: `imports or query appends`
   - Or filter by Service: `BigQuery API`
   - Look for: **"Number of imports or query appends per table"**

3. **Select the Quota**:
   - Click the checkbox next to the quota row
   - Click the **"EDIT QUOTAS"** button at the top

4. **Request Increase**:
   - **New limit**: `10000` (or `50000` for more headroom)
   - **Justification** (copy/paste):
     ```
     Backfilling trades from Dome API for PolyCopy project. Processing 
     1,000+ wallet addresses, each requiring one load job. Current limit 
     of 1,000/day is insufficient. Need 10,000+ to complete backfill 
     efficiently. Using staging table approach to minimize partition 
     modifications.
     ```

5. **Submit**:
   - Click **"Submit request"**
   - You'll receive email confirmation
   - Approval typically takes 24-48 hours

## Method 2: gcloud CLI

```bash
# First, install alpha components if needed
gcloud components install alpha

# List quotas to find exact name
gcloud alpha service-usage quotas list \
  --service=bigquery.googleapis.com \
  --consumer=projects/gen-lang-client-0299056258 \
  --filter="metric:imports OR metric:appends"

# Request increase (replace QUOTA_NAME with actual name from above)
gcloud alpha service-usage quotas update QUOTA_NAME \
  --service=bigquery.googleapis.com \
  --consumer=projects/gen-lang-client-0299056258 \
  --value=10000
```

## Method 3: Support Ticket

If you can't find the quota in the console:

1. Go to: https://console.cloud.google.com/support/cases
2. Click **"Create Case"**
3. Select **"Quota Increase Request"**
4. Fill in:
   - **Service**: BigQuery API
   - **Quota**: Number of imports or query appends per table
   - **Current Limit**: 1,000/day
   - **Requested Limit**: 10,000/day
   - **Justification**: Use the template below

### Support Ticket Template:

```
Subject: BigQuery Load Job Quota Increase Request

I need to increase the quota for "Number of imports or query appends per table" 
for the BigQuery API in project gen-lang-client-0299056258.

Current Limit: 1,000 load jobs per table per day
Requested Limit: 10,000 load jobs per table per day

Justification:
We are running a data backfill job that processes trades from an external 
API for approximately 1,000 wallet addresses. Each wallet requires one 
load job to import trades into BigQuery. With the current limit of 1,000 
jobs per day, we can only process 1,000 wallets per day, which is 
insufficient for our backfill needs.

We are using a staging table approach (polycopy_v1.trades_staging) to 
minimize partition modifications and following BigQuery best practices. 
The increased quota will allow us to complete the backfill in a 
reasonable timeframe.

Table: polycopy_v1.trades_staging
Project: gen-lang-client-0299056258
```

## After Quota Increase

Once approved:

1. **No action needed** - The backfill job will automatically:
   - Resume loading trades from GCS to BigQuery
   - Continue processing remaining wallets
   - Complete automatically

2. **Monitor progress**:
   ```bash
   gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=dome-backfill-v3" --limit=50
   ```

## Alternative Solution: Batch Multiple Files

Instead of requesting quota increase, we can modify the code to batch multiple 
wallet GCS files into a single load job. This would reduce quota usage from 
~1,000 jobs to ~50-100 jobs.

**Pros**: No quota increase needed, faster approval
**Cons**: Requires code changes, slightly more complex

Would you like me to implement batching instead?

## Current Status

- ✅ 184 wallets processed (18% complete)
- ✅ 88.6M trades fetched and stored in GCS
- ⏳ Waiting for quota reset or increase to load trades
- 🔄 Auto-retrying every 30 minutes via Cloud Scheduler
