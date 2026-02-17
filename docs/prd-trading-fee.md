# PRD: Polycopy Trading Fee

**Author:** Polycopy Team  
**Status:** Draft  
**Created:** February 16, 2026  
**Last Updated:** February 16, 2026

---

## 1. Overview

Polycopy will charge a per-trade fee on all orders placed by free-tier users. Premium subscribers are exempt from trading fees. This creates a dual-purpose monetization mechanism: direct revenue from free-tier trading volume, and a conversion incentive that drives users toward premium subscriptions.

### Goals

1. Generate per-trade revenue from free-tier users
2. Create a clear, quantifiable incentive to upgrade to Premium
3. Implement fee collection with minimal impact on order latency and UX
4. Build the infrastructure in-house to avoid third-party margin erosion

### Non-Goals

- Charging fees to Premium or Admin users
- Implementing fee refunds for unfilled orders (v1)
- Building a trustless on-chain escrow contract (considered for v2)
- Changing the subscription pricing model (separate initiative)

---

## 2. Revenue Model

### Fee Rate Comparison

The following tables model monthly and annual revenue across different fee rates and volume levels. All figures assume free-tier users only (Premium users pay $0 in trading fees).

#### Monthly Revenue by Volume

| Monthly Volume | 1.00% | 1.25% | 1.50% | 2.00% |
|---|---|---|---|---|
| $25,000 | $250 | $313 | $375 | $500 |
| $50,000 | $500 | $625 | $750 | $1,000 |
| $100,000 | $1,000 | $1,250 | $1,500 | $2,000 |
| $200,000 | $2,000 | $2,500 | $3,000 | $4,000 |
| $500,000 | $5,000 | $6,250 | $7,500 | $10,000 |
| $1,000,000 | $10,000 | $12,500 | $15,000 | $20,000 |

#### Annual Revenue by Volume

| Monthly Volume | 1.00% | 1.25% | 1.50% | 2.00% |
|---|---|---|---|---|
| $25,000 | $3,000 | $3,750 | $4,500 | $6,000 |
| $50,000 | $6,000 | $7,500 | $9,000 | $12,000 |
| $100,000 | $12,000 | $15,000 | $18,000 | $24,000 |
| $200,000 | $24,000 | $30,000 | $36,000 | $48,000 |
| $500,000 | $60,000 | $75,000 | $90,000 | $120,000 |
| $1,000,000 | $120,000 | $150,000 | $180,000 | $240,000 |

### Premium Conversion Breakeven

At what monthly trading volume does a free-tier user save money by upgrading to Premium ($30/month)?

| Fee Rate | Breakeven Volume | Trades at $100 avg | Trades at $200 avg |
|---|---|---|---|
| 1.00% | $3,000/month | ~30 trades | ~15 trades |
| 1.25% | $2,400/month | ~24 trades | ~12 trades |
| 1.50% | $2,000/month | ~20 trades | ~10 trades |
| 2.00% | $1,500/month | ~15 trades | ~8 trades |

**Interpretation:** At 1.25%, a user making ~2 copy trades per day at $100 each would break even on Premium in the first month. This is a natural tipping point — casual users who copy a few trades per week won't feel the fee much ($1.25 per $100 trade), while active users have a clear path to savings.

### Round-Trip Cost Impact

Users copy-trading will typically buy and later sell. The round-trip cost is 2x the fee rate.

| Fee Rate | Round-Trip Cost | Impact on a 10% Winning Trade | Net Return |
|---|---|---|---|
| 1.00% | 2.0% | 10% - 2.0% = 8.0% | 80% of gross profit retained |
| 1.25% | 2.5% | 10% - 2.5% = 7.5% | 75% of gross profit retained |
| 1.50% | 3.0% | 10% - 3.0% = 7.0% | 70% of gross profit retained |
| 2.00% | 4.0% | 10% - 4.0% = 6.0% | 60% of gross profit retained |

### Fee Rate Recommendation

**1.00% - 1.25% recommended.** This range balances revenue generation with user retention:

