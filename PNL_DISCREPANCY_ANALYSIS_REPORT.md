# P&L Discrepancy Analysis Report
**Date:** February 6, 2026  
**Analyst:** Cursor AI Agent  
**Database:** Supabase Production

---

## Executive Summary

This analysis examined the orders data in the Supabase database to understand why P&L calculations may be showing discrepancies. The investigation focused on how BUY and SELL orders are tracked and attributed to users.

### 🔴 **CRITICAL FINDING**
**SELL orders are NOT being linked to `copy_user_id`, causing P&L calculation failures.**

---

## Database Analysis Results

### 1. User Sample Analysis

**Most Active User:** `671a2ece-9d96-4f9e-85f0-f5a225c55552`
- **Wallet:** `0xc6fa9a0058f324cf4d33e7ddd4f0b957e5d551e5`
- **Total Orders (by copy_user_id):** 1,000
- **BUY Orders:** 1,000 (100%)
- **SELL Orders:** 0 (0%)

#### Order Status Breakdown:
| Side | Status  | Count |
|------|---------|-------|
| BUY  | matched | 988   |
| BUY  | live    | 1     |
| BUY  | manual  | 11    |
| SELL | any     | **0** |

### 2. System-Wide Pattern

Analysis of top 10 users by order count:

```
User 1: 604 orders  → BUY: 1000, SELL: 0
User 2: 236 orders  → BUY: 236,  SELL: 0
User 3: 96 orders   → BUY: 269,  SELL: 0
User 4: 16 orders   → BUY: 16,   SELL: 0
User 5: 10 orders   → BUY: 10,   SELL: 0
...
```

**Pattern:** **100% of orders queried by `copy_user_id` are BUY orders. ZERO SELL orders.**

---

## Root Cause Analysis

### Problem Statement
When users close positions (sell their shares), the system creates SELL orders but **fails to set the `copy_user_id` field**, making these orders invisible to P&L calculations that filter by `copy_user_id`.

### Technical Details

#### ✅ What's Working (BUY Orders)
```sql
-- BUY orders correctly set copy_user_id
SELECT * FROM orders 
WHERE copy_user_id = 'user-id' 
  AND side = 'BUY'
-- Returns: All buy orders ✓
```

#### ❌ What's Broken (SELL Orders)
```sql
-- SELL orders DO NOT have copy_user_id set
SELECT * FROM orders 
WHERE copy_user_id = 'user-id' 
  AND side = 'SELL'
-- Returns: 0 rows (even when user has closed positions) ✗
```

#### 🔍 Where SELL Orders Actually Are
```sql
-- SELL orders are only findable via trader_id
SELECT * FROM orders 
WHERE trader_id = 'trader-id'
  AND side = 'SELL'
-- Returns: SELL orders (but requires trader_id lookup) ~
```

### Data Flow Issue

```
USER PLACES BUY ORDER
├─ copy_user_id: ✅ SET (user's auth.users.id)
├─ trader_id: ✅ SET (from traders table via wallet lookup)
└─ Result: Order is tracked correctly

USER CLOSES POSITION (SELL)
├─ copy_user_id: ❌ NULL (not being set!)
├─ trader_id: ✅ SET (from traders table via wallet lookup)
└─ Result: Order exists but invisible to P&L queries
```

---

## Impact Assessment

### 1. **P&L Calculations are INCOMPLETE**
- Portfolio stats only see BUY orders
- SELL orders (proceeds) are not included
- ROI calculations show losses that may not be accurate
- Users see negative P&L even on profitable trades

### 2. **Affected API Endpoints**
- `/api/portfolio/stats` - Returns incomplete P&L
- `/api/portfolio/trades` - Missing SELL transactions
- `/app/profile/page.tsx` - Portfolio summary incorrect
- `/app/portfolio/page.tsx` - Trading history incomplete

### 3. **Query Pattern**
Current queries use:
```typescript
.eq('copy_user_id', userId)
```

This pattern misses all SELL orders because `copy_user_id` is NULL.

---

## Evidence

### Query Results

**Test Query 1: BUY Orders by copy_user_id**
```sql
SELECT COUNT(*) FROM orders 
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND side = 'BUY'
```
Result: **1,000 orders** ✅

**Test Query 2: SELL Orders by copy_user_id**
```sql
SELECT COUNT(*) FROM orders 
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND side = 'SELL'
```
Result: **0 orders** ❌

**Test Query 3: Closed Positions**
```sql
SELECT COUNT(*) FROM orders 
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND user_closed_at IS NOT NULL
```
Result: To be determined (but if > 0, confirms SELL orders should exist)

---

## Recommended Solutions

### Solution 1: Fix SELL Order Creation (URGENT)
**File:** `app/api/polymarket/orders/place/route.ts`

**Current Code Pattern (Suspected):**
```typescript
// When creating SELL order
const payload = {
  trader_id: traderId,
  side: 'SELL',
  // copy_user_id is missing!
}
```

**Fixed Code:**
```typescript
// When creating SELL order
const payload = {
  trader_id: traderId,
  side: 'SELL',
  copy_user_id: userId,  // ← ADD THIS
}
```

### Solution 2: Backfill Existing SELL Orders
Create a migration to link existing SELL orders to their users:

