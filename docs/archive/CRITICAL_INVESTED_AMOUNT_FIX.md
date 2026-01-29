# CRITICAL FIX: Invested Amount Must Show Actual Spent (Not Intended)

## 🚨 **The Bug**

**Symptom:** User places $5 order, it partially fills for $0.71, but Polycopy shows "Invested: $4.97"

**Impact:** 
- ❌ Inaccurate financial data
- ❌ Misleading ROI calculations  
- ❌ User confusion and loss of trust
- ❌ Potential legal/compliance issues

---

## 🔍 **Root Cause**

### **The Problem in the Database View:**

**File:** `supabase/migrations/20250118_rebuild_orders_copy_enriched_view.sql`  
**Lines 52-61:**

```sql
COALESCE(
  o.amount_invested,        -- ❌ WRONG: Shows $5 (intended amount)
  price * filled_size       -- ✅ CORRECT: Should show $0.71 (actual)
) AS invested_usd
```

### **What Happens:**

| Step | User Action | System Behavior | What's Stored |
|------|-------------|-----------------|---------------|
| 1 | User submits $5 order | Order placed with `amount_invested = $5` | ✅ Correct |
| 2 | Order partially fills | Only 1 contract filled at $0.71 | `filled_size = 1` ✅ |
| 3 | Display to user | Shows `invested_usd = $5` | ❌ WRONG |
| **Should show** | - | **$0.71** (price × filled_size) | ✅ CORRECT |

### **The SQL Logic Error:**

```sql
-- Current (WRONG):
COALESCE(
  o.amount_invested,      -- Checked FIRST (intended $5)
  price * filled_size     -- Only if amount_invested is NULL
)

-- Should be (CORRECT):
CASE
  WHEN filled_size IS NOT NULL 
  THEN price * filled_size    -- Use ACTUAL fill ($0.71)
  ELSE o.amount_invested      -- Fall back to intended
END
```

---

## ✅ **The Fix**

### **New Migration:** `20260112_fix_invested_usd_partial_fills.sql`

**Key Change (lines 50-72):**

```sql
-- CRITICAL FIX: Always calculate from filled_size when available
CASE
  -- Priority 1: If filled_size exists, calculate ACTUAL cost
  WHEN o.filled_size IS NOT NULL 
    AND o.filled_size > 0 
    AND COALESCE(o.price_when_copied, o.price) IS NOT NULL
  THEN COALESCE(o.price_when_copied, o.price) * o.filled_size  -- ✅ ACTUAL
  
  -- Priority 2: If no filled_size but size exists, use that
  WHEN o.filled_size IS NULL 
    AND o.size IS NOT NULL 
    AND o.size > 0
    AND COALESCE(o.price_when_copied, o.price) IS NOT NULL
  THEN COALESCE(o.price_when_copied, o.price) * o.size
  
  -- Priority 3: Fall back to stored amount_invested (manual copies only)
  ELSE o.amount_invested
END AS invested_usd
```

### **Priority Logic:**

| Priority | Condition | Calculation | Use Case |
|----------|-----------|-------------|----------|
| **1 (Highest)** | `filled_size` exists | `price × filled_size` | Quick Copy orders (actual) |
| **2** | `size` exists (no filled_size) | `price × size` | Unfilled orders |
| **3 (Lowest)** | Nothing else available | `amount_invested` | Manual Copy (user input) |

---

## 📊 **Before vs After**

### **Example: $5 Order, Partial Fill (1 contract @ $0.71)**

| Field | Before (WRONG) | After (CORRECT) |
|-------|----------------|-----------------|
| **Intended Amount** | $5.00 | $5.00 |
| **Filled Size** | 1 contract | 1 contract |
| **Entry Price** | $0.71 | $0.71 |
| **Displayed "Invested"** | ❌ $4.97 | ✅ $0.71 |
| **ROI Calculation** | ❌ Based on $4.97 | ✅ Based on $0.71 |
| **User Confusion** | High | None |

### **Why $4.97 Appeared:**

The old logic was looking at the wrong field:
- User input: $5
- System rounded: $4.97 (for contract precision)
- Stored as `amount_invested = $4.97`
- But actual fill: 1 × $0.71 = **$0.71**
- Display showed: **$4.97** ❌

---

## 🧪 **Testing**

