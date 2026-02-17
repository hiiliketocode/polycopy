# Trader Profile Redesign: Eliminating Custom P&L Infrastructure

**Author:** Polycopy Team  
**Status:** Proposal  
**Created:** February 17, 2026  
**Last Updated:** February 17, 2026

---

## 1. Executive Summary

Our trader profile pages are slow, expensive to maintain, and show less data than competitors like stand.trade. The root cause is that we built and maintain our own P&L calculation pipeline (BigQuery, Dome ingestion, Supabase materialized views, FIFO matching) to compute data that **Polymarket's Data API already provides pre-calculated, for free, for any wallet, instantly**.

This document proposes replacing our custom P&L infrastructure with direct calls to Polymarket's Data API, aggregated server-side into a single cached endpoint. The result: faster page loads, richer data, dramatically simpler architecture, and lower operating costs.

---

## 2. What We Learned from Stand.trade

### 2.1 How Stand.trade Works

We reverse-engineered stand.trade's trader profile implementation by examining their browser console output, network requests, and page behavior. Key findings:

**From the console output on a stand.trade trader profile page:**

```
/api/profile-stats?proxyAddress=0x9d84ce0306f8551e02efef1680475fc0f1dc1344
clob.polymarket.com/auth/api-key
embedded-wallets-a49247918b59d05f.js (Privy embedded wallets)
divine-warmhearted-putty.solana-mainnet.quiknode.pro (Solana RPC)
```

**The critical observation:** Stand.trade has a **single internal API endpoint** (`/api/profile-stats`) that returns all trader profile data in one response. The page loads nearly instantly because:

1. **One network request** from client to their server (not 4+ like we do)
2. **Server-side parallel fetching** — their backend calls multiple Polymarket endpoints simultaneously
3. **Aggressive caching** — profile data is cached server-side (likely 30-60 seconds TTL)
4. **No custom P&L database** — they use Polymarket's pre-calculated P&L fields directly

### 2.2 What Stand.trade Does NOT Do

Stand.trade does **not** appear to:

- Maintain their own P&L calculation pipeline
- Run BigQuery or any data warehouse for trader stats
- Store daily realized P&L rows in their own database
- Compute FIFO position matching
- Maintain materialized views for rankings

They simply read from Polymarket's API and present the data. This is why their profiles load instantly with complete history for every wallet on Polymarket.

### 2.3 What Stand.trade Shows on a Trader Profile

- **P&L by time period** — 1 Day, 1 Week, 1 Month, All Time (with rank for each)
- **Full trade history** — every trade with entry price, size, side, outcome, market title
- **Open positions** — current positions with entry price, current price, unrealized P&L
- **Closed positions** — historical positions with realized P&L, average price paid
- **Profile metadata** — display name, avatar, X/Twitter handle, verified badge, account age
- **Volume** — total volume traded per time period

All of this data is available from Polymarket's public API. Stand.trade is simply fetching it and displaying it well.

---

## 3. The Polymarket Data API: What's Available

Through our investigation, we confirmed that Polymarket's Data API provides **everything needed for a complete trader profile**, pre-calculated and ready to use. Here is the complete set of endpoints and the data they return:

### 3.1 Leaderboard with Time Periods

**Endpoint:** `GET https://data-api.polymarket.com/v1/leaderboard?timePeriod={period}&user={wallet}`

Returns P&L, volume, rank, and profile info for any wallet, broken down by time period. This is how stand.trade populates their 1D / 1W / 1M / All-time P&L display.

**Verified live data for wallet `0x9d84...` (ImJustKen):**

| Period | P&L | Volume | Rank |
|---|---|---|---|
| Day | +$13,048 | $783K | #41 |
| Week | -$14,446 | $912K | #349,336 |
| Month | -$30,266 | $10.7M | #668,679 |
| All Time | +$2,953,273 | $457M | #26 |

Each response also includes: `userName`, `xUsername`, `verifiedBadge`, `profileImage`.

**What this replaces for us:** Our `wallet_realized_pnl_daily` table, the BigQuery/Dome pipeline, the `wallet_realized_pnl_rankings` materialized view, and all the date-math summary computation in our `/api/trader/[wallet]/realized-pnl` route.

