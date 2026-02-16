# Trading System Improvements — Cofounder Brief

**Date:** February 16, 2026  
**For:** Cofounder review  
**Status:** Deployed to production

---

## Executive Summary

We shipped a major upgrade to our copy-trading system. The changes cut signal-to-order latency from **0–60 seconds to under 5 seconds**, add explicit handling for lost orders, improve execution quality with liquidity checks, and protect production from overload. We also added an **MCP server** (AI assistants can query strategies/performance from Cursor/Claude) and an **event bus** (foundation for alerts and dashboards).

---

## What Changed

### 1. Real-Time Trade Stream (Biggest Impact)

**Before:** We polled Polymarket every minute for new trades. A trader could place a trade at 12:00:01 and we wouldn’t react until 12:01:00 — up to 60 seconds late.

**After:** A dedicated worker runs 24/7 on Fly.io, subscribed to Polymarket’s WebSocket. When a target trader places a BUY, we see it in **sub-second time**, evaluate it, insert into `ft_orders`, and **immediately trigger live order placement**.

**Impact:**
- **Latency:** 0–60s → **< 5 seconds**
- **Fill quality:** Earlier reaction = better prices, fewer missed trades
- **Competitive edge:** We copy faster than anyone still polling

---

### 2. Production Safety (Circuit Breaker + Target Filter)

**Risk:** Polymarket has hundreds of trades per minute. If we processed every one, we’d hammer our API and Supabase.

**Mitigations:**
- **Target filter:** The worker forwards trades from (a) explicit targets (`target_trader` / `target_traders`) and (b) when any FT has no target (leaderboard-style), trades from the `traders` table (leaderboard-synced). sync-trade then evaluates each trade against each wallet's rules (edge, category, etc.). Trades from untracked traders are ignored.
- **Circuit breaker:** If our API returns 5xx or times out 5 times in a row, the worker **stops calling** for 60 seconds, then probes once. Prevents runaway load.

**Impact:** Production stays stable even during Polymarket spikes.

---

### 3. Lost-Order Handling

**Before:** If an order never showed up on the CLOB (network glitch, race, etc.), we had no explicit concept — capital stayed locked, no alert.

**After:**
- We track `order_not_found_count` per order.
- When the CLOB returns “order not found” 3 times in a row, we mark the order as **LOST**, unlock capital, and emit an event.
- Event bus supports future alerts and dashboards.

**Impact:** Capital is no longer stuck on ghost orders; we can detect and recover.

---

### 4. Order Book Depth Checks

**Before:** We placed orders without checking if there was enough liquidity. Thin books could cause failed orders or bad slippage.

**After:**
- New `lib/polymarket/order-book.ts` with depth helpers.
- Before placing, we check: *“Is there at least 50% of our size available at our price?”*
- If not, we **skip** instead of placing a doomed order.

**Impact:** Fewer failed orders, better execution on thin markets.

---

### 5. Cron Optimization

**Before:** `ft-sync` ran every 1 minute, even though the worker now handles real-time trades.

**After:** `ft-sync` runs every **5 minutes** as a safety net (catches missed WebSocket events, reconnects, etc.).

**Impact:** Less cron load, lower Vercel usage, same coverage.

---

### 6. MCP Server (AI Assistant Integration)

**What it is:** Model Context Protocol (MCP) lets AI tools like Cursor and Claude query PolyCopy directly — strategies, performance, status — without leaving the IDE.

**Built:**
- `mcp-server/` with tools:
  - `list_strategies` — List LT strategies with status, capital, PnL
  - `get_strategy` — Get full detail for a strategy (FT wallet config, risk state)
  - `get_strategy_orders` — Get orders for a strategy (filter by status, limit results)
- Runs locally via stdio; Cursor/Claude connects to it when configured.

**How to use:** Add to Cursor’s MCP config — copy `mcp-server/mcp.json.example` to `.cursor/mcp.json`. See `mcp-server/README.md`:
```json
{
  "mcpServers": {
    "polycopy": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "mcp-server",
      "env": {
        "POLYCOPY_API_URL": "https://polycopy.app",
        "CRON_SECRET": "YOUR_CRON_SECRET_HERE"
      }
    }
  }
}
```

**Impact:** Engineers and power users can ask “What’s my strategy performance?” or “List my strategies” from Cursor/Claude. Future: `place_trade` (read-only first).

---

### 7. Event Bus

**What it is:** Structured events when order state changes — `OrderPlaced`, `OrderFilled`, `OrderPartialFill`, `OrderCancelled`, `OrderLost`.

**Built:** `lib/live-trading/event-bus.ts` — in-process emitter. Executor and sync-order-status emit events.

**Impact:** Foundation for alerts, dashboards, and metrics. Not yet wired to Slack/email; that’s a next step.

---

## Architecture (Simplified)

```
Polymarket WebSocket (trades)
         │
         ▼
  Fly.io Worker (polycopy-trade-stream)
    • Filter: only target traders
    • Circuit breaker on API failures
         │
         ▼
  POST /api/ft/sync-trade  (evaluate, insert ft_orders)
         │
         ▼ (if inserted > 0)
  POST /api/lt/execute    (place real orders)
         │
         ▼
  CLOB → Real trades on Polymarket
```

---

## What’s Live

| Component | Location | Status |
|-----------|----------|--------|
| Trade stream worker | Fly.io (polycopy-trade-stream.fly.dev) | Running |
| Target-trader filter | Worker + GET /api/ft/target-traders | Active |
| Circuit breaker | Worker | Active |
| Sync-trade API | Vercel | Active |
| LT execute trigger | Worker → POST /api/lt/execute | Active |
| Lost-order handling | sync-order-status + migration | Deployed |
| Order book checks | executor-v2 | Active |
| Event bus | lib/live-trading/event-bus.ts | Active (emits from executor, sync-order-status) |
| MCP server | mcp-server/ (local, Cursor/Claude) | Built — configure in IDE to use |
| ft-sync cron | Vercel (every 5 min) | Active |

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Signal-to-order latency | 0–60 s | **< 5 s** |
| Lost orders | Implicit, capital stuck | Explicit, capital unlocked |
| Pre-execution liquidity checks | None | Yes (skip if &lt; 50% available) |
| Production overload risk | High (if worker unfiltered) | Low (filter + circuit breaker) |

---

## From the Roadmap (Not Yet Done)

| Item | Effort | Notes |
|------|--------|-------|
| **place_trade MCP tool** | Low | Read-only first; would let AI query trade status |
| **Alerts (Slack/email for LOST)** | Low | Wire event bus to notification service |
| **Dashboard for event metrics** | Medium | OrderFilled, OrderLost, latency histograms |
| **In-memory order state machine** | Medium | InFlightOrder-style; for more complex flows |
| **Connector abstraction** | High | Only if we add Kalshi, PredictIt, etc. |

---

## Deploying Changes

- **Worker (Fly.io):** `cd workers/polymarket-trade-stream && flyctl deploy`
- **Main app (Vercel):** Push to `main` — Vercel auto-deploys. Or run `vercel --prod --yes` from project root.

## Verification

See `docs/VERIFY_PRODUCTION_DEPLOYMENT.md` for how to confirm everything is working (worker logs, health checks, what to look for).

---

## Questions?

Reach out to the eng team. The full technical roadmap is in `docs/TRADING_IMPROVEMENTS_ROADMAP.md`.
