# Architecture Plan v3 — Internal Audit

**Date**: February 18, 2026  
**Scope**: Robustness, cost efficiency, speed, and API data coverage across the app. Plus schema cleanup.

---

## 1. Robustness

### Strengths
- **Single source of truth for trades**: Trade-stream → `trades_public` + `ft_orders`; feed and FT both read from DB. No split-brain.
- **Price fallback chain**: Gamma → CLOB → stale in-memory with `stale: true` flag. Resolved markets skip API entirely.
- **Request coalescing**: In-flight dedup for same `conditionId` prevents thundering herd on price API.
- **LT execute**: Event-driven path is primary; 2-minute cron is backup. Documented.
- **Backpressure (Phase 1a)**: Drop non-target trades if sync-trade queue > 50. Prevents OOM from slow Vercel.

### Gaps / Risks
1. **In-memory cache is per-instance.** Vercel serverless = multiple instances. Each has its own 2–3s cache. No shared cache (e.g. Redis). Result: more Gamma calls than “single process” math. Acceptable if Gamma rate limits are generous; document and add 429 handling + exponential backoff (plan already mentions this).
2. **Fire-and-forget Supabase write.** Phase 1b updates `markets.outcome_prices` in background. If write fails, crons/snapshots that read from DB get stale data. Consider: log write failures and/or a lightweight “last write failed” flag so crons can fall back to price API for that market.
3. **Trade-stream → Vercel coupling.** If `/api/ft/sync-trade` or `/api/lt/execute` is slow or returns 5xx, trade-stream buffers. Backpressure helps but doesn’t fix Vercel cold starts. Consider: timeouts and circuit breaker (e.g. skip sync-trade for that trade after 10s and log).
4. **No explicit Gamma rate-limit number.** Plan says “~20 Gamma calls/second max” and “if 429: back off.” Add: document or measure Gamma’s actual limit and add a simple in-memory rate limiter so we never burst into 429.

**Recommendation:** Add 1–2 sentences per risk: “Mitigation: …” so the plan is executable (e.g. “Mitigation: log Supabase write errors; crons fall back to price API if `last_price_updated_at` older than 5 min”).

---

## 2. Cost efficiency

### Strengths
- **One Fly.io app** (trade-stream at 2GB ~$5/mo). Hot/cold workers removed. No extra price worker.
- **CLOB only for trading.** Display uses Gamma + cache. Saves paid CLOB load.
- **Resolved-market skip.** ft-resolve / lt-resolve and price API skip closed+resolved markets. Fewer API calls.
- **refresh-copy-pnl**: Phase 10 reads from `markets.outcome_prices` instead of calling price API per market. Big win for batch jobs.
- **Trade-stream**: Single WebSocket for all trades; no per-wallet subscription cost.

