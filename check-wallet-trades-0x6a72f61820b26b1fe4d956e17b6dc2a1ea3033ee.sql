-- Simple query to list all trades for wallet
-- Wallet: 0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee

DECLARE trader_wallet STRING DEFAULT '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee';

SELECT 
  TIMESTAMP_SECONDS(t.timestamp) as trade_time,
  t.side,
  t.price,
  t.shares_normalized as size,
  t.price * t.shares_normalized as trade_value_usd,
  t.condition_id,
  t.token_label,
  t.token_id,
  t.tx_hash,
  t.order_hash,
  m.status as market_status,
  m.winning_label,
  m.title as market_title
FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.markets` m 
  ON t.condition_id = m.condition_id
WHERE LOWER(t.wallet_address) = LOWER(trader_wallet)
  AND t.price IS NOT NULL
  AND t.shares_normalized IS NOT NULL
ORDER BY t.timestamp ASC;
