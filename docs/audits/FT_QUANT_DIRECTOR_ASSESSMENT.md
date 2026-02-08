# Forward Testing: Quant Director Assessment

**Perspective:** Senior Quant / ML Director (e.g. Jane Street, Citadel)  
**Scope:** FT sync, strategy execution, data integrity, operational robustness  
**Date:** Feb 2026

---

## Executive Summary

The Forward Testing system has solid foundations (dedup, audit trail, cash safeguards) but contains **critical design flaws** that invalidate core thesis experiments and create operational risk. A top quant firm would not deploy this without addressing the P0 items below.

| Severity | Count | Top Issue |
|----------|-------|-----------|
| **P0 Critical** | 4 | `use_model` strategies do NOT gate on ML score |
| **P1 High** | 5 | No sync cron, stale stats, Kelly edge cases |
| **P2 Medium** | 6 | Schema mismatches, voided markets, observability |
| **P3 Low** | 4 | Documentation, timezone, minor logic |

---

## P0 — Critical (Invalidates Strategy Theses)

### 1. `use_model` / `model_threshold` Do NOT Gate on ML Score

**Finding:** When `use_model=true`, the sync uses `model_threshold` as **min_win_rate** (trader WR), not as a filter on `model_probability`. The ML score is computed **after** the trade is inserted.

```typescript
// sync/route.ts ~529
const minWinRate = extFilters.min_trader_win_rate ?? 
  (wallet.use_model && wallet.model_threshold ? wallet.model_threshold : 0);
// ...
if (traderWinRate < minWinRate) { ... skip ... }
```

**Impact:** FT_MODEL_ONLY, FT_T1_PURE_ML, and any "model-gated" strategy are **misnamed**. They filter on trader win rate, not ML. The thesis "Can the ML model predict winners without trader stats?" cannot be tested—you are testing trader WR.

**Fix:** For `use_model=true`, compute model score **before** the insert decision. If ML is not available in time, skip the trade (do not insert) or run a two-phase sync: evaluate ML first, then insert only if `model_probability >= model_threshold`.

---

### 2. Extended Filters Stored Incompatibly — parseExtendedFilters Often Returns {}

**Finding:** `parseExtendedFilters` does `JSON.parse(wallet.detailed_description)`. Default and thesis wallets store **markdown** in `detailed_description`, not JSON. Parse fails → returns `{}` → no target_trader, market_categories, etc.

**Impact:** Wallets created via add-wallet with `target_traders`, `market_categories` store JSON. Migration 20260326 appends markdown to `detailed_description`. If a wallet had JSON, the append **corrupts** it (invalid JSON). Mixed usage of one field for display vs machine-readable config is fragile.

**Fix:** Introduce a dedicated `extended_filters JSONB` column. Migrate existing JSON from `detailed_description` into it. Use `extended_filters` for sync logic; keep `detailed_description` for human-readable text only.

---

### 3. No FT Sync Cron — Capture Depends on Page Being Open

**Finding:** `vercel.json` has no cron for `/api/ft/sync`. Sync runs only when the FT page triggers it (30s interval). If no one has the page open, **no new trades are captured**.

**Impact:** Strategy performance is a function of "who had the page open when." Tests are not comparable across time or across strategies. Overnight, weekend, and holiday gaps are systemic.

**Fix:** Add a cron for sync (e.g. every 2–5 minutes). Ensure cron secret is set and endpoints validate it.

---

### 4. Kelly Sizing Uses Stale `current_balance` and Has No Guard Against `entryPrice === 1`

**Finding:** `calculateBetSize` uses `wallet.current_balance`, which is updated by resolve, not by sync. Between syncs, `current_balance` can be stale. Also:

```typescript
const fullKelly = edge / (1 - entryPrice);
```

If `entryPrice` is 0.99, `(1 - entryPrice) = 0.01` → `fullKelly` can be 50x. Min/max bet caps mitigate, but the formula can produce extreme values. No explicit guard for `entryPrice >= 0.99`.

