# Scalable Architecture Redesign (v3)

**Date**: February 18, 2026
**Status**: Proposed (revised after cofounder review, round 2)
**Context**: Supabase hitting 100% CPU / Disk IO budget depleted. Fly.io trade-stream OOMing. Architecture doesn't scale with user growth.

---

## What We Already Fixed (Feb 18 — deployed)

- **6 new database indexes** on `orders` and `ft_orders` — eliminates full table scans
- **N+1 query fix in `refresh-copy-pnl`** — batches updates instead of one per order
- **`ft-snapshot` optimization** — uses `wallet.total_pnl` instead of fetching 10K+ orders
- **`sync-polymarket-pnl` parallelization** — batched updates + query limits
- **Cron frequency reduction** — `lt-execute` and `lt-sync-order-status` reduced from every 1min to every 2min

---

## Key Decisions

### 1. Fly.io: trades only, NOT markets/prices

Fly.io runs one app: `polycopy-trade-stream` (WebSocket trade ingestion). We do NOT add a Fly.io worker for market prices.

**Why**: The price API route on Vercel already serves all price consumers. Making it smarter (in-memory cache + Gamma API) centralizes pricing without adding infrastructure. One fewer service to maintain, monitor, and pay for. Fly.io's value is the always-on WebSocket connection — Vercel can't do that. But Vercel serverless functions handle request/response pricing just fine.

**Tradeoff**: A dedicated Fly.io price worker could offer more predictable refresh cadence (e.g., guaranteed 5-second refresh). But it adds cost (~$5/month), operational complexity, and another failure point. The cache-through approach on Vercel achieves similar freshness with zero additional infrastructure.

### 2. Feed pricing: API-first, NOT DB-first

The feed must show truly live prices. The approach is: **hit Gamma API first, return live data, write to Supabase as a side effect** — NOT "check Supabase first, then maybe hit API."

Specifically: an in-memory cache (2-3 second TTL) on the price API route prevents duplicate API calls. The first request for a market within the window hits Gamma and returns live data. Concurrent/subsequent requests within 2-3 seconds return the cached response. Supabase `markets.outcome_prices` is updated as a fire-and-forget side effect for other consumers (crons, snapshots, portfolio).

The 250ms client-side polling stays. It reads from the in-memory cached response (at most 2-3 seconds old), which is effectively live for market prices.

### 3. LT execute is ALREADY event-driven

Investigation revealed that lt-execute is NOT limited to the 2-minute cron. The trade-stream worker triggers `/api/lt/execute` immediately after inserting ft_orders. Typical latency from "trade on Polymarket" to "order placed on CLOB" is 1-6 seconds. The cron is a backup for missed events. No change needed for execution speed.

### 4. Trade-stream does NOT need a 200-trader cap

Investigation revealed the Polymarket WebSocket sends ALL platform trades in a single subscription — it's NOT per-wallet. The `targetTraders` Set is just a filter (O(1) lookup). Memory for 5K wallets = ~400KB. The OOM is not from Set size. It's likely from Node.js baseline memory, HTTP request buffering, or a leak. Scaling to 2K-5K wallets adds negligible memory.

### 5. Only poll unresolved/open markets for prices

All price refreshing (API route, crons, resolution checks) should skip markets that are already resolved. A market is "resolved" when `closed = true` AND outcome prices show a clear winner (max >= 0.99, min <= 0.01). Currently ft-resolve and lt-resolve don't pre-filter; this should be added.

---

## Architecture Overview

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
              │         │ │  (side-      │     │
              │         │ │   effect)    │     │
              └────┬────┘ └──────┬───────┘     │
                   │             │              │
     ┌─────────────┼─────────────┼──────────────┤
     │             │             │              │
  ┌──▼───┐  ┌─────▼──┐  ┌──────▼───┐  ┌───────▼───────┐
  │ Feed │  │Portfo- │  │ Bot      │  │ lt-execute    │
  │ Page │  │lio     │  │ Dashboard│  │ (place orders)│
  └──────┘  └────────┘  └──────────┘  └───────────────┘
