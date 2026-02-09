-- =============================================================================
-- Slippage Analysis: Real Copy Trades vs. Trader Price
-- =============================================================================
-- Run against Supabase DB. Analyzes ~1.5k orders (real copy trades only).
--
-- Slippage = (our_fill - trader_price) / trader_price * 100
--   Positive = we paid more (unfavorable)
--   Negative = we paid less (favorable)
--
-- When trades table has leader data: also computes delay (seconds from
-- trader's trade to our order) and slippage by time bucket.
-- =============================================================================

-- Filter: real copy trades only (user-placed, filled BUY orders)
-- Excludes FT/paper; requires copy_user_id and filled_size
\echo '=== 0. QUALIFYING ORDERS COUNT ==='
SELECT COUNT(*) AS total_copy_buys,
       COUNT(*) FILTER (WHERE o.filled_size > 0 AND o.price_when_copied > 0 AND o.amount_invested > 0) AS with_slippage_data
FROM orders o
WHERE o.copy_user_id IS NOT NULL
  AND o.copied_trade_id IS NOT NULL
  AND o.side = 'BUY';

-- =============================================================================
-- PART A: SLIPPAGE STATS (no time - works with orders only)
-- =============================================================================

\echo ''
\echo '=== A1. RAW SAMPLE (first 30) ==='
SELECT 
  o.order_id,
  o.market_id,
  o.price_when_copied AS trader_price,
  o.amount_invested,
  o.filled_size,
  ROUND((o.amount_invested / NULLIF(o.filled_size, 0))::numeric, 6) AS effective_fill_price,
  ROUND(
    ((o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100)::numeric,
    2
  ) AS slippage_pct,
  o.created_at AS our_order_at
FROM orders o
WHERE o.copy_user_id IS NOT NULL
  AND o.copied_trade_id IS NOT NULL
  AND o.side = 'BUY'
  AND o.filled_size > 0
  AND o.filled_size IS NOT NULL
  AND o.price_when_copied > 0
  AND o.amount_invested > 0
ORDER BY o.created_at DESC
LIMIT 30;

\echo ''
\echo '=== A2. AGGREGATE SLIPPAGE STATS ==='
SELECT 
  COUNT(*) AS n_trades,
  ROUND(AVG(
    (o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100
  )::numeric, 3) AS mean_slippage_pct,
  ROUND(STDDEV(
    (o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100
  )::numeric, 3) AS stddev_slippage_pct,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
    (o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100
  )::numeric, 3) AS median_slippage_pct,
  ROUND(PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY
    (o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100
  )::numeric, 2) AS p5_slippage_pct,
  ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY
    (o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100
  )::numeric, 2) AS p25_slippage_pct,
  ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY
    (o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100
  )::numeric, 2) AS p75_slippage_pct,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY
    (o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100
  )::numeric, 2) AS p95_slippage_pct
FROM orders o
WHERE o.copy_user_id IS NOT NULL
  AND o.copied_trade_id IS NOT NULL
  AND o.side = 'BUY'
  AND o.filled_size > 0
  AND o.filled_size IS NOT NULL
  AND o.price_when_copied > 0
  AND o.amount_invested > 0;