### 3.2 Open Positions with P&L

**Endpoint:** `GET https://data-api.polymarket.com/positions?user={wallet}`

Returns all open positions with **pre-calculated P&L fields**:

```json
{
  "title": "Will Trump nominate Kevin Warsh as the next Fed chair?",
  "outcome": "Yes",
  "size": 395229.66,
  "avgPrice": 0.4506,
  "curPrice": 0.9435,
  "initialValue": 178115.39,
  "currentValue": 372899.19,
  "cashPnl": 194783.80,
  "percentPnl": 109.36,
  "realizedPnl": 78057.65,
  "percentRealizedPnl": 19.79,
  "totalBought": 690733.22,
  "icon": "https://...",
  "slug": "will-trump-nominate-kevin-warsh...",
  "eventSlug": "who-will-trump-nominate-as-fed-chair",
  "endDate": "2026-12-31",
  "redeemable": false
}
```

Supports sorting by `CURRENT`, `INITIAL`, `TOKENS`, `CASHPNL`, `PERCENTPNL`, `TITLE`, `RESOLVING`, `PRICE`, `AVGPRICE`. Supports pagination (limit up to 500, offset up to 10,000).

**What this replaces for us:** Our FIFO P&L calculation in `/api/trader/[wallet]/my-stats`, the per-position price lookups against the CLOB API, and the `markets` table write-back for cached prices.

### 3.3 Closed Positions with Realized P&L

**Endpoint:** `GET https://data-api.polymarket.com/closed-positions?user={wallet}`

Returns all historically closed positions with realized P&L:

```json
{
  "title": "Will Kamala Harris win the 2024 Democratic Presidential Nomination?",
  "outcome": "Yes",
  "avgPrice": 0.4805,
  "totalBought": 1941775.85,
  "realizedPnl": 768633.76,
  "curPrice": 1,
  "timestamp": 1722942012,
  "icon": "https://...",
  "slug": "will-kamala-harris-win-the-2024-democratic..."
}
```

Supports sorting by `REALIZEDPNL`, `TITLE`, `PRICE`, `AVGPRICE`, `TIMESTAMP`. Pagination up to 50 per page, offset up to 100,000.

**What this replaces for us:** The `wallet_realized_pnl_daily` table for historical P&L, the backfill pipeline, and the async backfill trigger logic.

### 3.4 Full Trade History

**Endpoint:** `GET https://data-api.polymarket.com/activity?user={wallet}&type=TRADE`

Returns every individual trade with full context:

```json
{
  "timestamp": 1771344569,
  "type": "TRADE",
  "title": "Will US or Israel strike Iran by February 28, 2026?",
  "outcome": "No",
  "side": "SELL",
  "size": 210.52,
  "usdcSize": 174.73,
  "price": 0.83,
  "transactionHash": "0x059...",
  "name": "ImJustKen",
  "profileImage": "https://...",
  "icon": "https://..."
}
```

Supports filtering by `type` (TRADE, SPLIT, MERGE, REDEEM, REWARD, CONVERSION, MAKER_REBATE), `side` (BUY, SELL), `market`, `eventId`, and time range (`start`, `end`). Pagination up to 500 per page.

**What this replaces for us:** Our `/api/polymarket/trades-blockchain/[wallet]` endpoint and the trades API wrapper.

### 3.5 Public Profile

**Endpoint:** `GET https://gamma-api.polymarket.com/public-profile?address={wallet}`

Returns profile metadata:

```json
{
  "createdAt": "2022-01-19T11:45:10.761Z",
  "name": "ImJustKen",
  "pseudonym": "Ample-Instance",
  "bio": "",
  "profileImage": "https://...",
  "xUsername": "Domahhhh",
  "verifiedBadge": true,
  "displayUsernamePublic": true,
  "users": [{"id": "82662", "creator": true, "mod": false}]
}
```

**What this replaces for us:** The username-from-trades fallback logic, and gives us data we don't currently show (account creation date, X username, verified badge, bio).

### 3.6 Portfolio Value

