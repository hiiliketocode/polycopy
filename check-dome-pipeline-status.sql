-- Check Dome to BigQuery Pipeline Status
-- This query analyzes:
-- 1. Recent trade timestamps
-- 2. Wallets with new trades from yesterday and today
-- 3. Traders table update frequency

DECLARE today_date DATE DEFAULT CURRENT_DATE();
DECLARE yesterday_date DATE DEFAULT DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY);
DECLARE two_days_ago DATE DEFAULT DATE_SUB(CURRENT_DATE(), INTERVAL 2 DAY);

-- 1. Check latest trade timestamps and overall stats
SELECT 
  '=== LATEST TRADE TIMESTAMPS ===' as section,
  MAX(timestamp) as latest_trade_timestamp,
  MIN(timestamp) as earliest_trade_timestamp,
  COUNT(*) as total_trades,
  COUNT(DISTINCT wallet_address) as unique_wallets_with_trades,
  COUNT(DISTINCT condition_id) as unique_markets
FROM `gen-lang-client-0299056258.polycopy_v1.trades`;

-- 2. Check trades from today
SELECT 
  '=== TRADES TODAY ===' as section,
  COUNT(*) as trades_today,
  COUNT(DISTINCT wallet_address) as wallets_with_trades_today,
  MIN(timestamp) as earliest_trade_today,
  MAX(timestamp) as latest_trade_today
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE DATE(timestamp) = today_date;

-- 3. Check trades from yesterday
SELECT 
  '=== TRADES YESTERDAY ===' as section,
  COUNT(*) as trades_yesterday,
  COUNT(DISTINCT wallet_address) as wallets_with_trades_yesterday,
  MIN(timestamp) as earliest_trade_yesterday,
  MAX(timestamp) as latest_trade_yesterday
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE DATE(timestamp) = yesterday_date;

-- 4. Check wallets with trades in last 48 hours
SELECT 
  '=== WALLETS WITH TRADES IN LAST 48 HOURS ===' as section,
  COUNT(DISTINCT wallet_address) as unique_wallets,
  COUNT(*) as total_trades
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE timestamp >= TIMESTAMP(yesterday_date);

-- 5. Compare traders table vs trades table wallets
SELECT 
  '=== TRADERS TABLE vs TRADES TABLE COMPARISON ===' as section,
  (SELECT COUNT(DISTINCT wallet_address) FROM `gen-lang-client-0299056258.polycopy_v1.traders`) as wallets_in_traders_table,
  (SELECT COUNT(DISTINCT wallet_address) FROM `gen-lang-client-0299056258.polycopy_v1.trades`) as wallets_in_trades_table,
  (SELECT COUNT(DISTINCT wallet_address) FROM `gen-lang-client-0299056258.polycopy_v1.trades` 
   WHERE wallet_address NOT IN (SELECT DISTINCT wallet_address FROM `gen-lang-client-0299056258.polycopy_v1.traders`)) as wallets_in_trades_not_in_traders;

-- 6. Check checkpoint table (daily sync checkpoint)
SELECT 
  '=== DAILY SYNC CHECKPOINT ===' as section,
  last_sync_time,
  sync_duration_seconds,
  trades_fetched,
  markets_fetched,
  wallets_processed,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), last_sync_time, HOUR) as hours_since_last_sync
FROM `gen-lang-client-0299056258.polycopy_v1.daily_sync_checkpoint`
ORDER BY last_sync_time DESC
LIMIT 5;

-- 7. Wallets with new trades today (not in traders table)
SELECT 
  '=== WALLETS WITH TRADES TODAY NOT IN TRADERS TABLE ===' as section,
  t.wallet_address,
  COUNT(*) as trade_count_today,
  MAX(t.timestamp) as latest_trade
FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.traders` tr
  ON LOWER(t.wallet_address) = LOWER(tr.wallet_address)
WHERE DATE(t.timestamp) = today_date
  AND tr.wallet_address IS NULL
GROUP BY t.wallet_address
ORDER BY trade_count_today DESC
LIMIT 20;

-- 8. Top wallets by trade count today
SELECT 
  '=== TOP WALLETS BY TRADES TODAY ===' as section,
  wallet_address,
  COUNT(*) as trade_count,
  MIN(timestamp) as first_trade_today,
  MAX(timestamp) as last_trade_today
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE DATE(timestamp) = today_date
GROUP BY wallet_address
ORDER BY trade_count DESC
LIMIT 20;

-- 9. Top wallets by trade count yesterday
SELECT 
  '=== TOP WALLETS BY TRADES YESTERDAY ===' as section,
  wallet_address,
  COUNT(*) as trade_count,
  MIN(timestamp) as first_trade_yesterday,
  MAX(timestamp) as last_trade_yesterday
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE DATE(timestamp) = yesterday_date
GROUP BY wallet_address
ORDER BY trade_count DESC
LIMIT 20;

-- 10. Check if traders table is being updated daily
-- (Check when wallets were last added/updated)
SELECT 
  '=== TRADERS TABLE UPDATE STATUS ===' as section,
  COUNT(*) as total_traders,
  COUNT(DISTINCT wallet_address) as unique_wallets,
  -- Note: traders table may not have updated_at, so we check if there are recent trades
  (SELECT COUNT(DISTINCT wallet_address) 
   FROM `gen-lang-client-0299056258.polycopy_v1.trades` 
   WHERE DATE(timestamp) >= yesterday_date
     AND wallet_address IN (SELECT wallet_address FROM `gen-lang-client-0299056258.polycopy_v1.traders`)
  ) as traders_with_recent_trades
FROM `gen-lang-client-0299056258.polycopy_v1.traders`;