- **1.00%** is conservative — comparable to eToro's crypto spread, lower than Coinbase's 1.49% standard rate. Round-trip cost of 2% is palatable. Premium breakeven at $3,000/month is reasonable.
- **1.25%** is the sweet spot — generates 25% more revenue than 1%, Premium breakeven at $2,400/month is still very accessible, and the round-trip cost of 2.5% is competitive.
- **1.50%** is defensible but aggressive — 3% round trip starts to meaningfully erode winning trades. Could drive price-sensitive users away before they convert.
- **2.00%** is risky — 4% round trip is steep for prediction markets where edges are thin. Best suited only if the product is highly differentiated with no alternatives.

The fee rate should be configurable (stored in environment variables or database) so it can be adjusted without code changes.

---

## 3. Dome API: Build vs. Buy Analysis

### What Dome Offers

Dome provides a fee escrow service for Polymarket order routing. Their `PolymarketRouterWithEscrow` SDK handles:
- EIP-712 fee authorization signing
- Pre-trade USDC.e pull to escrow contract
- Automatic fee distribution on order fill
- Automatic refund on order cancellation
- Affiliate fee splitting

### Dome's Cost

Dome charges **25 basis points (0.25%)** per order as their fee for providing the escrow infrastructure.

### Cost Analysis at Different Dome Rates

| Polycopy Fee | Dome Cost | Total User Cost | Dome's Share of User Cost | Polycopy Net Revenue (on $50K/mo) |
|---|---|---|---|---|
| 1.25% | 25 bps (current) | 1.50% | 17% | $625/mo (vs $625 self-built) |
| 1.25% | 15 bps (negotiated) | 1.40% | 11% | $625/mo (Dome takes $75) |
| 1.25% | 10 bps (negotiated) | 1.35% | 7% | $625/mo (Dome takes $50) |
| 1.25% | 5 bps (best case) | 1.30% | 4% | $625/mo (Dome takes $25) |

**Important clarification:** Dome's fee is additive — it's charged to the user on top of Polycopy's fee. Polycopy always keeps its full fee. The question is whether the increased user cost (making the product less competitive) and the dependency on a third-party beta product are worth the reduced engineering effort.

### Decision Matrix

