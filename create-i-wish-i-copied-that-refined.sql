-- ============================================================================
-- CREATE TABLE: i_wish_i_copied_that (REFINED VERSION)
-- Purpose: Identify the MOST EXCITING winning trades from last 7 days
-- Criteria: 
--   - Minimum 5x ROI (500%)
--   - Large trades: $100k+ with decent ROI OR exceptional ROI
--   - Only closed markets
--   - Top 100-200 most exciting trades
--   - Maximum context for AI agent
-- ============================================================================

CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that` AS

WITH 
-- Step 1: Get resolved markets from last 7 days (must be closed)
recent_markets AS (
  SELECT 
    condition_id,
    status,
    winning_label,
    winning_id,
    end_time,
    completed_time,
    title,
    description,
    market_type,
    market_subtype,
    bet_structure,
    market_slug,
    event_slug,
    resolution_source,
    image,
    volume_total,
    volume_1_week,
    volume_1_month,
    liquidity,
    side_a,
    side_b,
    tags,
    -- Use end_time if available, otherwise completed_time
    COALESCE(end_time, completed_time) as market_close_time
  FROM `gen-lang-client-0299056258.polycopy_v1.markets`
  WHERE status IN ('closed', 'resolved')
    AND winning_label IS NOT NULL
    AND COALESCE(end_time, completed_time) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
    AND COALESCE(end_time, completed_time) < CURRENT_TIMESTAMP()  -- Must be closed
),

-- Step 2: Get winning trades (BUY side only, matching winning_label)
winning_trades AS (
  SELECT 
    t.id as trade_id,
    t.condition_id,
    t.wallet_address,
    t.timestamp,
    t.side,
    t.price as entry_price,
    t.shares_normalized as shares,
    t.token_label,
    t.token_id,
    t.tx_hash,
    t.order_hash,
    m.winning_label,
    m.winning_id,
    m.market_close_time,
    m.title as market_title,
    m.description as market_description,
    m.market_type,
    m.market_subtype,
    m.bet_structure,
    m.market_slug,
    m.event_slug,
    m.resolution_source,
    m.image as market_image,
    m.volume_total as market_volume_total,
    m.volume_1_week as market_volume_1_week,
    m.liquidity as market_liquidity,
    m.side_a,
    m.side_b,
    m.tags as market_tags,
    -- Calculate invested USD (price * shares)
    t.price * t.shares_normalized as invested_usd,
    -- Calculate ROI: (1.0 - entry_price) / entry_price * 100
    CASE 
      WHEN t.price > 0 THEN ((1.0 - t.price) / t.price) * 100.0
      ELSE NULL
    END as roi_pct,
    -- Calculate minutes before market close
    CASE 
      WHEN m.market_close_time IS NOT NULL AND t.timestamp IS NOT NULL THEN
        TIMESTAMP_DIFF(m.market_close_time, t.timestamp, MINUTE)
      ELSE NULL
    END as mins_before_close,
    -- Calculate profit USD
    CASE 
      WHEN t.price > 0 THEN (1.0 - t.price) * t.shares_normalized
      ELSE NULL
    END as profit_usd
  FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
  INNER JOIN recent_markets m
    ON LOWER(TRIM(COALESCE(t.condition_id, ''))) = LOWER(TRIM(COALESCE(m.condition_id, '')))
    AND LOWER(TRIM(COALESCE(t.condition_id, ''))) != ''
  WHERE t.side = 'BUY'
    AND t.token_label IS NOT NULL
    AND m.winning_label IS NOT NULL
    AND LOWER(TRIM(t.token_label)) = LOWER(TRIM(m.winning_label))
    AND t.price IS NOT NULL
    AND t.shares_normalized IS NOT NULL
    AND t.price > 0
    AND t.shares_normalized > 0
    -- Minimum 5x ROI requirement (relaxed slightly to get more candidates for scoring)
    AND ((1.0 - t.price) / t.price) >= 4.5
),

-- Step 3: Calculate trader volume per market (to filter bots)
trader_market_volume AS (
  SELECT 
    wt.condition_id,
    wt.wallet_address,
    SUM(wt.invested_usd) as total_invested_usd
  FROM winning_trades wt
  GROUP BY wt.condition_id, wt.wallet_address
  HAVING SUM(wt.invested_usd) >= 100.0  -- Minimum $100 per trader per market
),

-- Step 4: Filter for Human trades and apply strict criteria
filtered_trades AS (
  SELECT 
    wt.*,
    tmv.total_invested_usd as trader_market_volume
  FROM winning_trades wt
  INNER JOIN trader_market_volume tmv
    ON wt.condition_id = tmv.condition_id
    AND wt.wallet_address = tmv.wallet_address
  WHERE 
    -- Relaxed filter: Let excitement scoring do the work
    -- Minimum 5x ROI (enforced here since we relaxed it earlier)
    wt.roi_pct >= 500.0
    -- And minimum investment to filter out dust
    AND wt.invested_usd >= 50.0
    -- Filter out bots: reasonable volume range
    AND tmv.total_invested_usd >= 100.0
    AND tmv.total_invested_usd <= 10000000.0  -- Max $10M per trader per market
),

-- Step 5: Get trader stats for context
trades_with_stats AS (
  SELECT 
    ft.*,
    COALESCE(tgs.L_win_rate, 0.0) as lifetime_win_rate,
    COALESCE(tgs.L_total_pnl_usd, 0.0) as lifetime_pnl_usd,
    COALESCE(tgs.L_count, 0) as lifetime_trade_count,
    COALESCE(tgs.D30_total_pnl_usd, 0.0) as last_30d_pnl_usd
  FROM filtered_trades ft
  LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.trader_global_stats` tgs
    ON LOWER(TRIM(ft.wallet_address)) = LOWER(TRIM(tgs.wallet_address))
),

