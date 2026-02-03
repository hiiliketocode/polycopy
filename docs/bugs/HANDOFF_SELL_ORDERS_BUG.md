# Handoff: SELL Orders Appearing as Open Positions Bug

**Date:** January 29, 2026  
**Priority:** HIGH - Affects portfolio accuracy  
**Reported by:** Brad Michelson  
**Status:** In Progress - Multiple fixes attempted, issue persists

---

## Problem Summary

SELL orders are appearing in the "Open" tab of the portfolio page as if they are new open positions. This is incorrect - SELL orders represent position closures, not new positions.

**Expected Behavior:**
- SELL orders should NOT appear in the Open/All/Closed/Resolved tabs
- SELL orders SHOULD appear in the Activity/History tab for full trade visibility

**Actual Behavior:**
- Multiple "Israel strikes Iran by March 31, 2026?" SELL orders are showing in the Open tab
- These appear to be quick trades (from `/api/orders` endpoint) with `side: "SELL"`

---

## Key Context

### The Issue Origin
1. User attempted to close a position using the "Sell" button in the portfolio UI
2. The sell button was initially creating NEW positions (opening shorts/longs) instead of closing positions - **this was fixed in commit `d441d711`**
3. However, the SELL orders that were created are now stuck appearing as "open positions" in the UI

### Screenshot Evidence
See screenshot showing multiple "Israel strikes Iran" positions all marked as "Open" - these have `"side": "SELL"` in their raw data.

---

## Technical Details

### Data Architecture
There are TWO separate trade data sources that get merged in the frontend:

1. **Manual/Copied Trades** (`copiedTrades`)
   - Source: `/api/portfolio/trades` endpoint
   - Backed by: `orders_copy_enriched` PostgreSQL view
   - Stored in: `orders` table
   - Has a `side` column at the database level

