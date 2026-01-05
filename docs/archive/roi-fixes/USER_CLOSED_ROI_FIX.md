# User-Closed Trade ROI Fix

## Problem

When users manually closed trades on the profile page and entered their exit price, the ROI would continue to update based on current market prices instead of staying locked to their actual exit price.

**Example:**
- User buys at $0.50
- User closes at $0.75 (50% gain)
- Market continues to move to $0.60
- ROI incorrectly showed 20% gain instead of locked 50% gain

## Root Cause

The `fetchCurrentPriceFromPolymarket` function always calculated ROI using the current market price, ignoring the `user_exit_price` field.

```typescript
// BEFORE (Wrong):
const roi = ((currentPrice - entryPrice) / entryPrice) * 100;
// Always uses current market price, even for closed trades
```

## Solution

Updated ROI calculation to use `user_exit_price` when available (when user has manually closed the trade).

```typescript
// AFTER (Correct):
const exitPrice = trade.user_exit_price ?? currentPrice;
const roi = ((exitPrice - entryPrice) / entryPrice) * 100;
// Uses user's actual exit price if they closed the trade
```

---

## Changes Made

### 1. Updated ROI Calculation Logic

**File:** `app/profile/page.tsx`
**Function:** `fetchCurrentPriceFromPolymarket`

**Before:**
```typescript
// Calculate ROI
let roi: number | null = null;
if (currentPrice !== null && trade.price_when_copied) {
  const entryPrice = trade.price_when_copied;
  if (entryPrice > 0) {
    roi = ((currentPrice - entryPrice) / entryPrice) * 100;
    roi = parseFloat(roi.toFixed(2));
  }
}
```

**After:**
```typescript
// Calculate ROI
let roi: number | null = null;
if (trade.price_when_copied) {
  const entryPrice = trade.price_when_copied;
  
  // Use user's exit price if they manually closed the trade
  // Otherwise use current market price
  const exitPrice = trade.user_exit_price ?? currentPrice;
  
  if (entryPrice > 0 && exitPrice !== null) {
    roi = ((exitPrice - entryPrice) / entryPrice) * 100;
    roi = parseFloat(roi.toFixed(2));
  }
}
```

**Key changes:**
- ✅ Uses `user_exit_price` when available (trade is user-closed)
- ✅ Falls back to `currentPrice` for open/trader-closed trades
- ✅ Enhanced logging shows both prices

---

### 2. Skip Price Refresh for User-Closed Trades

User-closed trades should never update their prices or ROI since the user has locked them in.

**Updated:** `handleRefreshStatus` function

```typescript
for (let i = 0; i < copiedTrades.length; i++) {
  const trade = copiedTrades[i];
  
  // Skip price refresh for user-closed trades - their ROI is locked
  if (trade.user_closed_at) {
    updatedTrades.push(trade);
    continue;
  }
  
  // ... fetch and update prices for other trades
}
```

**Updated:** `autoRefreshPrices` function (inside useEffect)

```typescript
for (const trade of tradesToRefresh) {
  // Skip price refresh for user-closed trades - their ROI is locked
  if (trade.user_closed_at) {
    updatedTrades.push(trade);
    continue;
  }
  
  // ... fetch and update prices for other trades
}
```

---

## Behavior Matrix

| Trade Type | Price Used | ROI Calculation | Updates on Refresh? |
|------------|------------|-----------------|---------------------|
| **Open** | `current_price` | Live market price | ✅ Yes |
| **Trader Closed** | `current_price` | Last known price | ✅ Yes |
| **You Closed** | `user_exit_price` | Your actual exit | ❌ No (locked) |
| **Resolved** | `current_price` | Final price ($1 or $0) | ✅ Yes |

---

## User Experience

### Before Fix:
```
User Action: Mark trade as closed at $0.75 (50% gain)
Initial Display: ROI = +50.0% ✓
After market moves to $0.60:
  - Refresh button clicked
  - ROI updates to +20.0% ❌ WRONG!
  - User's actual exit price ignored
```

### After Fix:
```
User Action: Mark trade as closed at $0.75 (50% gain)
Initial Display: ROI = +50.0% ✓
After market moves to $0.60:
  - Refresh button clicked
  - ROI stays at +50.0% ✓ CORRECT!
  - User's exit price is preserved
```

---

## Technical Details

### Database Fields Used