| Factor | Build In-House | Use Dome |
|---|---|---|
| User cost | Lower (only Polycopy's fee) | Higher (+25 bps from Dome) |
| Build effort | 3-5 days | ~1 day integration |
| Ongoing maintenance | Low (simple USDC transfer) | None (Dome handles it) |
| Dependency risk | None | Beta product, may change without notice |
| Refund on cancel | Not in v1 (planned v2) | Automatic |
| Latency impact | +1-3s per order | +2-5s per order (escrow tx + order) |
| Trustlessness | Custodial (Turnkey-based) | On-chain escrow (trustless) |
| Control | Full | Limited to Dome's API |

### Recommendation

**Build in-house.** Reasons:

1. **User cost matters.** At $50K/month volume, Dome adds $125/month in costs passed to users with zero benefit to Polycopy's revenue. At higher volumes this scales linearly.
2. **Dome is in beta.** Their docs explicitly warn "DO NOT USE IN PRODUCTION." Building on a beta dependency for a revenue-critical feature is risky.
3. **The build is small.** Polycopy already has Turnkey signing authority, Polygon RPC infrastructure, and USDC balance fetching. The incremental work is a single USDC.e transfer function + fee gating logic.
4. **No negotiation needed.** Even if Dome dropped to 10 bps, the dependency risk and additive user cost remain.

**Reconsider Dome only if:**
- Dome exits beta and offers a stable SLA
- Dome's fee drops below 5 bps
- Polycopy needs trustless on-chain escrow for regulatory/trust reasons and doesn't want to build its own smart contract

---

## 4. Product Requirements

### 4.1 Fee Exemption Rules

| User Tier | Fee Charged? | Notes |
|---|---|---|
| Anonymous | N/A | Cannot place orders |
| Registered (free) | Yes | Full fee rate applied |
| Premium | No | Fee waived entirely |
| Admin | No | Fee waived entirely |

Fee exemption is determined server-side using the existing `is_premium` / `is_admin` flags on the `profiles` table. The check happens before any fee transfer is initiated.

### 4.2 Fee Calculation

```
fee_amount_usdc = order_size_contracts * order_price * fee_rate
```

Where:
- `order_size_contracts` = number of contracts (shares) being ordered
- `order_price` = limit price per contract
- `fee_rate` = configurable rate (e.g., 0.0125 for 1.25%)

**Minimum fee:** $0.01 USDC. Orders where the calculated fee is below $0.01 are exempt (fee not worth the gas cost).

**Maximum fee:** No cap (scales linearly with order size).

### 4.3 Fee Collection Flow

**For manual copy trades (quick trade):**

```
1. User clicks "Copy Trade" → Frontend sends POST to /api/polymarket/orders/place
2. API validates input, checks auth, checks rate limits (existing)
3. NEW: Check user tier (Premium? → skip fee)
4. NEW: Calculate fee amount
5. NEW: Transfer USDC.e from user wallet to Polycopy fee wallet via Turnkey
6. NEW: Record fee transaction in fee_transactions table
7. Place order on Polymarket CLOB (existing flow)
8. Return response to user (existing, with fee info added)
```

**For Live Trading bot orders:**

```
1. Executor identifies trade signal (existing)
2. Bet size calculation, capital lock, risk check (existing)
3. NEW: Calculate fee on the bet size
4. NEW: Check user tier (Premium? → skip fee)
5. NEW: Transfer USDC.e from user wallet to Polycopy fee wallet via Turnkey
6. NEW: Record fee transaction
7. Place order on CLOB (existing flow)
8. Record results (existing, with fee info added)
```

### 4.4 Fee Display (Frontend)

Before confirming a trade, free-tier users see:

```
Order Summary
─────────────
Buy 100 YES @ $0.50
Order Cost:        $50.00
Polycopy Fee (1.25%): $0.63
Total:             $50.63

[Confirm Trade]

💎 Premium members trade fee-free. Upgrade →
```

The fee disclosure must be visible **before** the user confirms the trade. Premium users see no fee line.

### 4.5 Handling Edge Cases

| Scenario | Behavior |
|---|---|
| Fee transfer fails (insufficient USDC) | Order is blocked. User sees "Insufficient balance for trade + fee" |
| Fee transfer fails (network error) | Order is blocked. Retry once. If still fails, allow order without fee (fail-open) and log for manual review |
| Order doesn't fill after fee is collected | Fee is retained (v1). User paid for order placement, not fill. Noted in terms. |
| User is Premium when order placed | No fee charged, regardless of subscription changes after |
| Order is cancelled before fill | Fee is retained (v1). Refund-on-cancel is a v2 feature. |
| Fee amount < $0.01 | Fee waived for this order |
| Live Trading bot order | Same fee rules apply. Fee comes from the user's wallet, not the bot's capital allocation. |

### 4.6 Fee Refund Policy (v1 vs v2)

**v1 (initial launch):** No refunds. Users pay the fee on order placement. This is simpler to build and mirrors how Coinbase and other platforms charge — the fee is for the service of placing the order, not contingent on fills.

**v2 (future):** Consider refund-on-cancel or refund-on-no-fill for GTC orders that expire without filling. This would require either:
- A background worker that monitors order status and initiates refund transfers
- A simple escrow contract on Polygon

---

## 5. Technical Architecture

### 5.1 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                             │
│  feed-trade-card.tsx / copy modal / bots UI                │
│  Shows fee preview for free-tier users                      │
│  Shows "Premium = fee-free" upsell                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Layer                               │
│  /api/polymarket/orders/place (quick trades)               │
│  /api/lt/execute (live trading)                            │
│                                                             │
│  NEW: Fee gating middleware                                 │
│  1. Check is_premium / is_admin                            │
│  2. Calculate fee                                          │
│  3. Call collectTradingFee()                               │
│  4. Proceed to placeOrderCore()                            │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
┌──────────────────┐ ┌──────────┐ ┌──────────────────┐
│  Fee Collection  │ │  CLOB    │ │  Database         │
│  (NEW)           │ │  Order   │ │                   │
│                  │ │          │ │  fee_transactions  │
│  USDC.e transfer │ │  Existing│ │  order_events_log │
│  via Turnkey +   │ │  flow    │ │  profiles         │
│  Polygon RPC     │ │          │ │                   │
└──────────────────┘ └──────────┘ └──────────────────┘
```

### 5.2 New Module: `lib/fees/collect-fee.ts`

This module handles the USDC.e transfer from user wallet to Polycopy fee wallet.

**Responsibilities:**
- Encode ERC-20 `transfer(address,uint256)` calldata
- Sign the transaction via Turnkey (using user's private key)
- Submit to Polygon via RPC
- Wait for transaction confirmation
- Return transaction hash or error

**Key implementation details:**

- Uses USDC.e (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`) — this is what Polymarket uses for trading
- 6 decimal places (1 USDC = 1,000,000 units)
- Polygon gas cost: ~$0.001-0.01 per transfer (negligible)
- Fee wallet address: a Polycopy-controlled EOA, configured via `POLYCOPY_FEE_WALLET_ADDRESS` env var

