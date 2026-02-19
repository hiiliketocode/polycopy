# Price freshness tiers

**Purpose:** Every flow that needs a current **market price** uses the same price API with a **freshness tier**. The API returns cached data only if it was updated within that tier’s max age; otherwise it refreshes from Gamma/CLOB and writes back to `markets`.

**See also:** `docs/CENTRALIZED_MARKET_DATA_ARCHITECTURE.md`, `docs/MARKET_DATA_RIGOROUS_ANALYSIS.md`.

---

## 1. Market price vs execution price

- **Market price (this API):** What we show in feed, portfolio, and trade-execute. Sourced from **CLOB** (order book / token prices) or **Gamma** (outcome prices). It answers “what’s the current trading price for this outcome?” and is used for display, P&amp;L, and **sizing/deciding** whether to place an order. Trades need this to be **live** (T1 when placing orders, T2a for feed).
- **Execution price:** The price you actually get when the order **fills**. That comes from the **CLOB order placement/fill response**, not from this price API. So: this API = live **market** price; execution price = result of submitting the order (can differ due to slippage, depth, etc.).

---

## 2. Tiers (max age)

| Tier | Max age | Use cases |
|------|---------|-----------|
| **T1** | 30 s | **Execution:** trade-execute, LT/FT order placement, bots. Live **market** price for sizing and “should I trade?” |
| **T2a** | **250 ms** | **Feed (live):** feed table and expanded cards. 250ms so display feels real-time. |
| **T2b** | 15 s | **Portfolio / profile / trader / discover:** open positions, P&amp;L, ROI. 15s is enough for “current” feel. |
| **T3** | 2 min | **Dashboard:** portfolio stats, FT list, FT wallet [id], trader my-stats. Summary views. |
| **T4** | 10 min | **Background:** crons (refresh-copy-pnl, check-notifications), analytics. Minimize external API calls. |

**Resolved/closed markets:** Always served from cache regardless of age (no refresh).

**Default:** If the caller does not pass `tier` or `maxAgeMs`, the API uses **T2b** (15 s).

---

## 3. How to request a tier

- **Query param:** `tier=T1` | `T2a` | `T2b` | `T3` | `T4` (e.g. `/api/polymarket/price?conditionId=0x...&tier=T2a`).
- **Override with ms:** `maxAgeMs=500` (numeric; capped so one caller can’t force sub-second for everyone).

---

## 4. Callers (backend and frontend)

### 4.1 Frontend (pages / components)

| Flow | File(s) | Tier | Note |
|------|---------|------|------|
| Feed (visible markets) | `app/v2/feed/page.tsx`, `app/feed/page.tsx` | **T2a** | 250ms so feed feels live |
| Feed trade card (live price poll) | `components/polycopy-v2/feed-trade-card.tsx`, `components/polycopy/trade-card.tsx` | **T2a** | Card polls every 250ms |
| Trade execute | `app/trade-execute/page.tsx` | **T1** | Execution; need fresh price for order |
| Portfolio | `app/portfolio/page.tsx` | **T2b** | Open positions, P&amp;L |
| Profile | `app/profile/page.tsx` | **T2b** | Same as portfolio |
| Trader page | `app/trader/[wallet]/page.tsx` | **T2b** | Trade list, ROI |
| Test trader page | `app/test/trader/[wallet]/page.tsx` | **T2b** | Same as trader |
| Discover | `app/discover/page.tsx` | **T2b** | Browse / ROI display |

### 4.2 Backend (API routes)

| Flow | File(s) | Tier | Note |
|------|---------|------|------|
| Portfolio open trades | `app/api/portfolio/trades/route.ts` | **T2b** | Builds `marketsMap`; `latestPrice` for each trade |
| Portfolio stats | `app/api/portfolio/stats/route.ts` | **T3** | Summary, P&amp;L; 5 min staleness logic already present |
| Trader my-stats | `app/api/trader/[wallet]/my-stats/route.ts` | **T3** | Trader dashboard stats |
| FT wallets list | `app/api/ft/wallets/route.ts` | **T3** | List of wallets; positions summary |
| FT wallet [id] | `app/api/ft/wallets/[id]/route.ts` | **T3** | Single wallet positions (display). When FT/LT use price for **trading decisions**, that path should use T1 (e.g. executor or strategy route that fetches price before order). |

### 4.3 Bots / LT / FT when trading

- **Bot pages (display):** Use same as dashboard (T3) if they call the price API for list/summary.
- **When a bot or LT/FT strategy decides to place an order:** That code path should request price with **T1** (or call the price API with `tier=T1`) so the decision is based on fresh price. If such logic lives in a different service (e.g. executor, cron), add `tier=T1` when it calls the price API.

### 4.4 Crons / background

- **refresh-copy-pnl, check-notifications, etc.:** Should use **T4** (or no tier, and we could add T4 to those call sites when they use the price API). Not all crons call the price API today; when they do, pass `tier=T4`.

---

## 5. Implementation notes

- **Price API** (`app/api/polymarket/price/route.ts`): Reads `tier` or `maxAgeMs` from query; uses it for (1) in-memory cache TTL (return cache only if `cachedAt` within max age), (2) DB freshness (return from `markets.outcome_prices` only if `last_price_updated_at` within max age). Constants: `PRICE_FRESHNESS_TIERS_MS`, `DEFAULT_FRESHNESS_MS`.
- **Single source of truth:** All these flows call the same endpoint; the only difference is how fresh the cached data is allowed to be. Fresher tiers cause more Gamma/CLOB refreshes when cache is stale.

---

## 6. Summary

| Tier | Max age | Main use |
|------|---------|----------|
| T1 | 30 s | Execution (trade-execute, order placement) — live **market** price for sizing |
| T2a | **250 ms** | Feed table + cards (real-time feel) |
| T2b | 15 s | Portfolio, profile, trader, discover |
| T3 | 2 min | Dashboard (stats, FT list, my-stats) |
| T4 | 10 min | Background / crons |

Every caller that needs “current price” should pass the appropriate `tier` (or `maxAgeMs`) so the API can serve from cache when data is fresh enough for that use case, and refresh when not.
