# Backfill Deduplication Fix

**Date:** February 3, 2026  
**Issue:** Backfill scripts were using `id` field for deduplication instead of the idempotency key, causing duplicates.

## Problem

All backfill scripts were using `ON target.id = source.id` for MERGE statements, which allowed the same trade (same wallet_address + tx_hash + order_hash) to be inserted multiple times if it had different `id` values.

## Solution

Updated all backfill scripts to use the **idempotency key** for deduplication:
- **Idempotency Key:** `wallet_address + tx_hash + COALESCE(order_hash, '')`
- **MERGE Condition:** `ON target.wallet_address = source.wallet_address AND target.tx_hash = source.tx_hash AND COALESCE(target.order_hash, '') = COALESCE(source.order_hash, '')`
- **QUALIFY Clause:** `PARTITION BY wallet_address, tx_hash, COALESCE(order_hash, '') ORDER BY timestamp DESC, id DESC`

## Files Updated

### Python Scripts

1. **`daily-sync-trades-markets.py`**
   - Fixed `load_trades_to_bigquery()` function
   - MERGE now uses idempotency key

2. **`catchup-trades-gap.py`**
   - Fixed `load_trades_to_bigquery()` function
   - MERGE now uses idempotency key

3. **`load-missing-trades-from-gcs.py`**
   - Fixed two MERGE statements:
     - Staging table merge
     - Production table merge
   - Both now use idempotency key

4. **`backfill_v2.py`**
   - Fixed `upload_to_bigquery_with_deduplication()` function
   - Now checks if table is trades table and uses appropriate deduplication:
     - Trades: idempotency key
     - Other tables (markets, events): `id` field

5. **`backfill_v3_hybrid.py`**
   - Fixed `load_gcs_to_bigquery()` function
   - Now checks if table is trades table and uses appropriate deduplication:
     - Trades: idempotency key
     - Other tables (markets, events): `id` field

6. **`backfill.py`**
   - Fixed `copy_staging_to_production()` function
   - INSERT query now uses idempotency key in QUALIFY clause

### Shell Scripts

7. **`copy-staging-to-production.sh`**
   - Updated INSERT query to use idempotency key

8. **`restore-from-staging.sh`**
   - Updated INSERT query to use idempotency key

9. **`dedup-production-table.sh`**
   - Updated DELETE query to use idempotency key

## Deduplication Logic

### For Trades Table

```sql
MERGE `trades` AS target
USING (
    SELECT *
    FROM `temp_table`
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY wallet_address, tx_hash, COALESCE(order_hash, '')
        ORDER BY timestamp DESC, id DESC
    ) = 1
) AS source
ON target.wallet_address = source.wallet_address
   AND target.tx_hash = source.tx_hash
   AND COALESCE(target.order_hash, '') = COALESCE(source.order_hash, '')
WHEN NOT MATCHED THEN INSERT ROW
```

### For Other Tables (Markets, Events)

```sql
MERGE `table` AS target
USING (
    SELECT *
    FROM `temp_table`
    QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp DESC) = 1
) AS source
ON target.id = source.id
WHEN NOT MATCHED THEN INSERT ROW
```

## Testing

After these changes, all backfill processes will:
1. ✅ Properly deduplicate trades based on idempotency key
2. ✅ Prevent the same trade from being inserted multiple times
3. ✅ Keep the most recent record when duplicates exist
4. ✅ Maintain backward compatibility for markets and events tables

## Verification

To verify deduplication is working:

```sql
-- Check for remaining duplicates
SELECT 
    wallet_address, 
    tx_hash, 
    COALESCE(order_hash, '') as order_hash,
    COUNT(*) as duplicate_count
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
GROUP BY wallet_address, tx_hash, COALESCE(order_hash, '')
HAVING COUNT(*) > 1
```

This should return 0 rows after backfill runs.

## Related Files

- `TRADES_DUPLICATES_ANALYSIS.md` - Analysis of duplicate issue
- `check-trades-duplicates-bigquery.sql` - Queries to check for duplicates
- `dedupe-trades-bigquery.py` - One-time deduplication script (already run)