### **Test Case 1: Partial Fill**
```sql
-- Create test order
INSERT INTO orders (
  order_id, price, size, filled_size, amount_invested
) VALUES (
  'test-1', 0.71, 7, 1, 4.97
);

-- Before fix:
SELECT invested_usd FROM orders_copy_enriched WHERE order_id = 'test-1';
-- Result: 4.97 ❌

-- After fix:
SELECT invested_usd FROM orders_copy_enriched WHERE order_id = 'test-1';
-- Result: 0.71 ✅ (0.71 * 1)
```

### **Test Case 2: Full Fill**
```sql
-- Full fill: intended $5, filled 7 contracts @ $0.71
INSERT INTO orders (
  order_id, price, size, filled_size, amount_invested
) VALUES (
  'test-2', 0.71, 7, 7, 4.97
);

-- After fix:
SELECT invested_usd FROM orders_copy_enriched WHERE order_id = 'test-2';
-- Result: 4.97 ✅ (0.71 * 7)
```

### **Test Case 3: Manual Copy**
```sql
-- Manual copy: user manually enters investment amount
INSERT INTO orders (
  order_id, amount_invested, filled_size, trade_method
) VALUES (
  'test-3', 10.50, NULL, 'manual'
);

-- After fix:
SELECT invested_usd FROM orders_copy_enriched WHERE order_id = 'test-3';
-- Result: 10.50 ✅ (falls back to amount_invested)
```

---

## 🚀 **Deployment**

### **To Apply This Fix:**

**Option A: Via Supabase Dashboard**
1. Go to Supabase Dashboard → SQL Editor
2. Paste the contents of `20260112_fix_invested_usd_partial_fills.sql`
3. Run the migration
4. Verify with test query:
   ```sql
   SELECT order_id, filled_size, price, invested_usd 
   FROM orders_copy_enriched 
   WHERE filled_size IS NOT NULL 
   LIMIT 10;
   ```

**Option B: Via Supabase CLI**
```bash
supabase db push
# Or manually run the migration file
```

### **Verification Query:**

```sql
-- Check if fix is working
SELECT 
  order_id,
  filled_size,
  price,
  amount_invested,
  invested_usd,
  CASE 
    WHEN filled_size IS NOT NULL 
    THEN price * filled_size 
    ELSE amount_invested 
  END AS expected_invested
FROM orders_copy_enriched
WHERE filled_size IS NOT NULL
LIMIT 20;

-- invested_usd should equal expected_invested
```

---

## ⚠️ **Impact on Existing Data**

### **What Happens to Old Records:**

- **Views are recalculated automatically** when you run the migration
- All old orders will now show **correct** invested amounts
- ROI calculations will automatically update
- **No data loss** - we're just changing the calculation logic

### **User-Visible Changes:**

| User Experience | Before | After |
|----------------|--------|-------|
| Partial fills | Showed intended amount | Shows actual amount ✅ |
| ROI % | Incorrect (based on wrong base) | Correct ✅ |
| P&L $ | Incorrect | Correct ✅ |
| Portfolio value | Overstated | Accurate ✅ |

---

## 📈 **Why This Matters**

### **Financial Accuracy:**
- **ROI calculations depend on this** - wrong invested amount = wrong ROI
- **P&L calculations depend on this** - affects user decisions
- **Portfolio tracking depends on this** - affects risk management

### **User Trust:**
- Users MUST be able to trust the numbers
- Inaccurate data destroys credibility
- Could lead to poor trading decisions

### **Compliance:**
- Financial platforms must show accurate data
- Misleading investment amounts could have legal implications

---

## 🎯 **Summary**

**Problem:** 
- Showed intended investment amount ($5)
- Not actual amount spent ($0.71)

**Fix:**
- Prioritize `filled_size × price` over stored `amount_invested`
- Fall back to `amount_invested` only for manual copies

**Impact:**
- ✅ Accurate invested amounts
- ✅ Correct ROI calculations
- ✅ Trustworthy financial data
- ✅ Better user experience

**Status:** 
- Migration created: `20260112_fix_invested_usd_partial_fills.sql`
- Ready to deploy to Supabase
- Zero downtime - it's just a view recreation

---

## 📋 **Deployment Checklist**

- [ ] Review migration SQL
- [ ] Back up current view definition (already in migrations folder)
- [ ] Run migration on staging/dev first
- [ ] Verify with test queries
- [ ] Run migration on production
- [ ] Verify user-facing data is now correct
- [ ] Monitor for any issues
- [ ] Update user if they noticed the bug

**Estimated Time:** 5 minutes  
**Risk Level:** Low (view recreation, no table changes)  
**Rollback:** Easy (revert to previous migration)

---

**🔴 PRIORITY: CRITICAL** - This directly affects financial accuracy and user trust.
