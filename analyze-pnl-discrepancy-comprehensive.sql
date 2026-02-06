-- ============================================================================
-- COMPREHENSIVE P&L DISCREPANCY ANALYSIS
-- ============================================================================
-- This SQL script examines the orders table to understand P&L calculation issues
-- Focus: Why SELL orders are missing copy_user_id
-- User: 671a2ece-9d96-4f9e-85f0-f5a225c55552 (most active user)

-- ============================================================================
-- 1. BASIC ORDER STATS
-- ============================================================================
SELECT 
  '=== ORDER COUNTS BY SIDE AND STATUS ===' AS section;

SELECT 
  side,
  status,
  COUNT(*) AS order_count,
  COUNT(DISTINCT market_id) AS unique_markets,
  ROUND(SUM(COALESCE(filled_size, size, 0))::numeric, 2) AS total_shares
FROM public.orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
GROUP BY side, status
ORDER BY side, status;

-- ============================================================================
-- 2. CHECK FOR SELL ORDERS WITHOUT copy_user_id
-- ============================================================================
SELECT 
  '=== CHECKING FOR ORPHANED SELL ORDERS ===' AS section;

-- First, get the user's wallet
WITH user_wallet AS (
  SELECT 
    cc.polymarket_account_address,
    cc.user_id
  FROM clob_credentials cc
  WHERE cc.user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  ORDER BY cc.created_at DESC
  LIMIT 1
),
user_trader AS (
  SELECT 
    t.id AS trader_id,
    t.wallet_address,
    t.username
  FROM traders t, user_wallet uw
  WHERE LOWER(t.wallet_address) = LOWER(uw.polymarket_account_address)
),
sell_orders_by_trader AS (
  SELECT 
    o.order_id,
    o.side,
    o.copy_user_id,
    o.trader_id,
    o.market_id,
    o.outcome,
    o.price,
    o.filled_size,
    o.size,
    o.status,
    o.created_at
  FROM public.orders o
  WHERE o.trader_id IN (SELECT trader_id FROM user_trader)
    AND o.side = 'SELL'
  LIMIT 20
)
SELECT 
  CASE 
    WHEN COUNT(*) = 0 THEN 'No trader record found for this user'
    ELSE 'Found ' || COUNT(*) || ' SELL orders via trader_id'
  END AS finding,
  COUNT(*) AS sell_order_count,
  COUNT(*) FILTER (WHERE copy_user_id IS NOT NULL) AS with_copy_user_id,
  COUNT(*) FILTER (WHERE copy_user_id IS NULL) AS without_copy_user_id
FROM sell_orders_by_trader;

-- Show sample SELL orders if they exist
SELECT 
  '=== SAMPLE SELL ORDERS (if any) ===' AS section;

SELECT 
  o.order_id,
  o.side,
  o.copy_user_id,
  o.status,
  o.market_id,
  o.outcome,
  o.price,
  COALESCE(o.filled_size, o.size) AS shares,
  o.created_at
FROM public.orders o
WHERE o.trader_id IN (
  SELECT t.id 
  FROM traders t
  JOIN clob_credentials cc ON LOWER(cc.polymarket_account_address) = LOWER(t.wallet_address)
  WHERE cc.user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
)
AND o.side = 'SELL'
ORDER BY o.created_at DESC
LIMIT 10;

-- ============================================================================
-- 3. INVESTMENT TOTALS (BUY ORDERS ONLY)
-- ============================================================================
SELECT 
  '=== INVESTMENT TOTALS (BUY ORDERS) ===' AS section;

SELECT 
  COUNT(*) AS total_buy_orders,
  COUNT(*) FILTER (WHERE status = 'matched') AS matched_orders,
  ROUND(SUM(
    COALESCE(amount_invested, price * COALESCE(filled_size, size, 0))
  ) FILTER (WHERE status = 'matched')::numeric, 2) AS total_invested_usd,
  ROUND(AVG(
    COALESCE(amount_invested, price * COALESCE(filled_size, size, 0))
  ) FILTER (WHERE status = 'matched')::numeric, 2) AS avg_order_size_usd
