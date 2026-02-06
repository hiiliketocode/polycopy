-- ============================================================================
-- CORRECT P&L ANALYSIS - Understanding Metadata-Based Position Tracking
-- ============================================================================
-- User: 671a2ece-9d96-4f9e-85f0-f5a225c55552 (Most active user)
-- 
-- KEY INSIGHT: System doesn't create SELL orders. Instead, it updates the
-- original BUY order with closing metadata (user_closed_at, user_exit_price)

\echo '\n=== USER PORTFOLIO P&L ANALYSIS ==='
\echo 'User: 671a2ece-9d96-4f9e-85f0-f5a225c55552\n'

-- ============================================================================
-- 1. POSITION STATUS BREAKDOWN
-- ============================================================================
\echo '--- 1. POSITION STATUS BREAKDOWN ---\n'

SELECT 
  CASE 
    WHEN user_closed_at IS NOT NULL THEN 'Closed by User'
    WHEN trader_still_has_position = false THEN 'Trader Closed (Not User)'
    ELSE 'Still Open'
  END AS position_status,
  COUNT(*) AS position_count,
  ROUND(SUM(COALESCE(amount_invested, price * COALESCE(filled_size, size, 0)))::numeric, 2) AS total_invested_usd,
  ROUND(AVG(COALESCE(amount_invested, price * COALESCE(filled_size, size, 0)))::numeric, 2) AS avg_position_size
FROM orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND status = 'matched'
GROUP BY position_status
ORDER BY position_count DESC;

-- ============================================================================
-- 2. SAMPLE CLOSED POSITIONS (User Closed)
-- ============================================================================
\echo '\n--- 2. SAMPLE CLOSED POSITIONS (User Explicitly Closed) ---\n'

SELECT 
  LEFT(order_id, 30) AS order_id_short,
  LEFT(market_id, 40) AS market_short,
  outcome,
  ROUND(price::numeric, 3) AS entry_price,
  ROUND(user_exit_price::numeric, 3) AS exit_price,
  ROUND(COALESCE(filled_size, size)::numeric, 2) AS shares,
  ROUND(amount_invested::numeric, 2) AS invested,
  ROUND((user_exit_price * COALESCE(filled_size, size))::numeric, 2) AS proceeds,
  ROUND(((user_exit_price * COALESCE(filled_size, size)) - amount_invested)::numeric, 2) AS realized_pnl,
  ROUND((((user_exit_price / price) - 1) * 100)::numeric, 2) AS roi_pct,
  user_closed_at
FROM orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND user_closed_at IS NOT NULL
  AND amount_invested IS NOT NULL
  AND user_exit_price IS NOT NULL
ORDER BY user_closed_at DESC
LIMIT 10;

-- ============================================================================
-- 3. COMPREHENSIVE P&L CALCULATION
-- ============================================================================
\echo '\n--- 3. COMPREHENSIVE P&L CALCULATION ---\n'

WITH user_positions AS (
  SELECT 
    order_id,
    market_id,
    outcome,
    price AS entry_price,
    COALESCE(filled_size, size) AS shares,
    amount_invested,
    user_exit_price,
    current_price,
    user_closed_at,
    trader_still_has_position,
    -- Calculate actual value based on position status
    CASE 
      WHEN user_closed_at IS NOT NULL THEN user_exit_price * COALESCE(filled_size, size)
      ELSE current_price * COALESCE(filled_size, size)
    END AS current_value,
    -- Calculate P&L
    CASE 
      WHEN user_closed_at IS NOT NULL THEN (user_exit_price * COALESCE(filled_size, size)) - amount_invested
      ELSE (current_price * COALESCE(filled_size, size)) - amount_invested
    END AS pnl,
    -- Mark as realized or unrealized
    CASE 
      WHEN user_closed_at IS NOT NULL THEN 'realized'
      ELSE 'unrealized'
    END AS pnl_type
  FROM orders
  WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
    AND status = 'matched'
    AND amount_invested IS NOT NULL
    AND amount_invested > 0
),
totals AS (
  SELECT 
    COUNT(*) AS total_positions,
    SUM(amount_invested) AS total_invested,
    SUM(current_value) AS total_current_value,
    SUM(CASE WHEN pnl_type = 'realized' THEN pnl ELSE 0 END) AS realized_pnl,
    SUM(CASE WHEN pnl_type = 'unrealized' THEN pnl ELSE 0 END) AS unrealized_pnl,
    SUM(pnl) AS total_pnl,
    COUNT(*) FILTER (WHERE pnl_type = 'realized') AS closed_positions,
    COUNT(*) FILTER (WHERE pnl_type = 'unrealized') AS open_positions
  FROM user_positions
)
SELECT 
  total_positions,
  closed_positions,
  open_positions,
  ROUND(total_invested::numeric, 2) AS total_invested_usd,
  ROUND(total_current_value::numeric, 2) AS total_current_value_usd,
  ROUND(realized_pnl::numeric, 2) AS realized_pnl_usd,
  ROUND(unrealized_pnl::numeric, 2) AS unrealized_pnl_usd,
  ROUND(total_pnl::numeric, 2) AS total_pnl_usd,
  ROUND(((total_pnl / NULLIF(total_invested, 0)) * 100)::numeric, 2) AS overall_roi_pct
FROM totals;

-- ============================================================================
-- 4. TOP 10 BEST PERFORMING CLOSED POSITIONS
-- ============================================================================
\echo '\n--- 4. TOP 10 BEST PERFORMING CLOSED POSITIONS ---\n'

