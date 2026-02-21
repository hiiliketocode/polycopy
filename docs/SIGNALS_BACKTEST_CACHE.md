# Signals Backtest & Cache

The **/v2/signals** page shows performance tables by ML score, win rate, conviction, trader ROI, and trade count. Data comes from `scripts/signals-backtest.ts`. Querying `ft_orders` directly can hit Supabase statement timeouts, so we use a **lookup table** for larger runs.

## Quick run (live query, may timeout)

```bash
npx tsx scripts/signals-backtest.ts --out public/data/signals-backtest-results.json
```

This limits to the last 180 days and may only return a few thousand rows before timeout.

## Recommended: use the cache for tens of thousands of trades

1. **Apply the migration** (if not already applied):
   - Migration `20260221_create_signals_backtest_cache.sql` creates the table `signals_backtest_cache`.

2. **Populate the cache** in 30-day chunks (avoids timeout):
   ```bash
   npx tsx scripts/populate-signals-backtest-cache.ts
   npx tsx scripts/populate-signals-backtest-cache.ts --days 365   # optional: longer window
   ```
   Only trades from the **top 100 traders (30d PnL)** are written to the cache.

3. **Run the backtest from cache**:
   ```bash
   npx tsx scripts/signals-backtest.ts --use-cache --out public/data/signals-backtest-results.json
   ```

4. **Commit the JSON** (if you want it in the repo for production):
   ```bash
   git add -f public/data/signals-backtest-results.json
   git commit -m "Update signals backtest results"
   ```

If the cache exists and has rows, the script will **use it automatically** even without `--use-cache`; use `--use-cache` to require cache and fail if empty.

## Table: signals_backtest_cache

- One row per unique resolved trade (`source_trade_id`) from top-100 traders.
- Columns: `source_trade_id`, `trader_address`, `entry_price`, `outcome`, `model_probability`, `trader_win_rate`, `trader_roi`, `trader_resolved_count`, `conviction`, `order_time`, `refreshed_at`.
- Populate periodically (e.g. weekly) with `populate-signals-backtest-cache.ts` to include new resolved trades.
