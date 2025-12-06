# ROI Bug Fixes - Data Correction & Resolution Detection

## Overview

Fixed two critical bugs affecting ROI calculation and market resolution detection:

1. ✅ **Profile Page**: Recalculate ROI for user-closed trades on load (fixes old wrong data)
2. ✅ **Status API**: Enhanced resolution detection to use current trade price

---

## Bug 1: User-Closed Trade Has Wrong ROI in Database

### Problem

Database shows:
- `price_when_copied`: 0.51 ✅
- `user_exit_price`: 0.53 ✅  
- `roi`: -99.9 ❌ (should be +3.9%)

**Root Cause:** The wrong ROI was saved BEFORE we added skip logic. The status API overwrote user_exit_price with current market price (0.0005), then calculated ROI as -99.9%.

### Solution Applied ✅

**Recalculate ROI for user-closed trades when loading from database.**

**File:** `app/profile/page.tsx`
**Location:** After loading trades, before status refresh

```typescript
// Recalculate ROI for user-closed trades (fixes old wrong ROIs saved before skip logic)
const tradesWithCorrectRoi = trades.map(trade => {
  if (trade.user_closed_at && trade.user_exit_price && trade.price_when_copied) {
    const correctRoi = ((trade.user_exit_price - trade.price_when_copied) / trade.price_when_copied) * 100;
    
    // Only log and update if ROI is different
    if (Math.abs(correctRoi - (trade.roi || 0)) > 0.1) {
      console.log(`🔧 Recalculated ROI for user-closed trade: ${trade.market_title?.substring(0, 30)}`, {
        entry: trade.price_when_copied,
        exit: trade.user_exit_price,
        oldRoi: trade.roi,
        newRoi: parseFloat(correctRoi.toFixed(2))
      });
    }
    
    return { ...trade, roi: parseFloat(correctRoi.toFixed(2)) };
  }
  return trade;
});

// Update trades with corrected ROIs
trades = tradesWithCorrectRoi;
```

### How It Works

1. **Load trades from database** (includes wrong ROI: -99.9)
2. **Recalculate ROI** for any trade with `user_closed_at`:
   - Uses `user_exit_price` (0.53) and `price_when_copied` (0.51)
   - Calculates: `((0.53 - 0.51) / 0.51) * 100 = 3.92%`
   - Updates the trade object in memory
3. **Display shows correct ROI** (+3.9%)

**Note:** This only updates the in-memory trade object, not the database. The database will be corrected next time the user marks a trade as closed (the save logic is already correct).

### Console Output

**If trade has wrong ROI:**
```javascript
📊 Loaded 5 copied trades from database

🔧 Recalculated ROI for user-closed trade: Spread: Magic (-5.5) {
  entry: 0.51,
  exit: 0.53,
  oldRoi: -99.9,    // ❌ Wrong value from database
  newRoi: 3.92      // ✅ Corrected!
}

⏭️ Skipping status refresh for user-closed trade: Spread: Magic (-5.5) (locked at user_exit_price: 0.53)
```

**If trade already has correct ROI:**
```javascript
📊 Loaded 5 copied trades from database
// No recalculation message (ROI already correct)
⏭️ Skipping status refresh for user-closed trade: Market Name (locked at user_exit_price: 0.53)
```

### Why This Approach

**Option A: Fix in database with SQL**
```sql
UPDATE copied_trades
SET roi = ((user_exit_price - price_when_copied) / price_when_copied) * 100
WHERE user_closed_at IS NOT NULL;
```
- ✅ Permanent fix
- ❌ Requires manual SQL execution
- ❌ One-time migration

**Option B: Recalculate on load (chosen)** ✅
```typescript
// Fix in code when loading
const correctRoi = ((user_exit_price - price_when_copied) / price_when_copied) * 100;
```
- ✅ Automatic fix for all users
- ✅ No SQL migration needed
- ✅ Self-healing
- ⚠️ Recalculates on every page load (negligible performance impact)

---

## Bug 2: Status API Not Detecting Market Resolution

### Problem

Console shows:
- `currentPrice: 1` (market resolved - outcome won)
- `newStatus: { marketResolved: false }` ❌

Markets with price at $0 or $1 should be detected as resolved.

### Investigation

The existing resolution detection (line 282) checks the MARKET's outcome prices:

```typescript
// Method 3: Check if prices show clear resolution
if (maxPrice >= 0.99 && minPrice <= 0.01) {
  isActuallyResolved = true;
}
```

