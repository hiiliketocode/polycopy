# Slippage Research and Modeling for Forward Tests

**Date:** February 2026  
**Purpose:** Design evidence-based slippage modeling for FT and backtests

---

## 1. How Real Trades Work on Polymarket

### 1.1 Order Types

- **GTC (Good-Til-Cancelled):** Limit order sits in book until filled or cancelled.
- **FAK (Fill-And-Kill):** Fills immediately for available liquidity; cancels unfilled remainder.
- We use **limit orders**—we set a maximum price (BUY) or minimum price (SELL).

### 1.2 CLOB Mechanics

From standard CLOB mechanics (Polymarket uses a central limit order book):

- **BUY limit order:** Fills at your limit price **or better (lower)**. You never pay more than your limit.
- **SELL limit order:** Fills at your limit price **or better (higher)**. You never receive less than your limit.

### 1.3 What "Slippage" Means in Our UI

Our `slippagePercent` (e.g. 3%) is a **tolerance/cap**, not the expected outcome:

| Action | Formula | Meaning |
|--------|---------|---------|
| BUY | `limitPrice = currentBestAsk * (1 + slippage/100)` | Willing to pay up to X% above current best ask |
| SELL | `limitPrice = currentBestBid * (1 - slippage/100)` | Willing to accept down to X% below current best bid |

- **Actual fill** is at best available price **within** that limit.
- In practice, most fills use <1–2% of the tolerance (per ORDER_TIMEOUT_FIX.md).
- The 3% is a worst-case cap to improve fill rate.

### 1.4 Can Slippage Be Favorable?

**Yes.** Two separate concepts:

1. **Within our limit:** We set limit = bestAsk × 1.03. We can fill at 1.01× (better than limit).
2. **vs. trader's price:** The trader paid 60¢ at T0. At T1 we copy:
   - If best ask is 59¢ → we can fill **better** than the trader (favorable).
   - If best ask is 62¢ → we fill **worse** than the trader (unfavorable).

So **realized slippage vs. trader price** can be positive or negative depending on market movement between trader trade and our execution.

---

## 1.5 External Research: Copy Trading, Slippage, and Execution Delay

### Bybit Copy Trading (Crypto Exchange)

Bybit’s copy trading replicates master orders to followers sequentially after execution. Because each order executes at different market conditions, **discrepancies between master and follower positions are common**.[1]

- **Slippage protection:** 0.1% default, adjustable up to 5%. If price deviation exceeds the threshold, the order fails to copy.
- **Reasons for missed copies:** Insufficient balance, price deviation (slippage) exceeding threshold, rapid price fluctuations.
- **Execution delay:** There is an inherent time delay; orders are replicated after the master places them. Combined with volatility, this creates **timing differences that impact average entry prices**.[1][2]

### Academic / Empirical Findings

- **Adverse selection (HFT / crypto):** Research on latency in trading shows that delays from exchange, trader infrastructure, and communication create **adverse selection effects**: profitable orders tend to get worse-than-expected fill prices; market orders see worsening prices; marketable limit orders often fail to fill immediately.[3]
- **Copy errors and price efficiency:** Copy trading adds both informed capital and systematic noise. Replication mistakes (“copy errors”) create factor-structured noise and a hump-shaped relationship between copy participation and price efficiency when copy error is moderate.[4]
- **General slippage ranges:** Slippage is often 0.1%–1%+ depending on liquidity; thinner markets see higher slippage.[5]

### Takeaways for Our Modeling

1. **Execution delay is a first-order effect** — followers systematically execute later than masters.
2. **Slippage can be favorable or unfavorable** — but latency tends to bias toward worse fills.
3. **Platforms typically cap slippage** — 0.1%–5%; our 3% default is in line with this.
4. **Run our own empirical analysis** — use `scripts/analyze-slippage-copy-trades.sql` on real orders to calibrate models.

**References:** [1] Bybit Help: Understanding discrepancies in copy trading positions. [2] Bybit: Differences between master and follower. [3] "The Good, the Bad, and Latency" (Bybit/Binance HFT). [4] Ren & Kang, Copy Trading and Price Efficiency (SSRN). [5] LuxAlgo, Backtesting limitations: slippage and liquidity.

