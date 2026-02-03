# Request BigQuery Partition Modification Quota Increase

## Current Situation
- **Current Limit**: 5,000 partition modifications per day per table
- **Status**: Quota exhausted (hitting limit)
- **Need**: 50,000 per day to complete backfill efficiently

## Steps to Request Increase

### Option 1: GCP Console (Recommended)

1. **Open Quotas Page**:
   ```
   https://console.cloud.google.com/iam-admin/quotas?project=gen-lang-client-0299056258
   ```

2. **Search for Quota**:
   - In the filter/search box, type: `partition modifications`
   - Or search for: `bigquery partition`
   - Look for: **"Number of partition modifications to a column partitioned table"**

3. **Select the Quota**:
   - Click the checkbox next to the quota
   - Click **"EDIT QUOTAS"** button

4. **Request Increase**:
   - **New value**: `50000` (or `20000` as minimum)
   - **Justification**: 
     ```
     Backfilling millions of trades from Dome API for PolyCopy project. 
     Current 5,000/day limit is insufficient for large-scale data ingestion. 
     Need 50,000 per day to complete backfill in reasonable time.
     ```

5. **Submit Request**:
   - Click **"Submit request"**
   - You'll receive email confirmation
   - Usually approved within hours

### Option 2: Contact Support

If you can't find the quota in the console:
- Go to: https://cloud.google.com/support
- Create a support case requesting BigQuery partition modification quota increase
- Mention project: `gen-lang-client-0299056258`
- Request: 50,000 partition modifications per day

## After Quota Increase

Once approved:
1. Restart the backfill job:
   ```bash
   ./run-backfill.sh
   ```

2. The job will automatically:
   - Skip already-processed wallets (checkpoint system)
   - Continue with remaining ~954 wallets
   - Use conservative settings (30s delays, 50K chunks)

## Alternative: Wait for Quota Reset

- Quota resets daily (usually midnight Pacific time)
- Can restart job tomorrow
- Will work but slower progress