SELECT 
  LEFT(market_id, 40) AS market,
  outcome,
  ROUND(amount_invested::numeric, 2) AS invested,
  ROUND((user_exit_price * COALESCE(filled_size, size))::numeric, 2) AS proceeds,
  ROUND(((user_exit_price * COALESCE(filled_size, size)) - amount_invested)::numeric, 2) AS profit,
  ROUND((((user_exit_price / price) - 1) * 100)::numeric, 2) AS roi_pct,
  user_closed_at::date AS closed_date
FROM orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND user_closed_at IS NOT NULL
  AND amount_invested IS NOT NULL
  AND user_exit_price IS NOT NULL
ORDER BY ((user_exit_price * COALESCE(filled_size, size)) - amount_invested) DESC
LIMIT 10;

-- ============================================================================
-- 5. TOP 10 WORST PERFORMING CLOSED POSITIONS
-- ============================================================================
\echo '\n--- 5. TOP 10 WORST PERFORMING CLOSED POSITIONS ---\n'

SELECT 
  LEFT(market_id, 40) AS market,
  outcome,
  ROUND(amount_invested::numeric, 2) AS invested,
  ROUND((user_exit_price * COALESCE(filled_size, size))::numeric, 2) AS proceeds,
  ROUND(((user_exit_price * COALESCE(filled_size, size)) - amount_invested)::numeric, 2) AS loss,
  ROUND((((user_exit_price / price) - 1) * 100)::numeric, 2) AS roi_pct,
  user_closed_at::date AS closed_date
FROM orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND user_closed_at IS NOT NULL
  AND amount_invested IS NOT NULL
  AND user_exit_price IS NOT NULL
ORDER BY ((user_exit_price * COALESCE(filled_size, size)) - amount_invested) ASC
LIMIT 10;

-- ============================================================================
-- 6. CURRENT OPEN POSITIONS VALUE
-- ============================================================================
\echo '\n--- 6. CURRENT OPEN POSITIONS (Sample) ---\n'

SELECT 
  LEFT(market_id, 40) AS market,
  outcome,
  ROUND(amount_invested::numeric, 2) AS invested,
  ROUND((current_price * COALESCE(filled_size, size))::numeric, 2) AS current_value,
  ROUND(((current_price * COALESCE(filled_size, size)) - amount_invested)::numeric, 2) AS unrealized_pnl,
  ROUND((((current_price / price) - 1) * 100)::numeric, 2) AS unrealized_roi_pct,
  trader_still_has_position AS trader_still_in
FROM orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND user_closed_at IS NULL
  AND status = 'matched'
  AND amount_invested IS NOT NULL
  AND current_price IS NOT NULL
ORDER BY amount_invested DESC
LIMIT 10;

-- ============================================================================
-- 7. VALIDATION: Check for NULL Values that Could Break P&L
-- ============================================================================
\echo '\n--- 7. DATA QUALITY CHECK ---\n'

SELECT 
  'Total Matched Orders' AS metric,
  COUNT(*) AS count
FROM orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND status = 'matched'

UNION ALL

SELECT 
  'Orders Missing amount_invested' AS metric,
  COUNT(*) AS count
FROM orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND status = 'matched'
  AND amount_invested IS NULL

UNION ALL

SELECT 
  'Closed Orders Missing user_exit_price' AS metric,
  COUNT(*) AS count
FROM orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND user_closed_at IS NOT NULL
  AND user_exit_price IS NULL

UNION ALL

SELECT 
  'Open Orders Missing current_price' AS metric,
  COUNT(*) AS count
FROM orders
WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
  AND user_closed_at IS NULL
  AND status = 'matched'
  AND current_price IS NULL

ORDER BY metric;

-- ============================================================================
-- 8. COMPARE: orders_copy_enriched View vs Raw Calculation
-- ============================================================================
\echo '\n--- 8. VIEW CALCULATION VERIFICATION ---\n'

WITH raw_calc AS (
  SELECT 
    order_id,
    CASE 
      WHEN user_closed_at IS NOT NULL THEN (user_exit_price * COALESCE(filled_size, size)) - amount_invested
      ELSE (current_price * COALESCE(filled_size, size)) - amount_invested
    END AS raw_pnl_usd
  FROM orders
  WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
    AND status = 'matched'
    AND amount_invested IS NOT NULL
  LIMIT 5
),
view_calc AS (
  SELECT 
    order_id,
    pnl_usd AS view_pnl_usd
  FROM orders_copy_enriched
  WHERE copy_user_id = '671a2ece-9d96-4f9e-85f0-f5a225c55552'
    AND status = 'matched'
    AND invested_usd IS NOT NULL
  LIMIT 5
)
SELECT 
  LEFT(r.order_id, 30) AS order_id_short,
  ROUND(r.raw_pnl_usd::numeric, 2) AS raw_pnl,
  ROUND(v.view_pnl_usd::numeric, 2) AS view_pnl,
  CASE 
    WHEN ABS(r.raw_pnl_usd - COALESCE(v.view_pnl_usd, 0)) < 0.01 THEN '✓ Match'
    ELSE '✗ Mismatch'
  END AS status
FROM raw_calc r
LEFT JOIN view_calc v ON v.order_id = r.order_id;

\echo '\n=== ANALYSIS COMPLETE ==='
\echo 'Review the numbers above to identify any discrepancies in P&L calculations.'
