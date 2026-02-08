# PnL Audit Report

**Date:** February 2026  
**Scope:** All PnL calculations across FT (Forward Testing), Portfolio/Copy Trading, and Orders

---

## Executive Summary

| System | Status | Critical Issues |
|--------|--------|-----------------|
| **FT Resolve (WON/LOST)** | ❌ Bug | BUY WON formula understates profit by ~2–3x |
| **FT Unrealized** | ✅ Correct | Formula and price source verified |
| **Portfolio Stats** | ✅ Correct | FIFO, resolution price priority, user_exit_price |
| **Orders / OrdersScreen** | ✅ Correct | Delta × size (shares) |
| **FT Wallets List** | ✅ Correct | Same unrealized calc as detail page |

---

## 1. FT (Forward Testing) PnL

### 1.1 Resolved Orders (WON/LOST) — `/api/ft/resolve`

**Price source:** Polymarket gamma API (`outcomePrices` after resolution = 0 or 1)  
**Formula for BUY positions:**

| Outcome | Current Formula | Correct Formula | Issue |
|---------|-----------------|-----------------|-------|
| **BUY WON** | `size * (1 - entry_price)` | `size * (1 - entry_price) / entry_price` | **WRONG** — understates profit |
| **BUY LOST** | `-size` | `-size` | ✅ Correct |
| **SELL WON** | `size * entry_price` | Depends on size semantics | Needs verification |
| **SELL LOST** | `-size * (1 - entry_price)` | Depends on size semantics | Needs verification |

**Example (BUY WON):**
- Invest $8 at 40¢ → 20 shares
- Win → payout $20, profit $12
- Current: `8 * 0.6 = 4.8` ❌  
- Correct: `8 * 0.6 / 0.4 = 12` ✅  

**Note:** FT `size` = dollars invested; `entry_price` = price per share (0–1). Shares = size / entry_price.  
Winning payout = shares × $1 = size / entry_price. Profit = size/entry_price − size = size(1/entry_price − 1).

### 1.2 Unrealized PnL — `/api/ft/wallets/[id]`

**Price source:** `markets` table → Polymarket price API (outcomePrices by outcome)  
**Formula:**
```
shares = size / entry_price
currentValue = shares * currentPrice
unrealizedPnl = currentValue - size
```
✅ **Correct** for size in dollars.

**Price handling:**
- Uses `findOutcomePrice(conditionId, tokenLabel)` with outcome label matching
- Handles YES/NO fallback for binary markets
- Multi-outcome (e.g. "Houston Cougars") requires exact label match

### 1.3 Awaiting-Resolution Display

When event ended but not resolved (mid-range price): Value and P&L show "Pending"; Current column shows last price. ✅ Correct.

---

## 2. Portfolio / Copy Trading PnL

### 2.1 Portfolio Stats — `/api/portfolio/stats`

**Price sources (priority):**
1. Resolved: `resolved_outcome` / `winning_side` → 0 or 1
2. Open: `markets.outcome_prices` or Polymarket API
3. Manual close: `user_exit_price`

**Logic:**
- FIFO cost basis for buys/sells
- `user_closed_at` + `user_exit_price` treated as virtual SELL
- Resolved positions: `inferResolutionPrice()` → 0 or 1 from outcome
- Polymarket `polymarket_realized_pnl` used when available

**Formulas:**
- Realized (FIFO): `matchProceeds - matchCost` per matched lot
- Resolved: `remainingSize * resolutionPrice - remainingCost`
- Unrealized: `remainingSize * currentPrice - remainingCost`

✅ **Correct.** Resolution price correctly prioritized over stale `current_price`.

### 2.2 OrdersScreen `computePositionPnl`

**Assumes:** `position.size` = shares (contracts), not dollars  
**Formula:** `(currentPrice - entryPrice) * size` for LONG; `(entryPrice - currentPrice) * size` for SHORT  
✅ **Correct** for Polymarket positions where size = shares.

### 2.3 Orders API `calculatePnlUsd`

Same logic as OrdersScreen. ✅ Correct.

---

## 3. Price Capture Quality

| System | Source | Staleness | Resolved Handling |
|--------|--------|-----------|-------------------|
| FT | `markets` + Polymarket API | 5 min stale threshold | N/A (open only) |
| Portfolio | `markets` + Polymarket API | 5 min | 0/1 from outcome |
| Orders | Order `current_price` | Per-order | Uses resolution when available |

**Resolved markets:** Portfolio stats correctly skip refreshing prices and use 0/1 from `resolved_outcome`.  
**FT:** Does not fetch prices for resolved orders (only OPEN). ✅

---

## 4. Recommendations

1. ~~**Fix FT resolve BUY WON formula**~~ — **FIXED** in resolve route + migration `20260207_fix_ft_buy_won_pnl.sql`.
2. ~~**Handle object outcomes in FT `findOutcomePrice`**~~ — **FIXED** in wallets/[id] and wallets routes.
3. **Resolved FT positions:** Migration backfills existing WON orders with correct pnl.

---

## 5. Files Reviewed

- `app/api/ft/resolve/route.ts` — resolved PnL (BUG)
- `app/api/ft/wallets/[id]/route.ts` — unrealized PnL
- `app/api/ft/wallets/route.ts` — wallet list stats
- `app/api/portfolio/stats/route.ts` — portfolio PnL
- `app/api/portfolio/realized-pnl/route.ts` — realized PnL history
- `app/api/orders/route.ts` — `calculatePnlUsd`
- `components/orders/OrdersScreen.tsx` — `computePositionPnl`
- `supabase/migrations/20260113_fix_pnl_for_resolved_trades.sql` — orders_copy_enriched exit_price