**Endpoint:** `GET https://data-api.polymarket.com/value?user={wallet}`

Returns total USDC value of all open positions. Simple aggregate.

---

## 4. Current Architecture vs. Proposed Architecture

### 4.1 Current Architecture (What We Have Today)

```
User visits /trader/[wallet]
    │
    ├── Client fetch #1: /api/trader/[wallet]
    │   └── Server: Polymarket V1 leaderboard API (no cache)
    │   └── Server: Supabase follows count
    │   └── Fallback: /trades API for username
    │
    ├── Client fetch #2: /api/trader/[wallet]/realized-pnl
    │   └── Server: Supabase wallet_realized_pnl_daily (paginated, 1000 rows/page)
    │   └── Server: Supabase wallet_realized_pnl_rankings (materialized view)
    │   └── Server: Supabase traders table (volume)
    │   └── Server: Date normalization, summary computation
    │   └── Async: Backfill trigger if no data exists
    │
    ├── Client fetch #3: /api/trader/[wallet]/my-stats
    │   └── Server: Supabase orders table
    │   └── Server: FIFO position matching calculation
    │   └── Server: CLOB API for current prices (per market)
    │
    └── Client fetch #4: /api/polymarket/trades-blockchain/[wallet]
        └── Server: Polymarket trades API
```

**Problems:**
- 4 sequential client-side network requests before the page is fully loaded
- Each server route makes its own external API calls (no sharing)
- `realized-pnl` route paginates through potentially thousands of Supabase rows
- `my-stats` route runs FIFO calculation + per-market price lookups
- No caching on the main trader route (`cache: 'no-store'`)
- If a wallet has never been viewed, there's no P&L data at all (backfill must run first)
- Data is only as fresh as the last Dome/BigQuery pipeline run

### 4.2 Proposed Architecture (Stand.trade Approach)

```
User visits /trader/[wallet]
    │
    └── Client fetch: /api/v3/trader/[wallet]/profile
        │
        └── Server (parallel, cached):
            ├── Polymarket /v1/leaderboard?timePeriod=day&user=...
            ├── Polymarket /v1/leaderboard?timePeriod=week&user=...
            ├── Polymarket /v1/leaderboard?timePeriod=month&user=...
            ├── Polymarket /v1/leaderboard?timePeriod=all&user=...
            ├── Polymarket /positions?user=...
            ├── Polymarket /closed-positions?user=...
            ├── Polymarket /activity?user=...&type=TRADE&limit=50
            ├── Gamma /public-profile?address=...
            └── Supabase: follows count
            │
            └── Aggregate into single JSON → cache 30-60s → return
```

**One client request. All data. Cached.**

