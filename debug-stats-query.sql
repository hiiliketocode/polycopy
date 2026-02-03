-- Debug query to check if stats calculation is working
-- Run this in BigQuery to test a specific wallet

DECLARE test_wallet STRING DEFAULT '0x004c3cab'; -- Replace with actual wallet

WITH buy_trades AS (
  SELECT 
    t.timestamp,
    t.price as entry_price,
    t.shares_normalized,
    t.condition_id,
    t.token_label,
    m.status as market_status,
    m.winning_label,
    -- Calculate trade size (USD)
    t.price * t.shares_normalized as trade_size_usd,
    -- Determine exit price: 1.0 for wins, 0.0 for losses, NULL for open
    CASE 
      WHEN m.status = 'resolved' AND t.token_label = m.winning_label THEN 1.0
      WHEN m.status = 'resolved' AND t.token_label != m.winning_label THEN 0.0
      ELSE NULL
    END as exit_price,
    -- Calculate PnL: (exit_price - entry_price) * shares for resolved trades
    CASE 
      WHEN m.status = 'resolved' AND t.token_label = m.winning_label THEN (1.0 - t.price) * t.shares_normalized
      WHEN m.status = 'resolved' AND t.token_label != m.winning_label THEN (0.0 - t.price) * t.shares_normalized
      ELSE NULL
    END as pnl_usd,
    -- Determine if this is a win/loss
    CASE 
      WHEN m.status = 'resolved' AND t.token_label = m.winning_label THEN 1
      WHEN m.status = 'resolved' AND t.token_label != m.winning_label THEN 0
      ELSE NULL
    END as is_win
  FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
  LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.markets` m ON t.condition_id = m.condition_id
  WHERE LOWER(t.wallet_address) = LOWER(test_wallet)  -- Case-insensitive match
    AND t.side = 'BUY'
    AND t.price IS NOT NULL
    AND t.shares_normalized IS NOT NULL
  LIMIT 10
)
SELECT 
  *,
  COUNT(*) OVER() as total_trades,
  COUNTIF(is_win IS NOT NULL) OVER() as resolved_count,
  COUNTIF(is_win = 1) OVER() as wins_count
FROM buy_trades
ORDER BY timestamp DESC;
