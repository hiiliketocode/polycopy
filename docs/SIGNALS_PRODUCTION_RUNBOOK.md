# Signals page — production runbook

## See results on the Signals page

- The Signals page at **/v2/signals** (admin-only) loads backtest data from `/data/signals-backtest-results.json`.
- **Recommended path:** Use **signals_backtest_cache** (filled from `ft_orders`). No markets or trades_public needed. Run:
  1. `npx tsx scripts/populate-signals-backtest-cache.ts --days 180`
  2. `npx tsx scripts/signals-backtest.ts --use-cache --out public/data/signals-backtest-results.json`
  3. Commit and push the JSON so the page shows the latest results.
- **trades_public_resolved** and **signals_backtest_enriched** need either (a) `markets.closed = true` and `winning_side` / `resolved_outcome` set, or (b) resolution fallback from `ft_orders` (trade_id = source_trade_id). If your `trades_public` rows don’t overlap with copied trades in `ft_orders`, those tables can stay empty; the cache path still works.

---

## Migrations to run (Supabase Dashboard → SQL or `supabase db push`)

Run these in order if you want the full signals pipeline (cache, trades_public_resolved, enriched):

1. **`20260221_create_signals_backtest_cache.sql`**  
   - Table for resolved ft_orders cache (optional; used by `--use-cache`).

2. **`20260222_create_trades_public_resolved.sql`**  
   - Resolved trades from trades_public + markets (for large-N backtest by price/size).  
   - After migration:  
     `npx tsx scripts/populate-trades-public-resolved.ts --days 30`  
   - Then:  
     `npx tsx scripts/signals-backtest.ts --source trades_public --out public/data/signals-backtest-results.json`  
   - Commit and push the updated JSON if you want production to use this source.

3. **`20260223_create_signals_backtest_enriched.sql`**  
   - Enriched table (resolution + rolling WR/ROI/count/conviction + ML from ft_orders).  
   - After migration:  
     `npx tsx scripts/populate-signals-backtest-enriched.ts --days 15`  
   - Then:  
     `npx tsx scripts/signals-backtest.ts --source enriched --out public/data/signals-backtest-results.json`  
   - Optional combo run:  
     `npx tsx scripts/signals-backtest-combos.ts --out public/data/signals-combo-results.json`

---

## Quick reference

| Goal | Command |
|------|--------|
| **Backtest from all resolved trades (max N)** | `npx tsx scripts/signals-backtest.ts --source ft_orders --out public/data/signals-backtest-results.json` |
| Backtest from cache table | `npx tsx scripts/signals-backtest.ts --use-cache --out public/data/signals-backtest-results.json` |
| Backtest from trades_public_resolved | `npx tsx scripts/signals-backtest.ts --source trades_public --out public/data/signals-backtest-results.json` |
| Backtest from enriched (15d) | `npx tsx scripts/signals-backtest.ts --source enriched --out public/data/signals-backtest-results.json` |
| Backtest with filter | `npx tsx scripts/signals-backtest.ts --source enriched --filter "ml_min=0.55,wr_min=0.6" --out ...` |
| Run combos | `npx tsx scripts/signals-backtest-combos.ts` (or `--out public/data/signals-combo-results.json`) |
| **Diagnose why tables are empty** | `npx tsx scripts/diagnose-signals-trades.ts` |
| Populate cache (7-day chunks to avoid timeout) | `npx tsx scripts/populate-signals-backtest-cache.ts --days 180` (default 7-day chunks) |

After regenerating `public/data/signals-backtest-results.json`, commit and push so the Signals page shows the new results.

**Why only a few hundred unique trades?** Backtest dedupes by **source_trade_id** (one row per unique trade we copied). `ft_orders` has many rows per trade (one per wallet that copied it). So N = unique resolved trades, not total ft_order rows. To get more N from **trades_public** you need resolution: either backfill `markets.closed` + `winning_side` for those condition_ids, or ensure the same traders/markets are in both trades_public and ft_orders so the (trader, condition_id, time) fallback can resolve them.
