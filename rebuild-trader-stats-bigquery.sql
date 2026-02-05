-- ============================================================================
-- Rebuild Trader Global Stats Table
-- Calculates stats from trades table for all wallets
-- ============================================================================

CREATE OR REPLACE TABLE `gen-lang-client-0299056258.polycopy_v1.trader_global_stats` AS
WITH buy_trades AS (
  SELECT 
    LOWER(TRIM(t.wallet_address)) as wallet_address,
    t.timestamp,
    t.price,
    t.shares_normalized,
    t.condition_id,
    t.token_label,
    m.status as market_status,
    m.winning_label,
    -- Calculate trade size (USD)
    t.price * t.shares_normalized as trade_size_usd,
    -- Calculate PnL for resolved trades
    CASE 
      WHEN m.status = 'closed' AND t.token_label = m.winning_label THEN (1.0 - t.price) * t.shares_normalized
      WHEN m.status = 'closed' AND t.token_label != m.winning_label THEN (0.0 - t.price) * t.shares_normalized
      ELSE NULL
    END as pnl_usd,
    -- Determine if win/loss
    CASE 
      WHEN m.status = 'closed' AND t.token_label = m.winning_label THEN 1
      WHEN m.status = 'closed' AND t.token_label != m.winning_label THEN 0
      ELSE NULL
    END as is_win
  FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
  LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.markets` m 
    ON t.condition_id = m.condition_id
  WHERE t.side = 'BUY'
    AND t.price IS NOT NULL
    AND t.shares_normalized IS NOT NULL
    AND t.wallet_address IS NOT NULL
),
stats_by_wallet AS (
  SELECT 
    wallet_address,
    -- Lifetime stats
    COUNT(*) as L_count,
    COUNTIF(is_win IS NOT NULL) as L_resolved_count,
    COUNTIF(is_win = 1) as L_wins,
    SUM(pnl_usd) as L_total_pnl_usd,
    SUM(trade_size_usd) as L_total_invested_usd,
    AVG(trade_size_usd) as L_avg_trade_size_usd,
    STDDEV(trade_size_usd) as L_stddev_trade_size_usd,
    AVG(pnl_usd) as L_avg_pnl_trade_usd,
    -- Last 30 days
    COUNTIF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)) as D30_count,
    COUNTIF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY) AND is_win IS NOT NULL) as D30_resolved_count,
    COUNTIF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY) AND is_win = 1) as D30_wins,
    SUM(IF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY), pnl_usd, 0)) as D30_total_pnl_usd,
    SUM(IF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY), trade_size_usd, 0)) as D30_total_invested_usd,
    AVG(IF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY), trade_size_usd, NULL)) as D30_avg_trade_size_usd,
    AVG(IF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY), pnl_usd, NULL)) as D30_avg_pnl_trade_usd,
    -- Last 7 days
    COUNTIF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)) as D7_count,
    COUNTIF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY) AND is_win IS NOT NULL) as D7_resolved_count,
    COUNTIF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY) AND is_win = 1) as D7_wins,
    SUM(IF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY), pnl_usd, 0)) as D7_total_pnl_usd,
    SUM(IF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY), trade_size_usd, 0)) as D7_total_invested_usd,
    AVG(IF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY), trade_size_usd, NULL)) as D7_avg_trade_size_usd,
    AVG(IF(timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY), pnl_usd, NULL)) as D7_avg_pnl_trade_usd,
    -- Position stats (average position size)
    AVG(trade_size_usd) as L_avg_pos_size_usd,
    -- Average trades per position (simplified - using distinct positions)
    CASE 
      WHEN COUNT(DISTINCT condition_id) > 0 THEN 
        COUNT(*) / COUNT(DISTINCT condition_id)
      ELSE 0
    END as L_avg_trades_per_pos
  FROM buy_trades
  GROUP BY wallet_address
)
SELECT 
  wallet_address,
  -- Lifetime counts
  L_count,
  D30_count,
  D7_count,
  -- Lifetime win rates
  CASE 
    WHEN L_resolved_count > 0 THEN SAFE_DIVIDE(L_wins, L_resolved_count)
    ELSE 0.5
  END as L_win_rate,
  CASE 
    WHEN D30_resolved_count > 0 THEN SAFE_DIVIDE(D30_wins, D30_resolved_count)
    ELSE 0.5
  END as D30_win_rate,
  CASE 
    WHEN D7_resolved_count > 0 THEN SAFE_DIVIDE(D7_wins, D7_resolved_count)
    ELSE 0.5
  END as D7_win_rate,
  -- Lifetime PnL
  COALESCE(L_total_pnl_usd, 0.0) as L_total_pnl_usd,
  COALESCE(D30_total_pnl_usd, 0.0) as D30_total_pnl_usd,
  COALESCE(D7_total_pnl_usd, 0.0) as D7_total_pnl_usd,
  -- Lifetime ROI %
  CASE 
    WHEN L_total_invested_usd > 0 THEN (L_total_pnl_usd / L_total_invested_usd) * 100.0
    ELSE 0.0
  END as L_total_roi_pct,
  CASE 
    WHEN D30_total_invested_usd > 0 THEN (D30_total_pnl_usd / D30_total_invested_usd) * 100.0
    ELSE 0.0
  END as D30_total_roi_pct,
  CASE 
    WHEN D7_total_invested_usd > 0 THEN (D7_total_pnl_usd / D7_total_invested_usd) * 100.0
    ELSE 0.0
  END as D7_total_roi_pct,
  -- Average PnL per trade
  COALESCE(L_avg_pnl_trade_usd, 0.0) as L_avg_pnl_trade_usd,
  COALESCE(D30_avg_pnl_trade_usd, 0.0) as D30_avg_pnl_trade_usd,
  COALESCE(D7_avg_pnl_trade_usd, 0.0) as D7_avg_pnl_trade_usd,
  -- Average trade size
  COALESCE(L_avg_trade_size_usd, 0.0) as L_avg_trade_size_usd,
  COALESCE(D30_avg_trade_size_usd, 0.0) as D30_avg_trade_size_usd,
  COALESCE(D7_avg_trade_size_usd, 0.0) as D7_avg_trade_size_usd,
  -- Position stats
  COALESCE(L_avg_pos_size_usd, 0.0) as L_avg_pos_size_usd,
  COALESCE(L_avg_trades_per_pos, 0.0) as L_avg_trades_per_pos,
  -- Win streak (calculate separately - simplified to 0 for now)
  0 as current_win_streak
FROM stats_by_wallet;
