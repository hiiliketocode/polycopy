# Eliminate Staging Table Analysis

## Current Situation

### Daily Sync (Already Direct to Production) ✅
- **Script:** `daily-sync-trades-markets.py`
- **Method:** Uses temp table + MERGE directly to production
- **Deduplication:** Built-in via MERGE with idempotency key
- **Status:** Already working correctly, no staging needed

### Backfill Scripts (Use Staging) ⚠️
- **Scripts:** `backfill_v3_hybrid.py`, `backfill.py`, `backfill_v2.py`
- **Method:** Write to staging table, then copy to production
- **Reason:** To avoid partition modification quota limits
- **Problem:** Creates duplicates, requires manual copy step

## Why Staging Was Used

1. **Partition Modification Quota:**
   - BigQuery limits partition modifications per day
   - Writing directly to partitioned production table hits quota quickly
   - Staging table is non-partitioned (no quota limit)

2. **Batch Processing:**
   - Backfill processes millions of rows
   - Staging allows accumulating data before final insert
   - Single partition modification instead of many

## Problems with Staging

1. **Duplicates:** 64% duplicate rate (106M duplicates out of 165M rows)
2. **Manual Step:** Requires separate copy operation
3. **Complexity:** Extra table to manage and monitor
4. **Data Lag:** Staging data not immediately available
5. **Schema Mismatch:** Staging has fewer columns than production

## Solution: Eliminate Staging

### Option 1: Use MERGE (Like Daily Sync) ✅ RECOMMENDED

**How it works:**
- Use temp table (like daily sync does)
- MERGE into production with deduplication
- Only inserts new rows, updates existing ones
- Single partition modification per batch

**Benefits:**
- No staging table needed
- Built-in deduplication
- Same pattern as daily sync (consistent)
- No manual copy step

**Implementation:**
```python
# Create temp table
temp_table = create_temp_table()

# Load data to temp table
load_to_temp(temp_table, trades)

# MERGE to production (deduplicates automatically)
MERGE production AS target
USING (
    SELECT * FROM temp_table
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY wallet_address, tx_hash, COALESCE(order_hash, '')
        ORDER BY timestamp DESC
    ) = 1
) AS source
ON target.wallet_address = source.wallet_address
   AND target.tx_hash = source.tx_hash
   AND COALESCE(target.order_hash, '') = COALESCE(source.order_hash, '')
WHEN NOT MATCHED THEN INSERT ROW
WHEN MATCHED AND target.timestamp < source.timestamp THEN UPDATE SET ...
```

### Option 2: Use Clustering Instead of Partitioning

**How it works:**
- Production table uses clustering (wallet_address, timestamp)
- No partition modifications needed
- Can write directly without quota issues

**Benefits:**
- No staging needed
- Direct writes
- Still efficient queries

**Drawbacks:**
- Requires table recreation (migration)
- May affect existing queries

### Option 3: Keep Staging but Fix It

**How it works:**
- Keep staging for backfill
- Fix deduplication at source
- Auto-copy after backfill completes

**Benefits:**
- Minimal changes
- Keeps partition quota protection

**Drawbacks:**
- Still need staging table
- Still need copy step
- More complexity

## Recommendation: Option 1 (MERGE Pattern)

### Why MERGE is Better:

1. **Already Proven:** Daily sync uses this pattern successfully
2. **No Staging:** Eliminates extra table
3. **Built-in Deduplication:** MERGE handles duplicates automatically
4. **Consistent Pattern:** Same approach for daily sync and backfill
5. **No Manual Steps:** Fully automated

### Implementation Plan:

1. **Update Backfill Scripts:**
   - Replace staging writes with temp table + MERGE
   - Use same pattern as `daily-sync-trades-markets.py`
   - Remove staging table creation code

2. **Test:**
   - Run backfill with new pattern
   - Verify deduplication works
   - Check partition modification count

3. **Cleanup:**
   - After successful migration, drop staging table
   - Remove staging-related scripts
   - Update documentation

### Code Changes Needed:

**In `backfill_v3_hybrid.py` (and similar):**

**Remove:**
```python
TRADES_STAGING_TABLE = f"{PROJECT_ID}.polycopy_v1.trades_staging"
USE_STAGING_TABLE = True
ensure_staging_table_exists(client)
load_to_staging(...)
copy_staging_to_production(...)
```

**Replace with:**
```python
# Use temp table + MERGE (same as daily sync)
load_trades_to_bigquery(client, trades)  # Already exists!
```

**The `load_trades_to_bigquery()` function in `daily-sync-trades-markets.py` already does this correctly!**

## Markets and Events Tables

### Current Status:
- Daily sync already updates markets and events ✅
- Uses MERGE pattern (no staging) ✅
- Fetches new markets/events for new condition_ids ✅

### Recommendation:
- **No changes needed** - markets and events are already handled correctly
- Daily sync fetches and updates them automatically
- Uses same MERGE pattern (no staging)

## Action Items

1. ✅ **Copy staging to production** (in progress)
2. ⏳ **Update backfill scripts** to use MERGE pattern
3. ⏳ **Test updated backfill** scripts
4. ⏳ **Drop staging table** after verification
5. ⏳ **Remove staging-related code** and scripts
6. ✅ **Markets/Events** - already working correctly

## Conclusion

**Staging table is NOT needed** because:
- Daily sync already writes directly to production ✅
- MERGE pattern handles deduplication ✅
- Temp tables avoid partition quota issues ✅
- Same pattern works for backfill ✅

**Next Steps:**
1. Finish copying staging data to production
2. Update backfill scripts to use MERGE pattern
3. Remove staging table and related code
4. Document the simplified architecture
