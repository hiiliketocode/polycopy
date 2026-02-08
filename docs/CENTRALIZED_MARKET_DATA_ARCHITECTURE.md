# Centralized Market Data Architecture: Strategy and Scalability

**Purpose:** Define a single source of truth for market metadata and prices, with freshness rules per use case, so we stop multiplying external API calls (CLOB/Gamma/Dome) across feed, portfolios, FT, LT, and other systems.

**Status:** Proposal (research + current-state audit). Implementation phased.

**Rigorous companion doc:** See **`docs/MARKET_DATA_RIGOROUS_ANALYSIS.md`** for: (1) when we use CLOB vs Gamma vs Dome and where Dome can improve, (2) every component that needs live prices and how it uses them, (3) break risks and calculation accuracy, (4) faster tiers (15–30 s for feed/portfolio), (5) response-shape contract and implementation safety checklist.

---

## 1. Problem Statement

- **Many independent callers** request live or near-live market data:
  - **Feed:** thousands of positions/trades, each card can trigger `/api/polymarket/price?conditionId=…`
  - **Portfolio / Profile:** each copied trade/position calls the price API for current price and metadata
  - **Trader pages:** same pattern per trade
  - **FT:** per-wallet open positions, batched by unique `condition_id` but still N calls per sync/view
  - **LT:** execution and resolve depend on market data
  - **Discover, trade-card, trade-execute:** direct price/metadata fetches
  - **Crons:** refresh-copy-pnl, check-notifications, portfolio stats
- **Current behavior:** Almost every request to `/api/polymarket/price` results in **at least one CLOB request** (and often Gamma fallbacks). The `markets` table is used for **metadata** (e.g. game start, ESPN URL) and for **write-back** in one place (portfolio/trades), but the price API **does not** use `markets.outcome_prices` / `last_price_updated_at` to avoid calling CLOB when data is fresh enough.
- **Consequence:** As we add more test markets, real users, and features, we multiply CLOB/Gamma traffic and risk rate limits, latency, and cost. We need one conceptual “market system” that all callers use, with **freshness rules per use case** and **one refresh path** per market.

---

## 2. Current State Audit

### 2.1 Database

| Asset | Purpose |
|-------|--------|
| **`markets`** | Primary cache keyed by `condition_id`. Has metadata (Dome/Gamma-style), and from migration `20260321`: `outcome_prices` (JSONB), `last_price_updated_at`, `resolved_outcome`, `closed`. |
| **`market_fetch_queue`** | Queue of `condition_id`s to fetch (e.g. for backfill); not used for real-time price freshness. |
| **`market_cache`** | Referenced in `app/api/orders/route.ts` for market metadata (title, image, is_open). May be a view or separate table; clarify whether it should be merged into `markets` or fed from it. |

### 2.2 Price API (`/api/polymarket/price`)

- **Read path:** Loads from `markets` only for **metadata** (e.g. game start, ESPN, tags). Does **not** check `last_price_updated_at` or `outcome_prices` to skip the external call.
- **External calls:** Always hits CLOB `https://clob.polymarket.com/markets/{conditionId}` (and often Gamma for slug/event/metadata). Every successful response could be written back to `markets` (outcome_prices, last_price_updated_at) but today that write-back only happens in **portfolio/trades** after it fetches via the price API.
- **Effect:** Every caller pays one CLOB call per market per request; no reuse of recently fetched prices.

### 2.3 Call Sites (who hits the price API or CLOB)

| Caller | Pattern | Uses markets cache for price? |
|--------|---------|-------------------------------|
| **Feed** | `fetchLiveMarketData`: one `/api/polymarket/price` per unique market (deduped by market key) | No – every request goes to price API → CLOB |
| **Portfolio page** | `fetchLiveMarketData`: one price API call per market, then POST `/api/portfolio/refresh-prices` to update orders | No |
| **Profile page** | Same as portfolio | No |
| **Trader page** | One price API call per trade’s market | No |
| **Discover** | `/api/polymarket/price` per market | No |
| **Trade card** | Price API for constraints/live data | No |
| **Trade execute** | Price API for execution UI | No |
| **FT wallets list** | Batched unique `condition_id`s, then one price API call per condition | No |
| **FT wallet [id]** | Same, per-wallet open positions | No |
| **Portfolio/trades (API)** | Reads `markets`, checks `last_price_updated_at` vs `PRICE_STALE_MS` (1 min); only then fetches price API and **writes back** to `markets` | Yes – only place that uses cache + write-back |
| **Portfolio/stats** | Fetches price per market; uses 5 min staleness for “refresh” logic | Partial (staleness in stats, but still fetches via price API) |
| **Trader my-stats** | Same idea, 5 min staleness | Partial |
| **Orders API** | Reads `market_cache`; also **fetchMarketMetadataFromClob** – direct CLOB calls per condition_id | No – bypasses price API, hits CLOB directly |
| **Cron refresh-copy-pnl** | Fetches price API per market | No |
| **Cron check-notifications** | Fetches market token data (likely CLOB/Gamma) | No |

