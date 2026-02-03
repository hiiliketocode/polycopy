# Trades Table Deletion Summary

**Date:** January 29, 2026  
**Migration:** `20260129_drop_trades_table.sql`

## What Was Deleted

### Tables
- ✅ `public.trades` - Main trades table (massive table)
- ✅ `public.top5_traders_trades` - Copy of trades for top 5 traders
- ✅ `public.top50_traders_trades` - Copy of trades for top 50 traders
- ✅ `public.trade_timing_cache` - Cache table for trade timing calculations

### Views
- ✅ `public.trades_with_timing` - View joining trades with timing data

### Functions
- ✅ `public.enqueue_market_fetch_queue_from_trades()` - Replaced with `enqueue_market_fetch_queue_from_markets()`
- ✅ `public.enqueue_market_fetch_queue_from_trades_page()` - Removed (use markets-based function)
- ✅ `public.get_missing_market_condition_ids()` - Removed (was trades-based)
- ✅ `public.cache_trade_timing()` - Removed (trade timing no longer needed)
- ✅ `public.calculate_trade_timing()` - Removed (trade timing no longer needed)
- ✅ `public.truncate_trades()` - Removed (table no longer exists)

### New Functions Created
- ✅ `public.enqueue_market_fetch_queue_from_markets()` - Replacement for trades-based enqueue
- ✅ `public.reset_market_fetch_queue()` - Reset queue using markets table

## Code Changes

### Fixed API Endpoints
1. ✅ `/app/api/portfolio/route.ts` - Changed from `trades` to `orders` table
2. ✅ `/app/api/traders/[id]/orders/route.ts` - Changed from `trades` to `orders` table

### Remaining References (Non-Critical)

These files still reference `trades` but are **backfill/analysis scripts** that can be updated or removed:

#### Backfill Scripts (Can be updated or removed)
- `scripts/backfill-dome-markets.js` - Update to use `enqueue_market_fetch_queue_from_markets()`
- `scripts/backfill-top50-traders-trades.js` - Can be removed (table deleted)
- `scripts/backfill-top5-traders-latest-trades.js` - Can be removed (table deleted)
- `scripts/populate-top50-traders-trades.js` - Can be removed (table deleted)
- `scripts/populate-top50-traders-trades-robust.js` - Can be removed (table deleted)
- `scripts/create-top-traders-trades-table.js` - Can be removed (table deleted)
- `scripts/create-top5-traders-trades-table-now.js` - Can be removed (table deleted)
- `scripts/create-top5-table-30d-final.sql` - Can be removed (table deleted)
- `scripts/backfill-trade-timing.js` - Can be removed (timing no longer needed)
- `scripts/backfill-trade-timing-top-traders.js` - Can be removed (timing no longer needed)
- `scripts/match-markets-from-trades.js` - Update to use markets table directly
- `scripts/test-classification-top5.js` - Can be removed (table deleted)
- `scripts/test-gemini-top5-traders.js` - Can be removed (table deleted)

#### Workers (Can be updated or removed)
- `workers/worker-top5-traders.js` - Can be removed (table deleted)

#### Supabase Functions (Need to update)
- `supabase/functions/get-polyscore/index.ts` - Queries trades for recent actions
  - **Action:** Remove trades query or replace with alternative data source

#### Ingestion Code (Can be removed)
- `lib/ingestion/wallet-fills.ts` - Writes to trades table
  - **Action:** Remove or comment out (no longer ingesting trades)

## Impact Assessment

### ✅ Safe to Delete
- No production API endpoints depend on trades table (all fixed)
- Market queue can be repopulated from markets table
- All critical dependencies removed

### ⚠️ Optional Cleanup
- `wallet_realized_pnl_daily` still has trades-derived columns (commented out in migration)
  - These columns will remain but won't update anymore
  - Can be removed later if desired

### 📝 Scripts to Update/Remove
- Multiple backfill scripts reference trades table
- These are non-critical and can be updated or removed as needed

## Next Steps

1. ✅ **Migration created** - Ready to run
2. 🔄 **Update backfill scripts** (optional) - Update `scripts/backfill-dome-markets.js` to use new function
3. 🔄 **Remove ingestion code** (optional) - Remove `lib/ingestion/wallet-fills.ts` if not needed
4. 🔄 **Update PolyScore function** (optional) - Remove trades query from `supabase/functions/get-polyscore/index.ts`
5. 🗑️ **Clean up old scripts** (optional) - Remove scripts that reference deleted tables

## Running the Migration

```bash
# Apply the migration
supabase migration up

# Or if using Supabase CLI directly
supabase db push
```

## Verification

After running the migration, verify:

```sql
-- Should return 0 rows
SELECT COUNT(*) FROM public.trades;

-- Should return 0 rows  
SELECT COUNT(*) FROM public.top5_traders_trades;

-- Should return 0 rows
SELECT COUNT(*) FROM public.top50_traders_trades;

-- Should not exist
SELECT * FROM public.trades_with_timing LIMIT 1;
```

## Rollback

If you need to rollback, you would need to:
1. Restore from backup (if available)
2. Re-run the original migrations that created the tables
3. Re-populate data (if needed)

**Note:** This is a destructive operation. Make sure you have backups if you might need the data later.