-- Step 6: Calculate excitement score
scored_trades AS (
  SELECT 
    *,
    -- Excitement Score Components:
    -- 1. ROI component (0-40 points): Higher ROI = more exciting
    LEAST(40.0, (roi_pct / 25.0)) as roi_score,
    
    -- 2. Size component (0-25 points): Larger trades = more exciting
    LEAST(25.0, (invested_usd / 10000.0)) as size_score,
    
    -- 3. Profit component (0-20 points): Absolute profit matters
    LEAST(20.0, (profit_usd / 50000.0)) as profit_score,
    
    -- 4. Clutch component (0-10 points): Last-minute trades are exciting
    CASE 
      WHEN mins_before_close IS NOT NULL 
        AND mins_before_close <= 10 
        AND mins_before_close >= 0 
        AND invested_usd >= 1000.0 THEN 10.0
      WHEN mins_before_close IS NOT NULL 
        AND mins_before_close <= 30 
        AND mins_before_close >= 0 
        AND invested_usd >= 5000.0 THEN 5.0
      ELSE 0.0
    END as clutch_score,
    
    -- 5. Market volume component (0-5 points): Popular markets are more interesting
    CASE 
      WHEN market_volume_total >= 1000000.0 THEN 5.0
      WHEN market_volume_total >= 500000.0 THEN 3.0
      WHEN market_volume_total >= 100000.0 THEN 1.0
      ELSE 0.0
    END as market_popularity_score
    
  FROM trades_with_stats
),

-- Step 7: Calculate total excitement score
ranked_trades AS (
  SELECT 
    *,
    (roi_score + size_score + profit_score + clutch_score + market_popularity_score) as excitement_score,
    ROW_NUMBER() OVER (
      PARTITION BY condition_id 
      ORDER BY (roi_score + size_score + profit_score + clutch_score + market_popularity_score) DESC
    ) as trade_rank_per_market  -- Rank trades within same market
  FROM scored_trades
)

-- Final output: Top 200 most exciting trades (filtered to ensure quality)
SELECT 
  trade_id,
  condition_id,
  wallet_address,
  timestamp,
  entry_price,
  shares,
  invested_usd,
  profit_usd,
  roi_pct,
  mins_before_close,
  
  -- Market information
  market_title,
  market_description,
  market_type,
  market_subtype,
  bet_structure,
  market_slug,
  event_slug,
  market_image,
  resolution_source,
  
  -- Market volume/liquidity
  market_volume_total,
  market_volume_1_week,
  market_liquidity,
  
  -- Market outcomes
  winning_label,
  winning_id,
  side_a,
  side_b,
  market_tags,
  
  -- Trade details
  token_label,
  token_id,
  tx_hash,
  order_hash,
  market_close_time,
  
  -- Trader context
  trader_market_volume,
  lifetime_win_rate,
  lifetime_pnl_usd,
  lifetime_trade_count,
  last_30d_pnl_usd,
  
  -- Scoring
  excitement_score,
  roi_score,
  size_score,
  profit_score,
  clutch_score,
  market_popularity_score,
  trade_rank_per_market,
  
  -- Metadata
  CURRENT_TIMESTAMP() as created_at
FROM ranked_trades
WHERE trade_rank_per_market = 1  -- Only top trade per market
  -- Final quality filter: ensure minimum standards
  AND roi_pct >= 500.0  -- Minimum 5x ROI
  AND (
    invested_usd >= 100.0  -- Minimum $100 investment
    OR profit_usd >= 500.0  -- OR at least $500 profit
  )
ORDER BY excitement_score DESC
LIMIT 200;  -- Top 200 most exciting trades
