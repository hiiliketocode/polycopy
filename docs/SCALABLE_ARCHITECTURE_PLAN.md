# Scalable Architecture Redesign (v2)

**Date**: February 18, 2026
**Status**: Proposed (revised after cofounder review)
**Context**: Supabase project hitting 100% CPU and depleting Disk IO budget. Fly.io trade-stream OOMing. Architecture doesn't scale with user growth.

---

## What We Already Fixed (Feb 18 — deployed)

Emergency fixes to stop the immediate bleed:

- **6 new database indexes** on `orders` and `ft_orders` — eliminates full table scans
- **N+1 query fix in `refresh-copy-pnl`** — batches updates instead of one per order
- **`ft-snapshot` optimization** — uses `wallet.total_pnl` instead of fetching 10K+ orders
- **`sync-polymarket-pnl` parallelization** — batched updates + query limits
- **Cron frequency reduction** — `lt-execute` and `lt-sync-order-status` from every 1min to every 2min

---

## Problem Summary

Our architecture has every user session and cron job independently calling Polymarket APIs and writing results to Supabase. This creates two compounding problems:

1. **Load grows linearly with users.** Each feed page calls `data-api.polymarket.com/trades` per followed trader and polls `clob.polymarket.com/markets` per visible market every 250ms-15s. At 50 users: ~300 API calls/min. At 500 users: ~3,000/min.

2. **Same data fetched by multiple systems.** The feed, ft-sync, hot worker, cold worker, and crons all independently fetch the same trades and prices, then write overlapping data to Supabase.

3. **CLOB API used for display, not just trading.** The `/api/polymarket/price` route hits CLOB as its primary source for ALL consumers (feed, portfolio, bots). CLOB should only be used for order placement, orderbook depth, and order status. For price display, Gamma API provides the same `outcomePrices` data.

---

## Key Decisions (from cofounder review)

1. **Hot and cold workers are no longer needed.** Remove from code and tear down Fly.io apps.
2. **Most FT/LT cron jobs must stay.** Only `ft-sync` is redundant with the trade-stream. The rest handle resolution, snapshots, capital reconciliation — not trade ingestion.
3. **No new Fly.io workers.** Fix the existing trade-stream instead of adding infrastructure.
4. **CLOB API only for actual trading.** Switch all price/display code to Gamma API or cached `markets` table.
5. **`trades_public` needs a retention policy.** Auto-delete trades older than 30 days to prevent disk bloat.
6. **Bots need sub-5s freshness.** The trade-stream WebSocket already delivers this. Price for execution comes from on-demand API calls.
7. **Feed needs live pricing.** The 250ms client-side poll stays, but reads from a 10-second DB cache instead of hitting CLOB every time.

---

## Cron Job Audit

| Cron | Schedule | What It Does | Keep? |
|------|----------|-------------|-------|
| `ft-sync` | Every 5min | Polls Polymarket API for trades | **REMOVE** — redundant with trade-stream |
| `ft-resolve` | Every 10min | Resolves FT orders when markets close | **KEEP** — handles resolution |
| `ft-snapshot` | Hourly | Records performance analytics snapshots | **KEEP** — handles analytics |
| `lt-execute` | Every 2min | Executes live trades, cooldowns, risk resets | **KEEP** — safety net + cooldown/risk |
| `lt-resolve` | Every 5min | Resolves LT positions when markets settle | **KEEP** — handles resolution |
| `lt-sync-order-status` | Every 2min | Syncs fill status from CLOB, reconciles capital | **KEEP** — handles order lifecycle |
| `refresh-copy-pnl` | Cron | Updates current prices on user orders | **KEEP** — optimize to read from cache |
| `sync-polymarket-pnl` | Every 6hr | Syncs realized PnL from Polymarket | **KEEP** — reduce to daily |
| `backfill-wallet-pnl` | Daily 2AM | Backfills wallet PnL stats | **KEEP** — make incremental |

---

## Target Architecture

```
                    Polymarket APIs
                    ┌─────────────────────────────────┐
                    │  WebSocket   Gamma API   CLOB   │
                    └──────┬──────────┬─────────┬─────┘
                           │          │         │
                    ┌──────▼──────┐   │    (trading only)
                    │  Fly.io     │   │         │
                    │  Trade      │   │         │
                    │  Stream     │   │         │
                    │  (2GB)      │   │         │
                    └──┬────┬─────┘   │         │
                       │    │         │         │
              ┌────────▼┐ ┌─▼─────────▼──┐     │
              │trades_  │ │  markets     │     │
              │public   │ │  table       │     │
              │         │ │  (price      │     │
              │         │ │   cache)     │     │
              └────┬────┘ └──────┬───────┘     │
                   │             │              │
     ┌─────────────┼─────────────┼──────────────┤
     │             │             │              │
  ┌──▼───┐  ┌─────▼──┐  ┌──────▼───┐  ┌───────▼───────┐
  │ Feed │  │Portfo- │  │ Bot      │  │ lt-execute    │
  │ Page │  │lio     │  │ Dashboard│  │ (place orders)│
  └──────┘  └────────┘  └──────────┘  └───────────────┘
  DB read    DB read     DB read       CLOB (trading)
  only       only        only          only
```