**Dependencies (all existing in codebase):**
- `lib/turnkey/client.ts` — Turnkey signing
- `lib/polygon/rpc.ts` — `callPolygonRpc()` for submitting transactions
- `lib/turnkey/config.ts` — USDC.e contract address, Polygon chain ID

### 5.3 New Module: `lib/fees/fee-gate.ts`

Centralized fee gating logic used by both quick-trade and LT execution paths.

```typescript
interface FeeGateResult {
  shouldChargeFee: boolean
  feeAmountUsdc: number      // In human-readable USDC (e.g., 0.63)
  feeAmountRaw: bigint       // In USDC smallest unit (e.g., 630000n)
  feeRateBps: number         // e.g., 125 for 1.25%
  reason: 'premium' | 'admin' | 'below_minimum' | 'fee_disabled' | 'charged'
}

async function checkFeeGate(
  userId: string,
  orderSizeContracts: number,
  orderPrice: number,
): Promise<FeeGateResult>
```

### 5.4 Database Schema

#### New table: `fee_transactions`

```sql
CREATE TABLE fee_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  wallet_address TEXT NOT NULL,
  order_intent_id TEXT,                    -- Links to the order that triggered this fee
  polymarket_order_id TEXT,                -- Filled after order is placed
  
  fee_rate_bps INTEGER NOT NULL,           -- e.g., 125 for 1.25%
  order_notional_usdc NUMERIC(18,6),       -- order_size * order_price
  fee_amount_usdc NUMERIC(18,6) NOT NULL,  -- Actual fee charged
  
  tx_hash TEXT,                            -- Polygon transaction hash
  tx_status TEXT DEFAULT 'pending',        -- pending, confirmed, failed, skipped
  
  fee_wallet_address TEXT NOT NULL,        -- Polycopy's fee collection wallet
  
  source TEXT NOT NULL,                    -- 'quick_trade' | 'live_trading'
  
  created_at TIMESTAMPTZ DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  
  CONSTRAINT fee_amount_positive CHECK (fee_amount_usdc > 0)
);

CREATE INDEX idx_fee_transactions_user ON fee_transactions(user_id);
CREATE INDEX idx_fee_transactions_order ON fee_transactions(order_intent_id);
CREATE INDEX idx_fee_transactions_status ON fee_transactions(tx_status);
CREATE INDEX idx_fee_transactions_created ON fee_transactions(created_at);
```

#### Existing table changes

**`profiles`** — no changes needed. Already has `is_premium` and `is_admin` columns.

**`order_events_log`** — add optional fee columns:

```sql
ALTER TABLE order_events_log
  ADD COLUMN fee_charged BOOLEAN DEFAULT FALSE,
  ADD COLUMN fee_amount_usdc NUMERIC(18,6),
  ADD COLUMN fee_tx_hash TEXT;
```

### 5.5 Environment Variables

| Variable | Description | Example |
|---|---|---|
| `POLYCOPY_FEE_WALLET_ADDRESS` | EOA address that receives all fees | `0x...` |
| `POLYCOPY_FEE_RATE_BPS` | Fee rate in basis points | `125` (= 1.25%) |
| `POLYCOPY_FEE_ENABLED` | Kill switch for fee collection | `true` |
| `POLYCOPY_FEE_MIN_USDC` | Minimum fee threshold | `0.01` |

