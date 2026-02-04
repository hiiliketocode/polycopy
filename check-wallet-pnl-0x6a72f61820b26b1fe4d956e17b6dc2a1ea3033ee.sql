-- BigQuery Query for Wallet P&L (Realized + Unrealized + Blended)
-- Wallet: 0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee
-- Purpose: Calculate realized P&L (SELLs + resolved markets), unrealized P&L (open positions), and blended total

DECLARE trader_wallet STRING DEFAULT '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee';

-- Step 1: Get all trades with market resolution info
WITH all_trades AS (
  SELECT 
    t.timestamp,
    t.side,
    t.price,
    t.shares_normalized as size,
    t.condition_id,
    t.token_label,
    t.token_id,
    t.tx_hash,
    t.order_hash,
    m.status as market_status,
    m.winning_label,
    m.title as market_title,
    t.price * t.shares_normalized as trade_value_usd
  FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
  LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.markets` m 
    ON t.condition_id = m.condition_id
  WHERE LOWER(t.wallet_address) = LOWER(trader_wallet)
    AND t.price IS NOT NULL
    AND t.shares_normalized IS NOT NULL
  ORDER BY t.timestamp ASC
),

-- Step 2: Calculate net positions per condition_id + token_label
position_summary AS (
  SELECT 
    condition_id,
    token_label,
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
    -- Market resolution info
    MAX(market_status) as market_status,
    MAX(winning_label) as winning_label,
    MAX(market_title) as market_title,
    COUNT(*) as total_trades,
    COUNTIF(side = 'BUY') as buy_count,
    COUNTIF(side = 'SELL') as sell_count
  FROM all_trades
  GROUP BY condition_id, token_label
),

-- Step 3: Calculate realized P&L from SELL trades
sell_realized_pnl AS (
  SELECT 
    s.condition_id,
    s.token_label,
    s.timestamp,
    s.price as sell_price,
    s.size as sell_size,
    s.trade_value_usd as sell_proceeds,
    -- Get average cost basis from all BUYs up to this point
    (
      SELECT AVG(b.price)
      FROM all_trades b
      WHERE b.condition_id = s.condition_id
        AND b.token_label = s.token_label
        AND b.side = 'BUY'
        AND b.timestamp <= s.timestamp
    ) as avg_cost_basis,
    -- Calculate realized P&L
    (s.price - COALESCE((
      SELECT AVG(b.price)
      FROM all_trades b
      WHERE b.condition_id = s.condition_id
        AND b.token_label = s.token_label
        AND b.side = 'BUY'
        AND b.timestamp <= s.timestamp
    ), s.price)) * s.size as realized_pnl
  FROM all_trades s
  WHERE s.side = 'SELL'
),

-- Step 4: Calculate realized P&L from resolved markets
resolved_realized_pnl AS (
  SELECT 
    condition_id,
    token_label,
    net_position_size,
    total_cost,
    avg_entry_price,
    market_status,
    winning_label,
    market_title,
    -- Calculate P&L if market is closed/resolved and we have a net position
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
    END as resolved_pnl
  FROM position_summary
  WHERE market_status = 'closed' AND winning_label IS NOT NULL
),

-- Step 5: Aggregate summaries
trade_summary AS (
  SELECT 
    COUNT(*) as total_trades,
    COUNTIF(side = 'BUY') as buy_trades,
    COUNTIF(side = 'SELL') as sell_trades,
    SUM(CASE WHEN side = 'BUY' THEN trade_value_usd ELSE 0 END) as total_volume,
    SUM(CASE WHEN side = 'SELL' THEN trade_value_usd ELSE 0 END) as total_sell_value,
    MIN(timestamp) as first_trade,
    MAX(timestamp) as last_trade
  FROM all_trades
),

sell_pnl_summary AS (
  SELECT 
    COUNT(*) as sell_count,
    SUM(realized_pnl) as total_sell_pnl,
    COUNTIF(realized_pnl > 0) as profitable_sells,
    COUNTIF(realized_pnl <= 0) as unprofitable_sells
  FROM sell_realized_pnl
  WHERE realized_pnl IS NOT NULL
),

resolved_pnl_summary AS (
  SELECT 
    COUNT(*) as resolved_count,
    SUM(resolved_pnl) as total_resolved_pnl,
    COUNTIF(resolved_pnl > 0) as winning_resolutions,
    COUNTIF(resolved_pnl <= 0 AND resolved_pnl IS NOT NULL) as losing_resolutions,
    MAX(resolved_pnl) as biggest_win,
    MIN(resolved_pnl) as biggest_loss
  FROM resolved_realized_pnl
  WHERE resolved_pnl IS NOT NULL
),

-- Step 6: Get latest trade price for each condition_id + token_label (for unrealized P&L)
latest_prices AS (
  SELECT 
    condition_id,
    token_label,
    price as latest_price,
    timestamp as latest_trade_time
  FROM (
    SELECT 
      condition_id,
      token_label,
      price,
      timestamp,
      ROW_NUMBER() OVER (PARTITION BY condition_id, token_label ORDER BY timestamp DESC) as rn
    FROM all_trades
  )
  WHERE rn = 1
),

-- Step 7: Calculate open positions with unrealized P&L
open_positions AS (
  SELECT 
    ps.condition_id,
    ps.token_label,
    ps.net_position_size,
    ps.total_cost,
    ps.avg_entry_price,
    ps.market_status,
    ps.winning_label,
    ps.market_title,
    lp.latest_price,
    lp.latest_trade_time,
    -- Calculate unrealized P&L: (current_price - avg_entry_price) * net_position_size
    CASE 
      WHEN ps.avg_entry_price IS NOT NULL AND lp.latest_price IS NOT NULL THEN
        (lp.latest_price - ps.avg_entry_price) * ps.net_position_size
      ELSE NULL
    END as unrealized_pnl
  FROM position_summary ps
  LEFT JOIN latest_prices lp 
    ON ps.condition_id = lp.condition_id 
    AND ps.token_label = lp.token_label
  WHERE (ps.market_status IS NULL OR ps.market_status = 'open' OR (ps.market_status = 'closed' AND ps.winning_label IS NULL))
    AND ps.net_position_size > 0.0001
),

-- Step 8: Unrealized P&L summary
unrealized_pnl_summary AS (
  SELECT 
    COUNT(*) as open_positions_count,
    SUM(unrealized_pnl) as total_unrealized_pnl,
    COUNTIF(unrealized_pnl > 0) as profitable_open_positions,
    COUNTIF(unrealized_pnl <= 0 AND unrealized_pnl IS NOT NULL) as unprofitable_open_positions,
    MAX(unrealized_pnl) as biggest_unrealized_win,
    MIN(unrealized_pnl) as biggest_unrealized_loss,
    SUM(total_cost) as total_open_cost
  FROM open_positions
  WHERE unrealized_pnl IS NOT NULL
)

-- Final output
SELECT '=== TRADE SUMMARY ===' as category, '' as metric, NULL as value
UNION ALL
SELECT 'TRADE SUMMARY', 'Total Trades', CAST(total_trades AS STRING) FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'Buy Trades', CAST(buy_trades AS STRING) FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'Sell Trades', CAST(sell_trades AS STRING) FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'Total Volume (USD)', CAST(ROUND(total_volume, 2) AS STRING) FROM trade_summary
UNION ALL
SELECT 'TRADE SUMMARY', 'Total Sell Value (USD)', CAST(ROUND(total_sell_value, 2) AS STRING) FROM trade_summary

UNION ALL
SELECT '=== REALIZED P&L FROM SELLS ===' as category, '' as metric, NULL as value
UNION ALL
SELECT 'SELL P&L', 'Sell Count', CAST(sell_count AS STRING) FROM sell_pnl_summary
UNION ALL
SELECT 'SELL P&L', 'Total Realized P&L from Sells (USD)', CAST(ROUND(total_sell_pnl, 2) AS STRING) FROM sell_pnl_summary
UNION ALL
SELECT 'SELL P&L', 'Profitable Sells', CAST(profitable_sells AS STRING) FROM sell_pnl_summary
UNION ALL
SELECT 'SELL P&L', 'Unprofitable Sells', CAST(unprofitable_sells AS STRING) FROM sell_pnl_summary

UNION ALL
SELECT '=== REALIZED P&L FROM RESOLVED MARKETS ===' as category, '' as metric, NULL as value
UNION ALL
SELECT 'RESOLVED P&L', 'Resolved Positions', CAST(resolved_count AS STRING) FROM resolved_pnl_summary
UNION ALL
SELECT 'RESOLVED P&L', 'Total Realized P&L from Resolutions (USD)', CAST(ROUND(total_resolved_pnl, 2) AS STRING) FROM resolved_pnl_summary
UNION ALL
SELECT 'RESOLVED P&L', 'Winning Resolutions', CAST(winning_resolutions AS STRING) FROM resolved_pnl_summary
UNION ALL
SELECT 'RESOLVED P&L', 'Losing Resolutions', CAST(losing_resolutions AS STRING) FROM resolved_pnl_summary
UNION ALL
SELECT 'RESOLVED P&L', 'Biggest Win (USD)', CAST(ROUND(biggest_win, 2) AS STRING) FROM resolved_pnl_summary
UNION ALL
SELECT 'RESOLVED P&L', 'Biggest Loss (USD)', CAST(ROUND(biggest_loss, 2) AS STRING) FROM resolved_pnl_summary

UNION ALL
SELECT '=== REALIZED P&L SUMMARY ===' as category, '' as metric, NULL as value
UNION ALL
SELECT 'REALIZED P&L', 'Total Realized P&L (USD)', CAST(ROUND(
  COALESCE((SELECT total_sell_pnl FROM sell_pnl_summary), 0) + 
  COALESCE((SELECT total_resolved_pnl FROM resolved_pnl_summary), 0), 
  2
) AS STRING)

UNION ALL
SELECT '=== UNREALIZED P&L (OPEN POSITIONS) ===' as category, '' as metric, NULL as value
UNION ALL
SELECT 'UNREALIZED P&L', 'Open Positions Count', CAST(open_positions_count AS STRING) FROM unrealized_pnl_summary
UNION ALL
SELECT 'UNREALIZED P&L', 'Total Unrealized P&L (USD)', CAST(ROUND(total_unrealized_pnl, 2) AS STRING) FROM unrealized_pnl_summary
UNION ALL
SELECT 'UNREALIZED P&L', 'Profitable Open Positions', CAST(profitable_open_positions AS STRING) FROM unrealized_pnl_summary
UNION ALL
SELECT 'UNREALIZED P&L', 'Unprofitable Open Positions', CAST(unprofitable_open_positions AS STRING) FROM unrealized_pnl_summary
UNION ALL
SELECT 'UNREALIZED P&L', 'Biggest Unrealized Win (USD)', CAST(ROUND(biggest_unrealized_win, 2) AS STRING) FROM unrealized_pnl_summary
UNION ALL
SELECT 'UNREALIZED P&L', 'Biggest Unrealized Loss (USD)', CAST(ROUND(biggest_unrealized_loss, 2) AS STRING) FROM unrealized_pnl_summary
UNION ALL
SELECT 'UNREALIZED P&L', 'Total Open Cost (USD)', CAST(ROUND(total_open_cost, 2) AS STRING) FROM unrealized_pnl_summary

UNION ALL
SELECT '=== BLENDED P&L (REALIZED + UNREALIZED) ===' as category, '' as metric, NULL as value
UNION ALL
SELECT 'BLENDED P&L', 'Total Blended P&L (USD)', CAST(ROUND(
  COALESCE((SELECT total_sell_pnl FROM sell_pnl_summary), 0) + 
  COALESCE((SELECT total_resolved_pnl FROM resolved_pnl_summary), 0) +
  COALESCE((SELECT total_unrealized_pnl FROM unrealized_pnl_summary), 0), 
  2
) AS STRING)

UNION ALL
SELECT '=== OPEN POSITIONS DETAIL ===' as category, '' as metric, NULL as value
UNION ALL
SELECT 'OPEN POSITIONS', 'Open Positions Count', CAST(COUNT(*) AS STRING) FROM open_positions
UNION ALL
SELECT 'OPEN POSITIONS', 'Total Open Cost (USD)', CAST(ROUND(SUM(total_cost), 2) AS STRING) FROM open_positions

ORDER BY category, metric;
