# Request BigQuery Partition Modification Quota Increase via Support

## Issue
The partition modification quota doesn't appear in the GCP Console quotas page. This is a **system limit** that may require contacting Google Cloud Support directly.

## Solution: Contact Google Cloud Support

### Option 1: Create Support Case (Recommended)

1. **Go to Support**:
   ```
   https://cloud.google.com/support
   ```

2. **Create a Case**:
   - Select project: `gen-lang-client-0299056258`
   - Category: **Technical** → **BigQuery**
   - Priority: **P3** or **P4** (non-urgent)

3. **Request Details**:
   ```
   Subject: Request BigQuery Partition Modification Quota Increase
   
   Description:
   I need to increase the BigQuery partition modification quota for 
   project gen-lang-client-0299056258.
   
   Current Limit: 5,000 partition modifications per day per table
   Requested Limit: 50,000 partition modifications per day per table
   
   Reason: Backfilling millions of trades from Dome API. The current 
   5,000/day limit is insufficient for large-scale data ingestion. 
   I'm hitting this limit daily and need a higher quota to complete 
   the backfill in reasonable time.
   
   Quota Metric: partition_modifications_per_column_partitioned_table
   Service: bigquery.googleapis.com
   Table: gen-lang-client-0299056258.polycopy_v1.trades
   ```

### Option 2: Use Support Chat

1. Go to: https://console.cloud.google.com/support
2. Click "Create Case" or use chat
3. Request the same quota increase

### Option 3: Email Support

If you have a support plan, email support with the details above.

## Alternative: Work Around the Limit

While waiting for quota increase:

1. **Wait for Daily Reset**: Quota resets daily (usually midnight Pacific)
2. **Process in Smaller Batches**: Current settings already optimized
3. **Extend Timeline**: Accept that backfill will take multiple days

## Current Job Status

- ✅ Job deployed with conservative settings (30s delays, 50K chunks)
- ✅ Checkpoint system working (47 wallets completed)
- ⏸️ Waiting for quota availability
- 📊 12.7M trades processed so far

## After Quota Increase

Once approved:
```bash
./run-backfill.sh
```

Job will automatically resume from checkpoint.
