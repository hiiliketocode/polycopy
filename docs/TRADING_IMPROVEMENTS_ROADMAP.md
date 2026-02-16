# Trading System Improvements Roadmap

**Created:** February 16, 2026  
**Source:** Hummingbot analysis, order book depth, scheduling alternatives, and execution quality improvements.

---

## Executive Summary

This roadmap consolidates improvements identified from analyzing Hummingbot, Polymarket's capabilities, and our current architecture. The work is organized into four phases, ordered by impact and dependency.

| Phase | Focus | Est. Effort | Impact |
|-------|--------|-------------|--------|
| **1** | Event-driven scheduling (WebSocket) | 2–3 weeks | High |
| **2** | Lost-order handling + event bus | 1–2 weeks | High |
| **3** | Order book depth integration | 1–2 weeks | Medium |
| **4** | MCP server + optional enhancements | 2–3 weeks | Medium |

---

## Current State

### Scheduling
- **ft-sync**: Vercel cron every 1 minute → REST fetch from Polymarket
- **lt-execute**: Vercel cron every 1 minute → reads `ft_orders` → places orders
- **lt-sync-order-status**: Every 1 minute → polls CLOB for PENDING/PARTIAL fills
- **Latency**: Trades can be 0–60 seconds old before we react

### Order Management
- Poll-based fill detection (500ms during placement, 1-min cron for pending)
- No explicit "lost order" concept (orders that never sync)
- No event bus for order lifecycle (OrderFilled, OrderCancelled, etc.)

### Order Book
- Best bid/ask only (sell-manager, trade-card, trade-execute)
- No depth-based sizing (`get_volume_for_price`, `get_price_for_volume`)
- Fixed slippage (0.3%) regardless of liquidity

---

## Phase 1: Event-Driven Scheduling (WebSocket)

**Goal:** React to trades in sub-second time instead of 0–60 second cron delay.

### 1.1 Polymarket WebSocket Integration

