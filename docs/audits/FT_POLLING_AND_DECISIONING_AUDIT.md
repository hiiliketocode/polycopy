# FT Polling and Trade Decisioning Engine Audit

**Date:** February 2026  
**Scope:** Forward Testing sync, strategy rules, trade capture, monitoring  
**Last updated:** Feb 2026 (post-fixes)

---

## Executive Summary

| Area | Status | Notes |
|------|--------|-------|
| **Polling** | ✅ | Sync cron every 2 min (`vercel.json`) + FT page (30s) + resolve cron every 10 min. |
| **Strategy rules** | ⚠️ Gaps | `trader_pool` unused. `use_model` + `model_threshold` now gate on **model_probability** (ML score at sync time). |
| **Trade capture** | ✅ Fixed | `ft_seen_trades` wired. All evaluated trades (taken + skipped) recorded with `source_trade_id`. Counts from DB. |
| **ft_seen_trades** | ✅ Wired | Sync inserts every evaluated trade. Dedup by `(wallet_id, source_trade_id)`. |
| **Model score** | ✅ Fixed | Computed at sync via predict-trade; stored in `ft_orders.model_probability`. enrich-ml cron backfills. |
| **Negative cash** | ✅ Fixed | Migration 20260325. API clamps cash_available ≥ 0. Sync blocks when cash ≤ 0. |
| **Compare tab** | ✅ Added | `/ft` has Compare Strategies tab with sortable config columns. |

---

## 1. Polling Architecture

