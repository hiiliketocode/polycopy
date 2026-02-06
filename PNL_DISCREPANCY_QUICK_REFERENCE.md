# P&L Discrepancy Investigation - Quick Reference

## Summary of Findings

**CRITICAL ISSUE IDENTIFIED:**
- ✅ BUY orders have `copy_user_id` set correctly
- ❌ SELL orders have `copy_user_id` = NULL
- 📊 Result: P&L calculations only see investments, not proceeds

## Test User
```
User ID: 671a2ece-9d96-4f9e-85f0-f5a225c55552
Wallet:  0xc6fa9a0058f324cf4d33e7ddd4f0b957e5d551e5
Orders:  1,000 BUY, 0 SELL (with copy_user_id)
```

## Quick SQL Queries (Run in Supabase SQL Editor)

### 1. Check BUY vs SELL breakdown for a user
```sql
SELECT 
  side,
  status,
  COUNT(*) AS order_count,
  SUM(COALESCE(filled_size, size, 0)) AS total_shares
FROM public.orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
GROUP BY side, status
ORDER BY side, status;
```

### 2. Find SELL orders via trader_id (proving they exist but aren't linked)
```sql
WITH user_wallet AS (
  SELECT polymarket_account_address
  FROM clob_credentials
  WHERE user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  o.order_id,
  o.side,
  o.copy_user_id,
  o.status,
  o.price,
  o.filled_size,
  o.created_at
FROM public.orders o
JOIN traders t ON t.id = o.trader_id
JOIN user_wallet uw ON LOWER(t.wallet_address) = LOWER(uw.polymarket_account_address)
WHERE o.side = 'SELL'
ORDER BY o.created_at DESC
LIMIT 20;
```

### 3. Count total SELL orders missing copy_user_id
```sql
SELECT 
  COUNT(*) AS total_sell_orders,
  COUNT(*) FILTER (WHERE copy_user_id IS NOT NULL) AS with_copy_user,
  COUNT(*) FILTER (WHERE copy_user_id IS NULL) AS without_copy_user,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE copy_user_id IS NULL) / COUNT(*), 
    2
  ) AS pct_missing_copy_user
FROM public.orders
WHERE side = 'SELL';
```

### 4. Check investment vs proceeds (will show discrepancy)
```sql
WITH all_user_orders AS (
  SELECT o.*
  FROM orders o
  LEFT JOIN traders t ON t.id = o.trader_id
  LEFT JOIN clob_credentials cc ON LOWER(cc.polymarket_account_address) = LOWER(t.wallet_address)
  WHERE o.copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
     OR (cc.user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552' AND o.side = 'SELL')
),
buy_total AS (
  SELECT SUM(COALESCE(amount_invested, price * COALESCE(filled_size, size))) AS invested
  FROM all_user_orders
  WHERE side = 'BUY' AND status = 'matched'
),
sell_total AS (
  SELECT SUM(price * COALESCE(filled_size, size)) AS proceeds
  FROM all_user_orders
  WHERE side = 'SELL' AND status = 'matched'
)
SELECT 
  ROUND(COALESCE(invested, 0)::numeric, 2) AS total_invested,
  ROUND(COALESCE(proceeds, 0)::numeric, 2) AS total_proceeds,
  ROUND((COALESCE(proceeds, 0) - COALESCE(invested, 0))::numeric, 2) AS net_pnl
FROM buy_total, sell_total;
```

## TypeScript Scripts (Run from terminal)

### Find active users with orders
```bash
npx tsx scripts/find-active-users.ts
```

### Analyze P&L discrepancy for most active user
```bash
npx tsx scripts/analyze-pnl-discrepancy.ts
```

### Deep dive into order structure
```bash
npx tsx scripts/analyze-orders-deep-dive.ts
```

## What to Do Next

1. **Verify the issue exists:**
   Run query #1 above - it should show 0 SELL orders

2. **Prove SELL orders exist elsewhere:**
   Run query #2 above - it should show SELL orders via trader_id

3. **Quantify the problem:**
   Run query #3 above - shows how many SELL orders are missing copy_user_id

4. **Calculate impact:**
   Run query #4 above - shows incorrect P&L calculation

5. **Fix the code:**
   See `PNL_DISCREPANCY_ANALYSIS_REPORT.md` for detailed fix instructions

## Key Files to Update

1. `app/api/polymarket/orders/place/route.ts` - Add copy_user_id to SELL orders
2. Create backfill migration to fix existing data
3. Update P&L calculation queries to handle both attribution methods

## Expected Results After Fix

**Before Fix:**
- Query by copy_user_id: 1000 BUY, 0 SELL
- P&L calculation: Only shows investment, no proceeds

**After Fix:**
- Query by copy_user_id: 1000 BUY, X SELL (where X > 0 for users who closed positions)
- P&L calculation: Shows both investment and proceeds accurately

---

For full analysis, see: `PNL_DISCREPANCY_ANALYSIS_REPORT.md`