FROM public.orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND side = 'BUY';

-- ============================================================================
-- 4. CHECK IF TRADER RECORD EXISTS
-- ============================================================================
SELECT 
  '=== USER TRADER LOOKUP ===' AS section;

SELECT 
  cc.user_id,
  cc.polymarket_account_address AS wallet,
  t.id AS trader_id,
  t.username,
  (SELECT COUNT(*) FROM orders WHERE trader_id = t.id) AS total_orders_via_trader_id,
  (SELECT COUNT(*) FROM orders WHERE trader_id = t.id AND side = 'SELL') AS sell_orders_via_trader_id
FROM clob_credentials cc
LEFT JOIN traders t ON LOWER(t.wallet_address) = LOWER(cc.polymarket_account_address)
WHERE cc.user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
ORDER BY cc.created_at DESC
LIMIT 1;

-- ============================================================================
-- 5. CHECK FOR ANY ORDERS WITH user_closed_at SET
-- ============================================================================
SELECT 
  '=== ORDERS WITH user_closed_at (User Closed Positions) ===' AS section;

SELECT 
  COUNT(*) AS orders_with_close_timestamp,
  COUNT(*) FILTER (WHERE side = 'BUY') AS buy_orders_closed,
  COUNT(*) FILTER (WHERE side = 'SELL') AS sell_orders_closed
FROM public.orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND user_closed_at IS NOT NULL;

-- Show details of closed orders
SELECT 
  order_id,
  side,
  market_id,
  outcome,
  price,
  price_when_copied,
  user_exit_price,
  current_price,
  COALESCE(filled_size, size) AS shares,
  user_closed_at,
  created_at
FROM public.orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND user_closed_at IS NOT NULL
ORDER BY user_closed_at DESC
LIMIT 10;

-- ============================================================================
-- 6. MARKET-LEVEL POSITION TRACKING
-- ============================================================================
SELECT 
  '=== POSITION TRACKING BY MARKET ===' AS section;

WITH user_positions AS (
  SELECT 
    market_id,
    outcome,
    COUNT(*) AS order_count,
    SUM(COALESCE(filled_size, size, 0)) AS total_shares,
    SUM(COALESCE(amount_invested, price * COALESCE(filled_size, size, 0))) AS total_invested,
    MAX(user_closed_at) AS latest_close_time
  FROM public.orders
  WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
    AND side = 'BUY'
    AND status = 'matched'
  GROUP BY market_id, outcome
)
SELECT 
  LEFT(market_id, 50) AS market_id_short,
  outcome,
  order_count,
  ROUND(total_shares::numeric, 2) AS shares,
  ROUND(total_invested::numeric, 2) AS invested_usd,
  CASE 
    WHEN latest_close_time IS NOT NULL THEN 'CLOSED'
    ELSE 'OPEN'
  END AS position_status,
  latest_close_time
FROM user_positions
ORDER BY total_invested DESC
LIMIT 20;

-- ============================================================================
-- 7. SUMMARY & KEY FINDINGS
-- ============================================================================
SELECT 
  '=== SUMMARY ===' AS section;

WITH stats AS (
  SELECT 
    (SELECT COUNT(*) FROM orders WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552' AND side = 'BUY') AS buy_orders,
    (SELECT COUNT(*) FROM orders WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552' AND side = 'SELL') AS sell_orders,
    (SELECT COUNT(*) FROM orders WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552' AND user_closed_at IS NOT NULL) AS closed_positions,
    (SELECT polymarket_account_address FROM clob_credentials WHERE user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552' ORDER BY created_at DESC LIMIT 1) AS wallet_address
)
SELECT 
  'User: 671a2ece-9d96-4f9e-85f0-f5a225c55552' AS summary,
  wallet_address,
  buy_orders,
  sell_orders,
  closed_positions,
  CASE 
    WHEN sell_orders = 0 AND closed_positions > 0 THEN '⚠️  ISSUE: Positions closed but no SELL orders with copy_user_id'
    WHEN sell_orders = 0 THEN '✅ No positions closed yet'
    ELSE '✅ SELL orders present'
  END AS status
FROM stats;
