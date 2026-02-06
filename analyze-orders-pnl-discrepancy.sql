-- Comprehensive Orders Analysis for P&L Discrepancy Investigation
-- User ID: 490723a6-e0be-4a7a-9796-45d4d09aa1bd
-- This script analyzes orders data to understand P&L calculation issues

-- =============================================================================
-- 1. BASIC ORDER COUNTS: BUY vs SELL breakdown
-- =============================================================================
SELECT 
  '1. ORDER COUNTS BY SIDE' AS analysis_section,
  side,
  COUNT(*) AS order_count,
  COUNT(DISTINCT market_id) AS unique_markets,
  SUM(COALESCE(filled_size, size, 0)) AS total_shares,
  ROUND(SUM(COALESCE(amount_invested, price * filled_size, price * size, 0))::numeric, 2) AS total_usd
FROM public.orders
WHERE copy_user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd'
GROUP BY side
ORDER BY side;

-- =============================================================================
-- 2. SELL ORDERS ANALYSIS: copy_user_id presence
-- =============================================================================
SELECT 
  '2. SELL ORDERS WITH/WITHOUT copy_user_id' AS analysis_section,
  CASE 
    WHEN copy_user_id IS NOT NULL THEN 'Has copy_user_id'
    ELSE 'Missing copy_user_id'
  END AS copy_user_status,
  COUNT(*) AS order_count,
  COUNT(DISTINCT market_id) AS unique_markets,
  SUM(COALESCE(filled_size, size, 0)) AS total_shares,
  ROUND(SUM(COALESCE(amount_invested, price * filled_size, price * size, 0))::numeric, 2) AS total_usd
FROM public.orders
WHERE side = 'SELL'
  AND (
    copy_user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd'
    OR trader_id IN (
      SELECT t.id 
      FROM traders t
      JOIN clob_credentials cc ON LOWER(cc.polymarket_account_address) = LOWER(t.wallet_address)
      WHERE cc.user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd'
    )
  )
GROUP BY copy_user_status
ORDER BY copy_user_status;

-- =============================================================================
-- 3. SAMPLE SELL ORDERS: Detailed view
-- =============================================================================
SELECT 
  '3. SAMPLE SELL ORDERS (Last 10)' AS analysis_section,
  o.order_id,
  o.side,
  o.copy_user_id,
  o.trader_id,
  o.market_id,
  o.outcome,
  o.price,
  o.price_when_copied,
  o.user_exit_price,
  o.current_price,
  o.filled_size,
  o.size,
  o.amount_invested,
  o.roi,
  o.user_closed_at,
  o.status,
  o.created_at,
  t.wallet_address AS trader_wallet
FROM public.orders o
LEFT JOIN traders t ON t.id = o.trader_id
WHERE (
  o.copy_user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd'
  OR o.trader_id IN (
    SELECT tr.id 
    FROM traders tr
    JOIN clob_credentials cc ON LOWER(cc.polymarket_account_address) = LOWER(tr.wallet_address)
    WHERE cc.user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd'
  )
)
AND o.side = 'SELL'
ORDER BY o.created_at DESC
LIMIT 10;

