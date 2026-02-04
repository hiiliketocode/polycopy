# Trader Stats Missing Wallets Analysis

## Problem Summary

- **Supabase `trader_global_stats`**: 974 rows
- **Supabase `trader_profile_stats`**: 974 rows (estimated)
- **Total wallets in `traders` table**: 1,407 wallets
- **Missing**: ~433 wallets (1,407 - 974 = 433)

## Root Cause

The BigQuery tables `trader_global_stats` and `trader_profile_stats` are **BASE TABLEs** (not views), which means they need to be populated by a process. However:

1. ✅ The sync script (`sync-trader-stats-from-bigquery.py`) is working correctly - it reads from BigQuery and syncs to Supabase
2. ❌ **The BigQuery tables themselves are not being updated with new wallets**
3. ❌ There's no scheduled query or process that populates these BigQuery tables

## Current Flow

```
BigQuery Tables (trader_global_stats, trader_profile_stats)
    ↓ (read only)
sync-trader-stats-from-bigquery.py
    ↓ (upsert)
Supabase Tables (trader_global_stats, trader_profile_stats)
```

**The problem**: The BigQuery tables are missing 433 wallets, so Supabase will never get them until BigQuery is updated.

## Solution Options

### Option 1: Create BigQuery Scheduled Query (Recommended)
Create a scheduled query that periodically rebuilds/updates the BigQuery tables from the `trades` table:

```sql
-- This would need to be created as a BigQuery Scheduled Query
CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.trader_global_stats` AS
SELECT 
  wallet_address,
  -- Calculate stats from trades table
  ...
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
GROUP BY wallet_address
```

### Option 2: Convert to Materialized Views
Convert the tables to materialized views that automatically refresh:

```sql
CREATE MATERIALIZED VIEW `gen-lang-client-0299056258.polycopy_v1.trader_global_stats_mv`
AS SELECT ... FROM trades ...
```

### Option 3: Update Sync Script to Calculate Stats
Modify `sync-trader-stats-from-bigquery.py` to:
1. Get all wallets from Supabase `traders` table
2. Calculate stats from BigQuery `trades` table for missing wallets
3. Write directly to Supabase (bypassing BigQuery tables)

## Next Steps

1. **Check if BigQuery tables should be views or scheduled queries**
2. **Create a script to populate BigQuery tables with missing wallets**
3. **Set up a scheduled query or process to keep BigQuery tables updated**

## Verification

Run `check-stats-table-counts.py` to verify counts:
```bash
python3 check-stats-table-counts.py
```

Expected output after fix:
- BigQuery trader_global_stats: ~1,407 rows
- Supabase trader_global_stats: ~1,407 rows