**Core principle**: Only the Fly.io trade-stream and Vercel crons talk to external APIs. All user-facing pages read from Supabase. User growth = more DB reads (cheap), not more API calls.

---

## Phase 1: Fix Trade-Stream OOM and Centralize Prices

### 1a. Fix Trade-Stream OOM (Immediate)

The trade-stream crashed because it subscribes to ALL traders from the `traders` table when in "leaderboard mode" (any FT wallet without an explicit target). 1000+ traders = too many WebSocket messages for 1GB.

**Fix:**
- Cap trader subscription set to max 200 traders
- Prioritize: explicit target traders first, then top traders by win rate
- Add memory monitoring (log heap usage every 60s)
- Scale memory: `fly scale memory 2048 -a polycopy-trade-stream` (~$5/month)

**File**: `workers/polymarket-trade-stream/src/index.ts`

### 1b. Switch Price API from CLOB to Cache-Through Gamma

Currently `/api/polymarket/price` hits CLOB API as primary source for every price request (including feed's 250ms polling). Switch to cache-through pattern:

1. Read `markets.outcome_prices` and `last_price_updated_at` first
2. If cache is fresh (< 10 seconds old) — return cached data immediately (sub-millisecond)
3. If stale — fetch from Gamma API (not CLOB), write back to `markets` table, return
4. Update `markets.last_requested_at` on every read (tracks which markets are in demand)
5. Keep CLOB as last-resort fallback only

**Result:**
- Feed's 250ms polling reads from DB cache (fast, no API calls)
- Cache refreshes from Gamma ~every 10 seconds per active market
- Multiple users viewing same market = 1 Gamma refresh, N cache reads
- CLOB reserved for actual trading only

**File**: `app/api/polymarket/price/route.ts`

### 1c. Add `last_requested_at` Column

```sql
ALTER TABLE markets ADD COLUMN IF NOT EXISTS last_requested_at TIMESTAMPTZ;
```

---

## Phase 2: Feed from Database + Trade-Stream Ingestion

### 2a. Trade-Stream Writes to `trades_public`

Currently the trade-stream only writes to `ft_orders` (via `/api/ft/sync-trade`). Extend it to also upsert trades into `trades_public` so the feed has a DB-backed source. This replaces the hot worker's role.

**File**: `workers/polymarket-trade-stream/src/index.ts`

### 2b. Create Feed API Endpoint

New `GET /api/v2/feed/trades` backed by `trades_public`:

```sql
SELECT tp.*, t.display_name, t.avatar, m.title, m.outcome_prices, m.image
FROM trades_public tp
JOIN follows f ON f.trader_wallet = tp.trader_wallet AND f.user_id = $1
LEFT JOIN traders t ON t.wallet_address = tp.trader_wallet
LEFT JOIN markets m ON m.condition_id = tp.condition_id
WHERE tp.trade_timestamp > NOW() - INTERVAL '7 days'
ORDER BY tp.trade_timestamp DESC
LIMIT 50
```

**Today**: User follows 20 traders = 20 API calls to Polymarket per page load.
**After**: 1 DB query regardless of how many traders followed.

### 2c. Migrate Feed Page

Update `app/v2/feed/page.tsx`:
- Replace `fetchFeed()` (N API calls per trader) with single call to `/api/v2/feed/trades`
- Keep 250ms price polling via `/api/polymarket/price` (now reads from cache, not CLOB)
- Optionally add Supabase real-time subscription on `trades_public` for instant new trade appearances

### 2d. `trades_public` Retention Cleanup

New daily cron `GET /api/cron/cleanup-trades-public` (4 AM UTC):
- Delete trades older than 30 days
- Delete trades for resolved markets older than 7 days
- Prevents unbounded table growth and disk exhaustion

---

## Phase 3: Remove Redundant Code

### 3a. Remove Hot and Cold Workers

Delete from codebase:
- `workers/worker-hot.js`
- `workers/worker-cold.js`
- `workers/shared/polling.js` (if only used by hot/cold)
- `fly.worker-hot.toml`
- `fly.worker-cold.toml`

Tear down Fly.io apps:
```bash
fly apps destroy polycopy-hot-worker
fly apps destroy polycopy-cold-worker
```

### 3b. Remove `ft-sync` Cron

Remove from `vercel.json`:
```json
{"path":"/api/cron/ft-sync","schedule":"*/5 * * * *"}
```

The trade-stream WebSocket handles real-time FT ingestion. `ft-sync` was the polling backup.

### 3c. Remove CLOB from Non-Trading Code

Replace CLOB with Gamma API or `markets` table reads in:
- `app/api/polymarket/market/route.ts`
- `app/api/orders/route.ts` (`fetchMarketMetadataFromClob`)
- `app/api/cron/check-notifications/route.ts`
- `app/api/polysignal/route.ts`
- `app/api/markets/ensure/route.ts`
- `app/api/lt/strategies/route.ts`

Keep CLOB **only** in:
- `lib/polymarket/place-order-core.ts` (order placement)
- `lib/polymarket/order-book.ts` (orderbook depth)
- `lib/live-trading/sell-manager.ts` (sell price discovery)
- `app/api/polymarket/orders/` routes (order management)
- `app/api/lt/sync-order-status` (fill status checks)

---

## Phase 4: Optimize Remaining Crons

- **`refresh-copy-pnl`**: Read prices from `markets.outcome_prices` cache instead of calling `/api/polymarket/price` per market
- **`sync-polymarket-pnl`**: Reduce from every 6 hours to daily; only process users with recent activity
- **`backfill-wallet-pnl`**: Track `last_backfilled_at` per wallet; only process wallets with new resolved positions

---

## Fly.io Cost Summary

| App | Current | After |
|-----|---------|-------|
| `polycopy-trade-stream` | 1GB, free tier | 2GB (~$5/month) |
| `polycopy-hot-worker` | 256MB, free tier | REMOVED |
| `polycopy-cold-worker` | 256MB, free tier | REMOVED |
| **Total** | **1.5GB across 3 apps** | **2GB, 1 app, ~$5/month** |

---

## Data Freshness Summary

| Consumer | Trade Freshness | Price Freshness | Data Source |
|----------|----------------|-----------------|-------------|
| Feed page | Real-time (WebSocket -> trades_public) | ~10s cache (Gamma via markets table) | DB reads only |
| Feed card (expanded) | Same | 250ms poll reads from ~10s cache | DB reads only |
| FT bots | Real-time (WebSocket -> ft_orders) | On-demand Gamma (sub-second) | WebSocket + API |
| LT bots | Real-time (triggered by FT) | On-demand CLOB for execution | WebSocket + CLOB |
| Portfolio | On page load | ~10s cache | DB reads only |
| ft-resolve | Every 10 min | Gamma API (resolution check) | Cron + API |
| lt-resolve | Every 5 min | Gamma API (resolution check) | Cron + API |
| lt-sync-order-status | Every 2 min | CLOB (fill status) | Cron + CLOB |

---

## Full Audit: Everything That Reads Trades or Prices

### Trades Consumers (25 total)

| # | File | What It Needs | Current Source | After Redesign |
|---|------|--------------|----------------|----------------|
| 1 | Feed page (`app/v2/feed/page.tsx`) | Followed traders' trades | Polymarket Data API per trader | `trades_public` table |
| 2 | Fire feed (`app/api/fire-feed/route.ts`) | Top trader trades | Polymarket Data API | `trades_public` table |
| 3 | FT sync-trade (`app/api/ft/sync-trade/route.ts`) | Single trade evaluation | WebSocket payload | No change (already real-time) |
| 4 | FT sync (`app/api/ft/sync/route.ts`) | Bulk trades from leaderboard | Polymarket Data API | REMOVED |
| 5 | LT execute (`app/api/lt/execute/route.ts`) | FT orders to execute | `ft_orders` table | No change |
| 6 | Portfolio trades (`app/api/portfolio/trades/route.ts`) | User's copied trades | `orders_copy_enriched` view | No change |
| 7 | Trader page (`app/api/trader/[wallet]/route.ts`) | Individual trader trades | Polymarket Data API | Keep as-is (on-demand) |
| 8 | Sync public trades (`app/api/cron/sync-public-trades/route.ts`) | All trader trades | Polymarket Data API | REMOVED (trade-stream replaces) |
| 9 | Sync Polymarket PnL (`app/api/cron/sync-polymarket-pnl/route.ts`) | Closed positions | Polymarket Data API | Keep (reduce to daily) |
| 10 | Backfill wallet PnL | Historical trades | `trades_public` + API | Keep (make incremental) |
| 11 | Refresh copy PnL | Open order prices | `/api/polymarket/price` | Read from `markets` cache |
| 12 | Trade-stream worker | Real-time trades | Polymarket WebSocket | No change + write to `trades_public` |
| 13 | Hot worker | Followed trader trades | Polymarket Data API | REMOVED |
| 14 | Cold worker | All trader trades | Polymarket Data API | REMOVED |

### Price/Markets Consumers (22 total)

| # | File | What It Needs | Current Source | After Redesign |
|---|------|--------------|----------------|----------------|
| 1 | `/api/polymarket/price` | Market prices | CLOB API (primary) | `markets` cache -> Gamma (fallback) |
| 2 | Feed page (trade cards) | Live prices | `/api/polymarket/price` -> CLOB | `/api/polymarket/price` -> cache |
| 3 | Portfolio stats | Position prices | `markets` table + CLOB refresh | `markets` cache (no change needed) |
| 4 | FT wallets (`/api/ft/wallets/[id]`) | Open position prices | `markets` + `/api/polymarket/price` | `markets` cache |
| 5 | LT live prices (`/api/lt/live-prices`) | Open position prices | `markets` + CLOB direct | `markets` cache + Gamma |
| 6 | FT resolve | Resolution status | Gamma API | No change |
| 7 | LT resolve | Resolution status | Gamma API | No change |
| 8 | LT sync-order-status | Fill status | CLOB API | No change (must use CLOB) |
| 9 | FT snapshot | Cached prices for PnL | `markets` table | No change (already cached) |
| 10 | Refresh copy PnL | Prices for orders | `/api/polymarket/price` -> CLOB | Read from `markets` cache directly |
| 11 | Check notifications | Market data | CLOB API | Switch to Gamma/cache |
| 12 | Orders route | Market metadata | CLOB API | Switch to Gamma/cache |
| 13 | PolySignal | Market data | CLOB API | Switch to Gamma/cache |
| 14 | Markets ensure | Market existence | CLOB + Gamma | Switch to Gamma only |
| 15 | LT strategies | Display metadata | CLOB API | Switch to Gamma/cache |
| 16 | Token cache | Token IDs | CLOB API | Keep (needed for order placement) |
| 17 | Order placement | Execution | CLOB API | No change (must use CLOB) |
| 18 | Orderbook | Depth/liquidity | CLOB API | No change (must use CLOB) |
| 19 | Sell manager | Sell price discovery | CLOB API | No change (must use CLOB) |
| 20 | PolyScore (edge function) | Market metadata | Gamma API + DB | No change |
| 21 | Predict-trade (edge function) | Market classification | Gamma API + DB | No change |
| 22 | Backfill scripts | Historical prices | Various APIs | No change (one-time runs) |

---

## Expected Impact

| Metric | Current (50 users) | After All Phases (500 users) |
|--------|--------------------|-----------------------------|
| CLOB API calls/min | ~200 (grows with users) | ~10 (trading only, fixed) |
| Gamma API calls/min | ~20 | ~50 (fixed, replaces CLOB for display) |
| Data API calls/min | ~100 (grows with users) | ~5 (fixed, from trade-stream only) |
| Supabase CPU | ~90-100% | ~30-50% (estimated) |
| Feed page load time | 2-5s (API round trips) | <500ms (DB query) |
| Fly.io apps | 3 apps, 1.5GB total | 1 app, 2GB, ~$5/month |

---

## Open Questions for Discussion

1. **Trade-stream scope**: When hot/cold workers are removed, the trade-stream needs to write ALL followed traders' trades to `trades_public`. Currently it only subscribes to FT target traders. Do we expand the WebSocket subscription to include all followed traders, or keep a lightweight polling backup for non-target traders?

2. **`trades_public` retention**: Is 30 days sufficient? Do we need longer for analytics or backfill?

3. **Price cache TTL**: Should the 10-second TTL be configurable per consumer (shorter for feed, longer for portfolio)?

4. **Trader page**: Currently fetches trades from Polymarket Data API on-demand. Move to `trades_public`, or acceptable as-is since it's low-volume (one user viewing one trader)?

---

## Deployment Order

Each phase is independently deployable:

```
Phase 1a: Fix trade-stream OOM → deploy to Fly.io
Phase 1b: Price API cache-through → deploy to Vercel
Phase 1c: Add last_requested_at column → run SQL migration
Phase 2a: Trade-stream writes to trades_public → deploy to Fly.io
Phase 2b: Create feed trades endpoint → deploy to Vercel
Phase 2c: Migrate feed page → deploy to Vercel
Phase 2d: Add cleanup cron → deploy to Vercel
Phase 3a: Remove hot/cold workers → delete code + tear down Fly.io
Phase 3b: Remove ft-sync cron → deploy to Vercel
Phase 3c: Remove CLOB from non-trading code → deploy to Vercel
Phase 4:  Optimize remaining crons → deploy to Vercel
```
