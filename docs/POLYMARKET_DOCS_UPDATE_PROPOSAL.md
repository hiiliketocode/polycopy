# Proposal: Polymarket Docs Update — Actions for Polycopy

**Author:** Engineering  
**Status:** v2 — Updated with cofounder feedback  
**Created:** February 19, 2026  
**Updated:** February 19, 2026  
**Context:** Polymarket released updated developer documentation on Feb 19, 2026. This proposal summarizes what's new and recommends specific actions for Polycopy.

---

## Summary

Polymarket overhauled their developer docs, formalizing several new APIs, SDKs, and features. After reviewing the full docs against our codebase — and incorporating cofounder feedback — we identified **5 items to implement**, **2 items to defer**, and **2 items to skip**.

---

## 1. Rate Limit Monitoring & API Usage — Big Picture

**Priority:** High  
**Effort:** Medium (2-3 days)  
**Risk addressed:** Production reliability, capacity planning

### Why This Comes First

Before making UX tradeoffs (polling intervals, card expansion behavior), we need visibility into our actual API usage. Today we have no monitoring, no alerts, and no way to know how close we are to Polymarket's limits.

### Polymarket Rate Limits (Newly Documented)

| API | Endpoint | Limit |
|-----|----------|-------|
| **Data API** | General | 1,000 req/10s |
| | `/trades` | 200 req/10s |
| | `/positions` | 150 req/10s |
| | `/closed-positions` | 150 req/10s |
| **CLOB API** | General | 9,000 req/10s |
| | `POST /order` | 3,500 burst / 36,000 per 10min |
| | `/book` | 1,500 req/10s |
| | `/price`, `/midpoint` | 1,500 req/10s |
| | Balance GET | 200 req/10s |
| **Gamma API** | General | 4,000 req/10s |
| | `/events` | 500 req/10s |
| | `/markets` | 300 req/10s |
| **Relayer** | `/submit` | 25 req/1min |

### Current API Usage — Full Inventory

#### Cron Jobs (Server-Side, Recurring)

| Job | Schedule | API | Calls per Run | Risk |
|-----|----------|-----|---------------|------|
| **FT sync** | Every 2 min | Data API `/v1/leaderboard` | 44 (4 views × 11 pages) | Low |
| | | Data API `/trades` | ~50-200 (1 per trader, batched 25 concurrent) | **Moderate** — approaches 200/10s limit |
| | | Data API `/activity` | ~0-10 (target traders only) | Low |
| | | Gamma `/markets` | Variable (batch of 20 for missing markets) | Low |
| **LT execute** | Every 2 min | CLOB `createOrder/postOrder` | Per active strategy (currently few) | Low |
| **LT sync order status** | Every 2 min | CLOB `getOrder()` | Up to 100 pending orders | Low |
| **Sync trader leaderboard** | Daily 1 AM | Data API `/v1/leaderboard` | 20 pages | Low |
| **Sync PnL** | Periodic | Data API `/closed-positions` | ~100 (10 users × 10 pages) | Moderate |
| **Check notifications** | Daily 8 AM | Data API `/positions` + CLOB `/markets` | ~500 position checks | Low (runs once/day) |

#### Client-Side Polling (Per User Session)

| Component | Trigger | API (via internal route) | Frequency | Risk |
|-----------|---------|--------------------------|-----------|------|
| **Expanded trade card — price** | Card expanded | Gamma/CLOB via `/api/polymarket/price` | Every 250ms | **High** |
| **Expanded trade card — order book** | Card expanded | CLOB `/book` via internal route | Every 250ms | **High** |
| **Feed-level live data** | Any card expanded | Gamma/CLOB via `/api/polymarket/price` | Every 1s | Moderate |
| **Order status after placement** | Order placed | CLOB `getOrder()` via `/api/polymarket/orders/{id}/status` | Every 200ms | Moderate (short-lived) |
| **Balance check** | Page load | CLOB `getBalanceAllowance()` | Every 2 min | Low |
| **Trading page FT sync** | Page load | FT sync + resolve | Every 30s | Low |

#### User-Initiated (On Demand)

| Action | API | Calls | Risk |
|--------|-----|-------|------|
| Place order | CLOB `createOrder/postOrder` | 1-3 per order | Low |
| Cancel order | CLOB `cancelOrders()` | 1 per cancel | Low |
| View positions | CLOB `getTradesPaginated()` | Up to 100 pages | Low (infrequent) |
| View market | Gamma `/markets` + CLOB `/markets` | 1-2 (cached 60s) | Low |
| Refresh orders | CLOB `getOpenOrders` + `getTradesPaginated` | 2-5 per refresh | Low |

