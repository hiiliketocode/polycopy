# Staging to Production Migration Summary

## Current Status

### Staging Table
- **Rows:** 165,569,306
- **Unique keys:** 58,953,954  
- **Duplicates:** 106,615,352 (64.39%)
- **Last modified:** Feb 4, 2026 03:09 UTC

### Production Table (Before Copy)
- **Rows:** 49,758,618
- **Latest trade:** Feb 4, 2026 22:39 UTC

### Copy Operation
- **Status:** Running in background (PID: 94168)
- **Method:** MERGE with deduplication
- **Expected new rows:** ~58M (after deduplication)
- **Log file:** `/tmp/copy-staging.log`

## What We're Doing

1. **Copying non-duplicate trades from staging to production**
   - Deduplicates on: `wallet_address + tx_hash + id`
   - Keeps latest record (ORDER BY timestamp DESC)
   - Uses MERGE to skip existing rows

2. **Analyzing staging table necessity**
   - Daily sync already writes directly to production ✅
   - Backfill scripts use staging (but don't need to)
   - Recommendation: Eliminate staging, use MERGE pattern

## Key Findings

### Daily Sync (Already Correct) ✅
- **Script:** `daily-sync-trades-markets.py`
- **Method:** Temp table + MERGE directly to production
- **No staging needed** - already working perfectly

### Backfill Scripts (Need Update) ⚠️
- **Scripts:** `backfill_v3_hybrid.py`, `backfill.py`, `backfill_v2.py`
- **Current:** Write to staging, then copy to production
- **Problem:** Creates duplicates, requires manual step
- **Solution:** Use same MERGE pattern as daily sync

### Markets & Events Tables ✅
- **Status:** Already updated correctly by daily sync
- **Method:** MERGE pattern (no staging)
- **No changes needed**

## Recommendations

### 1. Eliminate Staging Table
**Why:**
- Daily sync doesn't use it (already direct to production)
- Backfill can use same MERGE pattern
- Reduces complexity and duplicate issues
- No partition quota issues with MERGE

**How:**
- Update backfill scripts to use `load_trades_to_bigquery()` from daily sync
- Remove staging table creation code
- Drop staging table after migration

### 2. Prevent Duplicates
**Current deduplication:**
- MERGE uses: `wallet_address + tx_hash + order_hash`
- Keeps latest record (ORDER BY timestamp DESC)
- Only inserts new rows

**Ensure:**
- All scripts use same deduplication key
- Always use MERGE (not INSERT)
- Check for duplicates periodically

### 3. Always Get Latest Trades
**Daily sync already does this:**
- Uses checkpoint to track last sync time
- Fetches trades since last checkpoint
- Updates markets/events for new condition_ids
- Updates open markets

**No changes needed** - already working correctly!

## Next Steps

1. ✅ **Copy staging to production** (in progress)
2. ⏳ **Monitor copy operation** - check `/tmp/copy-staging.log`
3. ⏳ **Verify production table** after copy completes
4. ⏳ **Update backfill scripts** to use MERGE pattern
5. ⏳ **Test updated backfill** scripts
6. ⏳ **Drop staging table** after verification
7. ⏳ **Remove staging-related code**

## Monitoring

```bash
# Check copy progress
tail -f /tmp/copy-staging.log

# Check production table size
bq query --use_legacy_sql=false "
SELECT COUNT(*) as total_rows
FROM \`gen-lang-client-0299056258.polycopy_v1.trades\`
"

# Check for duplicates
python3 check-dome-pipeline.py
```

## Files Created

- `copy-staging-to-production-dedup.py` - Copy script with deduplication
- `ELIMINATE_STAGING_ANALYSIS.md` - Detailed analysis
- `STAGING_TO_PRODUCTION_SUMMARY.md` - This document