### Current Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ FT Page Open                                                     │
│   → setInterval(30s) → POST /api/ft/sync                        │
│                      → POST /api/ft/resolve                     │
│                      → POST /api/ft/enrich-ml (limit: 5–10)     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Vercel Cron                                                      │
│   → */2 * * * *  → /api/cron/ft-sync (captures new trades)      │
│   → */10 * * * * → /api/cron/ft-resolve (resolves WON/LOST)     │
│   → 0 * * * *    → /api/cron/ft-snapshot (hourly snapshots)     │
└─────────────────────────────────────────────────────────────────┘
```

**Findings:**
- **Sync has cron** — Every 2 minutes (`/api/cron/ft-sync`); new trades are captured even when the FT page is closed.
- **Resolve has cron** — Every 10 minutes; WON/LOST updates when page is closed.
- **Enrich-ML** — Runs when page triggers it (and can be triggered by cron elsewhere); batch limit per run.

See **docs/audits/FT_POLLING_CONFIRMATION.md** for confirmation that every test gets the same trade feed and market data.

---

## 2. Strategy Rules — Implementation vs Intended

### 2.1 Rules Correctly Applied

| Rule | Source | Implementation |
|------|--------|----------------|
| `target_trader` / `target_traders` | extended filters | ✅ Only trades from these traders |
| `market_categories` | extended filters or column | ✅ Title keyword match |
| `price_min` / `price_max` | wallet | ✅ Checked |
| `min_edge` | wallet | ✅ edge = traderWinRate - price |
| `min_trader_resolved_count` | wallet | ✅ Per-wallet (e.g. 10 for niche, 30 default) |
| `min_conviction` | wallet | ✅ When set |
| `max_trader_win_rate`, `max_edge`, `max_conviction` | extended filters | ✅ Anti-strategies |
| `min/max_original_trade_usd` | extended filters | ✅ When set |
| Cash check | computed | ✅ Skips when cash &lt; bet size |
| Market status | marketMap | ✅ Skip resolved/closed, after market end |

### 2.2 Rules Not Implemented or Incorrect

| Rule | Intended | Actual | Impact |
|------|----------|--------|--------|
| **`trader_pool`** | Choose leaderboard (top_pnl, top_wr, high_volume, newcomers) | **Never used** | All strategies use same merged leaderboard |
| **`use_model` + `model_threshold`** | ML model score ≥ threshold | **Uses trader WR** as min_win_rate | T1_PURE_ML etc. filter on trader WR, not ML |
| **`bet_structures`** | Filter by bet type | **Not implemented** | Column exists, sync ignores it |

### 2.3 use_model vs ML Score

**Intended (T1_PURE_ML):** Only copy trades where ML model predicts ≥threshold probability.

**Actual (Feb 2026):** Sync computes `model_probability` at insert time via getPolyScore → predict-trade (BigQuery ML). `use_model=true` + `model_threshold` gate on **model_probability** when available. Fallback: `model_threshold` used as `min_trader_win_rate` when model not yet computed. enrich-ml cron backfills missing scores.

---

## 3. Trade Capture and Monitoring

### 3.1 Current Tables

| Table | Purpose | Used by Sync? |
|-------|---------|---------------|
| **ft_orders** | Trades taken (inserted) | ✅ Yes — inserts here |
| **ft_seen_trades** | All evaluated trades (taken + skipped), dedup by source_trade_id | ✅ Yes |

### 3.2 What Is Stored

- **Taken trades:** `ft_orders` — full row per trade (wallet, market, entry, size, etc.).
- **Skipped trades:** `ft_seen_trades` — outcome='skipped', skip_reason. **trades_seen / trades_skipped** derived from DB counts (no double-count).

### 3.3 ft_seen_trades Schema (Wired)

```sql
ft_seen_trades (
  wallet_id, source_trade_id, outcome, skip_reason, seen_at
)
```

- `outcome`: 'taken' | 'skipped'
- `skip_reason`: e.g. 'wrong_category', 'low_win_rate'

Sync loads existing (wallet_id, source_trade_id) to dedup; records every evaluated trade.

### 3.4 Analysis

See `docs/FORWARD_TESTING_ANALYSIS_GUIDE.md` for comparison prompts and strategy analysis notes.

---

## 4. Sync Logic Flow (Abbreviated)

```
1. Get active wallets (is_active, in test period)
2. Get traders: leaderboard (PNL, VOL, week) + target_traders from all wallets
3. Fetch trader stats from trader_global_stats
4. For each trader: fetch BUY trades from Polymarket API (paginated, max 200/trader)
5. Get market info (our DB + Polymarket fallback)
6. For each wallet:
   For each trade (since last_sync_time):
     - Target trader filter → skip if not in target_traders/target_trader
     - Market checks (exists, not resolved, not after end)
     - price_min/max, min_win_rate, min_edge, min_trader_count, min_conviction
     - Extended: max_wr, max_edge, max_conv, market_categories, trade size
     - Cash check
     - Duplicate check (ft_orders)
     → Insert into ft_orders or skip (count in reasons)
7. Update last_sync_time, trades_seen, trades_skipped
```

---

## 5. Recommendations

### High Priority

1. ~~**Add FT sync cron**~~ — **Done.** Sync runs every 2 minutes via `/api/cron/ft-sync`.
2. ~~**Wire ft_seen_trades**~~ — **Done.** Sync inserts into `ft_seen_trades` with `outcome` and `skip_reason`.

### Medium Priority

3. **Implement trader_pool** — When set, restrict trader set to the chosen pool (top_pnl, top_wr, etc.) instead of merged.
4. **Clarify use_model** — Either:
   - (A) Document that it means “trader WR threshold” and rename for clarity, or  
   - (B) Pre-filter by ML score (would need ML before insert, or two-phase sync).

### Low Priority

5. **Implement bet_structures** — Add filter if strategy definitions use it.
6. **Prune ft_seen_trades** — Run periodic cleanup (e.g. delete rows &gt; 30 days) per migration comment.

---

## 6. Files Reviewed

- `app/api/ft/sync/route.ts` — Main decision engine
- `app/ft/page.tsx` — Auto-sync trigger
- `app/ft/[id]/page.tsx` — Auto-sync trigger
- `app/api/cron/ft-resolve/route.ts` — Resolve cron
- `vercel.json` — Cron config
- `supabase/migrations/20260324_create_ft_seen_trades.sql`
- `supabase/migrations/20260209_thesis_strategies.sql`