### Where We Have Headroom vs. Where We Don't

| API / Endpoint | Limit | Estimated Peak Usage | Headroom | Notes |
|----------------|-------|---------------------|----------|-------|
| Data API `/trades` | 200/10s | ~100/10s (FT sync) | ~50% | Scales with trader count, not bot count |
| Data API `/closed-positions` | 150/10s | ~100/10s (PnL sync) | ~33% | Scales with user count |
| Gamma `/markets` | 300/10s | Variable (price polls) | Uncertain | Depends on concurrent users with expanded cards |
| CLOB `/book` | 1,500/10s | Variable (order book polls) | Likely fine | Same concern as above |
| CLOB `POST /order` | 3,500 burst | Low today | High | Grows with LT strategies |

**Key insight:** The biggest unknown is client-side polling. Server-side cron jobs are predictable and within limits. But we can't quantify the Gamma/CLOB load from expanded cards without monitoring because it depends on concurrent active users.

### Proposed Changes

1. **Add rate-limit tracking middleware** — wrap all outbound Polymarket API calls with a counter that logs request counts per endpoint per 10-second window
2. **Dashboard** — surface these metrics (options: Vercel Analytics custom events, a lightweight internal dashboard, or structured logs we can query)
3. **Alerts** — trigger when any endpoint exceeds 70% of its rate limit within a 10-second window
4. **Evaluate polling changes with data** — once we have 1-2 days of monitoring data, we can make informed decisions about the 250ms→1s change and card expansion behavior

### FT Sync Architecture — Shared Polling (Already Efficient)

Good news: the FT sync is already architected the way the cofounder described — **one poll, local dispatch to bots.**

The sync process:
1. Fetches trades for all tracked traders (one API call per trader, not per bot)
2. Collects everything into a single `allTrades` array
3. Loops through each wallet/bot and filters in-memory — no additional API calls

**This means adding more bots/strategies does NOT increase API calls.** API calls scale with the number of unique traders being tracked, not the number of bots analyzing those trades. LT execution reads from the `ft_orders` table (populated by FT sync) and makes zero Polymarket API calls for trade discovery — it only hits CLOB for order placement.

### Maximum Bot Capacity

| Constraint | Limit | Current Usage | Max Bots |
|------------|-------|---------------|----------|
| FT sync API calls | 200 req/10s (`/trades`) | ~100/10s (with 25 concurrent fetches) | **Not a bot limit** — scales with traders, not bots |
| LT order placement | 3,500 burst / 36,000 per 10min | Low | ~1,000+ orders per 10min cycle |
| FT sync compute time | Must complete within 2-min cron window | ~30-60s currently | Depends on server resources, not API limits |

**Bottom line:** We can safely run hundreds of bots with the current architecture. The limiting factor is the number of unique traders we track (currently ~200), not the number of bots or strategies. If we need to scale beyond ~200 traders, reducing `FETCH_CONCURRENCY` from 25 to 15 and adding delays between batches would give us more headroom.

---

## 2. Feed Card Expansion & Polling

**Priority:** High  
**Effort:** Small (< 1 day)  
**Risk addressed:** API rate limits, UX

### Current Behavior

- `expandedTradeIds` is a `Set<string>` — multiple cards can be expanded simultaneously
- Each expanded card polls price every 250ms and order book every 250ms
- Feed-level polling runs every 1s for all expanded cards
- Order status polls every 200ms after an order is placed (short-lived, stops when filled)

### Proposed Changes

**A) Smart card expansion — one at a time, unless you have an active order**

Instead of "only one card expanded ever" or "unlimited cards expanded":
- Expanding a new card **auto-collapses** any previously expanded card that does **not** have an active/filling order
- Cards with active orders (placed but not yet fully filled) **stay expanded** so the user can watch the fill
- Once the order completes (filled or cancelled), the card follows normal collapse rules
- Same behavior applies to bot-initiated orders, not just manual trades

This preserves the UX of watching your fills while preventing unbounded card stacking for browsing.

Affected files:
- `app/feed/page.tsx` — `expandedTradeIds` state + `toggleTradeExpanded` function
- `app/v2/feed/page.tsx` — same
- Trade card components — need to surface "has active order" state to the parent

**B) Evaluate 250ms → 1s card polling after monitoring data**

250ms feels more live, so we'll keep it as the default for now. Once rate-limit monitoring (Item 1) is in place, we'll have data to determine whether the current interval causes issues. If it does, we bump to 1s. If it doesn't, we keep 250ms.

The single-card-expansion change alone dramatically reduces the risk — most of the problem was unbounded card stacking, not the interval itself.

### Note