- `user_closed_at` (TIMESTAMP): When user marked trade as closed
- `user_exit_price` (DECIMAL): Price user exited at (in decimal, e.g., 0.75 for 75¢)
- `price_when_copied` (DECIMAL): Entry price
- `current_price` (DECIMAL): Current market price

### Calculation Priority

1. **If `user_exit_price` exists:** Use it (trade is user-closed)
2. **Else:** Use `current_price` (trade is still active or trader-closed)

### Why Skip Refresh for User-Closed Trades?

Once a user manually closes a trade:
- They've locked in their actual exit price
- ROI should reflect their actual performance
- Market movements after close are irrelevant
- Refreshing prices would overwrite their data

---

## Testing

### Test Case 1: User Closes Trade with Profit
```
1. User copies trade at $0.50
2. Market moves to $0.75
3. User clicks "Mark as Closed", enters $0.75
4. ROI shows +50.0% ✓
5. Market moves to $0.60
6. User clicks "Refresh Status"
7. ROI still shows +50.0% ✓
```

### Test Case 2: User Closes Trade with Loss
```
1. User copies trade at $0.60
2. Market moves to $0.40
3. User clicks "Mark as Closed", enters $0.40
4. ROI shows -33.3% ✓
5. Market recovers to $0.55
6. User clicks "Refresh Status"
7. ROI still shows -33.3% ✓
```

### Test Case 3: Open Trade Continues Updating
```
1. User copies trade at $0.50
2. Market moves to $0.60
3. ROI shows +20.0% ✓
4. User does NOT close trade
5. Market moves to $0.70
6. User clicks "Refresh Status"
7. ROI updates to +40.0% ✓
```

### Test Case 4: Trader-Closed Trade Updates
```
1. User copies trade at $0.50
2. Trader closes position at $0.65
3. Status shows "Trader Closed"
4. Market moves to $0.70
5. User clicks "Refresh Status"
6. ROI updates to +40.0% (based on current price) ✓
```

---

## Console Output

Updated logging shows both current and exit prices:

```javascript
// Before
[Price] ✓ Final: price=0.62, roi=+24.0%

// After (open trade)
[Price] ✓ Final: price=0.62, exitPrice=0.62, roi=+24.0%

// After (user-closed trade)
[Price] ✓ Final: price=0.62, exitPrice=0.75, roi=+50.0%
```

---

## Edge Cases Handled

### Case 1: User Closes at $1 (Won)
```
Entry: $0.50
Exit: $1.00
ROI: +100.0%
Locked: ✓
```

### Case 2: User Closes at $0 (Lost)
```
Entry: $0.50
Exit: $0.00
ROI: -100.0%
Locked: ✓
```

### Case 3: User Closes at Break-Even
```
Entry: $0.50
Exit: $0.50
ROI: 0.0%
Locked: ✓
```

### Case 4: Missing Exit Price (Shouldn't Happen)
```
Entry: $0.50
user_exit_price: null (somehow)
Fallback: Uses current_price
ROI: Calculated normally
```

---

## Benefits

✅ **Accurate Performance Tracking:** Users see their actual returns
✅ **Locked ROI:** Exit price is preserved, not overwritten
✅ **No Confusion:** ROI doesn't change after manual close
✅ **Clear Distinction:** Different from trader-closed trades
✅ **Performance:** Skips unnecessary API calls for closed trades

---

## Files Modified

- `app/profile/page.tsx`
  - Updated `fetchCurrentPriceFromPolymarket` ROI calculation
  - Added skip logic in `handleRefreshStatus`
  - Added skip logic in `autoRefreshPrices`
  - Enhanced logging

---

## Migration Notes

**No Database Changes Required:**
- Fields already exist: `user_exit_price`, `user_closed_at`
- Existing user-closed trades will automatically use correct ROI
- No data migration needed

**Backward Compatible:**
- Trades without `user_exit_price` continue working
- Falls back to `current_price` as before
- No breaking changes

---

## Related Features

This fix works with:
- "Mark as Closed" modal (sets `user_exit_price`)
- "You Closed" status badge (shows when `user_closed_at` is set)
- Refresh Status button (now skips user-closed trades)
- Auto-refresh on load (now skips user-closed trades)

---

**Status:** ✅ Complete - User-closed trades now correctly use their exit price for ROI calculation and don't update on refresh.
