# Signals Backtest & Data Sources

The **/v2/signals** page shows performance tables. For **statistical significance** we use **trades_public** (resolved via markets): ~1.9M trades. We also support **ft_orders** (copied trades) for ML score, win rate, conviction, ROI.

## Data sources

1. **trades_public** (recommended for large N)
   - Raw trades from the feed; we join with **markets** (closed + winning_side/resolved_outcome) to get WON/LOST.
   - **Does not have:** ML score, conviction, trader_win_rate, trader_roi, trader_resolved_count — those are only in **ft_orders** (computed when we copy a trade). So trades_public is for **price and size** backtests only.
   - Populate: `npx tsx scripts/populate-trades-public-resolved.ts` (writes **trades_public_resolved**). Use `--delay 100` (ms between chunks) to avoid overloading the DB on large runs.
   - Backtest: `npx tsx scripts/signals-backtest.ts --source trades_public --out public/data/signals-backtest-results.json`.
   - Outputs **byPrice** and **bySize** buckets only.

2. **ft_orders** (for ML, WR, conviction, ROI)
   - Resolved trades our system has **copied**. Use when you want signals that require model_probability, trader_win_rate, conviction, etc.
   - Populate cache: `npx tsx scripts/populate-signals-backtest-cache.ts` (writes **signals_backtest_cache**).
   - Backtest: `npx tsx scripts/signals-backtest.ts --use-cache --out public/data/signals-backtest-results.json` (or without --use-cache to try cache then live).
   - Outputs **byMlScore**, **byWinRate**, **byConviction**, **byTraderRoi**, **byTradeCount**.

## Will this overload the DB?

- Populate runs in **chunks** (2k rows from trades_public per loop, then a batched markets lookup, then 500-row upserts). It does not run one giant join.
- For very large runs (e.g. 1.9M trades), you can pass **`--delay 100`** (or another ms value) to sleep between chunks and reduce load.
- Prefer running the populate script during off-peak or from a one-off job rather than in a tight cron.

## Why ft_orders alone was skewed

- **ft_orders** only has trades we chose to copy (filtered by wallet rules). That’s a small, non-random subset.
- **trades_public** has all trades from the feed; once resolved via markets we get a much larger, more representative N for price/size backtests.

## Quick run (live query, may timeout)

```bash
npx tsx scripts/signals-backtest.ts --out public/data/signals-backtest-results.json
```

This uses cache if present; otherwise fetches from `ft_orders` (last 180 days) and may timeout with a small N.

## Recommended: populate cache, then backtest (max N)

1. **Apply the migration** (if not already applied):
   - Migration `20260221_create_signals_backtest_cache.sql` creates the table `signals_backtest_cache`.

2. **Populate the cache** with **all** resolved copied trades (30-day chunks, no trader filter):
   ```bash
   npx tsx scripts/populate-signals-backtest-cache.ts
   npx tsx scripts/populate-signals-backtest-cache.ts --days 365   # optional: longer window
   ```

3. **Run the backtest** (uses all cached trades by default):
   ```bash
   npx tsx scripts/signals-backtest.ts --use-cache --out public/data/signals-backtest-results.json
   ```
   For a “top 100 traders only” view:
   ```bash
   npx tsx scripts/signals-backtest.ts --use-cache --top100 --out public/data/signals-backtest-results.json
   ```

4. **Commit the JSON** (if you want it in the repo for production):
   ```bash
   git add -f public/data/signals-backtest-results.json
   git commit -m "Update signals backtest results"
   ```

If the cache exists and has rows, the script will **use it automatically** even without `--use-cache`; use `--use-cache` to require cache and fail if empty.

## Table: signals_backtest_cache

- One row per unique resolved trade (`source_trade_id`) — **any trader** we’ve copied.
- Columns: `source_trade_id`, `trader_address`, `entry_price`, `outcome`, `model_probability`, `trader_win_rate`, `trader_roi`, `trader_resolved_count`, `conviction`, `order_time`, `refreshed_at`.
- Populate periodically (e.g. weekly) with `populate-signals-backtest-cache.ts` to include new resolved trades.
