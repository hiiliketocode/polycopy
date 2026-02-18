# Scalable Architecture Redesign

**Date**: February 18, 2026
**Status**: Proposed
**Context**: Supabase project hitting 100% CPU and depleting Disk IO budget due to redundant API calls and unoptimized database patterns.

---

## Problem Summary

Our current architecture has every user session and every cron job independently calling Polymarket APIs (CLOB, Data API, Gamma) and writing results to Supabase. This creates two compounding problems:

1. **Load grows linearly with users.** Each feed page loads trades by calling `data-api.polymarket.com/trades` per followed trader, and polls `clob.polymarket.com/markets` per visible market every 1-15 seconds. At 50 users this is ~300 API calls/minute hitting our DB. At 500 users it would be ~3,000/minute.

2. **The same data is fetched by multiple systems.** The feed, ft-sync, hot worker, cold worker, and various crons all independently fetch the same trades and prices from Polymarket, then write overlapping data to Supabase.

### What We Already Fixed (Feb 18)

Deployed today to stop the immediate bleed:

- **6 new database indexes** on `orders` and `ft_orders` tables — eliminates full table scans on the most frequent queries (`orders.copy_user_id`, `ft_orders.resolved_time`, partial indexes for OPEN orders)
- **N+1 query fix in `refresh-copy-pnl`** — batches updates by (market, outcome) instead of one UPDATE per order
- **`ft-snapshot` optimization** — uses `wallet.total_pnl` instead of fetching all 10K+ orders per wallet; now only queries OPEN orders
- **`sync-polymarket-pnl` parallelization** — batched updates + query limits
- **Cron frequency reduction** — `lt-execute` and `lt-sync-order-status` reduced from every 1 minute to every 2 minutes (50% less DB pressure)

---

## Proposed Architecture

### Core Principle

**Only Fly.io workers talk to Polymarket APIs. Everything else reads from Supabase.**

User growth = more DB reads (cheap, scalable), not more API calls (expensive, rate-limited).

### Current vs Target Data Flow

**Current (per-user API calls):**
```
User opens feed
  → Fetch trades from Polymarket API for each followed trader (N API calls)
  → Fetch prices from CLOB API for each visible market (M API calls)
  → Repeat every 1-15 seconds

ft-sync cron (every 5 min)
  → Fetch 44 leaderboard pages from Polymarket API
  → Fetch trades for hundreds of traders from Polymarket API
  → Same data the workers already ingested
```

**Target (centralized ingestion, DB reads):**
```
Fly.io workers (already running)
  → Ingest all trades into trades_public table
  → Write prices to markets.outcome_prices

User opens feed
  → Query trades_public table (1 DB query)
  → Subscribe to Supabase real-time for live updates (0 API calls)

ft-sync cron (every 5 min)
  → Query trades_public table (1 DB query)
  → No external API calls
```

---

## Implementation Phases

### Phase 1: Centralized Price Service

**Impact**: Highest. Eliminates the single biggest source of both API calls and Supabase writes.

**What**: A new Fly.io worker (`polycopy-price-worker`) that continuously refreshes `markets.outcome_prices` using tiered refresh rates:

| Tier | Markets | Refresh Rate | How Identified |
|------|---------|-------------|----------------|
| HOT | Markets with open live trading orders | Every 15 seconds | `lt_orders WHERE outcome = 'OPEN'` |
| WARM | Markets with open forward test orders | Every 60 seconds | `ft_orders WHERE outcome = 'OPEN'` |
| COOL | Markets recently viewed (feed/portfolio) | Every 5 minutes | New `markets.last_requested_at` column |
| COLD | All other markets | On demand only | No automatic refresh |

**Changes required**:
1. New `workers/price-worker/` directory with Fly.io config
2. New `last_requested_at` column on `markets` table
3. Modify `/api/polymarket/price` to read from cache first, only hit CLOB on cache miss
4. Feed page subscribes to Supabase real-time on `markets` table for instant price updates

**Why this matters**: Today, 50 users viewing 10 markets each = 500 CLOB API calls every 15 seconds. With this change, the price worker makes ~50 CLOB calls every 15 seconds regardless of user count.

### Phase 2: Feed from Database

**Impact**: High. Eliminates per-user-session trade API calls.