```

**Core principle**: Only the Fly.io trade-stream and Vercel crons talk to external APIs. All user-facing pages read from cached data (in-memory or DB). User growth = more cache reads (cheap), not more API calls.

---

## Phase 1: Fix Trade-Stream OOM and Centralize Prices

### 1a. Fix Trade-Stream OOM

The trade-stream OOM is NOT caused by too many traders in the Set (the WebSocket receives all trades regardless). Likely causes: Node.js baseline memory, HTTP request buffering when `/api/ft/sync-trade` is slow, or a memory leak.

**Fix:**
- Add heap usage monitoring (log every 60s, alert if > 80% of limit)
- Add backpressure: if sync-trade calls are backing up, drop lower-priority trades
- Scale memory: `fly scale memory 2048 -a polycopy-trade-stream` (~$5/month)
- Do NOT cap the trader Set at 200 — expand it to include all followed traders + FT targets

**File**: `workers/polymarket-trade-stream/src/index.ts`

### 1b. Switch Price API: Gamma-First with In-Memory Cache

Replace the current CLOB-first approach in `/api/polymarket/price` with:

1. Check in-memory cache (Map keyed by conditionId, 2-3 second TTL)
2. If cache hit and fresh: return immediately (sub-millisecond)
3. If cache miss or stale: fetch from Gamma API, return live data, update cache
4. Fire-and-forget: write to `markets.outcome_prices` + `last_price_updated_at` (for crons/snapshots)
5. Request coalescing: if another request for the same market is already in-flight, await the same promise instead of making a second API call
6. Fallback: if Gamma fails, try CLOB. If both fail, return stale in-memory cache with a `stale: true` flag.
7. Skip resolved markets: if `markets.closed = true` and resolved prices (0/1), return cached resolution prices without hitting any API.

**Rate limit mitigation:**
- In-memory cache prevents duplicate API calls within 2-3 second window
- Request coalescing prevents thundering herd (N concurrent requests = 1 API call)
- With 50 active markets across all users: ~20 Gamma calls/second max
- If Gamma rate-limits (429): serve stale cache, back off exponentially

**Result for feed:**
- 250ms client polling reads from in-memory cache or triggers a Gamma fetch
- Prices are at most 2-3 seconds old (effectively live for market prices)
- NO stale Supabase reads — API always returns live or near-live data
- Supabase updated as side effect for crons/snapshots that don't need real-time

**File**: `app/api/polymarket/price/route.ts`

### 1c. Add `last_requested_at` Column

```sql
ALTER TABLE markets ADD COLUMN IF NOT EXISTS last_requested_at TIMESTAMPTZ;
```

Updated as side effect by the price API. Tracks market demand for future analytics.

---

## Phase 2: Feed from Database + Trade-Stream Ingestion

### 2a. Trade-Stream Writes to `trades_public`

Extend the trade-stream to upsert incoming trades into `trades_public` (replacing the hot worker). Only trades from traders in `follows` or `traders` table.

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

**Today**: 20 followed traders = 20 API calls per page load.
**After**: 1 DB query.

### 2c. Migrate Feed Page

- Replace `fetchFeed()` with single call to `/api/v2/feed/trades`
- Keep 250ms price polling via `/api/polymarket/price` (now Gamma-first with in-memory cache)
- Optionally add Supabase real-time subscription on `trades_public` for instant new trade appearances

### 2d. `trades_public` Retention Cleanup

New daily cron at 4 AM UTC:
- Delete trades older than 30 days
- Delete trades for resolved markets older than 7 days
- Prevents unbounded table growth

---

## Phase 3: FT Snapshot — Cron + On-Load Refresh + Manual Refresh

The hourly cron stays for automated snapshots. Additionally:

- **Refresh on load**: When an admin opens the FT snapshot view, the page calls the snapshot endpoint to get fresh data immediately (not just the last hourly snapshot).
- **Manual refresh button**: Admin UI includes an explicit "Refresh" button that triggers the same endpoint, recalculating PnL with live prices.
- The snapshot endpoint already supports on-demand calls (it's a `GET` handler). The UI just needs to call it and show the result.

**Files**: `app/api/cron/ft-snapshot/route.ts` (backend, already works on-demand), FT dashboard page (frontend, needs refresh button)

---

## Phase 4: LT Execute — Already Event-Driven

Investigation confirmed: **LT execute is already event-driven with 1-6 second latency.**

**Current flow:**
```
Polymarket WebSocket trade arrives
  → trade-stream calls POST /api/ft/sync-trade (inserts ft_order)
  → trade-stream calls POST /api/lt/execute (IMMEDIATE, fire-and-forget)
  → lt-execute finds new ft_order, runs risk checks, places CLOB order
  → executor-v2 polls CLOB for 5 seconds for immediate fill
  → Total latency: 1-6 seconds