Polymarket provides:
- **`activity/trades`** – real-time trade stream
- **`activity/orders_matched`** – order matching events
- **RealTimeDataClient** – official TypeScript client ([Polymarket/real-time-data-client](https://github.com/Polymarket/real-time-data-client))

**Tasks:**
1. [x] Create `workers/polymarket-trade-stream` – long-running Node/TS process
2. [x] Connect to Polymarket WebSocket (`activity/trades`)
3. [x] Filter trades by target traders (from `ft_wallets` → `target_traders` or leaderboard)

**Supabase overload mitigation (implemented):**
- Worker fetches target trader addresses from `GET /api/ft/target-traders` on connect and every 5 min
- Only trades where `proxyWallet` is in that set are forwarded to `POST /api/ft/sync-trade`
- Without this filter, every Polymarket BUY trade would hit the API (100s/min) and cause 3+ DB queries each
4. [ ] On each trade event: call FT qualification logic (reuse from `ft/sync`)
5. [ ] Insert qualifying trades into `ft_orders` (or queue for processing)
6. [ ] Trigger LT execution (call `POST /api/lt/execute` or internal function)

### 1.2 Worker Deployment

**Options:**
- **Fly.io** – recommended; persistent process, easy deploy
- **Railway** – alternative
- **Render** – alternative

**Tasks:**
1. [ ] Add `workers/polymarket-trade-stream/` with Dockerfile
2. [ ] Deploy to Fly.io (or chosen platform)
3. [ ] Add health check and auto-restart
4. [ ] Configure CRON_SECRET or internal auth for API calls

### 1.3 Hybrid Mode

- Keep cron as **fallback** (e.g. every 5 min) for WebSocket reconnects / missed events
- WebSocket = primary; cron = safety net

### 1.4 Dependencies

- `@polymarket/real-time-data-client` or equivalent WebSocket client
- May need to map Polymarket trade schema to our `EnrichedTrade` / `ft_orders` shape

---

## Phase 2: Lost-Order Handling + Event Bus

**Goal:** Explicitly detect and recover from orders that never sync; structured events for metrics and alerts.

### 2.1 Lost-Order Handling

**Concept (from Hummingbot):** Track "order not found" count per order. After N consecutive failures, mark as LOST, unlock capital, log/alert.

**Tasks:**
1. [ ] Add `order_not_found_count` to `lt_orders` (or track in sync-order-status)
2. [ ] In `sync-order-status`: when CLOB returns 404/order not found, increment count
3. [ ] When count ≥ 3 (configurable): set `status = 'LOST'`, unlock capital, log to `lt_logs`
4. [ ] Add `LOST` to status enum and UI handling
5. [ ] Optional: recovery script to reconcile LOST orders manually

### 2.2 Event Bus

**Concept:** Emit structured events when order state changes. Consumers: metrics, alerts, dashboards.

**Events:**
- `OrderPlaced` – order sent to CLOB
- `OrderFilled` – fully filled
- `OrderPartialFill` – partial fill
- `OrderCancelled` – cancelled/expired
- `OrderFailed` – rejected or LOST

**Tasks:**
1. [ ] Create `lib/live-trading/event-bus.ts` – simple in-process emitter (or use EventEmitter)
2. [ ] Emit events from `executor-v2.ts` and `sync-order-status`
3. [ ] Add optional consumer: write to `lt_activity_logs` or external metrics
4. [ ] Document event schema for future consumers (Inngest, Datadog, etc.)

### 2.3 Dependencies

- Phase 2 can run in parallel with Phase 1
- Event bus is low-risk; lost-order handling touches sync-order-status and capital-manager

---

## Phase 3: Order Book Depth Integration

**Goal:** Check liquidity before placing; estimate slippage from depth; avoid thin-book failures.

### 3.1 Depth Helpers

**Add (in `lib/polymarket/order-book.ts` or similar):**
- `getVolumeForPrice(tokenId, side, price)` – how many shares at/better than price
- `getPriceForVolume(tokenId, side, volume)` – price to fill X shares
- `getVwapForVolume(tokenId, side, volume)` – VWAP for X shares (optional)

**Data source:** `GET https://clob.polymarket.com/book?token_id={tokenId}` (existing REST)

**Tasks:**
1. [ ] Create `lib/polymarket/order-book.ts` with depth helpers
2. [ ] Parse `bids`/`asks` from CLOB book response
3. [ ] Implement `getVolumeForPrice`, `getPriceForVolume`

### 3.2 Pre-Execution Checks

**In `executor-v2.ts` (before placeOrderCore):**
1. [ ] Fetch order book for `tokenId`
2. [ ] Check `getVolumeForPrice(tokenId, side, priceWithSlippage)` ≥ required size
3. [ ] If insufficient: skip or reduce size, log reason
4. [ ] Optional: use `getPriceForVolume` to derive dynamic slippage instead of fixed 0.3%

### 3.3 Sell Manager

**Already uses best bid.** Enhance:
1. [ ] Check depth at best bid before placing sell
2. [ ] If size > available liquidity: split into multiple orders or warn

### 3.4 Dependencies

- No new infra; uses existing CLOB REST API
- Can be done after Phase 1 and 2

---

## Phase 4: MCP Server + Optional Enhancements

**Goal:** Expose PolyCopy APIs to AI assistants (Cursor, Claude) via MCP; optional polish.

### 4.1 MCP Server

**Concept (from Hummingbot MCP):** Model Context Protocol lets AI tools query strategies, place trades, inspect performance.

**Tasks:**
1. [ ] Create `mcp-server/` or `tools/mcp/` with MCP-compatible server
2. [ ] Expose tools: `list_strategies`, `get_strategy_performance`, `place_trade` (read-only first)
3. [ ] Configure in Cursor/Claude to connect to PolyCopy MCP
4. [ ] Document available tools and auth

### 4.2 Optional Enhancements

| Enhancement | Effort | Notes |
|-------------|--------|-------|
| **In-memory order state machine** | Medium | InFlightOrder-style; useful if we add more complex order flows |
| **Time synchronizer** | Low | Only if Polymarket auth requires server-time sync |
| **Connector abstraction** | High | Only if adding Kalshi, PredictIt, etc. |

---

## Implementation Order

```
Phase 1 (WebSocket)     ──────────────────────────────────────►
                            │
Phase 2 (Lost-order +   ────┼────────────────────────────────►
Event bus)                  │
                            │
Phase 3 (Order book)   ─────┼────────────────────────────────►
depth)                      │
                            │
Phase 4 (MCP +         ─────┴────────────────────────────────►
optional)
```

**Recommended sequence:**
1. **Phase 1** – Biggest latency win; unblocks faster copy-trading
2. **Phase 2** – Improves reliability and observability
3. **Phase 3** – Improves execution quality (fewer failed/slippery orders)
4. **Phase 4** – Nice-to-have; can be deferred

---

## File Changes Summary

| Phase | New Files | Modified Files |
|-------|-----------|----------------|
| 1 | `workers/polymarket-trade-stream/`, Dockerfile | `vercel.json` (reduce ft-sync cron) |
| 2 | `lib/live-trading/event-bus.ts` | `sync-order-status`, `executor-v2`, `capital-manager`, migrations |
| 3 | `lib/polymarket/order-book.ts` | `executor-v2`, `sell-manager` |
| 4 | `mcp-server/` or `tools/mcp/` | — |

---

## Success Metrics

| Metric | Current | Target (Phase 1) | Target (Phase 2+3) |
|--------|---------|------------------|---------------------|
| Signal-to-order latency | 0–60 s | < 5 s | < 5 s |
| Lost orders | Implicit | Explicit, recoverable | Explicit, recoverable |
| Pre-execution liquidity checks | None | — | Yes |
| Order lifecycle visibility | Logs only | Event bus | Event bus |

---

---

## Phase 1 Kickoff Checklist

To start Phase 1 immediately:

1. **Install Polymarket real-time client**
   ```bash
   npm install @polymarket/real-time-data-client
   ```
   Connects to `wss://ws-live-data.polymarket.com`; supports `activity/trades` and `activity/orders_matched`.

2. **Create worker directory**
   ```
   workers/polymarket-trade-stream/
   ├── src/
   │   ├── index.ts      # Entry: connect WebSocket, onMessage
   │   ├── ft-qualify.ts # Reuse logic from ft/sync (extract shared)
   │   └── config.ts     # Target traders, API base URL
   ├── Dockerfile
   └── package.json
   ```

3. **Extract FT qualification logic** from `app/api/ft/sync/route.ts` into a shared module (e.g. `lib/ft-sync/qualify-trade.ts`) so both cron and worker can use it.

4. **Fly.io deploy**
   ```bash
   fly launch
   fly deploy
   ```

5. **Test**: Subscribe to `activity/trades` (no filter first), log trades, verify format matches our `PolymarketTrade` type.

6. **Deploy worker** (Fly.io):
   ```bash
   cd workers/polymarket-trade-stream
   fly launch
   fly secrets set API_BASE_URL=https://your-app.vercel.app CRON_SECRET=your_cron_secret
   fly deploy
   ```

---

## References

- [Hummingbot](https://github.com/hummingbot/hummingbot) – order tracking, event model, Cython hot paths
- [Polymarket Real-Time Data Client](https://github.com/Polymarket/real-time-data-client) – WebSocket `activity/trades`
- [Polymarket CLOB WebSocket](https://docs.polymarket.com/developers/CLOB/websocket/wss-overview)
- [LIVE_TRADING_ARCHITECTURE_PLAN.md](./LIVE_TRADING_ARCHITECTURE_PLAN.md) – existing LT design
- [RFP_LIVE_TRADING_REBUILD_V2.md](./RFP_LIVE_TRADING_REBUILD_V2.md) – order book integration notes