So: **one route (portfolio/trades)** implements “check cache freshness → fetch only if stale → write back”; all others effectively “always fetch” or hit CLOB directly.

---

## 3. Use-Case Freshness Tiers (recommended — faster for feed/portfolio)

Feed and portfolio need **live** pricing. The feed currently refreshes **visible** markets every **1 s** (`VISIBLE_REFRESH_INTERVAL_MS = 1000`); a 15–30 s cache would make the feed feel slower, so feed gets **T2a = 1–2 s**. For 24ms-style updates, use WebSockets/push or client interpolation; see `MARKET_DATA_RIGOROUS_ANALYSIS.md` for full justification and component-level risks.

| Tier | Name | Max age | Use cases |
|------|------|---------|-----------|
| **T1** | Execution | **30 s** | LT execution, order placement, trade execution page |
| **T2a** | Feed (live) | **1–2 s** | Feed visible markets — feed polls every 1 s; cache must be this fresh or feed feels slower. |
| **T2b** | Portfolio / profile / trader | **5–15 s** | Portfolio, profile, trader, discover |
| **T3** | Dashboard | **1–2 min** | Portfolio stats, FT wallet list, FT wallet [id], trader my-stats |
| **T4** | Background | **5–15 min** | refresh-copy-pnl cron, check-notifications, analytics |

Resolved/closed markets: always serve from cache (no max age). Rules:

- If `markets.outcome_prices` and `last_price_updated_at` exist and `now - last_price_updated_at <= max_age` for the requested tier, **return cached data** (and optionally extend with metadata from `markets`).
- If stale or missing, **one** refresh path runs (single-flight per `condition_id`), then we write back to `markets` and return. All concurrent requesters for the same market get the same result without duplicate CLOB calls.

---

## 4. Proposed Architecture

### 4.1 Single conceptual “Market Data Service”

- **All** market price and core metadata flows go through one layer:
  - Either a **shared server-side API** (e.g. existing `/api/polymarket/price` extended, or a dedicated `/api/markets/price` or `/api/markets/batch`) that:
    - Accepts `conditionId` (and optionally slug/title for fallback) and a **freshness tier** (or `maxAgeSeconds`).
    - Reads from **`markets`** only (keyed by `condition_id`).
    - If cached data is fresh enough for the tier, return it (no CLOB).
    - If not, run a **single-flight** fetch for that `condition_id` (one CLOB call per market per refresh), then upsert `outcome_prices`, `last_price_updated_at`, and any metadata into `markets`, then return.
  - Or a **shared server-side library** used by all routes (price API, portfolio/trades, FT, orders, crons) that implements the same “read from markets → if not fresh, single-flight fetch → write back” logic, and the existing price API becomes a thin wrapper that calls this lib with a default tier.

### 4.2 Single refresh path

- Only this layer (or lib) should call CLOB/Gamma for **price** (and minimal metadata needed for the response). No other route should call CLOB for the same market data; they should call the centralized endpoint or lib.
- **Orders** route today calls `fetchMarketMetadataFromClob` directly; it should be migrated to use the same market service (with an appropriate tier) so we don’t double-fetch.

### 4.3 Freshness rules and `markets` schema

- **`markets`** already has `last_price_updated_at` and `outcome_prices`. Use them as the source of truth for “when did we last fetch price” and “what was the price.”
- No need for “freshness per use case” stored in DB; the **caller** passes the tier (or max age). The service compares `last_price_updated_at` to the requested max age and decides cache hit vs refresh.
- Optional: add a small table or config for **tier → max_age_seconds** (e.g. T1=60, T2=300, T3=600) so product can tune without code changes.

