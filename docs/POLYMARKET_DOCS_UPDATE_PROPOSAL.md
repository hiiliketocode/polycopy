# Proposal: Polymarket Docs Update — Actions for Polycopy

**Author:** Engineering  
**Status:** Review  
**Created:** February 19, 2026  
**Context:** Polymarket released updated developer documentation on Feb 19, 2026. This proposal summarizes what's new and recommends specific actions for Polycopy.

---

## Summary

Polymarket overhauled their developer docs, formalizing several new APIs, SDKs, and features. After reviewing the full docs against our codebase, we identified **4 items to implement now**, **2 items to defer**, and **2 items to skip**. The changes range from quick wins (polling interval fix) to strategic features (gasless transactions via Builder Relayer).

---

## 1. Fix Feed Card Polling — Quick Win

**Priority:** High  
**Effort:** Small (< 1 day)  
**Risk addressed:** API rate limits

### Problem

Each expanded trade card polls price and order book data every **250ms** (4 requests/second per card). Multiple expanded cards stack — 10 cards = 40 req/sec hitting Gamma/CLOB APIs. Polymarket's newly documented rate limits confirm we're uncomfortably close to thresholds.

### Proposed Changes

**A) Bump card-level polling from 250ms to 1,000ms (1 second)**

Affected files:
- `components/polycopy/trade-card.tsx` — price polling (line ~1698) and order book polling (line ~1765)
- `components/polycopy-v2/feed-trade-card.tsx` — price polling (line ~1714) and order book polling (line ~1781)

This alone is a 4x reduction in API calls with negligible UX impact — price data doesn't meaningfully change at sub-second intervals for prediction markets.

**B) Allow only one expanded card at a time**

Currently, `expandedTradeIds` is a `Set<string>` allowing multiple cards open simultaneously. Change to `expandedTradeId: string | null` so expanding a new card auto-collapses the previous one.

Affected files:
- `app/feed/page.tsx` — state declaration (line ~741), toggle function (lines ~3840-3849)
- `app/v2/feed/page.tsx` — state declaration (line ~746), toggle function (lines ~3821-3831)

Combined impact: worst case drops from ~40 req/sec to ~1 req/sec.

### Note

The feed-level polling (live market data for expanded trades) is already at 1 second. This change only affects the per-card component-level polling.

---

## 2. Implement Heartbeat for Live Trading — Critical

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

## 3. Gasless Transactions via Builder Relayer — Strategic

**Priority:** High  
**Effort:** Medium (3-5 days)  
**Impact:** User onboarding, trading UX

### What's New

Polymarket now offers `@polymarket/builder-relayer-client`, an SDK that lets builders sponsor all gas fees for their users. Since Polycopy is already a Verified builder, we can use this immediately with our existing credentials.

### What It Enables

| Operation | Current State | With Relayer |
|-----------|--------------|--------------|
| Wallet deployment | User may need POL | Gas-free |
| Token approvals | User may need POL | Gas-free |
| CTF operations (split/merge/redeem) | User may need POL | Gas-free |
| Token transfers | User may need POL | Gas-free |
| Batch operations | Individual txns | Atomic batches |

### Why It Matters

Users currently need POL (Polygon's gas token) for certain onchain operations. This is a friction point, especially for new users who fund with USDC and don't understand why they need a second token. The relayer eliminates this entirely — users only need USDC.e to trade.

### Proposed Changes

1. Install `@polymarket/builder-relayer-client` and `@polymarket/builder-signing-sdk`
2. Initialize relayer client with existing builder credentials (same env vars we already have)
3. Use relayer for:
   - New wallet deployment during onboarding
   - Token approval transactions
   - Position redemption after market resolution
4. Batch approval + trade operations where possible for lower latency

### Rate Limit Consideration

The relayer has a limit of **25 requests/minute** (Verified tier: 3,000 txns/day). We need to be mindful of this for batch operations. Wallet deployment and approvals are typically one-time per user, so this should be fine for normal usage.

---

## 4. Account for Polymarket's New Taker Fees

**Priority:** Medium  
**Effort:** Small (< 1 day)  
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

The SDK handles fee inclusion in signed orders automatically if on the latest version. But we need to verify two things.

### Proposed Changes

1. **Verify SDK version:** Confirm `@polymarket/clob-client@^5.2.0` includes fee-rate support (update to latest if not)
2. **P&L accuracy:** Ensure our P&L calculations account for fees on these market types. The `fee_rate_bps` field is now included in trade objects and WebSocket events — we should store and display this
3. **User transparency:** Show fee information on trade cards for fee-enabled markets so users understand the cost before copying
4. **Polycopy fee stacking:** Our planned trading fee (per `docs/prd-trading-fee.md`) needs to account for Polymarket's underlying fees to avoid uncompetitive pricing on these market types

### RevShare Protocol — Worth Investigating

The Builder Program (Verified+ tier) now includes a **RevShare Protocol** that lets builders charge fees on orders they route. This could be an alternative mechanism for Polycopy's own trading fee, potentially simpler than our planned in-house implementation. Worth a conversation with builder@polymarket.com to understand the details.

---

## Deferred Items

### Bridge API — Deposit/Withdraw from Within Polycopy

**Recommendation:** Defer to post-v2 launch

Polymarket's new Bridge API (`bridge.polymarket.com`) enables programmatic deposits from Ethereum, Solana, Bitcoin, and Tron. This would let users fund their Polymarket wallet directly from Polycopy's UI instead of navigating to polymarket.com.

**User flow:** Deposit button → show unique deposit addresses per chain → user sends crypto → track status → funds auto-convert to USDC.e.

Nice-to-have for keeping users inside the Polycopy experience, but not blocking for v2. No auth required, ~3-4 REST endpoints, mostly a UI feature.

### FT Sync Concurrency Tuning

**Recommendation:** Monitor, adjust if issues arise

The FT sync process (every 2 minutes, 66+ bots) makes up to 25 concurrent requests to the Data API `/trades` endpoint (limit: 200 req/10s). Currently approaching ~50% of the limit during busy syncs. Not a problem yet, but worth reducing `FETCH_CONCURRENCY` from 25 to 15 if we start seeing throttling.

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
| 1 | Fix feed card polling (250ms → 1s + single expand) | < 1 day | Reduces API calls ~40x worst case |
| 2 | Implement heartbeat for live trading | < 1 day | Prevents silent order cancellation |
| 3 | Verify SDK handles new taker fees | < 1 day | Ensures correct order signing |
| 4 | Integrate Builder Relayer for gasless txns | 3-5 days | Eliminates gas friction for users |

Items 1-3 can be done in a single day. Item 4 is a standalone project.

---

## References

- [Polymarket Developer Docs](https://docs.polymarket.com/)
- [Builder Relayer Client (TypeScript)](https://github.com/Polymarket/builder-relayer-client)
- [Builder Program Tiers](https://docs.polymarket.com/builders/tiers)
- [Fee Structure](https://docs.polymarket.com/trading/fees)
- [Rate Limits](https://docs.polymarket.com/api-reference/rate-limits)
- [Heartbeat API](https://docs.polymarket.com/trading/orders/overview#heartbeat)