### 5.6 Integration Points

#### Quick Trade Path (`app/api/polymarket/orders/place/route.ts`)

Insert fee logic between input validation (line ~498) and order placement (line ~750):

```
Current flow:
  validate input → idempotency check → admin check → prepare order → placeOrderCore()

New flow:
  validate input → idempotency check → admin check → FEE GATE CHECK → FEE TRANSFER → prepare order → placeOrderCore()
```

The fee gate check queries the user's `is_premium` status (already fetched at the admin check step — extend that query to include `is_premium`). If fee is required, execute the USDC.e transfer before proceeding to order placement.

#### Live Trading Path (`lib/live-trading/executor-v2.ts`)

Insert fee logic in `executeTrade()` between the risk check (Step 4) and token resolution (Step 5):

```
Current flow:
  bet size → lock capital → risk check → resolve token → prepare order → place order

New flow:
  bet size → lock capital → risk check → FEE GATE CHECK → FEE TRANSFER → resolve token → prepare order → place order
```

If the fee transfer fails, unlock capital and return an error (same pattern as other pre-trade checks).

### 5.7 Transaction Signing

The fee transfer requires signing a raw Polygon transaction (not an EIP-712 typed data signature like CLOB orders). This needs a new capability in the Turnkey integration.

**Current Turnkey signer (`lib/polymarket/turnkey-signer.ts`):**
- Only supports `_signTypedData()` (EIP-712)
- Used exclusively for CLOB order signing

**New requirement:**
- Sign a raw transaction (`eth_signTransaction` or equivalent)
- Or use Turnkey's `signRawPayload` / `signTransaction` API directly

Turnkey supports raw transaction signing via their SDK. The implementation will:
1. Build the USDC.e `transfer()` transaction (to, data, value, gas, nonce, chainId)
2. Sign it via Turnkey's `signTransaction` method using the user's private key ID
3. Submit the signed transaction via `eth_sendRawTransaction` on Polygon RPC

This is the primary new technical capability needed.

---

## 6. Implementation Plan

### Phase 1: Core Fee Infrastructure (Days 1-2)

- [ ] Create `lib/fees/collect-fee.ts` — USDC.e transfer function
- [ ] Create `lib/fees/fee-gate.ts` — fee calculation and tier checking
- [ ] Add Turnkey raw transaction signing capability
- [ ] Create `fee_transactions` Supabase migration
- [ ] Add `fee_charged`, `fee_amount_usdc`, `fee_tx_hash` columns to `order_events_log`
- [ ] Add environment variables to `.env.example`
- [ ] Unit test fee calculation logic

### Phase 2: Quick Trade Integration (Day 3)

- [ ] Integrate fee gate into `app/api/polymarket/orders/place/route.ts`
- [ ] Update the `profiles` query to fetch `is_premium` alongside `is_admin`
- [ ] Add fee info to order response payload
- [ ] Handle fee transfer failures (block order, return error)
- [ ] Test end-to-end: free user → fee charged → order placed
- [ ] Test end-to-end: premium user → no fee → order placed

### Phase 3: Live Trading Integration (Day 3-4)

- [ ] Integrate fee gate into `lib/live-trading/executor-v2.ts`
- [ ] Add fee handling to the LT execution flow (after risk check, before token resolution)
- [ ] Handle fee failure → unlock capital flow
- [ ] Add fee logging to LT execution logs
- [ ] Test with shadow mode strategies
- [ ] Test with live strategies

### Phase 4: Frontend (Day 4-5)

- [ ] Add fee preview to copy trade modal (`components/polycopy-v2/feed-trade-card.tsx`)
- [ ] Show fee breakdown in order confirmation
- [ ] Show "Premium = fee-free" upsell for free users
- [ ] Hide fee UI entirely for Premium users
- [ ] Update portfolio/order history to show fees paid
- [ ] Add fee summary to user settings/profile

### Phase 5: Monitoring & Admin (Day 5)

- [ ] Create fee revenue dashboard query (daily/weekly/monthly revenue)
- [ ] Add fee collection alerts (failed transfers, unusual patterns)
- [ ] Admin view: total fees collected, fees by user, fee transfer status
- [ ] Kill switch testing (`POLYCOPY_FEE_ENABLED=false`)
- [ ] Update terms of service