**What**: The feed page reads from `trades_public` (already populated by Fly.io hot/cold workers) instead of calling Polymarket's Data API per followed trader.

**Changes required**:
1. New API endpoint `GET /api/v2/feed/trades` that queries `trades_public` joined with `follows`, `traders`, and `markets`
2. New index: `trades_public(wallet_address, created_at DESC)`
3. Feed page migrated to use DB-backed endpoint
4. Supabase real-time subscription on `trades_public` for live trade appearances (sub-5s latency)

**Why this matters**: Today, a user following 20 traders triggers 20 API calls on every page load. With this change, it's 1 database query. The hot worker (already running on Fly.io, polling every 1-3 seconds) ensures `trades_public` stays current.

### Phase 3: FT Sync from `trades_public`

**Impact**: Medium. Eliminates ~12,700 redundant API calls per day.

**What**: `ft-sync` reads recent trades from `trades_public` instead of independently fetching from Polymarket's Data API and Leaderboard API.

**Changes required**:
1. Modify `ft-sync` to query `trades_public` for trades since last sync
2. Remove the 44 leaderboard API calls per sync cycle — use `traders` table instead (already synced daily)
3. Keep all FT wallet evaluation logic (price, edge, ML, categories) unchanged
4. WebSocket worker (`polycopy-trade-stream`) continues handling real-time FT sync as-is

**Why this matters**: ft-sync currently makes 100+ API calls every 5 minutes (288 times/day). Most of those fetch trades that are already in `trades_public`.

### Phase 4: Optimize Remaining Crons

**Impact**: Lower, but reduces ongoing DB pressure.

**Changes**:
1. **`refresh-copy-pnl`**: Read prices from `markets.outcome_prices` instead of calling `/api/polymarket/price` per market
2. **`sync-polymarket-pnl`**: Reduce from every 6 hours to daily; only process users with recent trading activity
3. **`backfill-wallet-pnl`**: Track `last_backfilled_at` per wallet; only process wallets with new resolved positions

---

## Deployment Order

Each phase is independently deployable and provides immediate value:

```
Phase 1a: Deploy price worker to Fly.io
Phase 1b: Modify price API to read cache → deploy to Vercel
Phase 1c: Feed uses Supabase real-time for prices → deploy to Vercel
Phase 2a: Create feed trades API endpoint → deploy to Vercel
Phase 2b: Migrate feed page to DB-backed → deploy to Vercel
Phase 3:  ft-sync reads from trades_public → deploy to Vercel
Phase 4:  Optimize remaining crons → deploy to Vercel
```

If any phase needs to be paused, the system works fine with only the earlier phases completed.

---

## Expected Impact

| Metric | Current (50 users) | After All Phases (500 users) |
|--------|--------------------|-----------------------------|
| CLOB API calls/min | ~200 (grows with users) | ~50 (fixed) |
| Data API calls/min | ~100 (grows with users) | ~10 (fixed) |
| Supabase CPU | ~90-100% | ~30-50% (estimated) |
| Feed page load time | 2-5s (API round trips) | <500ms (DB query) |
| External API dependency | Every page load | Workers only |

---

## Infrastructure After Redesign

| Component | Role | Talks To |
|-----------|------|----------|
| **Vercel** (Next.js) | Web app, API routes, crons | Supabase only |
| **Fly.io: trade-stream** | WebSocket ingestion of trades | Polymarket WS → Supabase |
| **Fly.io: hot-worker** | Poll followed traders (1-3s) | Polymarket Data API → Supabase |
| **Fly.io: cold-worker** | Poll all other traders (~1hr) | Polymarket Data API → Supabase |
| **Fly.io: price-worker** (new) | Refresh market prices (tiered) | Polymarket CLOB → Supabase |
| **Supabase** | Database, real-time, edge functions | — |
| **Supabase real-time** | Push price/trade updates to clients | markets + trades_public tables |

---

## Open Questions

1. Should we consolidate the hot-worker and price-worker into a single Fly.io app to reduce costs?
2. Do we need the cold worker at all if trades_public is populated by the hot worker + trade stream?
3. Should we add a Redis/Upstash layer for sub-second price caching, or is Supabase real-time sufficient?
4. Rate limits: Polymarket doesn't publish official rate limits. We should add monitoring to detect 429 responses and adjust worker polling rates dynamically.
