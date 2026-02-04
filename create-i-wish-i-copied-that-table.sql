-- ============================================================================
-- CREATE TABLE: i_wish_i_copied_that
-- Purpose: Identify top "Anomaly" winning trades from last 7 days
-- Personas: Whales ($50k+ capital), Snipers (5x+ ROI on low-prob bets), 
--           Clutch (high-value bets in final 10 minutes)
-- 
-- NOTE: This query uses the `trades` table. If you have a `trades_cleaned` 
--       table/view, replace `trades` with `trades_cleaned` in the query below.
-- ============================================================================

CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that` AS

WITH 
-- Step 1: Get resolved markets from last 7 days
recent_markets AS (
  SELECT 
    condition_id,
    status,
    winning_label,
    end_time,
    completed_time,
    title,
    -- Use end_time if available, otherwise completed_time
    COALESCE(end_time, completed_time) as market_close_time
  FROM `gen-lang-client-0299056258.polycopy_v1.markets`
  WHERE status IN ('closed', 'resolved')
    AND winning_label IS NOT NULL
    AND COALESCE(end_time, completed_time) >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
),

-- Step 2: Get winning trades (BUY side only, matching winning_label)
-- NOTE: If you have a `trades_cleaned` table, replace `trades` with `trades_cleaned` below
winning_trades AS (
  SELECT 
    t.id as trade_id,
    t.condition_id,
    t.wallet_address,
    t.timestamp,
    t.side,
    t.price,
    t.shares_normalized as shares,
    t.token_label,
    m.winning_label,
    m.market_close_time,
    m.title as market_title,
    -- Calculate invested USD (price * shares)
    t.price * t.shares_normalized as invested_usd,
    -- Calculate ROI: (1.0 - entry_price) / entry_price * 100
    -- For winning trades, exit price is $1.00
    CASE 
      WHEN t.price > 0 THEN ((1.0 - t.price) / t.price) * 100.0
      ELSE NULL
    END as roi_pct,
    -- Calculate minutes before market close
    CASE 
      WHEN m.market_close_time IS NOT NULL AND t.timestamp IS NOT NULL THEN
        TIMESTAMP_DIFF(m.market_close_time, t.timestamp, MINUTE)
      ELSE NULL
    END as mins_before_close
  FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
  INNER JOIN recent_markets m
    -- Handle potential case sensitivity and whitespace issues
    ON LOWER(TRIM(COALESCE(t.condition_id, ''))) = LOWER(TRIM(COALESCE(m.condition_id, '')))
    AND LOWER(TRIM(COALESCE(t.condition_id, ''))) != ''  -- Exclude empty strings
  WHERE t.side = 'BUY'
    AND t.token_label IS NOT NULL
    AND m.winning_label IS NOT NULL
    -- Verify trade won: token_label matches winning_label (case-insensitive)
    AND LOWER(TRIM(t.token_label)) = LOWER(TRIM(m.winning_label))
    AND t.price IS NOT NULL
    AND t.shares_normalized IS NOT NULL
    AND t.price > 0
    AND t.shares_normalized > 0
),

-- Step 3: Calculate trader volume per market (to filter bots)
-- This aggregates all trades by a trader in a single market
trader_market_volume AS (
  SELECT 
    wt.condition_id,
    wt.wallet_address,
    SUM(wt.invested_usd) as total_invested_usd
  FROM winning_trades wt
  GROUP BY wt.condition_id, wt.wallet_address
  HAVING SUM(wt.invested_usd) >= 100.0  -- Pre-filter for efficiency
),

-- Step 4: Filter for Human trades ($100 - $1M volume per trader per market)
human_trades AS (
  SELECT 
    wt.*,
    tmv.total_invested_usd as trader_market_volume
  FROM winning_trades wt
  INNER JOIN trader_market_volume tmv
    ON wt.condition_id = tmv.condition_id
    AND wt.wallet_address = tmv.wallet_address
  WHERE tmv.total_invested_usd >= 100.0
    AND tmv.total_invested_usd <= 1000000.0
),

-- Step 5: Classify personas
classified_trades AS (
  SELECT 
    *,
    CASE 
      -- Clutch: High-value bets in final 10 minutes
      WHEN invested_usd >= 1000.0 
        AND mins_before_close IS NOT NULL 
        AND mins_before_close <= 10 
        AND mins_before_close >= 0 THEN 'Clutch'
      -- Whale: Large capital ($50k+)
      WHEN trader_market_volume >= 50000.0 THEN 'Whale'
      -- Sniper: High ROI (5x+) on low-probability bets (price < 0.20)
      WHEN roi_pct >= 500.0 
        AND price < 0.20 THEN 'Sniper'
      -- Default: High ROI winner
      WHEN roi_pct >= 200.0 THEN 'High ROI'
      ELSE 'Standard'
    END as story_label
  FROM human_trades
),

-- Step 6: Get trader stats for context (optional - table may not exist)
trades_with_stats AS (
  SELECT 
    ct.*,
    -- Try to get trader stats, but handle if table doesn't exist
    COALESCE(tgs.L_win_rate, 0.0) as lifetime_win_rate,
    COALESCE(tgs.L_total_pnl_usd, 0.0) as lifetime_pnl_usd
  FROM classified_trades ct
  LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.trader_global_stats` tgs
    ON LOWER(TRIM(ct.wallet_address)) = LOWER(TRIM(tgs.wallet_address))
)

-- Final output: Select top anomaly trades
SELECT 
  trade_id,
  condition_id,
  wallet_address,
  timestamp,
  price as entry_price,
  shares,
  invested_usd,
  roi_pct,
  mins_before_close,
  story_label,
  market_title,
  winning_label,
  market_close_time,
  trader_market_volume,
  lifetime_win_rate,
  lifetime_pnl_usd,
  -- Additional metadata
  CURRENT_TIMESTAMP() as created_at
FROM trades_with_stats
WHERE story_label IN ('Whale', 'Sniper', 'Clutch', 'High ROI')
ORDER BY 
  -- Prioritize by persona, then by ROI
  CASE story_label
    WHEN 'Clutch' THEN 1
    WHEN 'Whale' THEN 2
    WHEN 'Sniper' THEN 3
    WHEN 'High ROI' THEN 4
    ELSE 5
  END,
  roi_pct DESC,
  invested_usd DESC
