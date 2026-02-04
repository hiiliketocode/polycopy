# BigQuery Trades Table Duplicates Analysis

**Date:** February 3, 2026  
**Table:** `gen-lang-client-0299056258.polycopy_v1.trades`

## Executive Summary

The BigQuery trades table contains **significant duplicate data**:

- **Total Rows:** 55,931,720
- **Distinct IDs:** 55,923,721 (7,999 duplicate IDs)
- **Distinct Idempotency Keys:** 49,259,932
- **Duplicate Idempotency Keys:** 3,569,876 groups

**Key Finding:** The same trade (wallet_address + tx_hash + order_hash) appears up to **99 times** with different IDs, indicating a critical issue in the deduplication logic.

---

## Duplicate Types

### 1. Duplicate IDs (7,999 cases)

Same `id` value appears multiple times. In most cases:
- Same `wallet_address`, `timestamp`, `tx_hash`, and `order_hash`
- ID is set to `order_hash` value
- Appears to be exact duplicates inserted multiple times

**Example:**
```
ID: 0x676113cd8343821f07ed175f16863343643abd482fd36197a64a47e8586120d4
- Appears 2 times
- Same wallet: 0x6916cc00aa1c3e75ecf4081df7cae7d2f3592fd4
- Same timestamp: 2026-02-03 16:38:36
- Same tx_hash: 0xb09d20dab94e046fd9db2c2d3fec8b539ef940d31dfe002f2c89575d9dc46c2d
- Same order_hash: 0x676113cd8343821f07ed175f16863343643abd482fd36197a64a47e8586120d4
```

### 2. Duplicate Idempotency Keys (3,569,876 groups)

Same combination of `wallet_address + tx_hash + order_hash` appears multiple times with **different IDs**.

**Critical Issue:** When `order_hash` is NULL, the same transaction is being inserted multiple times with different IDs.

**Example (worst case):**
```
Wallet: 0x8e9eedf20dfa70956d49f608a205e402d9df38e4
Tx Hash: 0xae540d18f974f4d0dc40171731f558423fec6c024f8365ddba05707acf9b0cac
Order Hash: NULL
- Appears 99 times
- Each has a DIFFERENT id
- All have same timestamp: 2026-01-07 06:10:31
```

This pattern suggests:
1. The ID generation logic creates different IDs when `order_hash` is NULL
2. The MERGE statement is not properly deduplicating based on idempotency keys
3. Multiple sync processes may be inserting the same trades

---

## Root Cause Analysis

### ID Generation Logic

From `daily-sync-trades-markets.py`:
```python
trade_id = trade.get('id') or trade.get('order_hash') or trade.get('tx_hash')
if not trade_id:
    # Fallback: create composite ID from wallet + timestamp + tx_hash
    tx_hash = trade.get('tx_hash', '')
    timestamp = trade.get('timestamp') or trade.get('created_at', 0)
    trade_id = f"{wallet.lower().strip()}_{timestamp}_{tx_hash}"[:100]
```

**Problem:** When `order_hash` is NULL and `id` is not provided, the fallback creates IDs that may not be unique across syncs.

### MERGE Statement

From `daily-sync-trades-markets.py`:
```sql
MERGE `{TRADES_TABLE}` AS target
USING (
    SELECT *
    FROM `{temp_table_id}`
    QUALIFY ROW_NUMBER() OVER (PARTITION BY id ORDER BY timestamp DESC) = 1
) AS source
ON target.id = source.id
```

**Problem:** The MERGE only checks `id`, not the idempotency key (`wallet_address + tx_hash + order_hash`). If the same trade gets different IDs, it will be inserted multiple times.

---

## Recommendations

### Immediate Actions

1. **Fix MERGE Statement**
   - Change MERGE condition to use idempotency key instead of just `id`
   - Use: `ON target.wallet_address = source.wallet_address AND target.tx_hash = source.tx_hash AND COALESCE(target.order_hash, '') = COALESCE(source.order_hash, '')`

2. **Fix ID Generation**
   - Ensure IDs are deterministic based on idempotency key
   - Consider using: `COALESCE(order_hash, 'tx:' || tx_hash || ':' || wallet_address)` for uniqueness

3. **Add Unique Constraint**
   - Create a unique index on `(wallet_address, tx_hash, COALESCE(order_hash, ''))` in BigQuery
   - This will prevent future duplicates

### Cleanup Strategy

1. **Identify Duplicates to Remove**
   ```sql
   -- Keep the most recent record for each idempotency key
   SELECT *
   FROM `gen-lang-client-0299056258.polycopy_v1.trades`
   QUALIFY ROW_NUMBER() OVER (
     PARTITION BY wallet_address, tx_hash, COALESCE(order_hash, '')
     ORDER BY timestamp DESC
   ) = 1
   ```

2. **Create Deduplicated Table**
   - Create new table with deduplicated data
   - Verify counts match expected distinct records
   - Replace original table

3. **Estimated Cleanup Impact**
   - Current: 55,931,720 rows
   - Expected after cleanup: ~49,259,932 rows (distinct idempotency keys)
   - Rows to remove: ~6,671,788 rows (11.9% of data)

---

## SQL Queries for Analysis

See `check-trades-duplicates-bigquery.sql` for comprehensive duplicate detection queries.

### Quick Checks

```sql
-- Summary
SELECT 
  COUNT(*) as total_rows,
  COUNT(DISTINCT id) as distinct_ids,
  COUNT(DISTINCT CONCAT(wallet_address, '|', tx_hash, '|', COALESCE(order_hash, ''))) as distinct_keys
FROM `gen-lang-client-0299056258.polycopy_v1.trades`;

-- Worst duplicates
SELECT 
  wallet_address, 
  tx_hash, 
  COALESCE(order_hash, '') as order_hash,
  COUNT(*) as dup_count
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
GROUP BY wallet_address, tx_hash, COALESCE(order_hash, '')
HAVING COUNT(*) > 1
ORDER BY dup_count DESC
LIMIT 20;
```

---

## Next Steps

1. ✅ Document duplicate findings
2. ⏳ Review and fix MERGE logic in sync scripts
3. ⏳ Fix ID generation logic
4. ⏳ Create deduplication script
5. ⏳ Test deduplication on staging table
6. ⏳ Apply to production table
7. ⏳ Add unique constraints to prevent future duplicates
