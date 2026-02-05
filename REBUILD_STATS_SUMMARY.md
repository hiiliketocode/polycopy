# Rebuild Trader Stats - Complete Solution

## Overview

This solution rebuilds the BigQuery `trader_global_stats` and `trader_profile_stats` tables from scratch using all trades data, ensuring all 1400+ traders are included, then syncs to Supabase.

## Files Created

1. **`rebuild-trader-stats-bigquery.sql`**
   - Rebuilds `trader_global_stats` table
   - Calculates stats for all wallets with trades
   - Includes lifetime (L), 30-day (D30), and 7-day (D7) metrics

2. **`rebuild-trader-profile-stats-bigquery.sql`**
   - Rebuilds `trader_profile_stats` table
   - Groups by `final_niche`, `structure` (bet_structure), and `bracket` (price_bracket)
   - Only includes profiles with minimum 5 trades

3. **`rebuild-all-trader-stats.py`**
   - Orchestrates the rebuild process
   - Executes SQL queries to rebuild BigQuery tables
   - Verifies coverage (ensures all traders are included)
   - Syncs updated stats to Supabase

## Stats Calculated

### Global Stats (per wallet)
- **Counts**: L_count, D30_count, D7_count
- **Win Rates**: L_win_rate, D30_win_rate, D7_win_rate
- **PnL**: L_total_pnl_usd, D30_total_pnl_usd, D7_total_pnl_usd
- **ROI %**: L_total_roi_pct, D30_total_roi_pct, D7_total_roi_pct
- **Averages**: avg_pnl_trade_usd, avg_trade_size_usd (for each period)
- **Position Stats**: avg_pos_size_usd, avg_trades_per_pos

### Profile Stats (per wallet + niche + structure + bracket)
- Same metrics as global stats, but filtered by:
  - `final_niche` (e.g., NFL, NBA, CRYPTO)
  - `structure` (bet_structure: Prop, Yes/No, etc.)
  - `bracket` (price_bracket: LOW, MID, HIGH)
- Minimum 5 trades per profile

## How to Run

```bash
# Make sure you have .env.local with credentials
python3 rebuild-all-trader-stats.py
```

The script will:
1. ✅ Rebuild `trader_global_stats` in BigQuery
2. ✅ Rebuild `trader_profile_stats` in BigQuery
3. ✅ Verify coverage (check all traders are included)
4. ✅ Sync to Supabase

## Expected Results

- **Global Stats**: ~1,400+ wallets (all traders with trades)
- **Profile Stats**: ~50,000+ records (multiple profiles per trader)
- **Coverage**: 100% of traders with trades should be included

## Notes

- The rebuild uses `CREATE OR REPLACE TABLE`, so it completely rebuilds the tables
- Only BUY trades are included (SELL trades are not counted separately)
- Win rates default to 0.5 if no resolved trades exist
- PnL/ROI are 0 for open (unresolved) trades
- Profile stats require markets to have `market_subtype` and `bet_structure` classifications

## Verification

After running, verify in BigQuery:
```sql
-- Check global stats count
SELECT COUNT(*) FROM `gen-lang-client-0299056258.polycopy_v1.trader_global_stats`;

-- Check profile stats count
SELECT COUNT(*) FROM `gen-lang-client-0299056258.polycopy_v1.trader_profile_stats`;

-- Verify all traders with trades are included
SELECT 
  COUNT(DISTINCT wallet_address) as traders_with_trades
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE side = 'BUY';

SELECT 
  COUNT(*) as traders_in_stats
FROM `gen-lang-client-0299056258.polycopy_v1.trader_global_stats`;
```

These counts should match (or be very close).

## Troubleshooting

- **BigQuery Quota**: If you hit quota limits, wait for reset (midnight UTC)
- **Missing Classifications**: Profile stats require markets to have `market_subtype` and `bet_structure`. Run market classification backfill first if needed.
- **Import Errors**: Make sure `sync-trader-stats-from-bigquery.py` exists in the same directory