\echo ''
\echo '=== A3. FAVORABLE vs. UNFAVORABLE SLIPPAGE ==='
SELECT 
  CASE 
    WHEN (o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100 < 0 THEN 'favorable'
    WHEN (o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100 > 0 THEN 'unfavorable'
    ELSE 'neutral'
  END AS direction,
  COUNT(*) AS n,
  ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS pct
FROM orders o
WHERE o.copy_user_id IS NOT NULL
  AND o.copied_trade_id IS NOT NULL
  AND o.side = 'BUY'
  AND o.filled_size > 0
  AND o.filled_size IS NOT NULL
  AND o.price_when_copied > 0
  AND o.amount_invested > 0
GROUP BY 1;

-- =============================================================================
-- PART B: SLIPPAGE vs. TIME AFTER TRADER TRADE
-- =============================================================================
-- Joins to trades table to get trader's BUY timestamp. Matches on:
--   - copied_trader_wallet = trades.wallet_address
--   - market_id = condition_id (Polymarket market)
--   - side = BUY, price within 1% of price_when_copied
--   - trader trade must be BEFORE our order
-- Picks the trader trade closest to (but before) our order.
-- Note: If trades table lacks leader data (leader fills not synced from Dome),
--       PART B returns 0 rows. PART A always works.
--
-- To run: psql $DATABASE_URL -f scripts/analyze-slippage-copy-trades.sql
-- Or paste sections into Supabase SQL Editor (ignore \echo).
\echo ''
\echo '=== B1. ORDERS WITH TRADER TRADE TIMESTAMP (sample) ==='
WITH trader_trades AS (
  SELECT 
    t.wallet_address,
    t.condition_id,
    t.timestamp AS trader_trade_at,
    t.price AS trader_price,
    t.side
  FROM trades t
  WHERE t.side = 'BUY'
    AND t.condition_id IS NOT NULL
),
best_match AS (
  SELECT 
    o.order_id,
    o.created_at AS our_order_at,
    o.price_when_copied,
    o.amount_invested,
    o.filled_size,
    tt.trader_trade_at,
    ROUND(EXTRACT(EPOCH FROM (o.created_at - tt.trader_trade_at))::numeric, 0) AS delay_seconds,
    ROUND(((o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100)::numeric, 2) AS slippage_pct,
    ROW_NUMBER() OVER (PARTITION BY o.order_id ORDER BY tt.trader_trade_at DESC) AS rn
  FROM orders o
  JOIN trader_trades tt
    ON LOWER(TRIM(o.copied_trader_wallet)) = LOWER(tt.wallet_address)
   AND LOWER(TRIM(o.market_id)) = LOWER(tt.condition_id)
   AND tt.trader_trade_at <= o.created_at
   AND ABS(tt.trader_price - o.price_when_copied) / NULLIF(o.price_when_copied, 0) < 0.02
  WHERE o.copy_user_id IS NOT NULL
    AND o.copied_trade_id IS NOT NULL
    AND o.side = 'BUY'
    AND o.filled_size > 0
    AND o.price_when_copied > 0
    AND o.amount_invested > 0
)
SELECT order_id, our_order_at, trader_trade_at, delay_seconds, slippage_pct, price_when_copied, amount_invested, filled_size
FROM best_match
WHERE rn = 1
ORDER BY our_order_at DESC
LIMIT 30;

\echo ''
\echo '=== B2. SLIPPAGE BY DELAY BUCKET (when trader timestamp available) ==='
WITH trader_trades AS (
  SELECT t.wallet_address, t.condition_id, t.timestamp AS trader_trade_at, t.price AS trader_price, t.side
  FROM trades t
  WHERE t.side = 'BUY' AND t.condition_id IS NOT NULL
),
best_match AS (
  SELECT 
    o.order_id,
    o.created_at,
    tt.trader_trade_at,
    EXTRACT(EPOCH FROM (o.created_at - tt.trader_trade_at)) AS delay_seconds,
    (o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100 AS slippage_pct,
    ROW_NUMBER() OVER (PARTITION BY o.order_id ORDER BY tt.trader_trade_at DESC) AS rn
  FROM orders o
  JOIN trader_trades tt
    ON LOWER(TRIM(o.copied_trader_wallet)) = LOWER(tt.wallet_address)
   AND LOWER(TRIM(o.market_id)) = LOWER(tt.condition_id)
   AND tt.trader_trade_at <= o.created_at
   AND tt.trader_trade_at >= o.created_at - interval '1 hour'
   AND ABS(tt.trader_price - o.price_when_copied) / NULLIF(o.price_when_copied, 0) < 0.02
  WHERE o.copy_user_id IS NOT NULL
    AND o.copied_trade_id IS NOT NULL
    AND o.side = 'BUY'
    AND o.filled_size > 0
    AND o.price_when_copied > 0
    AND o.amount_invested > 0
),
bucketed AS (
  SELECT 
    CASE 
      WHEN delay_seconds < 60 THEN '0-1 min'
      WHEN delay_seconds < 300 THEN '1-5 min'
      WHEN delay_seconds < 900 THEN '5-15 min'
      WHEN delay_seconds < 3600 THEN '15-60 min'
      ELSE '60+ min'
    END AS delay_bucket,
    slippage_pct,
    delay_seconds
  FROM best_match
  WHERE rn = 1
)
SELECT 
  delay_bucket,
  COUNT(*) AS n_trades,
  ROUND(AVG(slippage_pct)::numeric, 3) AS mean_slippage_pct,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY slippage_pct)::numeric, 2) AS median_slippage_pct,
  ROUND(MIN(slippage_pct)::numeric, 2) AS min_slippage_pct,
  ROUND(MAX(slippage_pct)::numeric, 2) AS max_slippage_pct
FROM bucketed
GROUP BY delay_bucket
ORDER BY MIN(delay_seconds);

\echo ''
\echo '=== B3. CORRELATION: DELAY vs SLIPPAGE (scatter summary) ==='
WITH trader_trades AS (
  SELECT t.wallet_address, t.condition_id, t.timestamp AS trader_trade_at, t.price AS trader_price, t.side
  FROM trades t
  WHERE t.side = 'BUY' AND t.condition_id IS NOT NULL
),
best_match AS (
  SELECT 
    EXTRACT(EPOCH FROM (o.created_at - tt.trader_trade_at)) AS delay_seconds,
    (o.amount_invested / NULLIF(o.filled_size, 0) - o.price_when_copied) / NULLIF(o.price_when_copied, 0) * 100 AS slippage_pct,
    ROW_NUMBER() OVER (PARTITION BY o.order_id ORDER BY tt.trader_trade_at DESC) AS rn
  FROM orders o
  JOIN trader_trades tt
    ON LOWER(TRIM(o.copied_trader_wallet)) = LOWER(tt.wallet_address)
   AND LOWER(TRIM(o.market_id)) = LOWER(tt.condition_id)
   AND tt.trader_trade_at <= o.created_at
   AND tt.trader_trade_at >= o.created_at - interval '1 hour'
   AND ABS(tt.trader_price - o.price_when_copied) / NULLIF(o.price_when_copied, 0) < 0.02
  WHERE o.copy_user_id IS NOT NULL
    AND o.copied_trade_id IS NOT NULL
    AND o.side = 'BUY'
    AND o.filled_size > 0
    AND o.price_when_copied > 0
    AND o.amount_invested > 0
)
SELECT 
  COUNT(*) AS n_with_trader_timestamp,
  ROUND(AVG(delay_seconds)::numeric, 0) AS avg_delay_seconds,
  ROUND(AVG(slippage_pct)::numeric, 3) AS avg_slippage_pct,
  ROUND(REGR_SLOPE(slippage_pct, delay_seconds)::numeric, 6) AS slippage_per_second_slope
FROM best_match
WHERE rn = 1;
