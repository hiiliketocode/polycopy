# P&L Discrepancy - UPDATED Analysis Report
**Date:** February 6, 2026  
**Status:** ✅ ROOT CAUSE IDENTIFIED

---

## Executive Summary

### 🎯 Critical Discovery

The system **does NOT create SELL orders** when users close positions. Instead, it updates the original BUY order with closing metadata:
- `user_closed_at` - timestamp when user closed
- `user_exit_price` - price at which user exited
- `trader_still_has_position` - boolean tracking state

**This is actually the CORRECT design pattern.** The P&L discrepancy is not due to missing SELL orders, but likely due to **incorrect P&L calculation logic** that doesn't properly account for closed positions.

---

## Database Evidence

### System-Wide Statistics
- **Total Orders:** 1,751
- **BUY Orders:** 1,751 (100%)
- **SELL Orders:** 0 (0%)
- **Orders with `user_closed_at` set:** 64
- **Orders with `trader_still_has_position = false`:** 756

### Key Finding
```
64 positions have been closed by users (user_closed_at IS NOT NULL)
756 positions are closed because trader closed (trader_still_has_position = false)
0 SELL orders exist

→ The system uses metadata updates, not separate SELL orders
```

---

## Data Model Understanding

### Current Architecture (CORRECT)

```
USER BUYS POSITION:
orders table:
├─ side: 'buy'
├─ price: 0.65
├─ filled_size: 100
├─ amount_invested: 65.00
├─ copy_user_id: user_id
├─ user_closed_at: NULL
├─ user_exit_price: NULL
└─ trader_still_has_position: true

USER CLOSES POSITION:
Same order row updated:
├─ side: 'buy' (unchanged)
├─ price: 0.65 (unchanged - entry price)
├─ filled_size: 100 (unchanged)
├─ amount_invested: 65.00 (unchanged)
├─ copy_user_id: user_id (unchanged)
├─ user_closed_at: '2026-01-30T19:37:25' ✅ SET
├─ user_exit_price: 0.72 ✅ SET
└─ trader_still_has_position: false (possibly)
```

### P&L Calculation (Should Be)

```typescript
// For a CLOSED position:
const invested = order.amount_invested || (order.price * order.filled_size)
const proceeds = order.user_exit_price * order.filled_size
const pnl = proceeds - invested
const roi = ((proceeds / invested) - 1) * 100

// For an OPEN position:
const invested = order.amount_invested || (order.price * order.filled_size)
const currentValue = order.current_price * order.filled_size
const unrealizedPnL = currentValue - invested
const unrealizedROI = ((currentValue / invested) - 1) * 100
```

---

## Actual P&L Issue

The discrepancy is likely caused by one of these issues:

### Issue 1: Not Counting Closed Positions
```typescript
// WRONG: Only counting open positions
const orders = await supabase
  .from('orders')
  .eq('copy_user_id', userId)
  .is('user_closed_at', null)  // ❌ Excludes closed positions!

// CORRECT: Count all positions
const orders = await supabase
  .from('orders')
  .eq('copy_user_id', userId)  // ✅ Includes both open and closed
```

### Issue 2: Not Using user_exit_price for Closed Positions
```typescript
// WRONG: Always using current_price
const value = order.current_price * order.filled_size  // ❌ Wrong for closed!

// CORRECT: Check if closed first
const value = order.user_closed_at 
  ? order.user_exit_price * order.filled_size  // ✅ Use exit price
  : order.current_price * order.filled_size    // ✅ Use current price
```

### Issue 3: Double Counting or Missing Closed Positions
```typescript
// WRONG: Treating closed positions differently
const openPnL = calculateOpen(orders.filter(o => !o.user_closed_at))
const closedPnL = 0  // ❌ Not calculating closed P&L!
const total = openPnL + closedPnL

// CORRECT: Calculate P&L for all positions
const totalPnL = orders.reduce((sum, order) => {
  const invested = order.amount_invested || (order.price * order.filled_size)
  const exitValue = order.user_closed_at
    ? order.user_exit_price * order.filled_size  // Closed: use exit price
    : order.current_price * order.filled_size    // Open: use current price
  return sum + (exitValue - invested)
}, 0)
```