**Impact:** Kelly strategies may over- or under-size relative to true bankroll. Extreme prices can cause numeric instability.

**Fix:** Use `startingBalance + realizedPnl - openExposure` (or equivalent) as bankroll inside sync. Add `if (entryPrice >= 0.99) return minBet` (or skip) before Kelly calculation.

---

## P1 — High (Material Risk or Incorrect Behavior)

### 5. trader_global_stats May Be Stale or Missing for Leaderboard Traders

**Finding:** Sync reads from Supabase `trader_global_stats`. That table is populated by `sync-trader-stats-from-bigquery` and `sync-trader-leaderboard` (1am UTC). New leaderboard traders may not exist in `trader_global_stats`. Fallback: `{ winRate: 0.5, tradeCount: 0, avgTradeSize: 0 }`.

**Impact:** New hot traders get 50% WR and conviction=1. They pass filters they might fail with real stats. Skews strategy composition.

**Fix:** Consider fetching stats on-demand from BigQuery or a real-time source for leaderboard traders missing from Supabase. Or explicitly exclude traders with `tradeCount < N` when stats are missing.

---

### 6. Resolve: Voided / Cancelled Markets Never Resolved

**Finding:** `resolutionMap` is only set when `maxPrice > 0.9`. Voided or cancelled markets (no clear winner) never enter the map. Orders in those markets stay OPEN indefinitely.

**Impact:** Orphaned OPEN orders, wrong exposure, wrong cash calculations.

**Fix:** When market is closed but `maxPrice < 0.9` (or status indicates void/cancel), set `resolutionMap.set(cid, null)` and treat as stake returned (pnl=0, outcome=WON or a dedicated VOIDED status).

---

### 7. Resolve: `current_balance` Ignores Unrealized PnL

**Finding:** Resolve updates `current_balance = startingBalance + totalPnl`, where `totalPnl` is sum of pnl from resolved orders only. Unrealized PnL from OPEN orders is not included.

**Impact:** Displayed "current balance" understates true equity when there are open positions. For paper trading this may be acceptable, but it diverges from real portfolio valuation.

**Fix:** Either document this as intended (realized-only balance) or compute `current_balance = startingBalance + realizedPnl + unrealizedPnl` using cached prices.

---

### 8. Markets Table Schema Mismatch

**Finding:** Sync selects `closed`, `resolved_outcome`, `winning_side`, `title`, `slug`, `outcome_prices`, `outcomes`, `tags`, `start_time`. Migration `20260317_rebuild_markets_from_dome` creates a schema that may not have `closed`, `resolved_outcome`, or `outcomes` in the same form.

**Impact:** Query can fail or return nulls. Market checks (resolved, closed) may be wrong.

**Fix:** Audit migrations for markets table. Ensure select list matches actual columns. Add defensive null checks.

---

### 9. No Idempotency / Request Dedup for Sync

**Finding:** If two sync requests run concurrently (e.g. page open + manual trigger), both can process the same trades. `ft_seen_trades` and unique `(wallet_id, source_trade_id)` provide some protection, but `ft_orders` insert could race before `recordSeen` completes.

**Impact:** Possible duplicate orders in rare race conditions.

**Fix:** Add distributed lock (e.g. Redis) or DB advisory lock around sync per wallet. Or ensure `ft_orders` UNIQUE constraint is enforced and handle conflict gracefully.

---

## P2 — Medium (Correctness or Observability)

### 10. enrich-ml: `order_time` May Have `.value` (Supabase JSON)

**Finding:** `order.order_time?.value` is used in some paths. Supabase can return `{ value: "..." }` for timestamptz. If `order_time` is a plain string, `.value` is undefined.

**Impact:** Wrong timestamp passed to predict-trade → model may use "now" instead of trade time → biased scores.

**Fix:** Normalize: `const ts = order.order_time?.value ?? order.order_time;` and ensure it's an ISO string.