**Non-leaderboard fallback:** If the leaderboard API returns empty for a wallet (very rare — we've verified it works for wallets ranked as low as #349,336), the server computes aggregate P&L from the positions and closed-positions responses instead. Open positions, closed positions, trade history, and profile data are always available for any wallet regardless of leaderboard presence.

---

## 5. Will It Provide Full History Performance Data?

**Yes — instantly, for every wallet on Polymarket, with zero backfill needed.**

This is the single biggest improvement. Here is what becomes available for every trader profile with no pipeline, no database, and no waiting:

### 5.1 P&L by Time Period (Instant)

By calling the leaderboard endpoint 4 times in parallel (day, week, month, all), we get:

| Data Point | Day | Week | Month | All Time |
|---|---|---|---|---|
| P&L ($) | Yes | Yes | Yes | Yes |
| Volume ($) | Yes | Yes | Yes | Yes |
| Rank (#) | Yes | Yes | Yes | Yes |

This works for **any wallet that has ever traded on Polymarket**. No backfill. No pipeline. No database table. The data is calculated and maintained by Polymarket's own infrastructure.

**Comparison with what we have today:** Our current system only shows P&L by time period if the wallet exists in our `wallet_realized_pnl_daily` table, which requires the Dome/BigQuery pipeline to have already processed that wallet. For wallets we've never seen, we show nothing until a backfill completes (which can take minutes or fail silently).

### 5.2 Complete Trade History (Instant)

The `/activity?type=TRADE` endpoint returns every trade a wallet has ever made, with:

- **Timestamp** — when the trade happened
- **Market title** — what they traded on
- **Outcome** — which side (Yes/No)
- **Side** — BUY or SELL
- **Entry price** — the price they paid
- **Size** — number of shares
- **USDC size** — dollar amount
- **Transaction hash** — on-chain proof

Paginated up to 500 per page with offset up to 10,000. We can lazy-load older trades as the user scrolls.

**Comparison with what we have today:** Our current trade history comes from a single Polymarket trades endpoint and lacks the filtering, sorting, and activity-type breakdown that the `/activity` endpoint provides.

### 5.3 Open Positions with Live P&L (Instant)

The `/positions` endpoint returns every open position with pre-calculated:

- **Average entry price** — what they paid on average
- **Current price** — live market price
- **Cash P&L** — dollar profit/loss (unrealized + realized for this position)
- **Percent P&L** — percentage return
- **Realized P&L** — profit/loss from partial closes
- **Initial value** — what they originally invested
- **Current value** — what it's worth now

**Comparison with what we have today:** Our current system calculates this via FIFO matching against our `orders` table, which only contains orders our users have copied — not the trader's actual Polymarket positions. The Polymarket API returns the trader's real positions with P&L computed from the source of truth.

### 5.4 Closed Position History with Realized P&L (Instant)

The `/closed-positions` endpoint returns every historically closed position with:

- **Realized P&L** — how much they made or lost
- **Average price** — what they paid
- **Total bought** — total capital deployed
- **Closing price** — what the market resolved/sold at
- **Timestamp** — when it closed

**Comparison with what we have today:** We currently rely on `wallet_realized_pnl_daily` which stores one aggregated number per day — not per-position. We cannot show "this trader made $768K on the Kamala Harris nomination" today. With the Polymarket API, we can.

### 5.5 Rich Profile Data (Instant)

The `/public-profile` endpoint returns data we don't currently display:

- **Account creation date** — how long they've been trading
- **X/Twitter username** — social proof
- **Verified badge** — trust indicator
- **Bio** — trader's self-description

---

## 6. Performance: Will It Be Faster?

**Yes, significantly faster.** Here is the breakdown:

### 6.1 Current Load Time Estimate

| Step | What Happens | Estimated Time |
|---|---|---|
| Client fetch #1 | `/api/trader/[wallet]` → V1 leaderboard (no cache) | 300-800ms |
| Client fetch #2 | `/api/trader/[wallet]/realized-pnl` → Supabase paginated query | 500-2000ms |
| Client fetch #3 | `/api/trader/[wallet]/my-stats` → FIFO calc + price lookups | 400-1500ms |
| Client fetch #4 | `/api/polymarket/trades-blockchain/[wallet]` → Trades API | 300-600ms |
| **Total (sequential)** | | **1.5-5.0 seconds** |

These run partly in parallel from the client, but each one has to complete its own server-side work. On a cold load for a wallet with lots of history, the realized-pnl route alone can take 2+ seconds paginating through Supabase rows.

### 6.2 Proposed Load Time Estimate

| Step | What Happens | Estimated Time |
|---|---|---|
| Client fetch | `/api/v3/trader/[wallet]/profile` | 50-200ms (cached) |
| Cache miss | Server parallel-fetches 9 Polymarket endpoints | 400-800ms |
| **Typical (cached)** | | **50-200ms** |
| **Cold (cache miss)** | | **400-800ms** |

**Why it's faster:**
1. **One round trip** from client to server instead of four
2. **Server-side parallel fetching** — all 9 Polymarket API calls run simultaneously
3. **Edge/memory caching** — subsequent requests for the same trader in a 30-60 second window return instantly
4. **No database queries** — no Supabase round trips for P&L data
5. **No computation** — no FIFO matching, no date normalization, no summary aggregation
6. **No pagination** — no looping through thousands of daily P&L rows

### 6.3 Expected Improvement

| Metric | Current | Proposed | Improvement |
|---|---|---|---|
| Time to first meaningful paint | 1.5-5.0s | 50-800ms | **3-10x faster** |
| Full page data loaded | 2-6s | 50-800ms | **3-12x faster** |
| Cold load (never-seen wallet) | 5-15s (backfill) | 400-800ms | **6-20x faster** |
| Subsequent visits (same trader) | 1.5-5.0s (no cache) | 50-200ms | **10-25x faster** |

The most dramatic improvement is for wallets we've never seen before. Today, those require a backfill that can take many seconds or fail. With the new approach, every wallet loads instantly because Polymarket already has the data.

---

## 7. Other Benefits

### 7.1 Cost Reduction

| What We Eliminate | Estimated Savings |
|---|---|
| BigQuery usage for Dome P&L pipeline | Reduces BigQuery query/storage costs |
| Supabase storage for `wallet_realized_pnl_daily` | Reduces Supabase row count and storage |
| Supabase compute for materialized view refresh | Eliminates periodic refresh cost |
| Supabase reads from paginated P&L queries | Eliminates per-request read costs |
| CLOB API calls for per-market price lookups | Reduces external API call volume |

### 7.2 Reduced Complexity

**Code we can eventually remove or simplify:**

| File / Component | Purpose | Status After |
|---|---|---|
| `wallet_realized_pnl_daily` table | Daily P&L storage | Can deprecate |
| `wallet_realized_pnl_rankings` materialized view | Pre-computed rankings | Can deprecate |
| BigQuery → Supabase Dome pipeline | P&L ingestion | Can deprecate |
| `triggerWalletBackfillIfNeeded()` | Async backfill logic | Eliminated |
| FIFO position matching in `my-stats` | P&L calculation | Replaced by Polymarket API |
| Date normalization / summary computation | P&L time-window math | Replaced by leaderboard API |
| Username-from-trades fallback | Display name resolution | Replaced by `/public-profile` |
| `trader_global_stats` table | Cached global stats | Can simplify |
| `trader_profile_stats` table | Cached profile stats | Can simplify |

### 7.3 Data Accuracy

Currently we have documented P&L discrepancies between our calculated values and Polymarket's actual values (see `TRADER_PNL_DISCREPANCY_FIX.md`). This is because we compute P&L independently from different data sources, and they drift.

By using Polymarket's own pre-calculated P&L, we are guaranteed to match what Polymarket shows. No more discrepancies. No more "why doesn't our P&L match Polymarket?" investigations.

### 7.4 Coverage

| Metric | Current | Proposed |
|---|---|---|
| Wallets with P&L data | Only wallets processed by our pipeline | Every wallet on Polymarket |
| Trade history depth | Limited by our ingestion | Complete history back to account creation |
| Time period breakdowns | Only if in `wallet_realized_pnl_daily` | Day, Week, Month, All Time — always available |
| Closed position detail | One aggregated daily number | Per-position P&L with market context |
| New wallet first load | Requires backfill (seconds to minutes) | Instant |

**Concrete example:** Wallet `0xcbb1a3174d9ac5a0f57f5b86808204b9382e7afb` (bratanbratishka) currently shows **"Trader Not Found"** on Polycopy. But the Polymarket API returns complete data for this wallet:

- **Leaderboard:** rank #2,127 all-time, +$47,512 P&L, $509K volume
- **Open positions:** Active BTC Up/Down trades with per-position P&L
- **Closed positions:** Winning BTC trades with realized P&L (+$8,107, +$7,822, +$6,812 on individual positions)
- **Trade history:** Individual fills with entry prices, sizes, timestamps, and on-chain transaction hashes

Under the proposed architecture, this trader would have a fully populated profile page instead of an error screen.

### 7.5 Maintainability

- **No pipeline to monitor** — no BigQuery jobs to debug, no Dome ingestion to check
- **No materialized views to refresh** — no cron jobs, no stale data concerns
- **No backfill edge cases** — no "what if the wallet hasn't been backfilled yet?" logic
- **Single source of truth** — Polymarket is the authority on Polymarket data
- **Fewer tables** — less schema to maintain, migrate, and reason about

---

## 8. What We Keep

Not everything is replaced. We still need:

| Component | Why We Keep It |
|---|---|
| `follows` table | Polymarket doesn't track who follows whom on Polycopy |
| Follower count query | Our feature, not Polymarket data |
| User's copied trade P&L (`my-stats`) | P&L for the Polycopy user's copies (our `orders` table), not the trader's Polymarket P&L — different thing |
| `traders` table (subset of fields) | May still be useful for our own features like badges, classifications |
| Notification/alert logic | Our feature built on top of trader activity |

---

## 9. Implementation Plan

### Phase 1: New Aggregated Endpoint (Week 1)

Build `/api/v3/trader/[wallet]/profile` that:
1. Calls all Polymarket endpoints in parallel (leaderboard x4, positions, closed-positions, activity, public-profile)
2. Calls Supabase for follower count
3. Aggregates into a single response
4. Caches with 30-60s TTL (in-memory Map to start, Redis later)
5. Returns complete trader profile data in one response

### Phase 2: Update Trader Profile UI (Week 2)

Update `app/trader/[wallet]/page.tsx` and `app/v2/trader/[wallet]/page.tsx` to:
1. Fetch from the new single endpoint
2. Display P&L by time period (1D, 1W, 1M, All)
3. Show full trade history with entry prices, sizes, outcomes
4. Show open positions with live P&L
5. Show closed positions with realized P&L
6. Display rich profile data (account age, X handle, verified badge)

### Phase 3: Deprecate Old Infrastructure (Week 3-4)

1. Remove calls to `/api/trader/[wallet]/realized-pnl` from frontend
2. Remove calls to `/api/trader/[wallet]/my-stats` for trader P&L (keep for user's copied trade P&L)
3. Mark old API routes as deprecated
4. Stop the BigQuery/Dome P&L pipeline for trader profiles
5. Plan migration for `wallet_realized_pnl_daily` deprecation

### Phase 4: Edge Caching (Week 4+)

1. Move from in-memory cache to Redis or Vercel KV
2. Implement stale-while-revalidate pattern
3. Consider pre-warming cache for frequently viewed traders

---

## 10. Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Polymarket API rate limiting | Medium | Cache aggressively (30-60s), batch requests, monitor usage |
| Polymarket API downtime | Low | Fallback to cached data, show "data may be stale" indicator |
| API response format changes | Low | Type-safe parsing with runtime validation, alerting on parse failures |
| Missing data for very new wallets | Low | The leaderboard API returns empty arrays gracefully; UI handles empty state |
| Leaderboard API doesn't include all wallets | Low | Already verified: `user=` parameter returns data for wallets not on the public leaderboard (tested with rank #2,127 and rank #349,336 wallets). If the leaderboard ever returns empty for a wallet, fallback: sum `cashPnl` from `/positions` + `realizedPnl` from `/closed-positions` to compute aggregate P&L. Profile, trade history, and position data are always available regardless of leaderboard status. |
| Large response for very active traders | Medium | Paginate initial load: fetch first 50 positions, first 50 closed positions, first 50 trades. Lazy-load more on scroll via separate paginated requests. The `/positions` endpoint supports limit up to 500, `/closed-positions` up to 50, and `/activity` up to 500 per page. |

---

## 11. Summary

Stand.trade loads trader profiles instantly because they don't try to replicate Polymarket's data — they just read it. We should do the same.

**The core insight:** Polymarket's Data API already provides pre-calculated P&L (total, realized, unrealized, percent), full trade history with prices and sizes, complete position data, and profile metadata — broken down by time period, for any wallet, instantly. There is no reason for us to maintain our own P&L calculation pipeline.

**Expected outcomes:**
- **3-25x faster page loads** depending on cache state and wallet history
- **Instant data for every Polymarket wallet** — no backfill, no pipeline dependency
- **Richer data** — per-position P&L, time-period breakdowns, full trade history, profile metadata
- **Lower costs** — eliminate BigQuery pipeline, reduce Supabase usage
- **Less code to maintain** — remove ~500 lines of P&L calculation, backfill, and date math logic
- **No more P&L discrepancies** — Polymarket is the source of truth for Polymarket data
