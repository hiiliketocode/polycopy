-- ============================================================================
-- Analysis: Top 20 NFL Traders - Super Bowl Trading Positions
-- Purpose: Find top 20 traders by NFL PnL% and analyze their Super Bowl trades
-- Database: BigQuery (gen-lang-client-0299056258.polycopy_v1)
-- ============================================================================

-- Step 1: Get top 20 traders by NFL PnL% (from trader_profile_stats)
WITH top_nfl_traders AS (
  SELECT 
    wallet_address,
    L_total_roi_pct as nfl_pnl_pct,
    L_win_rate as nfl_win_rate,
    L_count as nfl_trade_count
  FROM `gen-lang-client-0299056258.polycopy_v1.trader_profile_stats`
  WHERE final_niche = 'NFL'
    AND L_total_roi_pct IS NOT NULL
    AND L_count >= 5  -- Minimum trades to be meaningful
  ORDER BY L_total_roi_pct DESC
  LIMIT 20
),

-- Step 2: Find all markets with "superbowl" tag (case-insensitive)
superbowl_markets AS (
  SELECT 
    condition_id,
    title,
    status,
    winning_label,
    volume_total
  FROM `gen-lang-client-0299056258.polycopy_v1.markets`
  WHERE (
    -- Check if tags JSON array contains "superbowl" (case-insensitive)
    (tags IS NOT NULL AND EXISTS (
      SELECT 1 FROM UNNEST(JSON_EXTRACT_ARRAY(tags)) AS tag
      WHERE LOWER(JSON_EXTRACT_SCALAR(tag)) LIKE '%superbowl%'
    ))
    OR LOWER(COALESCE(title, '')) LIKE '%superbowl%'
    OR LOWER(COALESCE(title, '')) LIKE '%super bowl%'
  )
  GROUP BY condition_id, title, status, winning_label, volume_total
),

-- Step 3: Get all trades from top NFL traders on Super Bowl markets
superbowl_trades AS (
  SELECT 
    t.wallet_address,
    t.timestamp,
    t.side,
    t.price,
    t.shares_normalized as size,
    t.condition_id,
    t.token_label,
    t.tx_hash,
    t.order_hash,
    m.title as market_title,
    m.status as market_status,
    m.winning_label,
    m.volume_total,
    t.price * t.shares_normalized as trade_value_usd,
    tr.nfl_pnl_pct,
    tr.nfl_win_rate,
    tr.nfl_trade_count
  FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
  INNER JOIN top_nfl_traders tr
    ON LOWER(t.wallet_address) = LOWER(tr.wallet_address)
  INNER JOIN superbowl_markets m
    ON t.condition_id = m.condition_id
  WHERE t.price IS NOT NULL
    AND t.shares_normalized IS NOT NULL
  ORDER BY t.wallet_address, t.timestamp ASC
),

-- Step 4: Calculate position summaries per trader per market
position_summary AS (
  SELECT 
    wallet_address,
    condition_id,
    market_title,
    token_label,
    market_status,
    winning_label,
    volume_total,
    nfl_pnl_pct,
    nfl_win_rate,
    nfl_trade_count,
    -- Net position size (BUYs - SELLs)
    SUM(CASE WHEN side = 'BUY' THEN size ELSE -size END) as net_position_size,
    -- Total cost basis (from BUYs only)
    SUM(CASE WHEN side = 'BUY' THEN trade_value_usd ELSE 0 END) as total_cost,
    -- Total proceeds (from SELLs only)
    SUM(CASE WHEN side = 'SELL' THEN trade_value_usd ELSE 0 END) as total_proceeds,
    -- Average entry price (weighted by size)
    CASE 
      WHEN SUM(CASE WHEN side = 'BUY' THEN size ELSE 0 END) > 0 THEN
        SUM(CASE WHEN side = 'BUY' THEN trade_value_usd ELSE 0 END) / 
        SUM(CASE WHEN side = 'BUY' THEN size ELSE 0 END)
      ELSE NULL
    END as avg_entry_price,
    -- Trade counts
    COUNT(*) as total_trades,
    COUNTIF(side = 'BUY') as buy_count,
    COUNTIF(side = 'SELL') as sell_count,
    -- Timestamps
    MIN(timestamp) as first_trade_time,
    MAX(timestamp) as last_trade_time
  FROM superbowl_trades
  GROUP BY 
    wallet_address,
    condition_id,
    market_title,
    token_label,
    market_status,
    winning_label,
    volume_total,
    nfl_pnl_pct,
    nfl_win_rate,
    nfl_trade_count
),