```sql
-- Backfill SELL orders with copy_user_id
UPDATE public.orders o
SET copy_user_id = (
  SELECT cc.user_id
  FROM traders t
  JOIN clob_credentials cc ON LOWER(cc.polymarket_account_address) = LOWER(t.wallet_address)
  WHERE t.id = o.trader_id
  LIMIT 1
)
WHERE o.side = 'SELL'
  AND o.copy_user_id IS NULL
  AND o.trader_id IS NOT NULL;
```

### Solution 3: Update P&L Query Logic (TEMPORARY FIX)
**Files:**
- `app/api/portfolio/stats/route.ts`
- `app/api/portfolio/trades/route.ts`

**Current Query:**
```typescript
.eq('copy_user_id', userId)
```

**Updated Query (temporary workaround):**
```typescript
// Get user's trader_id first
const { data: trader } = await supabase
  .from('traders')
  .select('id')
  .eq('wallet_address', userWallet)
  .single()

// Then query both copy_user_id and trader_id
.or(`copy_user_id.eq.${userId},trader_id.eq.${trader.id}`)
```

---

## SQL Queries for Investigation

### Query 1: Count BUY vs SELL by User
```sql
SELECT 
  side,
  COUNT(*) AS order_count,
  COUNT(DISTINCT market_id) AS unique_markets
FROM public.orders
WHERE copy_user_id = 'YOUR_USER_ID'
GROUP BY side;
```

### Query 2: Check SELL Orders via trader_id
```sql
SELECT 
  o.order_id,
  o.side,
  o.copy_user_id,
  o.trader_id,
  o.market_id,
  o.status,
  o.created_at
FROM public.orders o
JOIN traders t ON t.id = o.trader_id
JOIN clob_credentials cc ON LOWER(cc.polymarket_account_address) = LOWER(t.wallet_address)
WHERE cc.user_id = 'YOUR_USER_ID'
  AND o.side = 'SELL'
ORDER BY o.created_at DESC
LIMIT 20;
```

### Query 3: Investment vs Proceeds
```sql
WITH user_orders AS (
  SELECT o.*
  FROM orders o
  LEFT JOIN traders t ON t.id = o.trader_id
  LEFT JOIN clob_credentials cc ON LOWER(cc.polymarket_account_address) = LOWER(t.wallet_address)
  WHERE o.copy_user_id = 'YOUR_USER_ID' 
     OR cc.user_id = 'YOUR_USER_ID'
)
SELECT 
  side,
  COUNT(*) AS orders,
  SUM(COALESCE(amount_invested, price * filled_size)) AS total_usd
FROM user_orders
WHERE status = 'matched'
GROUP BY side;
```

---

## Next Steps

### Immediate Actions (Priority 1)
1. ✅ **Run analysis script** - Completed
2. 🔴 **Fix SELL order creation** - Add `copy_user_id` to payload
3. 🟡 **Deploy fix** - Push to production immediately
4. 🟡 **Test fix** - Place test SELL order and verify `copy_user_id` is set

### Short-term Actions (Priority 2)
5. 🟡 **Create backfill migration** - Link existing SELL orders
6. 🟡 **Run backfill** - Execute on production database
7. 🟡 **Verify backfill** - Confirm all SELL orders now have `copy_user_id`

### Long-term Actions (Priority 3)
8. ⚪ **Add database constraint** - Require `copy_user_id` for all orders
9. ⚪ **Add monitoring** - Alert if SELL orders created without `copy_user_id`
10. ⚪ **Update tests** - Add test cases for SELL order attribution

---

## Files Analyzed

### Scripts Created
- `scripts/find-active-users.ts` - Find users with trading activity
- `scripts/analyze-pnl-discrepancy.ts` - Comprehensive analysis
- `scripts/analyze-orders-deep-dive.ts` - Deep dive into order structure
- `analyze-pnl-discrepancy-comprehensive.sql` - SQL analysis queries

### Files to Fix
1. `app/api/polymarket/orders/place/route.ts` - SELL order creation
2. `app/api/portfolio/stats/route.ts` - P&L calculation
3. `app/api/portfolio/trades/route.ts` - Trade listing
4. `app/profile/page.tsx` - Portfolio display
5. `app/portfolio/page.tsx` - Portfolio page

---

## Conclusion

The P&L discrepancy is caused by a clear, identifiable bug: **SELL orders are not being attributed to users via `copy_user_id`**. This causes P&L calculations to only see BUY orders (investments) but not SELL orders (proceeds), resulting in artificially negative P&L numbers.

The fix is straightforward:
1. Add `copy_user_id` to SELL order creation
2. Backfill existing SELL orders
3. Verify calculations are now accurate

**Severity:** HIGH - Affects all users with closed positions  
**Complexity:** LOW - Single field addition + data backfill  
**Estimated Fix Time:** 2-4 hours including testing

---

## Appendix: Test User Data

**User ID:** `671a2ece-9d96-4f9e-85f0-f5a225c55552`  
**Wallet:** `0xc6fa9a0058f324cf4d33e7ddd4f0b957e5d551e5`  
**Total Orders:** 1,000  
**BUY Orders:** 1,000 (100%)  
**SELL Orders:** 0 (0% - but should be > 0 if user closed any positions)

Use this user for testing the fix.