-- =============================================================================
-- 4. INVESTMENT VS PROCEEDS: Total amounts
-- =============================================================================
WITH user_wallet AS (
  SELECT LOWER(polymarket_account_address) AS wallet_address
  FROM clob_credentials
  WHERE user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd'
  ORDER BY created_at DESC
  LIMIT 1
),
user_trader AS (
  SELECT t.id AS trader_id
  FROM traders t, user_wallet uw
  WHERE LOWER(t.wallet_address) = uw.wallet_address
),
buy_orders AS (
  SELECT 
    o.*,
    COALESCE(o.amount_invested, o.price * COALESCE(o.filled_size, o.size)) AS invested_amount,
    COALESCE(o.filled_size, o.size) AS shares_bought
  FROM public.orders o
  WHERE o.copy_user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd'
    AND o.side = 'BUY'
    AND o.status = 'MATCHED'
),
sell_orders AS (
  SELECT 
    o.*,
    COALESCE(o.user_exit_price, o.current_price, o.price) AS exit_price_used,
    COALESCE(o.filled_size, o.size) AS shares_sold,
    COALESCE(o.filled_size, o.size) * COALESCE(o.user_exit_price, o.current_price, o.price) AS proceeds_amount
  FROM public.orders o, user_trader ut
  WHERE (o.copy_user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd' OR o.trader_id = ut.trader_id)
    AND o.side = 'SELL'
    AND o.status = 'MATCHED'
)
SELECT 
  '4. INVESTMENT VS PROCEEDS' AS analysis_section,
  (SELECT COUNT(*) FROM buy_orders) AS buy_order_count,
  (SELECT COUNT(*) FROM sell_orders) AS sell_order_count,
  ROUND((SELECT SUM(invested_amount) FROM buy_orders)::numeric, 2) AS total_invested_usd,
  ROUND((SELECT SUM(proceeds_amount) FROM sell_orders)::numeric, 2) AS total_proceeds_usd,
  ROUND((SELECT SUM(proceeds_amount) FROM sell_orders)::numeric - (SELECT SUM(invested_amount) FROM buy_orders)::numeric, 2) AS net_pnl_usd,
  ROUND(
    ((SELECT SUM(proceeds_amount) FROM sell_orders)::numeric / NULLIF((SELECT SUM(invested_amount) FROM buy_orders)::numeric, 0) - 1) * 100, 
    2
  ) AS overall_roi_pct;

-- =============================================================================
-- 5. MATCHED ORDERS BY MARKET: Checking if SELLs match BUYs
-- =============================================================================
WITH user_wallet AS (
  SELECT LOWER(polymarket_account_address) AS wallet_address
  FROM clob_credentials
  WHERE user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd'
  ORDER BY created_at DESC
  LIMIT 1
),
user_trader AS (
  SELECT t.id AS trader_id
  FROM traders t, user_wallet uw
  WHERE LOWER(t.wallet_address) = uw.wallet_address
),
market_positions AS (
  SELECT 
    o.market_id,
    o.outcome,
    COUNT(*) FILTER (WHERE o.side = 'BUY') AS buy_count,
    COUNT(*) FILTER (WHERE o.side = 'SELL') AS sell_count,
    SUM(COALESCE(o.filled_size, o.size)) FILTER (WHERE o.side = 'BUY') AS shares_bought,
    SUM(COALESCE(o.filled_size, o.size)) FILTER (WHERE o.side = 'SELL') AS shares_sold,
    SUM(COALESCE(o.amount_invested, o.price * COALESCE(o.filled_size, o.size))) FILTER (WHERE o.side = 'BUY') AS invested,
    SUM(COALESCE(o.filled_size, o.size) * COALESCE(o.user_exit_price, o.current_price, o.price)) FILTER (WHERE o.side = 'SELL') AS proceeds
  FROM public.orders o, user_trader ut
  WHERE (o.copy_user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd' OR o.trader_id = ut.trader_id)
    AND o.status = 'MATCHED'
  GROUP BY o.market_id, o.outcome
)
SELECT 
  '5. MARKET-LEVEL MATCHING' AS analysis_section,
  market_id,
  outcome,
  buy_count,
  sell_count,
  ROUND(shares_bought::numeric, 2) AS shares_bought,
  ROUND(shares_sold::numeric, 2) AS shares_sold,
  ROUND((shares_bought - COALESCE(shares_sold, 0))::numeric, 2) AS net_position,
  ROUND(invested::numeric, 2) AS invested,
  ROUND(COALESCE(proceeds, 0)::numeric, 2) AS proceeds,
  ROUND((COALESCE(proceeds, 0) - invested)::numeric, 2) AS pnl
FROM market_positions
ORDER BY invested DESC
LIMIT 20;

-- =============================================================================
-- 6. STATUS BREAKDOWN: Check order statuses
-- =============================================================================
SELECT 
  '6. ORDER STATUS BREAKDOWN' AS analysis_section,
  o.side,
  o.status,
  COUNT(*) AS order_count,
  ROUND(SUM(COALESCE(o.filled_size, o.size, 0))::numeric, 2) AS total_shares,
  ROUND(SUM(COALESCE(o.amount_invested, o.price * COALESCE(o.filled_size, o.size), 0))::numeric, 2) AS total_usd
FROM public.orders o, 
  (SELECT LOWER(polymarket_account_address) AS wallet FROM clob_credentials WHERE user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd' ORDER BY created_at DESC LIMIT 1) uw,
  (SELECT t.id FROM traders t, (SELECT LOWER(polymarket_account_address) AS wallet FROM clob_credentials WHERE user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd' ORDER BY created_at DESC LIMIT 1) uw2 WHERE LOWER(t.wallet_address) = uw2.wallet) ut
WHERE (o.copy_user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd' OR o.trader_id = ut.id)
GROUP BY o.side, o.status
ORDER BY o.side, o.status;

-- =============================================================================
-- 7. COPY USER ID ANALYSIS: All orders breakdown
-- =============================================================================
SELECT 
  '7. ALL ORDERS BY copy_user_id PRESENCE' AS analysis_section,
  o.side,
  CASE 
    WHEN o.copy_user_id IS NOT NULL THEN 'Has copy_user_id'
    ELSE 'Missing copy_user_id'
  END AS has_copy_user_id,
  COUNT(*) AS order_count,
  ROUND(SUM(COALESCE(o.filled_size, o.size, 0))::numeric, 2) AS total_shares
FROM public.orders o, 
  (SELECT t.id FROM traders t JOIN clob_credentials cc ON LOWER(cc.polymarket_account_address) = LOWER(t.wallet_address) WHERE cc.user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd') ut
WHERE (o.copy_user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd' OR o.trader_id = ut.id)
GROUP BY o.side, has_copy_user_id
ORDER BY o.side, has_copy_user_id;

-- =============================================================================
-- 8. SAMPLE BUY ORDERS: For comparison
-- =============================================================================
SELECT 
  '8. SAMPLE BUY ORDERS (Last 10)' AS analysis_section,
  o.order_id,
  o.side,
  o.market_id,
  o.outcome,
  o.price,
  o.price_when_copied,
  o.filled_size,
  o.size,
  o.amount_invested,
  o.status,
  o.created_at
FROM public.orders o
WHERE o.copy_user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd'
  AND o.side = 'BUY'
ORDER BY o.created_at DESC
LIMIT 10;

-- =============================================================================
-- 9. USER WALLET AND TRADER INFO
-- =============================================================================
SELECT 
  '9. USER WALLET AND TRADER INFO' AS analysis_section,
  cc.polymarket_account_address AS wallet_address,
  t.id AS trader_id,
  t.username AS trader_username,
  (SELECT COUNT(*) FROM orders WHERE trader_id = t.id) AS total_orders_by_trader_id,
  (SELECT COUNT(*) FROM orders WHERE copy_user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd') AS total_orders_by_copy_user_id
FROM clob_credentials cc
LEFT JOIN traders t ON LOWER(t.wallet_address) = LOWER(cc.polymarket_account_address)
WHERE cc.user_id = '490723a6-e0be-4a7a-9796-45d4d09aa1bd'
ORDER BY cc.created_at DESC
LIMIT 1;
