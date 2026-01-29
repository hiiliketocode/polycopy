# Auto-Restart & Resume Mechanism

## How It Works

### 1. Checkpoint After Each Wallet ✅
- **When**: Immediately after processing each wallet (trades + markets + events uploaded)
- **What**: Writes to `backfill_checkpoint` table with:
  - `wallet_address`: The wallet processed
  - `completed`: true
  - `upload_successful`: true/false (indicates if BigQuery upload succeeded)
  - `trade_count`: Number of trades processed
  - `gcs_file`: Path to GCS file (for debugging)
  - `processed_at`: Timestamp

### 2. Resume Logic ✅
- **On Startup**: Queries checkpoint table for wallets with `completed=true AND upload_successful=true`
- **Skips**: All successfully processed wallets
- **Processes**: Only remaining wallets
- **Result**: Resumes exactly where it left off

### 3. Failure Handling ✅
- **Wallet Processing Fails**: 
  - Checkpointed with `upload_successful=false`
  - Will be retried on next run
  - Other wallets continue processing

- **BigQuery Upload Fails**:
  - Retries 3 times with exponential backoff
  - If all retries fail, wallet marked as failed
  - Will be retried on next run

- **Checkpoint Write Fails**:
  - Retries 5 times (critical operation)
  - If fails, wallet may be reprocessed (safe - deduplication handles it)

### 4. Cloud Scheduler Auto-Restart ✅
- **Schedule**: Every 30 minutes (`*/30 * * * *`)
- **Action**: Triggers Cloud Run Job execution
- **Result**: Job starts, checks checkpoint, resumes from last position

## Example Flow

**Run 1:**
- Processes wallets 1-100
- Checkpoints each wallet as completed
- Job crashes/timeout at wallet 101

**Run 2 (Auto-restart):**
- Queries checkpoint: finds wallets 1-100 completed
- Skips wallets 1-100
- Starts processing from wallet 101
- Continues until completion or next failure

**Run 3 (if needed):**
- Resumes from last checkpoint
- Processes remaining wallets
- Completes all wallets

## Key Features

1. **Granular Checkpointing**: Each wallet checkpointed individually
2. **Failure Isolation**: One wallet failure doesn't stop others
3. **Automatic Retry**: Failed wallets retried on next run
4. **No Data Loss**: GCS files preserved even if BigQuery upload fails
5. **Deduplication**: MERGE handles duplicates if wallet reprocessed

## Monitoring

```bash
# Check completed wallets
bq query --use_legacy_sql=false \
  "SELECT COUNT(*) as completed \
   FROM \`gen-lang-client-0299056258.polycopy_v1.backfill_checkpoint\` \
   WHERE completed = true AND upload_successful = true"

# Check failed wallets (will be retried)
bq query --use_legacy_sql=false \
  "SELECT wallet_address, trade_count, processed_at \
   FROM \`gen-lang-client-0299056258.polycopy_v1.backfill_checkpoint\` \
   WHERE completed = true AND upload_successful = false"

# Check progress percentage
bq query --use_legacy_sql=false \
  "SELECT \
     (SELECT COUNT(*) FROM \`gen-lang-client-0299056258.polycopy_v1.backfill_checkpoint\` WHERE completed = true AND upload_successful = true) as completed, \
     (SELECT COUNT(DISTINCT wallet_address) FROM \`gen-lang-client-0299056258.polycopy_v1.traders\` WHERE wallet_address IS NOT NULL) as total, \
     ROUND((SELECT COUNT(*) FROM \`gen-lang-client-0299056258.polycopy_v1.backfill_checkpoint\` WHERE completed = true AND upload_successful = true) * 100.0 / \
           (SELECT COUNT(DISTINCT wallet_address) FROM \`gen-lang-client-0299056258.polycopy_v1.traders\` WHERE wallet_address IS NOT NULL), 2) as percent_complete"
```

## Guarantees

✅ **No Duplicate Processing**: Checkpoint prevents reprocessing completed wallets
✅ **No Data Loss**: GCS files preserved, can retry uploads
✅ **Automatic Recovery**: Failed wallets automatically retried
✅ **Exact Resume**: Resumes from exact last position
✅ **Idempotent**: Safe to run multiple times (deduplication handles it)