### 4.4 Single-flight (request coalescing)

- When multiple requests need the same `condition_id` and the cache is stale, only **one** CLOB request should run; others wait and share the result. This avoids thundering herd and duplicate calls.
- Implementation options:
  - In-process: a map of `condition_id → Promise<MarketData>` so concurrent callers for the same id reuse the same promise.
  - If we have multiple serverless instances, we still reduce load per instance; for full cross-instance dedup we’d need a distributed lock or a small cache (e.g. Redis) with a short TTL “refresh in progress” key, which is a later phase.

### 4.5 Batch endpoint (optional but recommended)

- Many callers (feed, portfolio, FT) have a **list** of `condition_id`s. Today they do N separate `/api/polymarket/price?conditionId=X` calls.
- Add a **batch** endpoint, e.g. `POST /api/markets/prices` with `{ conditionIds: string[], tier?: string }` (or `maxAgeSeconds`). The server:
  - Reads all from `markets` in one query.
  - For each id that is missing or stale for the tier, enqueues a refresh (with single-flight per id).
  - Returns a map `condition_id → market payload`. This cuts round-trips and allows one DB read for many markets.

### 4.6 What gets written back to `markets`

- After any CLOB (or Gamma) fetch for price, upsert into `markets`:
  - `condition_id`, `outcome_prices`, `last_price_updated_at`, and enough metadata so that the next read can serve the response (e.g. `closed`, `resolved`, question, slug, image). Prefer one upsert from the same fetch so we don’t have “price fresh but metadata stale” in a confusing way.
- Existing `markets` columns (from Dome/rebuild) can stay for metadata that other jobs populate; the price path only needs to maintain the fields it uses for serving and freshness.

### 4.7 Resolved/closed markets

- For resolved or closed markets, we can treat “freshness” as infinite (or a very long TTL): once we have `resolved_outcome` / `closed`, we don’t need to re-fetch price from CLOB for display. So:
  - If `markets.closed` or `markets.resolved_outcome` is set, always serve from cache regardless of `last_price_updated_at`.

---

## 5. Implementation Phases (rigorous order)

### Phase 1: Price API uses cache when fresh (no new endpoints)

- In `/api/polymarket/price`:
  - At the start, after resolving `condition_id`, read from `markets` (including `outcome_prices`, `last_price_updated_at`, `closed`, `resolved_outcome`).
  - Accept an optional query param, e.g. `maxAgeSeconds=300` (default 0 or “always refresh” to keep current behavior initially).
  - If `maxAgeSeconds > 0` and we have `outcome_prices` and `last_price_updated_at` and (`closed` or `now - last_price_updated_at <= maxAgeSeconds`): build the same JSON shape we return today from cached fields and **return without calling CLOB**.
  - Otherwise: do the current CLOB/Gamma fetch; then **upsert** into `markets` (`outcome_prices`, `last_price_updated_at`, `closed`, `resolved_outcome`, and any metadata we already write elsewhere).
- Callers can stay unchanged at first; then we can start passing `maxAgeSeconds` from feed (e.g. 120), portfolio (120), FT (300), etc., so they get cache hits when data is fresh.

### Phase 2: Single-flight per condition_id in price API

- Add an in-memory map (or module-level) `condition_id → Promise<response>` so that concurrent requests for the same `condition_id` that need a refresh share one CLOB call. Release the promise after the response is written to `markets` and returned.
- Reduces stampede when many users hit the same market (e.g. a popular feed card).

### Phase 3: Unify “market cache” and orders route

- Confirm whether `market_cache` is a view over `markets` or a separate table. If separate, migrate orders route to use `markets` (or the same service that reads/writes `markets`) with an appropriate tier, and deprecate duplicate CLOB calls in `fetchMarketMetadataFromClob`.
- All price/metadata for “display” should go through the same cache and freshness logic.

### Phase 4: Batch endpoint and caller migration

- Add `POST /api/markets/prices` (or `/api/markets/batch`) with `conditionIds` and tier/maxAge. Implement same “read from markets → refresh stale with single-flight → write back” per id, return map.
- Migrate feed, portfolio, profile, FT wallet list to call the batch endpoint once per page load with their list of condition ids and tier (e.g. T2). Remove N separate price API calls from the client (or from server-side fetchers).

