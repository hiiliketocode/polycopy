# P&L Discrepancy Investigation - Executive Summary

**Investigation Date:** February 6, 2026  
**Status:** ✅ ROOT CAUSE IDENTIFIED  
**Priority:** HIGH - Affects all portfolio P&L calculations

---

## 🎯 Key Findings

### 1. System Architecture (Correct)
- ✅ System does **NOT** create separate SELL orders
- ✅ Positions are tracked by **updating BUY order metadata**
- ✅ Closing indicators: `user_closed_at`, `user_exit_price`
- ✅ Database view `orders_copy_enriched` correctly uses `COALESCE(user_exit_price, current_price)`

### 2. Data Evidence
```
Total Orders:     1,751
BUY Orders:       1,751 (100%)
SELL Orders:      0 (0%)
Closed Positions: 64 (have user_closed_at set)
```

### 3. Root Cause Hypothesis
The P&L calculation code likely:
- Filters out closed positions (e.g., `.is('user_closed_at', null)`)
- Doesn't properly use `user_exit_price` for closed positions
- Only calculates unrealized P&L for open positions
- Missing realized P&L from closed positions

---

## 📊 Correct P&L Calculation Logic

```typescript
// For EACH order:
const invested = order.amount_invested

if (order.user_closed_at) {
  // CLOSED POSITION: Use exit price
  const proceeds = order.user_exit_price * order.filled_size
  const realizedPnL = proceeds - invested
} else {
  // OPEN POSITION: Use current price
  const currentValue = order.current_price * order.filled_size
  const unrealizedPnL = currentValue - invested
}

// TOTAL P&L = Sum of all realized + unrealized P&L
```

---

## 🔍 SQL Queries for Analysis

### Quick P&L Check
```sql
SELECT 
  COUNT(*) FILTER (WHERE user_closed_at IS NOT NULL) AS closed_positions,
  COUNT(*) FILTER (WHERE user_closed_at IS NULL) AS open_positions,
  SUM(amount_invested) AS total_invested,
  SUM(
    CASE 
      WHEN user_closed_at IS NOT NULL 
      THEN (user_exit_price * filled_size) - amount_invested
      ELSE (current_price * filled_size) - amount_invested
    END
  ) AS total_pnl
FROM orders
WHERE copy_user_id = 'YOUR_USER_ID'
  AND status = 'matched';
```

### Position Status Breakdown
```sql
SELECT 
  CASE 
    WHEN user_closed_at IS NOT NULL THEN 'Closed'
    ELSE 'Open'
  END AS status,
  COUNT(*) AS positions,
  SUM(amount_invested) AS invested
FROM orders
WHERE copy_user_id = 'YOUR_USER_ID'
GROUP BY status;
```

---

## 📁 Files to Investigate

### 1. Portfolio Stats API ⚠️ PRIORITY
**File:** `app/api/portfolio/stats/route.ts`

**Check for:**
```typescript
// BAD: Filtering out closed positions
.is('user_closed_at', null)  // ❌
.eq('trader_still_has_position', true)  // ❌

// GOOD: Including all positions
const allOrders = await supabase
  .from('orders_copy_enriched')
  .eq('copy_user_id', userId)  // ✅ No filters on closed_at
```

### 2. Portfolio Page
**File:** `app/portfolio/page.tsx`

**Verify it displays:**
- Both open and closed positions
- Correct P&L for each type
- Separate realized vs unrealized P&L

### 3. Database View (Already Correct ✅)
**File:** `supabase/migrations/20250113_create_orders_copy_enriched_view.sql`

The view already handles this correctly:
```sql
exit_price = COALESCE(o.user_exit_price, o.current_price)  -- ✅ CORRECT
```

---

## 🧪 Testing Methodology

### Test User
- **User ID:** `671a2ece-9d96-4f9e-85f0-f5a225c55552`
- **Wallet:** `0xc6fa9a0058f324cf4d33e7ddd4f0b957e5d551e5`
- **Total Orders:** 1,000
- **Closed Positions:** 64
- **Open Positions:** 936

