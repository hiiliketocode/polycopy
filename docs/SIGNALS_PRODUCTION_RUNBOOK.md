# Signals page — production runbook

## See results on the Signals page

- The app is **pushed to production**; the Signals page at **/v2/signals** (admin-only) loads backtest data from `/data/signals-backtest-results.json`.
- That JSON is **already in the repo** (from a previous run). So the page should show results without any extra steps.
- If you later switch to the **enriched** pipeline (15-day, resolution + ML + trader stats), run the migrations below, then populate and backtest as in “Enriched pipeline (optional)” below.

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
| Backtest from cache (ft_orders) | `npx tsx scripts/signals-backtest.ts --use-cache --out public/data/signals-backtest-results.json` |
| Backtest from trades_public | `npx tsx scripts/signals-backtest.ts --source trades_public --out public/data/signals-backtest-results.json` |
| Backtest from enriched (15d) | `npx tsx scripts/signals-backtest.ts --source enriched --out public/data/signals-backtest-results.json` |
| Backtest with filter | `npx tsx scripts/signals-backtest.ts --source enriched --filter "ml_min=0.55,wr_min=0.6" --out ...` |
| Run combos | `npx tsx scripts/signals-backtest-combos.ts` (or `--out public/data/signals-combo-results.json`) |

After regenerating `public/data/signals-backtest-results.json`, commit and push so the Signals page shows the new results.