---

### 11. No Alerts or Health Checks for Sync/Resolve/Enrich-ML

**Finding:** Failures are logged but there is no alerting, no uptime check, no dashboard for "last successful sync per wallet."

**Impact:** Silent failures. No way to know if strategies stopped receiving trades.

**Fix:** Add a simple health endpoint or cron that writes `last_sync_ok_at` to a table. Surface in admin UI. Optional: PagerDuty/Slack on repeated failures.

---

### 12. Polymarket API Rate Limits and Timeouts

**Finding:** Sync fetches leaderboard (3 calls) + trades per trader (up to 4 pages × 100+ traders) + markets fallback. No explicit rate limiting or backoff.

**Impact:** Polymarket could throttle or block. Sync could hit Vercel timeout (10s default, 60s max for Pro).

**Fix:** Add exponential backoff on 429. Consider batching traders or reducing fetch scope. Monitor API errors.

---

### 13. recordSeen Upsert on Conflict — No Explicit Error Handling

**Finding:** `recordSeen` awaits the upsert but does not check for errors. Failures are silent.

**Impact:** If ft_seen_trades upsert fails (e.g. RLS, connection), we lose audit trail and dedup may be inconsistent.

**Fix:** Log or surface upsert errors. Consider retry.

---

### 14. ft_seen_trades Unbounded Growth

**Finding:** Migration suggests pruning rows older than 30 days but no automated job exists.

**Impact:** Table grows indefinitely. Slower queries, higher storage.

**Fix:** Add a scheduled job or migration trigger to delete `WHERE seen_at < NOW() - INTERVAL '30 days'`.

---

### 15. Timezone Consistency

**Finding:** Mix of `new Date()`, `toISOString()`, and DB timestamptz. No explicit timezone policy.

**Impact:** Edge cases around DST or server vs user timezone could misalign "since last sync" windows.

**Fix:** Document and enforce UTC everywhere. Use `timestamptz` and ISO strings.

---

## P3 — Low

### 16. trader_pool Unused

`trader_pool` (top_pnl, top_wr, etc.) is in extended filters but never applied. All strategies share the same merged leaderboard.

### 17. bet_structures Column Exists, Sync Ignores

Schema has `bet_structures` but sync does not filter by it.

### 18. Dual Use of detailed_description

One field for both human-readable description and JSON config causes parse ambiguity and corruption risk (see P0 #2).

### 19. getPolyScore / predict-trade Response Shape

Multiple fallback paths for extracting probability (`prediction`, `valuation`, `analysis.prediction_stats`). If API changes, one path may silently return wrong value.

---

## Recommendations (Priority Order)

1. **P0-1:** Implement ML-first gating for `use_model=true`. Compute model score before insert; skip if below threshold or if ML fails.
2. **P0-2:** Add `extended_filters JSONB` column; migrate and use it for sync.
3. **P0-3:** Add FT sync cron (e.g. `*/5 * * * *`).
4. **P0-4:** Fix Kelly bankroll source and add entryPrice guard.
5. **P1-5:** Improve trader stats coverage for new leaderboard traders.
6. **P1-6:** Handle voided markets in resolve.
7. **P1-8:** Audit markets schema and select list.
8. **P2:** Add health/observability and fix enrich-ml timestamp handling.

---

## Files Reference

| File | Relevance |
|------|-----------|
| `app/api/ft/sync/route.ts` | Core decision engine |
| `app/api/ft/resolve/route.ts` | Resolution logic |
| `app/api/ft/enrich-ml/route.ts` | ML backfill |
| `app/api/cron/ft-resolve/route.ts` | Resolve + enrich-ml cron |
| `vercel.json` | Cron config (no sync) |
| `lib/polymarket-leaderboard.ts` | Trader source |
| `docs/FORWARD_TESTING_ANALYSIS_GUIDE.md` | Analysis guide |
