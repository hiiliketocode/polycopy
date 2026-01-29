# Backfill v3 Hybrid - Features & Optimizations

## Speed Optimizations ✅

1. **Parallel Processing**: 10 workers (configurable via MAX_WORKERS)
2. **GCS Streaming**: Writes trades as fetched (no memory buildup)
3. **Reduced Delays**: 0.05s API delay (20 RPS)
4. **Efficient Batching**: Markets fetched in batches of 100
5. **No Memory Deduplication**: Uses BigQuery MERGE instead
6. **Connection Pooling**: Reusable HTTP sessions

## Reliability Features ✅

1. **Retry Logic**:
   - HTTP requests: 5 retries with exponential backoff
   - BigQuery operations: 3 retries with exponential backoff
   - Checkpoint operations: 5 retries (critical for resume)

2. **Error Handling**:
   - Individual wallet failures don't stop entire job
   - Failed wallets marked in checkpoint for retry
   - Comprehensive error logging

3. **Checkpointing**:
   - Each wallet checkpointed immediately after processing
   - Tracks upload_successful flag
   - Resume capability built-in

## Auto-Restart & Resume ✅

1. **Checkpoint Table**:
   - Stores wallet_address, completed, upload_successful, trade_count, gcs_file
   - Only wallets with upload_successful=true are skipped
   - Failed wallets automatically retried on next run

2. **Verification**:
   - Optional verification that wallets actually have trades in BigQuery
   - Reprocesses wallets marked complete but missing trades
   - Fixes broken checkpoints automatically

3. **Cloud Scheduler**:
   - Auto-restarts job every 30 minutes
   - Job resumes from checkpoint table
   - No manual intervention needed

## Deduplication ✅

1. **Trades**: QUALIFY ROW_NUMBER on id (in copy_staging_to_production)
2. **Markets**: MERGE on condition_id (updates existing)
3. **Events**: MERGE on event_slug (updates existing)
4. **Within-Run**: Tracks fetched markets/events to avoid duplicate API calls

## Partition Quota Handling ✅

1. **Staging Table**: Non-partitioned (no quota)
2. **Single Copy**: One INSERT at end (1 partition mod total)
3. **Avoids 5,000/day limit**: No partition modifications during processing

## Performance Metrics

- **API Rate**: 20 RPS (0.05s delay)
- **Parallel Workers**: 10 (configurable)
- **Memory**: 4GB (configurable)
- **CPU**: 4 vCPU (configurable)
- **Timeout**: 24 hours

## Deployment

```bash
# Set DOME_API_KEY
export DOME_API_KEY="your-key"

# Deploy
./deploy-backfill-v3.sh

# Job will auto-restart every 30 minutes
# Resume capability: Automatic via checkpoint table
```

## Monitoring

```bash
# Check progress
bq query --use_legacy_sql=false --project_id=gen-lang-client-0299056258 \
  "SELECT COUNT(DISTINCT wallet_address) as completed_wallets \
   FROM \`gen-lang-client-0299056258.polycopy_v1.backfill_checkpoint\` \
   WHERE completed = true AND upload_successful = true"

# Check failed wallets
bq query --use_legacy_sql=false --project_id=gen-lang-client-0299056258 \
  "SELECT wallet_address, trade_count, processed_at \
   FROM \`gen-lang-client-0299056258.polycopy_v1.backfill_checkpoint\` \
   WHERE completed = true AND upload_successful = false"
```