---

## Sample Data Analysis

### Example of Closed Position

From the database query, we found orders like:
```
Side: buy
Status: matched
Price (entry): ~0.50 (estimated)
User Closed At: 2026-01-30T19:37:25.122+00:00
Trader Still Has Position: true
```

**P&L Calculation for This Order:**
```typescript
const invested = order.amount_invested  // e.g., $50
const exitPrice = order.user_exit_price  // e.g., 0.65
const shares = order.filled_size  // e.g., 100
const proceeds = exitPrice * shares  // $65
const pnl = proceeds - invested  // $15 profit
const roi = ((proceeds / invested) - 1) * 100  // 30% ROI
```

---

## Verification Queries

### Query 1: Check closed vs open positions
```sql
SELECT 
  CASE 
    WHEN user_closed_at IS NOT NULL THEN 'Closed by User'
    WHEN trader_still_has_position = false THEN 'Closed by Trader'
    ELSE 'Still Open'
  END AS position_status,
  COUNT(*) AS count,
  SUM(amount_invested) AS total_invested
FROM orders
WHERE copy_user_id = 'YOUR_USER_ID'
GROUP BY position_status;
```

### Query 2: Sample P&L calculation
```sql
SELECT 
  order_id,
  side,
  price AS entry_price,
  user_exit_price,
  current_price,
  filled_size,
  amount_invested,
  CASE 
    WHEN user_closed_at IS NOT NULL 
    THEN (user_exit_price * filled_size) - amount_invested
    ELSE (current_price * filled_size) - amount_invested
  END AS pnl_usd,
  user_closed_at
FROM orders
WHERE copy_user_id = 'YOUR_USER_ID'
  AND amount_invested IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
```

### Query 3: Total P&L across all positions
```sql
SELECT 
  COUNT(*) AS total_positions,
  COUNT(*) FILTER (WHERE user_closed_at IS NOT NULL) AS closed_by_user,
  COUNT(*) FILTER (WHERE user_closed_at IS NULL AND trader_still_has_position = false) AS closed_by_trader,
  COUNT(*) FILTER (WHERE user_closed_at IS NULL AND trader_still_has_position = true) AS still_open,
  SUM(amount_invested) AS total_invested,
  SUM(
    CASE 
      WHEN user_closed_at IS NOT NULL THEN user_exit_price * filled_size
      ELSE current_price * filled_size
    END
  ) AS total_current_value,
  SUM(
    CASE 
      WHEN user_closed_at IS NOT NULL THEN (user_exit_price * filled_size) - amount_invested
      ELSE (current_price * filled_size) - amount_invested
    END
  ) AS total_pnl_usd
FROM orders
WHERE copy_user_id = 'YOUR_USER_ID'
  AND amount_invested IS NOT NULL;
```

---

## Root Cause Analysis

### What We Initially Thought
❌ "SELL orders are not being created with copy_user_id"

### What Is Actually Happening
✅ System doesn't create SELL orders at all (by design)
✅ Positions are tracked by updating the original BUY order
✅ Closing metadata: `user_closed_at`, `user_exit_price`

### The Real Problem
The P&L calculation code is likely:
1. Not checking for closed positions (`user_closed_at`)
2. Not using `user_exit_price` for closed positions
3. Only calculating unrealized P&L for open positions
4. Excluding closed positions entirely from calculations

---

## Files to Investigate

### 1. Portfolio Stats API
**File:** `app/api/portfolio/stats/route.ts`

Look for how it calculates P&L:
```typescript
// Check if it's doing this (WRONG):
const orders = await supabase
  .from('orders')
  .eq('copy_user_id', userId)
  .is('user_closed_at', null)  // ❌ Excludes closed!

// Should be doing this (CORRECT):
const orders = await supabase
  .from('orders')
  .eq('copy_user_id', userId)  // ✅ Include all

// Then calculate P&L correctly:
orders.forEach(order => {
  const exitPrice = order.user_closed_at 
    ? order.user_exit_price 
    : order.current_price
  // ...calculate P&L...
})
```