### Gaps / Opportunities
1. **sync-polymarket-pnl vs backfill-wallet-pnl.** Plan (Open Item #3) says “consider merging.” Merging into one daily job would cut Polymarket Data API calls and cron invocations. Worth a short “Phase 10b” or a follow-up task.
2. **Trader page** still fetches trades from Polymarket Data API on-demand. Plan says “acceptable as-is (low volume).” If trader pages grow, consider caching in `trades_public` and serving from DB (trade-stream would need to write that wallet’s trades when it’s in the filter set).
3. **Vercel cron count.** 12 crons after removing ft-sync. No cost callout for Vercel cron limits (e.g. Pro plan limits). If there is a limit, “optimize remaining crons” (Phase 10) and “reduce to daily” already help.

**Recommendation:** Keep current cost design. Add Open Item: “Measure Gamma and Polymarket Data API request volume post-launch; set alerts at 80% of expected peak.”

---

## 3. Speed (latency and freshness)

### Coverage by consumer

| Consumer | Trade source | Price source | Plan latency | Audit note |
|----------|--------------|--------------|--------------|------------|
| Feed (trades) | `trades_public` (Phase 2) | Price API → in-memory cache | 2–3s price | OK. Feed load &lt;500ms once DB-backed. |
| Feed (250ms poll) | — | Same price API | 2–3s | OK. No stale DB read. |
| Portfolio | DB (`orders`, `markets`) | Price API + `markets.outcome_prices` fallback | 2–3s | OK. Phase 6 aligned with refresh-copy-pnl. |
| FT bots | WebSocket → ft_orders | On-demand Gamma | Sub-second | OK. |
| LT execute | Event-driven from trade-stream | CLOB for execution | 1–6s | OK. Documented. |
| LT order status | Cron (2 min) | CLOB | 2 min poll | Acceptable. Optional WebSocket fills later. |
| FT snapshot (cron) | DB | `markets.outcome_prices` | Hourly | OK. |
| FT snapshot (on-load) | On-demand endpoint | Live price API | Live | OK. Phase 3. |
| ft-resolve / lt-resolve | Cron | Gamma | 5–10 min | OK. Resolution doesn’t need sub-second. |

### Gaps
1. **Trader page trades.** Fetched from Polymarket (Data API or CLOB) on load. Not in Data Freshness table. Plan says “keep as-is” and “low volume.” Add one row: “Trader page | On load | Polymarket API | On-demand” so it’s explicit.
2. **Fire feed / discover / other feeds.** Plan mentions `app/api/fire-feed/route.ts` in Phase 2b (feed from DB). Confirm all “feed-like” routes (fire-feed, discover top traders, etc.) are migrated to `trades_public` or another DB path so they don’t stay on Polymarket API.
3. **`/api/polymarket/trades/[wallet]`** is a CLOB proxy for public trade history (trader page, etc.). Plan doesn’t list it in “Remove CLOB from non-trading code.” It’s for display, not order placement. Either: (a) move to `trades_public` + DB when that wallet is in the trade-stream filter, or (b) explicitly keep as “on-demand CLOB for trader page” and document. Recommend (b) for v1; (a) as follow-up if traffic grows.

**Recommendation:** Add “Trader page” and “Fire feed / discover” to Data Freshness Summary. Decide and document CLOB proxy for `/api/polymarket/trades/[wallet]`.

---

## 4. API data coverage — did we miss any route?

Cross-check of **app/api** routes that touch Polymarket/CLOB/Gamma vs plan:

- **Price**: `/api/polymarket/price` — Phase 1b. ✓  
- **Market metadata**: `/api/polymarket/market`, `/api/markets/ensure` — Phase 9c (CLOB → Gamma/cache). ✓  
- **Orders (user)**: `/api/orders`, `/api/polymarket/orders/*` — Phase 9c for metadata; CLOB kept for order placement/status. ✓  
- **Feed**: `fetchFeed()` → `/api/v2/feed/trades` (Phase 2). ✓  
- **Fire feed**: `/api/fire-feed/route.ts` — Plan says `trades_public`; confirm implementation. ✓  
- **Portfolio**: `/api/portfolio/stats`, `/api/portfolio/trades` — Phase 6, read from DB + price API. ✓  
- **LT**: `/api/lt/execute`, `/api/lt/sync-order-status`, `/api/lt/live-prices`, `/api/lt/strategies`, etc. — CLOB only where needed; strategies/market metadata in Phase 9c. ✓  
- **FT**: `/api/ft/sync` removed; `/api/ft/sync-trade` stays (called by trade-stream); `/api/ft/wallets/[id]` uses markets. ✓  
- **Trader page data**: `/api/trader/[wallet]`, `/api/polymarket/trades/[wallet]` — Plan: trader page on-demand. CLOB trades route not in 9c list; see Section 3.  
- **Crons**: All listed in Cron Job Audit. ✓  
- **Check-notifications, polysignal, etc.** — Phase 9c. ✓  

**Recommendation:** Add to Phase 9c or “Non-trading CLOB” note: “`/api/polymarket/trades/[wallet]` remains on-demand CLOB for public trade history (trader page) unless we move trader page to `trades_public`.”

---

## 5. Doc consistency

- **lt-sync-order-status schedule:** Plan says “every 2min” (Key Decisions / Cron table) but Phase 5 says “every 1 minute.” **Fix:** Phase 5 should say “every 2 minutes” to match vercel.json (`*/2 * * * *`).
- **Data Freshness table:** “LT order status” row says “1min sync cron” — should be “2min” for consistency.

---

## 6. Separate feedback item: orders and markets — unused columns

**Request:** Check which columns in the **orders** and **markets** tables are not referenced in the codebase and add the result as a **separate feedback item** for the plan / cofounder.

**Why it matters:** Unused columns increase storage, backup size, and cognitive load; they can also hide obsolete semantics. A one-time schema audit supports:
- Safer migrations (don’t rely on unused columns).
- Optional future deprecation or dropping of unused columns (with backups and communication).

**Suggested approach:**
1. **List all columns** for `orders` and `markets` from the latest migrations (or `pg_catalog`/Supabase schema).
2. **Search the codebase** for each column name (app, lib, scripts, Supabase functions) for reads and writes.
3. **Produce a short table**: Column name | Used (Y/N) | Where used (file/context) or “Not found.”
4. **Add to the architecture plan (or a “Schema cleanup” doc)** as: “**Orders and markets — unused columns audit**: [Link or inline table]. Recommend no drops until post-redesign; then deprecate or drop unused columns with a migration and changelog.”

**Orders columns (from codebase view + migrations):**  
e.g. order_id, copy_user_id, market_id, status, side, filled_size, created_at, copied_trade_id, copied_trader_wallet, copied_market_title, market_slug, market_avatar_url, outcome, price_when_copied, current_price, market_resolved, market_resolved_at, resolved_outcome, user_exit_price, amount_invested, lt_strategy_id, lt_order_id, signal_price, signal_size_usd, polymarket_realized_pnl, polymarket_avg_price, polymarket_total_bought, polymarket_synced_at, … (and any others from migrations).

**Markets columns (from migrations):**  
condition_id, gamma_market_id, slug, question, description, category, tags, outcomes, outcome_prices, volume, liquidity, active, closed, start_date, end_date, twitter_card_image, icon, raw_gamma, created_at, updated_at, last_price_updated_at, resolved_outcome, espn_url, espn_game_id, espn_last_checked, and any `title` / `image` from rebuild migrations. Plan also adds `last_requested_at`.

**Deliverable for cofounder:** A single “Schema audit: orders and markets” section or doc that (1) lists columns and (2) marks used vs not used (and where used), and (3) recommends “review and optionally deprecate after architecture is stable.”

---

## 7. Summary

| Area | Verdict | Action |
|------|--------|--------|
| Robustness | Good; a few mitigations missing | Add 1–2 sentence mitigations for in-memory cache, fire-and-forget write, trade-stream timeout; document or add Gamma rate limiter. |
| Cost | Good | Keep; add Open Item to measure API volume and set alerts. Consider merging sync-polymarket-pnl and backfill-wallet-pnl (Phase 10 / Open Item). |
| Speed | Good | Add Trader page and fire-feed to Data Freshness; fix lt-sync 1min→2min in Phase 5; document CLOB trades proxy. |
| API coverage | Good | Explicitly document `/api/polymarket/trades/[wallet]` as on-demand CLOB for trader page. |
| Doc consistency | Minor | Phase 5 and Data Freshness: “1 minute” → “2 minutes” for lt-sync-order-status. |
| **Orders/markets columns** | **Not in plan** | **Add as separate feedback item: run schema audit (used vs unused columns), publish table, recommend post-redesign cleanup.** |

---

**Next steps**
1. Update plan with robustness mitigations and doc fixes (lt-sync 2 min, Data Freshness rows, CLOB trades route).
2. Run the orders/markets column audit (script or manual grep); add “Schema audit: orders and markets” section or doc.
3. Share this audit + schema feedback item with cofounder so the plan and schema cleanup can be tracked in one place.
