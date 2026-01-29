-- Quick trade count queries for BigQuery

-- Total trades
SELECT COUNT(*) as total_trades
FROM `gen-lang-client-0299056258.polycopy_v1.trades`;

-- Trades with breakdown by wallet
SELECT 
  COUNT(*) as total_trades,
  COUNT(DISTINCT wallet_address) as unique_wallets,
  COUNT(DISTINCT condition_id) as unique_markets,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade
FROM `gen-lang-client-0299056258.polycopy_v1.trades`;

-- Top wallets by trade count
SELECT 
  wallet_address,
  COUNT(*) as trade_count
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
GROUP BY wallet_address
ORDER BY trade_count DESC
LIMIT 20;

-- Recent trades (last hour)
SELECT COUNT(*) as recent_trades
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR);

-- Trades added today
SELECT COUNT(*) as trades_today
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE DATE(timestamp) = CURRENT_DATE();