The feed-level polling (live market data for expanded trades) is already at 1 second. The 250ms interval is only in the per-card component-level polling (`trade-card.tsx` and `feed-trade-card.tsx`).

---

## 3. Implement Heartbeat for Live Trading — Critical

**Priority:** Critical  
**Effort:** Small (< 1 day)  
**Risk addressed:** Silent order cancellation

### Problem

From the new docs:

> If a valid heartbeat is not received within 10 seconds (with up to a 5-second buffer), all of your open orders will be cancelled.

Polycopy has **no heartbeat implementation**. Any live trading process that maintains resting GTC/GTD orders could have them silently cancelled by Polymarket if the heartbeat isn't being sent.

### Proposed Changes

Add a heartbeat loop to any process that maintains open orders:

```typescript
let heartbeatId = "";
setInterval(async () => {
  const resp = await client.postHeartbeat(heartbeatId);
  heartbeatId = resp.heartbeat_id;
}, 5000); // every 5 seconds
```

Affected areas:
- Live trading order placement workers
- Any process that places GTC/GTD orders and expects them to rest on the book

### Open Question

We need to confirm whether heartbeat is scoped per API key or per session. If per API key, a single heartbeat loop on the server may suffice. If per session/connection, each trading flow needs its own.

---

## 4. Gasless Transactions & Auto-Redeem — Strategic

**Priority:** High  
**Effort:** Medium (3-5 days for relayer; additional investigation for auto-redeem)  
**Impact:** User onboarding, bot effectiveness

### What Is Gas, and Who Pays?

**Gas** is the fee for executing transactions on the Polygon blockchain. In Polycopy's current flows, gas is relevant for:

| Operation | When It Happens | Who Pays Gas Today |
|-----------|----------------|-------------------|
| Wallet deployment | First-time user setup | User (needs POL) |
| Token approvals | Before first trade | User (needs POL) |
| CTF operations (split/merge/redeem) | Position management | User (needs POL) |

**With the Builder Relayer: Polymarket pays all gas.** This is a benefit of the Builder Program — Polymarket subsidizes gas as an incentive for builders to route volume. Polycopy pays nothing. Users pay nothing. The relayer limit for Verified builders is 3,000 transactions/day.

**Practical note:** Most Polycopy users may not hit gas issues today because the CLOB itself is off-chain (gas-free for order matching). Gas only matters for on-chain operations like approvals and redemptions. But when it does come up, it's a confusing blocker — users don't expect to need a second token.

### Current Scope for Relayer

For v2, the relayer is most valuable for:
1. **Token approvals** during onboarding — removing any POL requirement
2. **Auto-redeem** (see below) — the highest-impact use case

We're not doing new wallet deployments or complex CTF operations in the current product. The relayer becomes more important as we add those capabilities.

### Auto-Redeem — Separate Investigation Item

**Problem:** When a market resolves, users hold winning outcome tokens that must be manually redeemed on polymarket.com to convert back to USDC.e. Until they do, their cash is locked up. This directly hurts bot effectiveness — bots can't trade with funds that are stuck in resolved positions.

**Proposed solution:** A cron job that automatically redeems resolved positions on behalf of users, returning USDC.e to their wallets so they can keep trading.

**Feasibility assessment:**

What we already have:
- Market resolution detection (markets table: `closed`, `resolved_outcome`, `winningSide`)
- Condition IDs and outcome data in orders tables
- User wallet addresses via Turnkey
- Database schema for redemption tracking (`lt_redemptions` table — schema exists, no implementation)
- Verified builder status (relayer access)

What's missing:
- Builder Relayer Client integration (`@polymarket/builder-relayer-client` — not installed)
- Token balance checking (need to query CTF contract `balanceOf()`)
- `parentCollectionId` and `indexSets` derivation from condition IDs
- Turnkey signer extension for raw transaction signing (currently only supports EIP-712 for CLOB orders)
- User consent/opt-in mechanism

**Risks:**
- Turnkey signing: need to confirm Turnkey can sign arbitrary transactions, not just EIP-712 typed data. If it can't, the relayer client may handle signing internally — needs verification
- Relayer rate limit: 25 req/min. If many users have resolved positions simultaneously, need to queue/batch
- User consent: should be opt-in with clear disclosure

**Next step:** Investigate whether the builder relayer client handles transaction signing internally (eliminating the Turnkey extension requirement), and do a proof-of-concept redemption for one position.

---

## 5. Account for Polymarket's New Taker Fees

**Priority:** Medium  
**Effort:** Small (< 1 day) for verification; separate discussions for disclosure and RevShare  
**Impact:** Fee accuracy, P&L calculation

### What's New

As of February 18, 2026, Polymarket charges taker fees on specific market types:

