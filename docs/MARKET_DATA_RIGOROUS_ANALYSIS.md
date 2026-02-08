# Market Data: Rigorous Analysis — APIs, Components, Break Risks, and Dome

**Purpose:** Single reference for (1) when we use CLOB vs Gamma vs Dome, (2) every component that needs live prices and how it uses them, (3) break risks and calculation accuracy when we centralize, (4) faster freshness for feed/portfolio, (5) where Dome can improve things.

**References:** Polymarket [pricing API](https://docs.polymarket.com/api-reference/pricing/), [Dome API](https://docs.domeapi.io/) (markets + market price), existing `docs/CENTRALIZED_MARKET_DATA_ARCHITECTURE.md`.

---

## 1. CLOB vs Gamma vs Dome — When We Use Each

### 1.1 Today’s usage (by file / flow)

| API | Endpoint / usage | Used by | Purpose |
|-----|------------------|--------|---------|
| **CLOB** | `GET https://clob.polymarket.com/markets/{conditionId}` | `/api/polymarket/price` (primary), `app/api/orders` (`fetchMarketMetadataFromClob`), `workers/shared/polling.js` | **Real-time prices** (order-book derived), token metadata (outcome, price, winner). Primary source for “current price” in app. |
| **Gamma** | `GET https://gamma-api.polymarket.com/markets?condition_id=…` (and by slug, by event) | `/api/polymarket/price` (fallback when CLOB fails; also for event/slug metadata, icon, score, teams), FT resolve, LT resolve, LT redemption, FT wallet [id] (fallback after price API), FT wallets list (fallback after price API) | **Metadata** (question, slug, events, icon, end_date), **outcome prices** when CLOB unavailable. Resolution (winning outcome) sometimes from Gamma. |
| **Dome** | `GET https://api.domeapi.io/v1/polymarket/markets?condition_id=…` (batch) | `/api/polymarket/price` (`ensureCachedMarket` — fill `markets` if missing), PolyScore edge function, predict-trade edge function, workers, backfill scripts | **Metadata** and **market existence**; populates `markets` (Dome schema → our row). Dome also has **GET Market Price** (and batch) — underused today. |

### 1.2 API characteristics (from docs and code)

| API | Price freshness | Batch support | Rate limits | Best for |
|-----|-----------------|---------------|-------------|----------|
| **CLOB** | Real-time (order book). Single market: `GET /markets/{id}`. Batch: “Get multiple market prices” (GET/POST). | Yes (batch pricing endpoints) | Unknown (no explicit doc in code) | **Execution and live display** when we need book-accurate price. |
| **Gamma** | Can be delayed. Good for metadata and resolution. | By `condition_id` (one id per request in our code); can pass multiple in one query in some endpoints. | Unknown | **Fallback** price, **metadata** (slug, event, icon, scores). |
| **Dome** | “GET Market Price” exists; batch “GET multiple market prices” available. Tiered QPS (Free 1/s, Dev 100/s, Pro 300/s). | Yes (markets and market price batch). | Documented (tier-based) | **Single provider** for metadata + price in one place; **batch** and **rate-limit clarity**; WebSockets for real-time if needed later. |

### 1.3 When to use which (recommended)

- **Trading and execution (LT, order placement, trade-execute):** Prefer **CLOB** (or Dome’s market price if proven same latency/accuracy) so price is order-book accurate. Tier: **T1** (e.g. 30 s max age).
- **Feed / portfolio / profile “live” display:** Need **fast** data; avoid N separate CLOB calls. Use **central cache** with short max age (e.g. **15–30 s**). Refresh path: **Dome batch** (market + price) first to reduce CLOB load and get one-call-per-many-markets; fallback to CLOB batch if Dome missing or stale. Tier: **T2** (15–30 s).
- **Stats / dashboard (portfolio stats, FT list, trader my-stats):** Cache with **T3** (e.g. 1–2 min) is enough; can use Dome or cache filled by CLOB.
- **Resolved/closed markets:** No external call for “price” — use `markets.resolved_outcome` / `winning_side` and treat settlement price as 0/1. No freshness requirement.

---

## 2. Freshness Tiers (Revised — Faster for Feed & Portfolio)

Feed and portfolio must feel “live.” Recommended:

| Tier | Name | Max age | Use cases |
|------|------|---------|-----------|
| **T1** | Execution | **30 s** | LT execute, order place, trade-execute page. |
| **T2a** | **Feed (live)** | **1–2 s** | Feed visible markets — 1s polling must get fresh-enough data; use batch + single-flight. |
| **T2b** | Portfolio / profile / trader | **5–15 s** | Portfolio, profile, trader, discover (or use T2a for same live feel). |
| **T3** | Dashboard | **1–2 min** | Portfolio stats, FT wallets list, FT wallet [id] summary, trader my-stats. |
| **T4** | Background | **5–15 min** | refresh-copy-pnl cron, check-notifications, analytics. |

Resolved/closed: always serve from cache; no max age.

**Feed timing (code audit):** The feed uses `VISIBLE_REFRESH_INTERVAL_MS = 1000` (1s): visible markets are refetched every **1 second** via `refreshVisibleMarkets()` → `fetchLiveMarketData(visibleTrades)`. So the design is **1s update cadence**, not 15–30s. A **15–30s cache TTL** would make the feed feel slower (display would only change when cache is refreshed). Hence T2a = **1–2 s** for feed. If the product goal is **24ms** (or 60fps) display updates, that requires **WebSockets/push** (e.g. Dome) or client-side interpolation; REST polling every 24ms is not feasible.

---

## 3. Component-by-Component: Who Needs Price, How It’s Used, Break Risks

Every place that consumes “current price” or “outcome prices” is listed below. For each: **what it uses**, **response shape it expects**, **calculation that must stay correct**, and **risk if we change routing**.

### 3.1 Feed (`app/feed/page.tsx`)

- **What:** `fetchLiveMarketData(trades)` → for each unique market, `GET /api/polymarket/price?conditionId=…` (and slug/title). Visible markets are refreshed every **1 s** (`VISIBLE_REFRESH_INTERVAL_MS = 1000`); expanded cards every 1 s. So cache TTL for feed must be **≤ 1–2 s** (T2a) or feed will feel slower.
- **Uses:** `outcomePrices`, `outcomes`, `gameStartTime`, `eventStatus`, `score`, `homeTeam`, `awayTeam`, `closed`, `resolved`, `endDateIso`, `marketAvatarUrl`, `tags`, `cryptoSymbol`, `cryptoPriceUsd`.
- **Calculation:** Converts `outcomePrices` to numbers; picks price by outcome for display; uses event status/score for sports. **No PnL formula here** — display only.
- **Response shape:** `{ success, market: { outcomePrices, outcomes, … } }`.
- **Break risk:** **Medium.** If we return cached data from `markets`, we must return the **same shape** (outcomePrices array, outcomes array, plus metadata). Outcome order must match so “pick price by outcome” is correct. **Mitigation:** Central layer returns identical JSON; only source (cache vs fetch) changes.

### 3.2 Portfolio page (`app/portfolio/page.tsx`)

- **What:** `fetchLiveMarketData(trades)` → one price API per market; then `POST /api/portfolio/refresh-prices` with updates; state uses `trade.current_price` for display and PnL.
- **Uses:** `current_price` (per outcome) for **unrealized PnL** and **ROI**: `(current_price - entry) / entry` and value = `entry_size * current_price`.
- **Calculation:** `amount_invested`, `current_price`, `user_exit_price`; resolved uses 0/1. **Critical:** `current_price` must be the **outcome** price (not average). Same for profile below.
- **Response shape:** Expects live data merged into trade as `current_price: live.price` (outcome-specific).
- **Break risk:** **High.** Wrong or stale price → wrong unrealized PnL and ROI. **Mitigation:** Central layer returns outcome-level prices; portfolio keeps same merge logic; we only change where the numbers come from (cache vs API). Don’t change formula or field names.

### 3.3 Profile page (`app/profile/page.tsx`)

- **What:** Same pattern as portfolio: `fetchLiveMarketData`, then refresh-prices; uses `current_price` for PnL and ROI.
- **Uses:** Same as portfolio (unrealized PnL, ROI, display).
- **Calculation:** Same formulas; resolved 0/1.
- **Break risk:** **High.** Same as portfolio. **Mitigation:** Same — identical response shape and outcome mapping.

### 3.4 Trader page (`app/trader/[wallet]/page.tsx`, `app/test/trader/…`)

- **What:** One `/api/polymarket/price?conditionId=…` per trade’s market in `fetchLiveMarketData`.
- **Uses:** outcome prices, metadata (game start, status, score, etc.) for cards.
- **Calculation:** Display and any ROI from `price_when_copied` vs `current_price` — same formula as portfolio.
- **Break risk:** **Medium–High.** Same as feed + portfolio: shape and outcome→price mapping must stay. **Mitigation:** Same response contract.

### 3.5 Discover (`app/discover/page.tsx`)

- **What:** `GET /api/polymarket/price?…` for market(s).
- **Uses:** Price and metadata for display.
- **Break risk:** **Low** (display only). Same shape.

### 3.6 Trade card (`components/polycopy/trade-card.tsx`)

- **What:** Price API for constraints/live data.
- **Uses:** outcome prices, metadata.
- **Break risk:** **Low–Medium.** Same response shape.

### 3.7 Trade execute (`app/trade-execute/page.tsx`)

- **What:** Price and market metadata for execution UI.
- **Uses:** Price for sizing/display; must be accurate for order.
- **Break risk:** **High** if execution uses this price. **Mitigation:** T1 (30 s) or always fresh for this route; same shape.

### 3.8 Portfolio API — trades (`app/api/portfolio/trades/route.ts`)

- **What:** Reads `markets` (outcome_prices, last_price_updated_at); if stale (> `PRICE_STALE_MS` 1 min), fetches `/api/polymarket/price` and **writes back** to `markets`. Builds `marketsMap`; uses `pickOutcomePrice(market.outcome_prices, row.outcome)` for `latestPrice`.
- **Uses:** `outcome_prices` as **object** (outcome → price map). Format: `{ outcomes, outcomePrices }` or keyed by outcome name.
- **Calculation:** `latestPrice` for each trade; settlement 0/1 when resolved. **Critical** for API consumers (e.g. portfolio page if it ever uses this for prices).
- **Break risk:** **High.** `pickOutcomePrice` expects object with outcome keys; normalized outcome (e.g. YES/NO) must match. **Mitigation:** Central layer and cache keep same `outcome_prices` structure (object or outcomes+outcomePrices arrays in same order). Don’t change `pickOutcomePrice` contract.

### 3.9 Portfolio API — stats (`app/api/portfolio/stats/route.ts`)

- **What:** Loads markets; `refreshMarketPrices` calls `/api/polymarket/price` for stale markets (5 min); writes outcome_prices + last_price_updated_at to `markets`. Uses `inferResolutionPrice` and outcome_prices for resolved positions.
- **Uses:** outcome_prices (outcomes + outcomePrices arrays), resolvedOutcome/winningSide for 0/1.
- **Calculation:** PnL, portfolio value; resolved = 0 or 1.
- **Break risk:** **High.** Same as trades: structure and 0/1 for resolved. **Mitigation:** Same response and write-back shape.

### 3.10 FT wallets list (`app/api/ft/wallets/route.ts`)

- **What:** Batched unique `condition_id`s; reads `markets` (outcome_prices, last_price_updated_at); 2 min staleness; then fetches `/api/polymarket/price` (and fallback Gamma) per missing/stale; writes back to `markets`.
- **Uses:** outcomes + outcomePrices for unrealized value per wallet.
- **Calculation:** Aggregates open position value; must match outcome to price.
- **Break risk:** **Medium–High.** Same shape and outcome mapping. **Mitigation:** Central layer returns same format; FT keeps same parsing.

### 3.11 FT wallet [id] (`app/api/ft/wallets/[id]/route.ts`)

- **What:** Same pattern: markets cache then price API then Gamma fallback; writes back.
- **Uses:** current_price per condition for open orders.
- **Break risk:** **Medium–High.** Same as above.

### 3.12 LT execute (`app/api/lt/execute/route.ts`)

- **What:** Reads `markets` only (no price API in this route). Uses `market.outcome_prices`, `market.outcomes` for evaluation and sizing.
- **Uses:** outcome_prices for **current_price** in trade evaluation (e.g. PolyScore, bet size). If cache is stale, LT could execute on old price — **bad for execution**.
- **Calculation:** Shared-logic uses outcome_prices to derive current_price for the outcome; then PnL/edge logic.
- **Break risk:** **High.** Stale price → wrong execution. **Mitigation:** LT execute must use **T1** (30 s) or always refresh before execute; ensure markets are refreshed by a single path (e.g. price API or dedicated refresh) before LT run.

### 3.13 LT resolve / FT resolve / LT redemption

- **What:** Gamma (and possibly CLOB) for resolution (winning outcome). Not “price” for display — resolution state.
- **Uses:** winning_side / resolved outcome to set orders to 0/1.
- **Break risk:** **Medium** if we switch to Dome for resolution; ensure Dome returns same resolution semantics. **Mitigation:** Keep Gamma for resolution until Dome resolution API is verified equivalent.

### 3.14 Orders API (`app/api/orders/route.ts`)

- **What:** Reads `market_cache` (market_id, title, image_url, is_open, metadata); **fetchMarketMetadataFromClob** hits CLOB per condition_id for metadata + tokens (outcome, price). Fills `market_cache` and uses it for display.
- **Uses:** Metadata and token prices for order list display.
- **Break risk:** **High** if we remove or change `market_cache` without migrating to `markets` and same shape. **Mitigation:** Phase 3 of central doc: orders should use same central market service (read from `markets` with T3, refresh via central path); deprecate duplicate CLOB in this route.

### 3.15 Cron refresh-copy-pnl (`app/api/cron/refresh-copy-pnl/route.ts`)

- **What:** Fetches price API per market for PnL.
- **Uses:** Prices for resolved/open; updates orders or stats.
- **Break risk:** **Medium.** Same response shape. **Mitigation:** Cron calls central endpoint with T4; central layer returns same shape.

### 3.16 Cron check-notifications (`app/api/cron/check-notifications/route.ts`)

- **What:** Fetches market token data (CLOB/Gamma) for notifications.
- **Uses:** Token/price for notification logic.
- **Break risk:** **Low–Medium.** Same shape. **Mitigation:** Use central service with T4.

### 3.17 Trader my-stats (`app/api/trader/[wallet]/my-stats/route.ts`)

- **What:** Fetches prices (5 min staleness); builds price map.
- **Uses:** outcome prices for stats.
- **Break risk:** **Medium.** Same shape. **Mitigation:** T3 + same contract.

### 3.18 FT sync shared-logic (`lib/ft-sync/shared-logic.ts`)

- **What:** Receives `market` (from LT execute’s marketMap) with `outcome_prices`, `outcomes`. Derives `current_price` for the trade’s outcome; passes to PolyScore and evaluation.
- **Uses:** outcome_prices (array or object) + outcomes to get current_price for one outcome.
- **Calculation:** Edge, bet size, ML. **Critical** for LT/FT quality.
- **Break risk:** **High.** If outcome_prices format or order changes, current_price is wrong. **Mitigation:** Central layer and `markets` keep same format (outcomes array + outcomePrices array, same order); shared-logic already normalizes array/object.

---

## 4. Response Shape Contract (No Breaks)

All consumers expect one of:

- **A.** `{ success: true, market: { outcomePrices: string[]|number[], outcomes: string[], closed, resolved, … metadata } }` (price API today).
- **B.** DB row: `outcome_prices` = object `{ outcomes, outcomePrices }` or outcome-keyed map; `last_price_updated_at`, `closed`, `resolved_outcome`, `winning_side`.

**Rule:** The central market layer (price API or new batch endpoint) must return **exactly** the same `market` shape for (A). Writes to `markets` must keep **exactly** the same `outcome_prices` and column semantics for (B). Then no component needs to change its calculation or mapping logic — only the **source** (cache vs fetch) changes.

---

## 5. Where Dome Improves Things

- **Single provider for metadata + price:** Dome’s GET Markets (by condition_id) and GET Market Price (and batch) can supply both. We can **try Dome first** for T2/T3 (feed, portfolio, stats) and fall back to CLOB only when Dome fails or for T1 (execution).
- **Batch:** Dome supports batch markets (and batch price). One call for many condition_ids → fewer round-trips and clearer rate limits (Dome docs give QPS).
- **Rate limits:** Dome tier (e.g. Dev 100/s) is documented; CLOB limits are not. Using Dome for most read traffic reduces CLOB load and avoids unknown throttling.
- **Consistency:** One pipeline (Dome → `markets`) for metadata+price for display; CLOB reserved for execution and as fallback when Dome is missing or T1.

**Concrete:**

- **Price API (or new batch):** For T2/T3 requests, (1) read `markets`; if fresh, return. (2) If stale, call **Dome** batch (markets + price) for those condition_ids; upsert into `markets`; return. (3) If Dome fails or tier is T1, call **CLOB** (single or batch) and upsert; return.
- **LT execute:** Continue reading `markets` but ensure data is T1-fresh (e.g. run a refresh step before execute that uses CLOB or Dome for open markets).
- **Resolve flows:** Keep Gamma for resolution until we verify Dome resolution/outcome semantics match.

---

## 6. Implementation Safety Checklist

- [ ] **Single response shape:** Document and code one `market` shape (outcomePrices, outcomes, metadata) used by all callers.
- [ ] **Outcome mapping:** Every consumer that maps outcome → price (pickOutcomePrice, array index, etc.) must get the same mapping from cache as from CLOB/Dome.
- [ ] **Resolved = 0/1:** Everywhere we infer resolution (portfolio, profile, stats, orders), use `resolved_outcome`/`winning_side` or cached 0/1; never use stale mid price for resolved.
- [ ] **T1 never stale for execution:** LT execute, order place, trade-execute must use 30 s cache or refresh; no T2/T3 cache for those.
- [ ] **Write-back one place:** Only the central layer (or routes that call it) writes `outcome_prices` and `last_price_updated_at` to `markets` so we don’t have conflicting formats.
- [ ] **Orders + market_cache:** Before removing CLOB from orders route, migrate to reading `markets` (or central service) and writing `market_cache` from that, or merge market_cache into markets and use one table.
- [ ] **Tests:** Add tests that (1) central layer returns same shape as current price API for a given condition_id, (2) pickOutcomePrice(cache, outcome) === pickOutcomePrice(fresh API, outcome) for open and resolved.

---

## 7. Summary

- **CLOB:** Primary for **real-time price** and execution; keep for T1 and fallback.
- **Gamma:** Metadata and resolution; fallback price; keep for resolve until Dome verified.
- **Dome:** Use for **batch metadata+price** and T2/T3 refresh to reduce CLOB load and get clear rate limits; optional WebSockets later for live feed.
- **Feed/portfolio:** Need **15–30 s** freshness (T2); use cache-first + single refresh path; same response shape everywhere so **no change to PnL/ROI formulas** — only data source changes.
- **Break prevention:** One response contract; same `outcome_prices` format in DB and API; T1 for execution paths; single write-back path; migrate orders route and test outcome mapping.
