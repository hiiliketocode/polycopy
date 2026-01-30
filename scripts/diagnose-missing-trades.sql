-- Diagnostic query to find missing trades
-- Run this in your Supabase SQL Editor

-- First, let's see your user ID
-- Replace 'your-email@example.com' with your actual email
SELECT id, email FROM auth.users WHERE email ILIKE '%your-email%';

-- Then use your user ID in the queries below (replace 'YOUR_USER_ID')

-- 1. Count total orders vs enriched view
SELECT 
  'Total orders in base table' as source,
  COUNT(*) as count
FROM orders 
WHERE copy_user_id = 'YOUR_USER_ID'
UNION ALL
SELECT 
  'Orders in enriched view' as source,
  COUNT(*) as count
FROM orders_copy_enriched 
WHERE copy_user_id = 'YOUR_USER_ID';

-- 2. Find orders missing from enriched view
WITH all_orders AS (
  SELECT order_id, copied_trade_id, copied_market_title, status, filled_size, size, amount_invested, created_at, trade_method
  FROM orders
  WHERE copy_user_id = 'YOUR_USER_ID'
),
enriched_orders AS (
  SELECT order_id, copied_trade_id
  FROM orders_copy_enriched
  WHERE copy_user_id = 'YOUR_USER_ID'
)
SELECT 
  a.order_id,
  a.copied_trade_id,
  a.copied_market_title as market_title,
  a.status,
  a.filled_size,
  a.size,
  a.amount_invested,
  a.created_at,
  a.trade_method,
  CASE 
    WHEN LOWER(COALESCE(a.status, '')) = 'open' AND COALESCE(a.filled_size, 0) = 0 
    THEN 'Filtered: status=open AND filled_size=0'
    ELSE 'Unknown reason'
  END as likely_reason
FROM all_orders a
LEFT JOIN enriched_orders e ON (a.order_id = e.order_id OR a.copied_trade_id = e.copied_trade_id)
WHERE e.order_id IS NULL AND e.copied_trade_id IS NULL
ORDER BY a.created_at DESC;

-- 3. Specifically look for Seahawks trades
SELECT 
  order_id,
  copied_trade_id,
  copied_market_title,
  status,
  filled_size,
  size,
  amount_invested,
  price_when_copied,
  outcome,
  created_at,
  trade_method,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM orders_copy_enriched 
      WHERE copy_user_id = 'YOUR_USER_ID' 
      AND (order_id = orders.order_id OR copied_trade_id = orders.copied_trade_id)
    )
    THEN 'YES - In enriched view'
    ELSE 'NO - Missing from enriched view'
  END as in_enriched_view
FROM orders
WHERE copy_user_id = 'YOUR_USER_ID'
  AND (
    copied_market_title ILIKE '%seahawks%' 
    OR copied_market_title ILIKE '%super bowl%'
  )
ORDER BY created_at DESC;

-- 4. Check for trades with status=open and filled_size=0 (these get filtered out)
SELECT 
  order_id,
  copied_trade_id,
  copied_market_title,
  status,
  filled_size,
  size,
  amount_invested,
  created_at,
  trade_method
FROM orders
WHERE copy_user_id = 'YOUR_USER_ID'
  AND LOWER(COALESCE(status, '')) = 'open'
  AND COALESCE(filled_size, 0) = 0
ORDER BY created_at DESC;