```

The 2-minute cron is a **backup only** — it catches any orders missed if the event-driven trigger fails (e.g., network error, trade-stream restart). It also handles daily risk resets and cooldown processing.

**No change needed for execution speed.** The cron stays as a safety net. The event-driven path is the primary execution path and is already fast enough.

**Documented for clarity**: The 2-minute cron does NOT introduce 2-minute latency. Real execution latency is 1-6 seconds via the event-driven WebSocket path.

---

## Phase 5: LT Order Status and Fill Tracking

### Current System

After placing an order, the executor immediately polls CLOB for 5 seconds (500ms intervals) to detect instant fills. If the order is still pending after 5 seconds, it's recorded as `PENDING` and tracked by the sync cron.

**Order lifecycle**: `PLACED → PENDING → PARTIAL → FILLED` (or `CANCELLED` / `LOST`)

**Sync cron** (`lt-sync-order-status`, every 1 minute):
- Checks all PENDING/PARTIAL orders via CLOB API
- Updates fill status, shares, executed price, fill rate
- Handles lost orders (3 consecutive "not found" = `LOST`)
- Runs capital reconciliation after every sync

**Logging**: All execution events logged to `lt_execute_logs` with trace_id, execution_id, stage, elapsed_ms. Viewable at `/lt/logs`.

### Recommendation

The 1-minute sync cron is adequate for most fills (orders typically fill within seconds to minutes). For truly real-time fill detection, we could process the `activity/orders_matched` WebSocket events the trade-stream already subscribes to — matching by `order_id` to detect fills instantly. This is an **optional enhancement** that doesn't block the redesign.

**For copy trading**: Fill status matters less — the user's order is placed via the CLOB and tracked the same way. The sync cron handles it identically.

---

## Phase 6: Portfolio PnL — Same Flow as Refresh-Copy-PnL

### How it works today (and after redesign)

Portfolio PnL and refresh-copy-pnl use the **same price source and flow**:

1. `refresh-copy-pnl` (cron) updates `orders.current_price` for all open positions by calling `/api/polymarket/price` per market
2. Portfolio stats (`/api/portfolio/stats`) reads `orders.current_price`, with fallback to `markets.outcome_prices`
3. Portfolio trades (`/api/portfolio/trades`) does the same, plus background-refreshes stale prices

**After redesign**: Both will use the same improved price API (Gamma-first with in-memory cache). `refresh-copy-pnl` writes `orders.current_price`; portfolio reads it. The Supabase side-effect from Phase 1b keeps `markets.outcome_prices` fresh as a fallback.

**For resolved markets**: Both use settlement prices (1 if outcome matches, 0 otherwise) — no API call needed.

**No additional changes needed** — the flows are already consistent. The price API improvement in Phase 1b automatically benefits both.

---

## Phase 7: Backfill Wallet PnL — Already Off Dome, Still Needed

### What it uses today
- **Polymarket Data API** (`/closed-positions?user={wallet}`) — fetches closed positions for daily PnL
- **Polymarket Data API** (`/leaderboard?window=all&limit=1&address={wallet}`) — fetches trader metrics

It does NOT use Dome API. The migration plan references Dome but the script has already been migrated to Polymarket's free APIs.

### What it computes
- `wallet_realized_pnl_daily` table: daily realized PnL per trader wallet (for trader profile charts, discover page, "yesterday's winners")
- `traders` table updates: volume, total_trades, markets_traded

### Is it still needed?
**Yes** — it serves a different purpose than portfolio PnL. Portfolio PnL tracks user copy-trading performance. Backfill wallet PnL tracks original trader wallet performance for discovery/leaderboards.

### Optimization
- Already supports `SKIP_UP_TO_DATE_WALLETS` (skips wallets with data from yesterday)
- Could further optimize by tracking `last_backfilled_at` per wallet

---

## Phase 8: Trade-Stream Scaling — No Cap, Cost Analysis

### How the WebSocket works

The Polymarket WebSocket sends **ALL platform trades** through a single subscription. The worker does NOT subscribe per-wallet. The `targetTraders` Set is a local filter — trades not matching the Set are discarded in-memory (O(1) lookup).

### Memory impact of wallet count

| Wallets | Set Memory | Total Impact |
|---------|-----------|-------------|
| 2,000 | ~160KB | Negligible |
| 3,000 | ~240KB | Negligible |
| 5,000 | ~400KB | Negligible |

The Set is not the memory bottleneck. The OOM is likely caused by:
- Node.js baseline memory usage (~200-400MB)
- HTTP request buffering when `/api/ft/sync-trade` is slow or backing up
- Potential memory leak in the WebSocket client or event handlers
- Trade-stream currently has 1GB limit, Node.js needs ~500MB baseline

### Cost at scale

| Memory | Cost | Handles |
|--------|------|---------|
| 1GB | Free tier | Insufficient (OOM'd) |
| 2GB | ~$5/month | Safe for current load + 5K wallets |
| 4GB | ~$15/month | Headroom for growth + HTTP buffering |

### Scaling strategy
1. **Immediate**: Scale to 2GB ($5/month)
2. **Add monitoring**: Log heap usage every 60s, alert at 80%
3. **Add backpressure**: If sync-trade HTTP queue > 50, drop non-target trades
4. **If OOM recurs at 2GB**: Scale to 4GB ($15/month) and investigate leak
5. **No cap on trader Set** — it's negligible memory. Include ALL traders needed for feed + bots.

---

## Phase 9: Remove Redundant Code

### 9a. Remove Hot and Cold Workers

Delete from codebase:
- `workers/worker-hot.js`
- `workers/worker-cold.js`
- `workers/shared/polling.js` (if only used by hot/cold)
- `fly.worker-hot.toml`
- `fly.worker-cold.toml`

Tear down:
```bash
fly apps destroy polycopy-hot-worker
fly apps destroy polycopy-cold-worker
```

### 9b. Remove `ft-sync` Cron

Remove from `vercel.json`. The trade-stream WebSocket handles real-time FT ingestion.

### 9c. Remove CLOB from Non-Trading Code

Replace CLOB with Gamma API or `markets` table reads in:
- `app/api/polymarket/market/route.ts`
- `app/api/orders/route.ts` (`fetchMarketMetadataFromClob`)
- `app/api/cron/check-notifications/route.ts`
- `app/api/polysignal/route.ts`
- `app/api/markets/ensure/route.ts`
- `app/api/lt/strategies/route.ts`

Keep CLOB only in:
- `lib/polymarket/place-order-core.ts` (order placement)
- `lib/polymarket/order-book.ts` (orderbook depth)
- `lib/live-trading/sell-manager.ts` (sell price discovery)
- `app/api/polymarket/orders/` routes (order management)
- `app/api/lt/sync-order-status` (fill status checks)

---

## Phase 10: Optimize Remaining Crons

- **`refresh-copy-pnl`**: Read from `markets.outcome_prices` (side-effect cache from Phase 1b) instead of calling price API per market
- **`sync-polymarket-pnl`**: Reduce to daily; only process users with recent activity. Overlaps with `backfill-wallet-pnl` — consider merging.
- **`backfill-wallet-pnl`**: Make incremental (skip up-to-date wallets, already supported)
- **`ft-resolve` / `lt-resolve`**: Pre-filter orders whose markets are already resolved in DB to skip unnecessary API calls

---

## Complete Vercel Cron Job Audit

| Cron | Schedule | Purpose | Keep? | Notes |
|------|----------|---------|-------|-------|
| `check-notifications` | Daily 8AM | Send trade/resolution emails, auto-close | KEEP | User notifications |
| `send-welcome-emails` | Daily 9AM | Welcome emails for new users | KEEP | Onboarding |
| `backfill-wallet-pnl` | Daily 2AM | Trader wallet PnL + metrics | KEEP | Optimize: incremental |
| `sync-trader-leaderboard` | Daily 1AM | Sync top 1K Polymarket traders | KEEP | Feeds FT wallet targets |
| `sync-polymarket-pnl` | Every 6hr | Sync user PnL from Polymarket | KEEP | Reduce to daily; overlaps with backfill |
| `rotate-pnl-winners` | Daily 3AM | Update top PnL trader lists | KEEP | Lightweight (2 RPC calls) |
| `ft-sync` | Every 5min | Poll API for FT trades | **REMOVE** | Redundant with trade-stream |
| `ft-resolve` | Every 10min | Resolve FT orders on market close | KEEP | Add resolved-market filter |
| `ft-snapshot` | Hourly | Record FT performance snapshots | KEEP | Add on-load refresh + manual button |
| `lt-execute` | Every 2min | Execute live trades (backup) | KEEP | Primary path is event-driven (1-6s) |
| `lt-resolve` | Every 5min | Resolve LT positions | KEEP | Add resolved-market filter |
| `lt-sync-order-status` | Every 2min | Sync fill status from CLOB | KEEP | Consider WebSocket fills later |
| `alpha-agent` | Daily 6AM | AI strategy optimization | KEEP | Already prevents overlap |

**Summary**: 12 of 13 crons stay. Only `ft-sync` is removed.

---

## Data Freshness Summary

| Consumer | Trade Freshness | Price Freshness | Source |
|----------|----------------|-----------------|--------|
| Feed page | Real-time (WebSocket -> trades_public) | 2-3s (Gamma via in-memory cache) | Live API, DB side-effect |
| Feed card (expanded, 250ms poll) | Same | 2-3s (in-memory cache hit) | Live API |
| FT bots | Real-time (WebSocket -> ft_orders) | On-demand Gamma (sub-second) | WebSocket + API |
| LT bots (execution) | 1-6s (event-driven via WebSocket) | On-demand CLOB for execution | WebSocket + CLOB |
| LT order status | 1min sync cron | CLOB fill status | Cron + CLOB |
| Portfolio | On page load | 2-3s via price API | Live API |
| FT snapshot (cron) | Hourly | From markets.outcome_prices cache | DB side-effect |
| FT snapshot (on-load) | On demand | Live via price API | Live API |
| ft-resolve | Every 10min | Gamma (resolution check) | Cron + API |
| lt-resolve | Every 5min | Gamma (resolution check) | Cron + API |

---

## Fly.io Cost Analysis

| Wallets | Memory | Monthly Cost | Notes |
|---------|--------|-------------|-------|
| Current (~1K) | 1GB | Free | OOMing |
| 2K wallets | 2GB | ~$5 | Safe for current load |
| 3K wallets | 2GB | ~$5 | Set adds negligible memory |
| 5K wallets | 2GB | ~$5 | Monitor; scale to 4GB if needed |
| 5K + headroom | 4GB | ~$15 | Plenty of room for growth |

Only 1 Fly.io app (`polycopy-trade-stream`). Hot and cold workers removed.

---

## Deployment Order

```
Phase 1a:  Fix trade-stream OOM (monitoring + memory scale)  → Fly.io
Phase 1b:  Price API: Gamma-first + in-memory cache           → Vercel
Phase 1c:  Add last_requested_at column                       → SQL migration
Phase 2a:  Trade-stream writes to trades_public               → Fly.io
Phase 2b:  Create /api/v2/feed/trades endpoint                → Vercel
Phase 2c:  Migrate feed page to DB-backed                     → Vercel
Phase 2d:  Add trades_public retention cron                   → Vercel
Phase 3:   FT snapshot on-load refresh + manual button        → Vercel
Phase 9a:  Remove hot/cold workers                            → Code + Fly.io
Phase 9b:  Remove ft-sync cron                                → Vercel
Phase 9c:  Remove CLOB from non-trading code                  → Vercel
Phase 10:  Optimize remaining crons                           → Vercel
```

Each phase is independently deployable.

---

## Open Items

1. **ML score function**: Currently depends on BigQuery (get-polyscore, predict-trade edge functions). BigQuery is paused. Need to relocate or replace the ML scoring pipeline until BigQuery is back in use. Does not block this architecture work.

2. **WebSocket fill detection**: The trade-stream already subscribes to `activity/orders_matched` but doesn't process fill notifications for LT orders. This could give real-time fill detection instead of 1-minute polling. Low priority enhancement.

3. **`sync-polymarket-pnl` vs `backfill-wallet-pnl` overlap**: Both sync PnL data from Polymarket APIs. Consider merging into a single daily cron to reduce redundancy.

4. **Trade-stream scope for feed**: When hot/cold workers are removed, the trade-stream needs to write ALL followed traders' trades to `trades_public`. The WebSocket already receives all trades — we just need to expand the filter Set to include followed traders, not just FT targets.

---

## Expected Impact

| Metric | Current (50 users) | After All Phases (500 users) |
|--------|--------------------|-----------------------------|
| CLOB API calls/min | ~200 (grows with users) | ~10 (trading only, fixed) |
| Gamma API calls/min | ~20 | ~30-50 (fixed, with in-memory dedup) |
| Data API calls/min | ~100 (grows with users) | ~5 (trade-stream only) |
| Supabase CPU | ~90-100% | ~30-50% (estimated) |
| Feed page load | 2-5s (API round trips) | <500ms (DB query) |
| Feed price freshness | Live (CLOB, 250ms poll) | Live (Gamma, 2-3s cache, 250ms poll) |
| LT execution latency | 1-6s (event-driven) | 1-6s (no change, already fast) |
| Fly.io apps | 3 apps, 1.5GB | 1 app, 2GB, ~$5/month |
