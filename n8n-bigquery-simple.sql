-- ============================================================================
-- n8n BigQuery Node Query: Simple version with excitement category
-- Use this if you want all columns without listing them explicitly
-- ============================================================================

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
  market_title,
  market_type,
  market_subtype,
  bet_structure,
  market_slug,
  event_slug,
  market_image,
  resolution_source,
  market_volume_total,
  market_volume_1_week,
  market_liquidity,
  winning_label,
  winning_id,
  side_a,
  side_b,
  market_tags,
  token_label,
  token_id,
  tx_hash,
  order_hash,
  market_close_time,
  trader_market_volume,
  lifetime_win_rate,
  lifetime_pnl_usd,
  lifetime_trade_count,
  last_30d_pnl_usd,
  excitement_score,
  roi_score,
  size_score,
  profit_score,
  clutch_score,
  market_popularity_score,
  trade_rank_per_market,
  created_at,
  -- Excitement Category: Why this trade is exciting
  CASE
    -- Clutch Play: Last-minute high-value bet
    WHEN mins_before_close IS NOT NULL 
         AND mins_before_close <= 10 
         AND mins_before_close >= 0
         AND invested_usd >= 1000.0 
         AND roi_pct >= 500.0 THEN 'Clutch Play'
    
    -- Whale Trade: Large capital deployment
    WHEN invested_usd >= 5000.0 
         AND profit_usd >= 10000.0 THEN 'Whale Trade'
    
    -- Sniper: High ROI on low-probability bet
    WHEN roi_pct >= 2000.0 
         AND entry_price < 0.15 THEN 'Sniper'
    
    -- Perfect Storm: Exceptional ROI + large profit
    WHEN roi_pct >= 1500.0 
         AND profit_usd >= 20000.0 THEN 'Perfect Storm'
    
    -- High ROI Winner: Exceptional returns
    WHEN roi_pct >= 2000.0 THEN 'High ROI Winner'
    
    -- Big Profit: Large absolute profit
    WHEN profit_usd >= 50000.0 THEN 'Big Profit'
    
    -- High ROI: Strong returns
    WHEN roi_pct >= 1000.0 THEN 'High ROI'
    
    -- Solid Trade: Good all-around performance
    ELSE 'Solid Trade'
  END as excitement_category
FROM `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that`
ORDER BY excitement_score DESC
LIMIT 50;
