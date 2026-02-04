# Trader Stats Missing Wallets - Issue Summary & Solution

## Problem Identified ✅

**Root Cause**: The BigQuery tables `trader_global_stats` and `trader_profile_stats` are **BASE TABLEs** (not views) and are **not being updated** with new wallets.

### Current State:
- ✅ **Supabase sync script is working correctly** - It reads from BigQuery and syncs to Supabase
- ❌ **BigQuery tables are missing 433 wallets** (974 vs 1,407 expected)
- ❌ **No process exists to populate/update the BigQuery tables**

### Counts:
- BigQuery `trader_global_stats`: **974 rows**
- Supabase `trader_global_stats`: **974 rows** (matches BigQuery - sync is working)
- Supabase `traders` table: **1,407 wallets**
- BigQuery `trades` table: **1,068 unique wallets with trades**
- **Missing**: ~433 wallets (1,407 - 974 = 433)

## Why This Happened

The sync script (`sync-trader-stats-from-bigquery.py`) was changed to read from existing BigQuery tables instead of calculating stats (to avoid quota issues). However, **there's no process that populates those BigQuery tables** with new wallets.

## Solution Options

### Option 1: Create BigQuery Scheduled Query (Recommended) ⭐

Create a BigQuery scheduled query that periodically rebuilds the stats tables from the `trades` table. This should run:
- After each incremental sync (or on a schedule)
- Calculates stats for ALL wallets with trades
- Updates both `trader_global_stats` and `trader_profile_stats`

**Steps:**
1. Create a SQL query that calculates all stats from `trades` table
2. Set it up as a BigQuery Scheduled Query
3. Schedule it to run after incremental sync (e.g., at :10 and :40 past each hour)

### Option 2: Modify Sync Script to Calculate Missing Stats

Modify `sync-trader-stats-from-bigquery.py` to:
1. Get all wallets from Supabase `traders` table
2. Check which ones are missing from BigQuery `trader_global_stats`
3. Calculate stats for missing wallets from BigQuery `trades` table
4. Insert into BigQuery tables
5. Then sync to Supabase

**Pros**: Self-contained, no separate scheduled query needed
**Cons**: More complex, may hit quota limits if calculating for many wallets

### Option 3: Convert to Materialized Views

Convert the tables to BigQuery materialized views that auto-refresh:
```sql
CREATE MATERIALIZED VIEW `gen-lang-client-0299056258.polycopy_v1.trader_global_stats_mv`
PARTITION BY DATE(_PARTITIONTIME)
CLUSTER BY wallet_address
AS SELECT ... FROM trades ...
```

**Pros**: Automatic updates
**Cons**: Requires understanding the exact calculation logic

## Immediate Action Items

1. **Check if BigQuery Scheduled Query exists**:
   ```bash
   bq ls --transfer_config --project_id=gen-lang-client-0299056258
   ```

2. **Find missing wallets**:
   - Run `backfill-missing-trader-stats-bigquery.sql` in BigQuery console
   - Or use `check-stats-table-counts.py` script

3. **Decide on solution**:
   - If you have the stats calculation SQL: Create scheduled query (Option 1)
   - If you want to keep it simple: Modify sync script (Option 2)
   - If you want automatic updates: Convert to views (Option 3)

## Verification

After implementing a solution, verify with:
```bash
python3 check-stats-table-counts.py
```

Expected result:
- BigQuery `trader_global_stats`: ~1,407 rows (or ~1,068 if only counting wallets with trades)
- Supabase `trader_global_stats`: Should match BigQuery

## Files Created

- `check-stats-table-counts.py` - Script to check counts in BigQuery and Supabase
- `backfill-missing-trader-stats-bigquery.sql` - SQL to find missing wallets
- `TRADER_STATS_MISSING_WALLETS_ANALYSIS.md` - Detailed analysis
- `TRADER_STATS_ISSUE_SUMMARY.md` - This file

## Next Steps

1. **Review this summary** with the team
2. **Choose a solution approach** (Option 1, 2, or 3)
3. **Implement the solution**
4. **Verify counts match** using `check-stats-table-counts.py`
5. **Monitor** to ensure new wallets are added going forward