---

## 2. Current Slippage Usage in the Codebase

### 2.1 Real Copy Trades (Feed → Place Order)

| Component | Value | Purpose |
|-----------|-------|---------|
| Default slippage | 3% (trade-card, settings) | Max tolerance for limit price |
| Limit price | `bestAsk * (1 + slippage)` (BUY) | Order sent to Polymarket |
| Fill outcome | Unknown until execution | Could be better or worse than limit |

### 2.2 FT (Forward Test) — Paper Simulation

| Component | Value | Purpose |
|-----------|-------|---------|
| Entry price | **Trader's price** (`trade.price`) | Assumed fill price |
| Slippage modeling | **None** | FT assumes we get the trader's exact price |

**Implication:** FT is **optimistic**—it does not model any execution cost or delay.

### 2.3 predict-trade / getPolyScore (ML Scoring)

| Component | Value | Purpose |
|-----------|-------|---------|
| user_slippage | 0.02 (FT/enrich-ml) | Passed to predict-trade |
| Interpretation | Treated as 0.02% max (bug: should be 2% = pass `2`) | Caps estimated slippage |
| Model | `impact * 0.3` clamped to [0.1%, userMax] | Market-impact heuristic |
| effective_price | `entryPrice * (1 + estimated_slippage)` | Used for edge calculation |

The model assumes **only unfavorable** slippage (always worse). No favorable case.

---

## 3. Time Factor: When Do We Execute vs. Trader?

### 3.1 FT Sync

- **Trigger:** Cron every 2 minutes (`*/2 * * * *` in vercel.json).
- **Flow:** Fetch trades from Polymarket API → filter → insert as ft_orders.
- **Delay:** 0–2 minutes from trader's execution to our "decision."
- **Price used:** Trader's fill price from the trade record (stale by 0–2 min).

### 3.2 Real Copy Trades

- **Trigger:** User sees trade in feed → expands card → fetches order book → submits.
- **Delay:** Typically seconds to 1–2 minutes.
- **Price used:** Fresh order book at submission time; limit derived from best ask/bid.

### 3.3 Polymarket Trade API Latency

- Trade records may lag by seconds to minutes.
- We don't have exact latency data; assume 30s–2min for FT.

---

## 4. Empirical Slippage (What We Could Measure)

### 4.1 Data We Have

For **real copy trades** in `orders`:

| Column | Meaning |
|--------|---------|
| `price_when_copied` | Trader's price (reference) |
| `amount_invested` | Actual USD spent |
| `filled_size` | Shares filled |
| Effective fill price | `amount_invested / filled_size` |

**Realized slippage vs. trader:**

```
slippage_pct = (effective_fill_price - price_when_copied) / price_when_copied * 100
```

- Positive = we paid more than the trader (unfavorable).
- Negative = we paid less (favorable).

### 4.2 Analysis Script: `scripts/analyze-slippage-copy-trades.sql`

Run against your Supabase DB:

```bash
psql $DATABASE_URL -f scripts/analyze-slippage-copy-trades.sql
```

Or paste sections into the Supabase SQL Editor.

**Part A** (slippage only) — uses `orders` only, always works:
- Aggregate stats: mean, median, std, percentiles
- Favorable vs. unfavorable split

**Part B** (slippage vs. time) — requires `trades` to contain leader (copied trader) fill events:
- Joins on `copied_trader_wallet` = `trades.wallet_address`, `market_id` = `condition_id`
- If your `trades` table is populated from Dome for **leader wallets**, you get delay (seconds from trader trade to our order) and slippage by delay bucket
- If `trades` only has our users' fills, Part B returns 0 rows — consider syncing leader trades for this analysis

### 4.3 Legacy Query (orders-only slippage)

```sql
-- Copy trades with sufficient data
SELECT 
  o.order_id,
  o.market_id,
  o.price_when_copied AS trader_price,
  o.amount_invested,
  o.filled_size,
  o.amount_invested / NULLIF(o.filled_size, 0) AS effective_fill_price,
  (o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100 AS slippage_pct
FROM orders o
WHERE o.copied_trade_id IS NOT NULL
  AND o.side = 'BUY'
  AND o.filled_size > 0
  AND o.price_when_copied > 0
  AND o.amount_invested > 0;
```