### Phase 5: Background refresh (optional)

- A low-priority job or cron that, for “hot” markets (e.g. condition_ids that appeared in feed or orders in the last 24h), periodically refreshes so that the next user request is a cache hit. This can use a longer max_age (e.g. 5 min) to avoid over-calling CLOB.

---

## 6. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Stale price shown for trading | Use T1 (30 s) for LT execution, order placement, and trade-execute; never serve cache older than that for those paths. |
| **Wrong PnL/ROI after centralizing** | **Critical.** Keep **exact same response shape** (outcomePrices, outcomes, metadata) and outcome→price mapping. No change to formulas in portfolio/profile/stats; only data source changes. See `MARKET_DATA_RIGOROUS_ANALYSIS.md` §3 and §4. |
| Different tiers in different routes | Document tier per route in rigorous doc and in code (constants); consider a small config table. |
| First request after long idle always misses cache | Expected; one fetch. Single-flight and batch reduce duplicate calls. |
| `markets` row missing for new markets | Current “ensure market” logic (e.g. in price API) can create/update row on first fetch; keep that. |
| Orders route and “market_cache” | Phase 3 must align orders with `markets` or the shared service so we don’t maintain two caches. |
| Multi-instance single-flight | In-process single-flight still helps a lot; if we need cross-instance dedup, add Redis or similar later. |
| **New routes breaking callers** | Add no new **response** contract; extend existing price API (e.g. query param `maxAgeSeconds`, batch POST) so all existing callers keep same URL and JSON shape. New batch endpoint must return the same `market` shape per condition_id. |

---

## 7. Success Criteria

- **Fewer CLOB calls:** Most requests for a given market within its freshness window are served from `markets` with no CLOB call.
- **One write path:** All price updates to `markets` come from the same layer (price API or shared lib it uses).
- **Callers use one entry point:** No direct CLOB calls for “market price for display” outside the centralized service; orders and crons migrated to use it with appropriate tiers.
- **Observability:** Log or metric “cache_hit” vs “cache_miss” per tier so we can tune max_age and confirm behavior.

---

## 8. CLOB vs Gamma vs Dome (summary)

- **CLOB:** Real-time order-book price; used by price API (primary) and orders route. Use for **T1 (execution)** and as fallback when Dome fails.
- **Gamma:** Metadata (slug, event, icon, score) and fallback price; used by price API, FT/LT resolve. Keep for resolution until Dome resolution semantics verified.
- **Dome:** Markets + **GET Market Price** (and batch); documented rate limits; can supply metadata+price in one call. Use for **T2/T3 refresh** to reduce CLOB load and get predictable limits. See `MARKET_DATA_RIGOROUS_ANALYSIS.md` §1 and §5.

---

## 9. References

- **Rigorous analysis:** `docs/MARKET_DATA_RIGOROUS_ANALYSIS.md` — components, break risks, APIs, Dome usage.
- **Cache stampede / single-flight:** Request coalescing (e.g. in-process Promise map per condition_id).
- **APIs:** Polymarket [pricing API](https://docs.polymarket.com/api-reference/pricing/) (CLOB), [Dome API](https://docs.domeapi.io/) (markets + market price).
- **Current code:** `app/api/polymarket/price/route.ts`, `app/api/portfolio/trades/route.ts`, `supabase/migrations/20260321_add_market_price_cache.sql`.

---

## 10. Summary

- **Idea:** One centralized market system (backed by the existing **markets** table) with a **freshness rule per use case**. Callers ask for data with a tier (or max age); if the cache is fresh enough, we return from `markets` and **do not** call the external API. If not, we run **one** refresh (with single-flight per market), write back to `markets`, then return.
- **Already in place:** `markets` has price-related columns; one route (portfolio/trades) already does “check freshness → fetch → write back.” Everything else bypasses that.
- **Next steps:** Implement Phase 1 (price API respects cache when fresh and writes back; **same response shape**), then Phase 2 (single-flight), then unify orders and add batch (Phases 3–4). Use **Dome for T2/T3** refresh where possible to reduce CLOB load. Keep **one response contract** so routing and calculations remain accurate; see rigorous doc for per-component break risks and checklist.