---

## 7. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Fee transfer fails mid-order | Order blocked, user frustrated | Medium | Retry once, then fail-open with logging for manual review |
| Polygon RPC downtime | All fee transfers fail | Low | Fail-open: allow orders without fee, log for later collection |
| User has insufficient USDC for trade + fee | Order blocked | Medium | Clear error message: "Need $X.XX more USDC (includes $Y.YY fee)" |
| Fee drives users away | Revenue loss, churn | Medium | Start at 1% or 1.25%, monitor conversion rates, A/B test if possible |
| Turnkey rate limits on signing | Fee transfers throttled | Low | Batch where possible, implement backoff |
| Nonce management conflicts | Tx fails due to nonce collision with CLOB operations | Medium | Use separate nonce tracking for fee transfers vs CLOB signing |

### Nonce Management (Important)

The Turnkey signer currently only signs EIP-712 typed data (off-chain, no nonce needed). Fee transfers are on-chain Polygon transactions that require sequential nonces. If the same EOA is used for both fee transfers and any future on-chain operations, nonce conflicts can occur.

**Mitigation:** Manage nonces explicitly for fee transfers — fetch current nonce from Polygon RPC before each transfer, and handle `nonce too low` errors with retry.

---

## 8. Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Fee collection success rate | >99% | `fee_transactions` where `tx_status = 'confirmed'` / total |
| Order latency increase | <2 seconds | Compare order placement time before/after fee launch |
| Free→Premium conversion rate | >5% increase | Track conversion rate pre/post fee launch |
| Fee revenue (month 1) | >$250 | Sum of `fee_amount_usdc` from `fee_transactions` |
| User churn from fee | <10% of active free users | Track 30-day retention pre/post |

---

## 9. Future Considerations (v2+)

### Refund on Cancel/Expiry
Build a background worker that monitors GTC/GTD orders for cancellation or expiry, and refunds the fee to the user's wallet. Requires a `refund_transactions` table and Turnkey-signed refund transfers.

### On-Chain Escrow Contract
For trustless fee handling, deploy a simple Solidity contract on Polygon:
- `depositFee(orderId, user, amount)` — pull fee before order
- `distributeFee(orderId)` — send fee to Polycopy on fill
- `refundFee(orderId)` — return fee to user on cancel

Reference: [Polymarket exchange-fee-module](https://github.com/Polymarket/exchange-fee-module)

### Tiered Fee Rates
Different fee rates based on monthly volume (e.g., 1.25% for <$10K, 1% for $10-50K, 0.75% for >$50K). Incentivizes higher volume from free-tier users.

### Affiliate Fee Sharing
If Polycopy introduces a referral program, a portion of the trading fee can be shared with the referring user.

### Fee-Free Promotions
Time-limited promotions (e.g., "First 10 trades fee-free") to reduce friction for new user onboarding.

---

## 10. Open Questions

1. **Final fee rate?** This PRD models 1%, 1.25%, 1.50%, and 2%. Recommendation is 1-1.25%. Final decision needed before build.

2. **Should Live Trading bot orders charge fees?** LT strategies are a premium feature, so users with active LT bots are likely already premium. However, if a free user somehow has an active LT strategy, should fees apply? Recommendation: yes, same rules apply universally.

3. **Fee on sell orders?** Should the fee apply to both buys and sells, or buys only? Recommendation: both (consistent, simpler to reason about). But this means round-trip cost is 2x the rate.

4. **Should we show cumulative fees saved for Premium users?** e.g., "You've saved $47.50 in fees this month with Premium." This reinforces the value of the subscription. Low effort, high impact on retention.

5. **Grace period?** Should existing free-tier users get a grace period before fees kick in? Recommendation: yes, 7-14 days with advance email notice.

6. **Fail-open vs fail-closed?** If the fee transfer fails, should we block the order (fail-closed, protects revenue) or allow it (fail-open, protects UX)? Recommendation: fail-closed for quick trades (user can retry), fail-open for LT bots (can't interrupt automated execution).