2. **Quick Trades** (`quickTrades`)
   - Source: `/api/orders` endpoint  
   - Backed by: Polymarket CLOB API (fetches user's wallet orders directly)
   - NOT stored in Supabase database
   - `side` field only available in the raw JSON response from Polymarket

These are combined into `allUnifiedTrades` in `app/profile/page.tsx` (line ~2431)

### Database Investigation Results

**Query 1 - Check orders table:**
```sql
SELECT order_id, side, created_at, user_closed_at, filled_size
FROM orders
WHERE copy_user_id = '5478cb0a-c638-4b40-8afc-bf44eb9092db'
  AND copied_market_title ILIKE '%Israel strikes Iran%'
ORDER BY created_at DESC;
```

**Result:** Only ONE "Israel strikes Iran" order exists with `side='buy'` (already closed). The SELL orders are NOT in the database.

**Conclusion:** The problematic SELL orders are coming from the quick trades system (Polymarket CLOB API), not from the database.

---

## Fixes Attempted

### Fix 1: Filter `copiedTrades` (Commit `3f9516e7`)
**What:** Added filter to exclude `side='sell'` from `copiedTrades`  
**Location:** `app/profile/page.tsx` line ~1507  
**Result:** ❌ Didn't work - copiedTrades is only manual trades, not quick trades

### Fix 2: Allow SELL in Activity filter (Commit `2a67aa99`)
**What:** Modified filter to allow SELL orders in 'history' filter  
**Location:** `app/profile/page.tsx` lines ~1507 and ~2510  
**Result:** ⚠️ Partial - Fixed Activity tab logic, but didn't solve Open tab issue

### Fix 3: Filter quick trades SELL orders (Commit `b5cf3051`)
**What:** Added filter in `allUnifiedTrades` to exclude SELL quick trades  
**Location:** `app/profile/page.tsx` line ~2436  
**Code:**
```typescript
.filter(order => {
  // Exclude SELL orders from quick trades in all views except 'history'
  if (tradeFilter !== 'history' && order.side?.toLowerCase() === 'sell') {
    return false;
  }
  return true;
})
```
**Result:** ❌ Still not working - SELL orders still appear in Open tab

---

## Current Code State

### Relevant Files

1. **`app/profile/page.tsx`** (PRIMARY FILE)
   - Line ~304: `tradeFilter` state definition
   - Line ~701-742: Quick trades fetch logic (`/api/orders`)
   - Line ~1507-1518: `copiedTrades` filter logic
   - Line ~2431-2467: `allUnifiedTrades` memo (combines manual + quick trades)
   - Line ~2477-2520: `filteredUnifiedTrades` memo (applies tab filters)
   - Line ~2622-2653: `handleSellTrade` function

2. **`app/api/orders/route.ts`**
   - Returns quick trades from Polymarket CLOB API
   - `side` field is included in the response

3. **`app/api/portfolio/trades/route.ts`**
   - Returns manual/copied trades from `orders_copy_enriched` view
   - Line 139: Selects `side` field from database

---

## Debugging Steps to Try Next

### Step 1: Verify the Filter is Being Applied
Add console logging to see if SELL orders are being filtered:

```typescript
// In allUnifiedTrades memo, around line 2436
.filter(order => {
  const isSell = order.side?.toLowerCase() === 'sell';
  if (isSell) {
    console.log('🔍 Filtering SELL order:', {
      orderId: order.orderId,
      market: order.marketTitle,
      side: order.side,
      tradeFilter,
      willExclude: tradeFilter !== 'history'
    });
  }
  if (tradeFilter !== 'history' && isSell) {
    return false;
  }
  return true;
})
```

Check browser console to see if SELL orders are being logged and filtered.

### Step 2: Check if SELL Orders Have a Different Side Format
The `side` field might not be lowercase 'sell'. Check the actual values:

```typescript
// Before filtering, log all quick trade sides
console.log('All quick trade sides:', quickTrades.map(o => ({
  id: o.orderId,
  side: o.side,
  sideType: typeof o.side,
  market: o.marketTitle?.substring(0, 30)
})));
```

### Step 3: Check OrderRow Type Definition
Verify that `OrderRow` interface includes `side` property. Location: `lib/orders/types.ts` or inline in `app/profile/page.tsx`.

### Step 4: Verify `isDisplayableQuickTrade` Function
This function (not shown in handoff) might be excluding SELL orders before our filter even runs. Check its implementation.

### Step 5: Check if Orders Are Being Re-Added
The `allUnifiedTrades` memo depends on `[copiedTrades, quickTrades, openPositionByKey, tradeFilter]`. If any of these change, it recalculates. Check if:
- `openPositionByKey` includes these SELL orders
- There's a race condition where filtered orders are re-added

---

## Alternative Approaches to Consider

### Option 1: Filter at the API Level
Instead of filtering in the frontend, modify `/api/orders/route.ts` to exclude SELL orders from the response entirely (except when explicitly requested).

**Pros:** Single source of truth, cleaner  
**Cons:** Might break Activity tab if not handled carefully

### Option 2: Use a Status Override
Mark SELL orders with a special status like `'closing'` or `'sold'` that's automatically excluded from Open tab filters.

### Option 3: Two-Phase Filtering
1. First phase: In `allUnifiedTrades`, mark SELL orders with metadata
2. Second phase: In `filteredUnifiedTrades`, exclude based on that metadata

---

## SQL Queries for Investigation

```sql
-- Check all orders for the user with their side
SELECT 
  order_id,
  side,
  copied_market_title,
  trade_method,
  status,
  filled_size,
  created_at
FROM orders
WHERE copy_user_id = '5478cb0a-c638-4b40-8afc-bf44eb9092db'
ORDER BY created_at DESC
LIMIT 50;
```

```sql
-- Check for any SELL orders in database
SELECT COUNT(*), side
FROM orders
WHERE copy_user_id = '5478cb0a-c638-4b40-8afc-bf44eb9092db'
  AND side IS NOT NULL
GROUP BY side;
```

---

## Related Issues

### Issue 1: Sell Button Creating New Positions (FIXED)
- **Commits:** `d441d711`, `3f9516e7`  
- **Fix:** Corrected `position.side` derivation in `handleSellTrade` function
- **Status:** ✅ Resolved

### Issue 2: Seahawks Position Not Showing
- **Status:** Separate issue, may be related to filtering logic
- **Last Update:** Position has `user_closed_at` set, investigating auto-close logic

---

## Important Notes

1. **Don't delete SELL orders** - they're legitimate trade history and should appear in Activity tab
2. **The `tradeFilter` dependency** - Added in commit `b5cf3051` but verify it's triggering memo recalculation correctly
3. **Hard refresh required** - After any fix, users need to hard refresh (Cmd+Shift+R) to clear cached JavaScript
4. **Check Vercel deployment** - Ensure latest commit is actually deployed before testing

---

## Test Plan

Once a fix is implemented:

1. ✅ **Open Tab:** SELL orders should NOT appear
2. ✅ **Activity Tab:** SELL orders SHOULD appear
3. ✅ **Database Integrity:** No unintended data modifications
4. ✅ **Sell Button:** Still creates proper SELL orders that close positions
5. ✅ **Position Calculations:** Net positions should be accurate

---

## Contact & Context

- **User UUID:** `5478cb0a-c638-4b40-8afc-bf44eb9092db`
- **Test Market:** "Israel strikes Iran by March 31, 2026?"
- **Environment:** Production (polycopy.app) and Local
- **Browser:** Chrome (latest)
- **Last Working State:** Unknown - issue may have existed since quick trades were implemented

---

## Quick Start for Cofounder

1. Pull latest: `git pull origin main` (commit: `b5cf3051`)
2. Run local: `npm run dev`
3. Navigate to: `http://localhost:3000/profile` (sign in as Brad)
4. Check: Browser console for any errors or our debug logs
5. Add console logs as described in "Step 1" above
6. Report: What you see in the console when viewing the Open tab

Good luck! 🚀