**This works if:**
- Gamma API returns the market's full outcome prices array
- Both outcomes are included: [1.0, 0.0] or [0.0005, 0.9995]

**But fails if:**
- We only fetch price for THIS SPECIFIC TRADE's outcome
- We don't have the other outcome's price
- Example: Trade outcome "Yes" has price 1.0, but we don't know "No" price

### Solution Applied ✅

**Added additional resolution check using the current trade's price.**

**File:** `app/api/copied-trades/[id]/status/route.ts`
**Location:** After ROI calculation, before database update

```typescript
// ADDITIONAL: Check if current price indicates resolution
// If this trade's outcome is at $0 or $1, the market is likely resolved
if (!marketResolved && currentPrice !== null) {
  if (currentPrice >= 0.99 || currentPrice <= 0.01) {
    marketResolved = true;
    
    // Determine if this outcome won or lost
    if (currentPrice >= 0.99) {
      resolvedOutcome = trade.outcome; // This outcome won
    }
    
    console.log('🔍 Resolution detected via current price:', {
      tradeId: id.substring(0, 10),
      market: trade.market_title?.substring(0, 30),
      outcome: trade.outcome,
      currentPrice,
      isResolved: currentPrice >= 0.99 || currentPrice <= 0.01,
      marketResolved
    });
  }
}
```

### How It Works

**Two resolution detection methods now:**

**Method 1 (Existing):** Check market's full outcome prices
```typescript
// Checks all outcomes in the market
const maxPrice = Math.max(...priceNumbers); // e.g., 1.0
const minPrice = Math.min(...priceNumbers); // e.g., 0.0005

if (maxPrice >= 0.99 && minPrice <= 0.01) {
  marketResolved = true; // ✅ Market resolved
}
```

**Method 2 (New):** Check this trade's current price
```typescript
// Checks only this trade's outcome price
if (currentPrice >= 0.99 || currentPrice <= 0.01) {
  marketResolved = true; // ✅ Market resolved
}
```

