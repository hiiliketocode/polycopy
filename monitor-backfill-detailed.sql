-- Detailed Backfill Monitoring Query
-- Shows comprehensive status information

-- Summary Stats
SELECT 
  'SUMMARY' as section,
  (SELECT COUNT(*) FROM `gen-lang-client-0299056258.polycopy_v1.trades_staging`) as staging_count,
  (SELECT COUNT(*) FROM `gen-lang-client-0299056258.polycopy_v1.trades`) as production_count,
  (SELECT COUNT(*) FROM `gen-lang-client-0299056258.polycopy_v1.backfill_checkpoint` WHERE completed = true) as completed_wallets,
  946 as total_wallets,
  ROUND((SELECT COUNT(*) FROM `gen-lang-client-0299056258.polycopy_v1.backfill_checkpoint` WHERE completed = true) / 946.0 * 100, 2) as progress_pct;

-- Staging table details
SELECT 
  'STAGING_DETAILS' as section,
  COUNT(*) as total_trades,
  COUNT(DISTINCT wallet_address) as unique_wallets,
  COUNT(DISTINCT condition_id) as unique_conditions,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade,
  COUNT(*) - (SELECT COUNT(*) FROM `gen-lang-client-0299056258.polycopy_v1.trades`) as new_trades_not_in_production
FROM `gen-lang-client-0299056258.polycopy_v1.trades_staging`;

-- Recent completed wallets (last 10)
SELECT 
  'RECENT_WALLETS' as section,
  wallet_address,
  trade_count,
  processed_at
FROM `gen-lang-client-0299056258.polycopy_v1.backfill_checkpoint`
WHERE completed = true
ORDER BY processed_at DESC
LIMIT 10;
