# Investigation: Model Only 55% min vs Low ML Trades

## Summary

FT_MODEL_ONLY (and other "model-only" style strategies) are configured with `model_threshold: 0.55` (55% min). Some trades in these wallets show **model_probability below 55%**. This doc explains why and what was done.

## Root Cause: Historical Bug (Pre-Feb 2026)

Before the **P0-1 ML pre-check** was added and migration `20260211_fix_use_model_for_model_strategies.sql` ran:

1. **`use_model` was false** for some model strategies (FT_MODEL_ONLY, FT_MODEL_BALANCED, etc.) in the DB.
2. Sync gated on **trader win rate** (using `model_threshold` as `min_trader_win_rate`), not on ML score.
3. Trades with 55%+ trader WR were inserted with **`model_probability = null`**.
4. **enrich-ml** cron later backfilled `model_probability` with the actual ML score.
5. Trader WR and ML can disagree: a trader with 60% WR might have an ML score of 48% for a specific trade. Those trades remained in the wallet with a now-visible low ML value.

So the low-ML trades you see are **legacy orders** from before the fix. New orders (since the fix) are correctly gated on ML at sync time.

## Current Behavior (Post-Fix)

- **Sync** (`app/api/ft/sync/route.ts`): For `use_model=true` wallets, we call `getPolyScore` before insert. If `model_probability` is null or < `model_threshold`, we skip.
- **enrich-ml** only processes orders where `model_probability IS NULL` (e.g. non-use_model wallets). It never overwrites existing scores.

## Verification

Run the investigation SQL to quantify:

```bash
# From project root, or run in Supabase SQL editor
psql $DATABASE_URL -f scripts/ft-model-only-low-ml-investigation.sql
```

Or paste the contents of `scripts/ft-model-only-low-ml-investigation.sql` into the Supabase SQL editor.

## Defensive Change Added

- **Probability normalization**: In sync and enrich-ml, if the API returns a value > 1 (e.g. 55 instead of 0.55), we divide by 100 before comparison. This guards against future API format changes.

## Options for Legacy Data

1. **Leave as-is** (recommended): Treat legacy low-ML trades as historical noise. Going forward, new orders respect the 55% threshold.
2. **One-time cleanup**: Delete or flag FT_MODEL_ONLY orders where `model_probability < 0.55`. This would alter historical PnL and break backtest consistency—only do if you explicitly want to "reset" the thesis.