**Why both methods?**
- **Method 1**: More reliable (checks both outcomes), but requires full market data
- **Method 2**: Works with partial data (just this trade's price), catches more cases

### Resolution Logic

**Scenario A: Trade Won (Price at $1)**
```javascript
trade.outcome: "Yes"
currentPrice: 1.0

// Method 2 triggers:
currentPrice >= 0.99  // true
marketResolved: true
resolvedOutcome: "Yes"
```

**Scenario B: Trade Lost (Price at $0)**
```javascript
trade.outcome: "Yes"
currentPrice: 0.0005

// Method 2 triggers:
currentPrice <= 0.01  // true
marketResolved: true
resolvedOutcome: undefined (this outcome lost)
```

**Scenario C: Market Not Resolved (Heavy Favorite)**
```javascript
trade.outcome: "Yes"
currentPrice: 0.85

// Neither method triggers:
currentPrice >= 0.99  // false
currentPrice <= 0.01  // false
marketResolved: false  // Still open
```

### Console Output

**Before Fix:**
```javascript
📊 Trade abc123... status refreshed: {
  market: 'UNLV vs Boise State',
  currentPrice: 1,
  newStatus: {
    marketResolved: false  // ❌ Wrong!
  }
}
```

**After Fix:**
```javascript
📊 Trade abc123... status refreshed: {
  market: 'UNLV vs Boise State',
  currentPrice: 1,
  newStatus: {
    marketResolved: true,   // ✅ Correct!
    resolvedOutcome: 'Yes'
  }
}

🔍 Resolution detected via current price: {
  tradeId: 'abc123...',
  market: 'UNLV vs Boise State',
  outcome: 'Yes',
  currentPrice: 1,
  isResolved: true,
  marketResolved: true
}
```

### Why This Fix Works

**Problem:** Only Method 1 existed, which requires full market data:
```typescript
// Needs both outcomes:
outcomes: ['Yes', 'No']
prices: [1.0, 0.0005]

// Then checks:
maxPrice (1.0) >= 0.99  ✅
minPrice (0.0005) <= 0.01  ✅
```

**But if Gamma API only returns this trade's price:**
```typescript
// Only has one outcome:
currentPrice: 1.0  // Just for "Yes"

// Method 1 can't run (no price array)
// Method 2 DOES run:
currentPrice >= 0.99  ✅
```

**Result:** More markets detected as resolved!

---

## Testing

### Test Bug 1 (Profile Page ROI Correction)

1. Go to profile page
2. Open browser console
3. Look for recalculation log:
   ```javascript
   🔧 Recalculated ROI for user-closed trade: Spread: Magic (-5.5) {
     entry: 0.51,
     exit: 0.53,
     oldRoi: -99.9,
     newRoi: 3.92
   }
   ```
4. Verify ROI displays as **+3.9%** (not -99.9%)

**Expected behavior:**
- Wrong ROIs are automatically corrected on page load
- No action needed from user
- Database will be fixed next time user marks a trade as closed

---

### Test Bug 2 (Status API Resolution Detection)

1. Go to profile page
2. Open browser console
3. Refresh status for a resolved market
4. Look for resolution detection log:
   ```javascript
   🔍 Resolution detected via current price: {
     tradeId: 'abc123...',
     market: 'Trail Blazers O/U',
     outcome: 'Yes',
     currentPrice: 0.0005,
     isResolved: true,
     marketResolved: true
   }
   ```
5. Verify trade shows as **"Resolved"** status

**Expected behavior:**
- Markets at $1.00 detected as resolved (won)
- Markets at $0.00 detected as resolved (lost)
- Status badge shows "Resolved" instead of "Open"

---

## Edge Cases

### Edge Case 1: ROI Recalculation with Invalid Data

```javascript
// If database has:
price_when_copied: null  // ❌ Missing
user_exit_price: 0.53

// Recalculation skipped:
if (trade.user_closed_at && trade.user_exit_price && trade.price_when_copied) {
  // Won't run - price_when_copied is null
}

// Result: ROI stays as-is (may be wrong)
```

**Handling:** Skip recalculation if data is invalid. User will need to re-mark trade as closed.

---

### Edge Case 2: Resolution Detection at 98% (Not Quite Resolved)

```javascript
currentPrice: 0.98  // 98% favorite

// Resolution check:
currentPrice >= 0.99  // false ❌

// Result:
marketResolved: false  // Correct! Market not resolved yet
```

**Handling:** Only detect resolution at 99%+ or 1%- to avoid false positives.

---

### Edge Case 3: Multiple Resolution Detection Methods Trigger

```javascript
// Method 1 (Gamma API):
maxPrice: 1.0, minPrice: 0.0005
marketResolved: true  ✅

// Method 2 (Current Price):
currentPrice: 1.0
marketResolved: true  ✅ (already true)

// Result: Both methods agree, no conflict
```

**Handling:** Methods are additive - if ANY method detects resolution, market is marked as resolved.

---

## Performance Impact

### Bug 1 Fix: ROI Recalculation

**Performance:**
```javascript
// For each user-closed trade:
- Simple arithmetic: ((exit - entry) / entry) * 100
- O(1) operation per trade
- Typical: 1-5 user-closed trades
- Total: <1ms
```

**Impact:** Negligible - runs once on page load

---

### Bug 2 Fix: Additional Resolution Check

**Performance:**
```javascript
// After fetching price:
- Simple comparison: price >= 0.99 || price <= 0.01
- O(1) operation
- No additional API calls
```

**Impact:** Negligible - just one conditional check

---

## Summary

### Bug 1: User-Closed Trade ROI ✅ FIXED

**Before:**
```javascript
// Database:
roi: -99.9  // ❌ Wrong

// Display:
ROI: -99.9%  // ❌ Wrong
```

**After:**
```javascript
// Database:
roi: -99.9  // Still wrong (not updated)

// In-Memory Recalculation:
roi: 3.92  // ✅ Corrected on load

// Display:
ROI: +3.9%  // ✅ Correct!
```

**Solution:** Recalculate ROI on load for user-closed trades

---

### Bug 2: Market Resolution Detection ✅ FIXED

**Before:**
```javascript
currentPrice: 1.0
marketResolved: false  // ❌ Wrong
```

**After:**
```javascript
currentPrice: 1.0

// Method 2 detects:
currentPrice >= 0.99  // true
marketResolved: true  // ✅ Correct!
```

**Solution:** Added current price check for resolution detection

---

## Files Modified

1. **`app/profile/page.tsx`** ✅
   - Added ROI recalculation for user-closed trades (line ~201)
   - Runs after loading trades, before status refresh
   - Logs corrections to console

2. **`app/api/copied-trades/[id]/status/route.ts`** ✅
   - Added current price resolution check (line ~382)
   - Runs after ROI calculation, before database update
   - Detects resolution at 99%+ or 1%-
   - Logs resolution detection to console

---

**Status:** 
- ✅ Bug 1 Fixed - User-closed trade ROI recalculated on load
- ✅ Bug 2 Fixed - Resolution detection enhanced with current price check