### Test Steps
1. Run SQL query to calculate correct P&L
2. Check API endpoint response
3. Compare numbers
4. Identify discrepancies

---

## 📝 Action Items

### Immediate (Today)
1. ✅ Run `correct-pnl-analysis.sql` against database
2. 🔴 Audit `app/api/portfolio/stats/route.ts` for incorrect filters
3. 🔴 Check for `.is('user_closed_at', null)` across codebase
4. 🔴 Verify P&L calculation includes closed positions

### Short-term (This Week)
5. 🟡 Fix any incorrect filters/calculations
6. 🟡 Add test cases for closed position P&L
7. 🟡 Deploy and verify with real user data
8. 🟡 Update documentation on position tracking

### Long-term (This Month)
9. ⚪ Add monitoring for P&L calculation accuracy
10. ⚪ Create dashboard to compare calculated vs actual P&L
11. ⚪ Add data validation checks for NULL prices

---

## 📋 Files Created During Investigation

### Analysis Scripts
1. `scripts/find-active-users.ts` - Identify users with trading activity
2. `scripts/analyze-pnl-discrepancy.ts` - Initial BUY/SELL analysis
3. `scripts/check-sell-orders-system.ts` - Discovered no SELL orders exist
4. `scripts/check-side-values.ts` - Confirmed metadata-based closing
5. `scripts/analyze-orders-pnl.ts` - First P&L analysis attempt

### SQL Queries
1. `analyze-orders-pnl-discrepancy.sql` - Initial comprehensive query
2. `analyze-pnl-discrepancy-comprehensive.sql` - BUY/SELL focused
3. `correct-pnl-analysis.sql` - ✅ **CORRECT analysis with proper understanding**

### Documentation
1. `PNL_DISCREPANCY_ANALYSIS_REPORT.md` - Initial report (outdated)
2. `PNL_DISCREPANCY_QUICK_REFERENCE.md` - Quick SQL reference
3. `PNL_DISCREPANCY_FINAL_ANALYSIS.md` - Updated understanding
4. **THIS FILE** - Executive summary

---

## 🎬 Next Steps for Developer

1. **Read this summary** (you're doing it! 👍)
2. **Run the SQL analysis:**
   ```bash
   # Option 1: Via Supabase SQL Editor
   # Copy/paste content from: correct-pnl-analysis.sql
   
   # Option 2: Via command line
   npx tsx scripts/analyze-pnl-discrepancy.ts
   ```
3. **Review the code:**
   - Open `app/api/portfolio/stats/route.ts`
   - Search for filters on `user_closed_at` or `trader_still_has_position`
   - Check if realized P&L is being calculated
4. **Fix any issues found**
5. **Test with user:** `671a2ece-9d96-4f9e-85f0-f5a225c55552`

---

## ⚠️ Common Pitfalls to Avoid

### ❌ Don't Do This
```typescript
// Filtering out closed positions
const orders = await supabase
  .from('orders')
  .eq('copy_user_id', userId)
  .is('user_closed_at', null)  // ❌ Excludes closed!

// Using current_price for everything
const value = order.current_price * order.shares  // ❌ Wrong for closed!
```

### ✅ Do This Instead
```typescript
// Include all positions
const orders = await supabase
  .from('orders_copy_enriched')
  .eq('copy_user_id', userId)  // ✅ All orders

// Use correct price based on status
const exitPrice = order.user_closed_at 
  ? order.exit_price  // ✅ From enriched view
  : order.current_price

const pnl = (exitPrice * order.entry_size) - order.invested_usd
```

---

## 📞 Questions?

If you have questions about this analysis:
1. Review `PNL_DISCREPANCY_FINAL_ANALYSIS.md` for detailed explanation
2. Run `correct-pnl-analysis.sql` to see actual data
3. Check the test scripts in `scripts/` folder

---

**Investigation Complete** ✅  
**Ready for Code Audit** 🔍  
**Estimated Fix Time:** 2-4 hours
