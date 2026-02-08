# Forward Testing Analysis Guide

**Purpose:** Help agents and analysts compare FT strategy performance and learn from results.

**Last updated:** Feb 2026

---

## 1. Data Model & Key Tables

| Table | Purpose | Notes |
|-------|---------|------|
| **ft_wallets** | Strategy configs. One row per strategy. | `starting_balance` may have been increased to fix negative cash (see migration 20260325). |
| **ft_orders** | Trades taken. Each row = one copied trade. | `model_probability` = ML score from BigQuery (poly_predictor_v11). `conviction` = trade_value / trader_avg_trade_size. |
| **ft_seen_trades** | All evaluated trades (taken + skipped). | `(wallet_id, source_trade_id)` unique. `outcome` = 'taken' or 'skipped'. `skip_reason` for audits. Prevents double-counting across syncs. |

**Metrics:**
- **trades_seen** / **trades_skipped** — Counts from `ft_seen_trades`. Accurate; no double-count on refresh.
- **cash_available** — `starting_balance + realized_pnl - open_exposure`. Clamped to ≥ 0 in API.
- **total_pnl** — `realized_pnl + unrealized_pnl`. Independent of `starting_balance`.
- **model_probability** — Fetched at sync time (once per trade) via predict-trade → BigQuery ML. Backfilled by enrich-ml cron if sync failed.

---

## 2. Strategy Comparison Matrix

Use the **Compare Strategies** tab on `/ft` to sort by config columns. Key differentiators:

| Strategy | Model? | Price Range | Min Edge | Allocation | Compare Against |
|----------|--------|-------------|----------|------------|-----------------|
| **FT_MODEL_ONLY** | 55%+ | 0–100¢ | 0% | Kelly 25% | Pure ML signal. Compare to any model-gated strategy to see if trader filters add alpha. |
| **FT_HIGH_CONVICTION** | No | 0–50¢ | 0% | FIXED | Trader WR only (95%+). Compare to MODEL_ONLY to see if ML adds value for underdogs. |
| **FT_UNDERDOG_HUNTER** | 50%+ | 0–50¢ | 5% | FIXED | Model + edge. Compare to HIGH_CONVICTION (no model). |
| **FT_FAVORITE_GRINDER** | No | 50–90¢ | 3% | FIXED | Favorites only. Compare to underdog strategies (different risk profile). |
| **FT_MODEL_BALANCED** | 50%+ | 0–100¢ | 5% | FIXED | Broad model+trader. Baseline for diversified approach. |
| **FT_SHARP_SHOOTER** | 55%+ | 10–70¢ | 10% | Kelly 50% | Highest bar: 65% WR, 1.5x conviction, 50+ trades. Compare to MODEL_BALANCED for selectivity vs volume. |

---

## 3. Analysis Prompts for Agents

- **"Which strategy has the best risk-adjusted return?"** — Compare total_pnl, win_rate, avg_trade_size. High WR + low avg size = lower variance.
- **"Does the ML model add value?"** — Compare FT_MODEL_ONLY vs FT_HIGH_CONVICTION (no model, similar underdog focus) or vs FT_FAVORITE_GRINDER.
- **"Does conviction filtering help?"** — FT_SHARP_SHOOTER (min_conviction 1.5x) vs FT_MODEL_BALANCED (no conviction filter).
- **"Is Kelly sizing better than FIXED?"** — Compare strategies with same filters but different allocation_method.
- **"Are underdogs or favorites more profitable?"** — FT_UNDERDOG_HUNTER vs FT_FAVORITE_GRINDER.
- **"How many trades did each strategy skip and why?"** — Check `ft_seen_trades` WHERE outcome='skipped', GROUP BY skip_reason.

---

## 4. Chat History: Fixes Applied (Feb 2026)

1. **Trades skipped miscounting** — Wired `ft_seen_trades`. Every evaluated trade (taken or skipped) is recorded. Counts derived from DB, not incremented. Unique `source_trade_id` prevents double-count on refresh.
2. **Model score missing** — Model probability now computed at sync time and stored in `ft_orders.model_probability`. Conviction stored in `ft_orders.conviction`. enrich-ml cron (every 10 min) backfills any that failed.
3. **Compare Strategies tab** — New tab on `/ft` with sortable columns: P&L, Model, Model Min, Price Range, Min Edge, Allocation, Bet Size, Min/Max Bet, Kelly %, Min Trades, Min Conviction, Target/Categories.
4. **Negative cash** — Migration 20260325 raises `starting_balance` for wallets with negative cash (shortfall + buffer). API clamps `cash_available` to ≥ 0. Sync blocks new trades when cash ≤ 0.

---

## 5. Files & Endpoints

| Path | Purpose |
|------|---------|
| `app/ft/page.tsx` | FT list: Performance tab, Compare Strategies tab |
| `app/ft/[id]/page.tsx` | Individual wallet: positions, trades, performance |
| `app/api/ft/sync/route.ts` | Sync new trades; records to ft_seen_trades; computes model at insert |
| `app/api/ft/wallets/route.ts` | Returns wallets + stats; clamps cash_available |
| `app/api/ft/enrich-ml/route.ts` | Backfill model_probability for orders missing it |
| `app/api/cron/ft-resolve/route.ts` | Resolves WON/LOST; triggers enrich-ml |
| `supabase/migrations/20260324_create_ft_seen_trades.sql` | ft_seen_trades schema |
| `supabase/migrations/20260325_fix_ft_negative_cash.sql` | Fix negative cash |

---

## 6. Wallet Description Enhancements

Each wallet's `detailed_description` may include:
- **Note (Feb 2026):** Starting balance adjustment for negative cash (if applied).
- **Analysis — Compare against:** Which strategies to compare this one to (migration 20260326).
- **Key metrics:** What to watch when evaluating results.