-- Step 5: Calculate PnL for each position
position_pnl AS (
  SELECT 
    *,
    -- Calculate realized PnL if market is resolved
    CASE 
      WHEN market_status = 'closed' 
        AND winning_label IS NOT NULL
        AND net_position_size > 0.0001  -- Has remaining position
        AND avg_entry_price IS NOT NULL THEN
        CASE 
          WHEN token_label = winning_label THEN 
            -- Win: exit at $1.00, P&L = (1.0 - entry_price) * net_position_size
            (1.0 - avg_entry_price) * net_position_size
          ELSE 
            -- Loss: exit at $0.00, P&L = (0.0 - entry_price) * net_position_size
            (0.0 - avg_entry_price) * net_position_size
        END
      ELSE NULL
    END as realized_pnl,
    -- Position status
    CASE 
      WHEN market_status = 'closed' AND winning_label IS NOT NULL THEN 'Resolved'
      WHEN net_position_size > 0.0001 THEN 'Open'
      WHEN net_position_size < -0.0001 THEN 'Over-sold'
      ELSE 'Closed'
    END as position_status
  FROM position_summary
),

-- Step 6: Aggregate by trader
trader_summary AS (
  SELECT 
    wallet_address,
    nfl_pnl_pct,
    nfl_win_rate,
    nfl_trade_count,
    COUNT(DISTINCT condition_id) as superbowl_markets_traded,
    COUNT(*) as total_superbowl_positions,
    SUM(total_cost) as total_invested_superbowl,
    SUM(CASE WHEN realized_pnl IS NOT NULL THEN realized_pnl ELSE 0 END) as total_realized_pnl,
    SUM(CASE WHEN position_status = 'Open' THEN total_cost ELSE 0 END) as open_position_value,
    COUNTIF(position_status = 'Resolved' AND realized_pnl > 0) as winning_positions,
    COUNTIF(position_status = 'Resolved' AND realized_pnl <= 0 AND realized_pnl IS NOT NULL) as losing_positions,
    COUNTIF(position_status = 'Open') as open_positions,
    AVG(CASE WHEN realized_pnl IS NOT NULL THEN realized_pnl ELSE NULL END) as avg_position_pnl,
    MAX(CASE WHEN realized_pnl IS NOT NULL THEN realized_pnl ELSE NULL END) as best_position_pnl,
    MIN(CASE WHEN realized_pnl IS NOT NULL THEN realized_pnl ELSE NULL END) as worst_position_pnl
  FROM position_pnl
  GROUP BY 
    wallet_address,
    nfl_pnl_pct,
    nfl_win_rate,
    nfl_trade_count
)

-- Final output: Trader summary with Super Bowl analysis
SELECT 
  wallet_address,
  ROUND(nfl_pnl_pct, 2) as nfl_pnl_pct,
  ROUND(nfl_win_rate, 2) as nfl_win_rate,
  nfl_trade_count,
  superbowl_markets_traded,
  total_superbowl_positions,
  ROUND(total_invested_superbowl, 2) as total_invested_superbowl,
  ROUND(total_realized_pnl, 2) as total_realized_pnl,
  ROUND(open_position_value, 2) as open_position_value,
  ROUND(
    CASE 
      WHEN total_invested_superbowl > 0 THEN 
        (total_realized_pnl / total_invested_superbowl) * 100 
      ELSE NULL 
    END, 
    2
  ) as superbowl_roi_pct,
  winning_positions,
  losing_positions,
  open_positions,
  ROUND(avg_position_pnl, 2) as avg_position_pnl,
  ROUND(best_position_pnl, 2) as best_position_pnl,
  ROUND(worst_position_pnl, 2) as worst_position_pnl,
  ROUND(
    CASE 
      WHEN winning_positions + losing_positions > 0 THEN 
        (winning_positions / (winning_positions + losing_positions)) * 100 
      ELSE NULL 
    END, 
    2
  ) as superbowl_win_rate_pct
FROM trader_summary
ORDER BY nfl_pnl_pct DESC;

-- ============================================================================
-- Detailed Position Breakdown (Run separately if needed)
-- ============================================================================
/*
SELECT 
  wallet_address,
  market_title,
  token_label,
  position_status,
  ROUND(net_position_size, 4) as net_position_size,
  ROUND(total_cost, 2) as total_cost,
  ROUND(realized_pnl, 2) as realized_pnl,
  ROUND(avg_entry_price, 4) as avg_entry_price,
  total_trades,
  buy_count,
  sell_count,
  market_status,
  winning_label,
  FROM_UNIXTIME(first_trade_time) as first_trade_time,
  FROM_UNIXTIME(last_trade_time) as last_trade_time
FROM position_pnl
ORDER BY wallet_address, market_title, token_label;
*/