From this we can compute:

- Mean slippage (signed)
- Median
- Percentiles (e.g. 5th, 25th, 75th, 95th)
- % of trades with favorable vs. unfavorable slippage

### 4.4 External Benchmarks

- General trading: Slippage often 0.1%–1%+ depending on liquidity.
- Our ORDER_TIMEOUT_FIX: "Most orders still fill with <1% actual slippage."
- Copy-trading literature: Replication errors and latency typically hurt performance; no specific Polymarket numbers.

---

## 5. Proposed Slippage Model for Forward Tests

### 5.1 Design Principles

1. **Asymmetric:** Copying after the trader usually means we pay more (price often moves against us). Model a **bias toward unfavorable**.
2. **Time-dependent:** Longer delay → more price movement → more slippage variance.
3. **Volume-dependent:** Larger size vs. liquidity → more market impact.
4. **Stochastic:** Use a distribution, not a fixed percentage.

### 5.2 Phase 1: Simple Symmetric (Baseline)

```
effective_entry = trader_price * (1 + slippage_pct)
slippage_pct = 0.02  # 2% fixed, unfavorable
```

- Easy to implement.
- Conservative: always assume worse fill.
- No time or size dependence.

### 5.3 Phase 2: Time- and Volume-Adjusted

```
base_slippage = 0.02                    # 2% base
time_factor = 0.005 * (delay_minutes)   # +0.5% per minute of delay
volume_impact = min(0.03, trade_size_usd / max(daily_volume_usd, 1000) * 0.5)

expected_slippage = base_slippage + time_factor + volume_impact
effective_entry = trader_price * (1 + expected_slippage)
```

- **Delay:** FT sync ≈ 0–2 min → add 0–1%.
- **Volume impact:** Larger trades in thin markets get higher slippage.

### 5.4 Phase 3: Stochastic (Best Fidelity)

```
# Draw from distribution
slippage_pct = mean_slippage + std_slippage * randn()
# Clamp to reasonable bounds
slippage_pct = clamp(slippage_pct, -0.02, 0.06)  # Can be -2% to +6%
effective_entry = trader_price * (1 + slippage_pct)
```

- Use **empirical** mean and std from the analysis query above.
- Allows favorable slippage (negative) and fat tails.
- Until we have data, use a placeholder: mean=2%, std=2%, clamp [-2%, 6%].

### 5.5 Phase 4: Order Book (Future)

- Use historical order book snapshots (e.g. Dome API).
- Simulate fill given size and book depth.
- Highest fidelity, highest implementation cost.

---

## 6. Recommended Slippage Rules for Tests

### 6.1 Forward Test (FT) Today

- **Current:** `entry_price = trader_price` (no slippage).
- **Recommendation:** Add Phase 1 or 2:
  - Phase 1: `entry_price = trader_price * 1.02` (2% worse).
  - Phase 2: Use sync cadence (e.g. 1 min average delay) + base 2% + optional volume term.

### 6.2 Backtests

- Use the same model as FT for consistency.
- Prefer Phase 2 (time + volume) once implemented.
- Document: "We assume 2% base + 0.5%/min delay + volume impact."

### 6.3 predict-trade / ML Scoring

- Fix `user_slippage` convention: pass `2` for 2%, not `0.02`.
- Consider separate models for "optimistic" vs. "conservative" edge (with/without slippage).

---

## 7. Action Items

| Priority | Task |
|----------|------|
| P0 | Run slippage analysis query on `orders` to get empirical mean/std |
| P1 | Add Phase 1 slippage (2% unfavorable) to FT sync |
| P2 | Fix user_slippage in predict-trade (pass 2 for 2%) |
| P3 | Implement Phase 2 (time + volume) for FT |
| P4 | Add slippage config to FT wallets (e.g. `slippage_model`, `slippage_pct`) |

---

## 8. References

- `docs/orders-clob.md` — Order types
- `docs/archive/ORDER_TIMEOUT_FIX.md` — 3% default, fill behavior
- `BACKTESTING_REQUIREMENTS.md` — Slippage model phases
- `supabase/functions/predict-trade/index.ts` — Current slippage heuristic