| Market Type | Max Effective Fee | Fee Rate | Exponent |
|-------------|------------------|----------|----------|
| Serie A (soccer) | 0.44% at 50¢ | 0.0175 | 1 |
| NCAAB (college basketball) | 0.44% at 50¢ | 0.0175 | 1 |
| 5-minute crypto | 1.56% at 50¢ | 0.25 | 2 |
| 15-minute crypto | 1.56% at 50¢ | 0.25 | 2 |

Fee formula: `fee = C × p × feeRate × (p × (1 - p))^exponent`

The SDK handles fee inclusion in signed orders automatically if on the latest version.

### In Scope Now

1. **Verify SDK version:** Confirm `@polymarket/clob-client@^5.2.0` includes fee-rate support (update to latest if not)
2. **P&L accuracy:** Ensure our P&L calculations account for fees on these market types. The `fee_rate_bps` field is now included in trade objects — we should store and factor this into realized P&L

### Separate Discussions Needed

3. **Fee disclosure UX:** How should we surface Polymarket's taker fees to users? Do we show a fee breakdown before trade confirmation? How does Polymarket disclose them on their own UI? We should align with their approach
4. **RevShare Protocol:** The Builder Program (Verified+) includes a RevShare Protocol that lets builders charge fees on orders they route. This could be the mechanism for Polycopy's own trading fee — potentially simpler than our planned in-house implementation. Reaching out to Polymarket dev relations to understand the mechanics

---

## Deferred Items

### Bridge API — Deposit/Withdraw from Within Polycopy

**Recommendation:** Defer to post-v2 launch

Polymarket's new Bridge API (`bridge.polymarket.com`) enables programmatic deposits from Ethereum, Solana, Bitcoin, and Tron. This would let users fund their Polymarket wallet directly from Polycopy's UI instead of navigating to polymarket.com.

**User flow:** Deposit button → show unique deposit addresses per chain → user sends crypto → track status → funds auto-convert to USDC.e.

Nice-to-have for keeping users inside the Polycopy experience, but not blocking for v2. No auth required, ~3-4 REST endpoints, mostly a UI feature.

### FT Sync Concurrency Tuning

**Recommendation:** Monitor, adjust if issues arise

The FT sync already uses shared polling (one poll → local dispatch to bots). API calls scale with trader count (~200 traders), not bot count (66+ bots). At 25 concurrent fetches we're using ~50% of the `/trades` rate limit. If we add significantly more traders or start seeing throttling, we reduce `FETCH_CONCURRENCY` from 25 to 15 and add delays between batches. No action needed today.

---

## Skipped Items

### Geoblock Checking

**Decision:** Skip

All Polycopy orders route through our Evomi proxy (default: Ireland). Polymarket sees the proxy IP, not the user's IP. Ireland is not a blocked country. Implementing geoblock checking would just confirm the proxy is working, which it already does.

### Polymarket Sports WebSocket → Replace ESPN

**Decision:** Keep ESPN

We observed that Polymarket's own scores display is delayed compared to ESPN. The Sports WebSocket is Polymarket's data source, so adopting it would give us the same delayed data. ESPN is upstream and faster. No reason to switch.

---

## Implementation Order

| # | Item | Effort | Impact |
|---|------|--------|--------|
| 1 | Rate-limit monitoring + API usage dashboard | 2-3 days | Visibility into production risk; informs all other decisions |
| 2 | Smart card expansion (one at a time unless active order) | < 1 day | Reduces unbounded polling from card stacking |
| 3 | Implement heartbeat for live trading | < 1 day | Prevents silent order cancellation |
| 4 | Verify SDK handles new taker fees + P&L accuracy | < 1 day | Ensures correct order signing and fee tracking |
| 5 | Builder Relayer integration + auto-redeem investigation | 3-5 days | Gas-free operations; auto-redeem unlocks bot effectiveness |

Items 2-4 can be done in a single day. Item 1 is a prerequisite for evaluating whether the 250ms polling interval needs to change. Item 5 is a standalone project.

### Separate Discussions (Not Engineering Tasks Yet)

- Taker fee disclosure UX
- RevShare Protocol for Polycopy trading fee
- Bridge API for post-v2

---

## References

- [Polymarket Developer Docs](https://docs.polymarket.com/)
- [Builder Relayer Client (TypeScript)](https://github.com/Polymarket/builder-relayer-client)
- [Builder Program Tiers](https://docs.polymarket.com/builders/tiers)
- [Fee Structure](https://docs.polymarket.com/trading/fees)
- [Rate Limits](https://docs.polymarket.com/api-reference/rate-limits)
- [Heartbeat API](https://docs.polymarket.com/trading/orders/overview#heartbeat)