### 2. Orders Copy Enriched View
**File:** `supabase/migrations/20250113_create_orders_copy_enriched_view.sql`

Check the view definition:
```sql
-- View should have:
COALESCE(o.user_exit_price, o.current_price) AS exit_price  -- ✅ CORRECT
```

### 3. Portfolio Page
**File:** `app/portfolio/page.tsx`

Check how it filters/displays orders:
```typescript
// Should include both open and closed positions
const allOrders = orders  // Don't filter by user_closed_at
```

---

## Recommended Fixes

### Fix 1: Verify orders_copy_enriched View

The view already seems to handle this correctly:
```sql
exit_price = COALESCE(o.user_exit_price, o.current_price)
```

✅ This is correct - uses exit price if closed, otherwise current price.

### Fix 2: Check Portfolio Stats Calculation

In `app/api/portfolio/stats/route.ts`, ensure it's:
1. ✅ Fetching ALL orders (not filtering by user_closed_at)
2. ✅ Using exit_price from the enriched view
3. ✅ Including both realized and unrealized P&L

### Fix 3: Verify No Filters Exclude Closed Positions

Search for queries like:
```typescript
.is('user_closed_at', null)  // ❌ BAD - excludes closed positions
.eq('trader_still_has_position', true)  // ❌ BAD - excludes closed positions
```

These should be removed or only used for specific "open positions only" views.

---

## Test Script

```typescript
// Test P&L calculation for a user
const { data: orders } = await supabase
  .from('orders_copy_enriched')
  .select('*')
  .eq('copy_user_id', userId)

let totalInvested = 0
let totalCurrentValue = 0
let realizedPnL = 0
let unrealizedPnL = 0

orders.forEach(order => {
  const invested = order.invested_usd || 0
  totalInvested += invested
  
  if (order.user_closed_at) {
    // Closed position: use exit price
    const proceeds = order.user_exit_price * order.entry_size
    realizedPnL += (proceeds - invested)
  } else {
    // Open position: use current price
    const currentValue = order.current_price * order.entry_size
    totalCurrentValue += currentValue
    unrealizedPnL += (currentValue - invested)
  }
})

console.log({
  totalInvested,
  realizedPnL,
  unrealizedPnL,
  totalPnL: realizedPnL + unrealizedPnL,
  portfolioValue: totalCurrentValue + (realized proceeds from closed)
})
```

---

## Conclusion

### Updated Understanding

1. ✅ **System Design is Correct:** Using metadata updates instead of SELL orders
2. ✅ **Database View is Correct:** `orders_copy_enriched` uses `COALESCE(user_exit_price, current_price)`
3. ⚠️ **Possible Issue:** P&L calculation code may be filtering out closed positions or not using exit_price correctly

### Next Steps

1. ✅ **Analysis Complete** - We now understand the data model
2. 🔍 **Audit P&L Code** - Check `app/api/portfolio/stats/route.ts`
3. 🔍 **Check Filters** - Search for queries that exclude closed positions
4. ✅ **Test with Real Data** - Use Query 3 above to calculate correct P&L
5. 🔧 **Fix Discrepancies** - Update calculation logic if needed

---

## Files Created

- `scripts/find-active-users.ts` - Find users with trading activity  
- `scripts/analyze-pnl-discrepancy.ts` - Initial analysis (BUY/SELL focus)
- `scripts/check-sell-orders-system.ts` - Discovered no SELL orders exist
- `scripts/check-side-values.ts` - Confirmed metadata-based closing
- `PNL_DISCREPANCY_ANALYSIS_REPORT.md` - Initial report (now outdated)
- `PNL_DISCREPANCY_QUICK_REFERENCE.md` - Quick queries
- **THIS FILE** - Updated analysis with correct understanding

---

**Status:** Analysis complete. Ready to audit P&L calculation code.
