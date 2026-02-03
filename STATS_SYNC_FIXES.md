# Stats Sync Fixes Applied

## Issue Found: Case-Sensitive Wallet Matching ❌

**Problem**: The BigQuery queries were using case-sensitive matching (`t.wallet_address = @wallet`), but wallet addresses are stored in lowercase in BigQuery.

**Fix Applied**: Changed all queries to use `LOWER(t.wallet_address) = LOWER(@wallet)` for case-insensitive matching.

## Files Updated

1. ✅ `sync-trader-stats-from-bigquery.py` - Both `calculate_global_stats` and `calculate_profile_stats` functions
2. ✅ `debug-stats-query.sql` - Updated to use case-insensitive matching

## Next Steps

1. **Find a wallet with trades** - Run `find-wallet-with-trades.sql` in BigQuery to get a valid test wallet
2. **Test the debug query** - Use the wallet from step 1 in `debug-stats-query.sql`
3. **Run the sync job** - The job should now find trades correctly

## Why You Saw Zeros

The zeros you're seeing are likely because:
1. **Most trades are open** (not resolved) - So `pnl_usd` and `is_win` are NULL
2. **Counts should work** - `l_count`, `d30_count`, `d7_count` should have values even for open trades
3. **Win rates default to 0.5** - When there are no resolved trades, win rate defaults to 50%

## Expected Behavior

After the fix:
- ✅ Trade counts (`l_count`, `d30_count`, `d7_count`) should populate correctly
- ✅ Win rates will be 0.5 if no resolved trades, or actual rate if there are resolved trades
- ✅ PnL/ROI will be 0 for wallets with only open trades (this is correct!)
- ✅ PnL/ROI will calculate correctly for wallets with resolved trades

## Testing

Run this in BigQuery to verify:
```sql
-- Get a wallet with trades
SELECT wallet_address, COUNT(*) as trades
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE side = 'BUY'
GROUP BY wallet_address
ORDER BY trades DESC
LIMIT 1;

-- Then use that wallet in debug-stats-query.sql
```
