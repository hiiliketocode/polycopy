#!/bin/bash
# Check trades added to BigQuery today

PROJECT_ID="gen-lang-client-0299056258"
DATASET="polycopy_v1"
TABLE="trades"

echo "📊 Checking trades added to BigQuery today..."
echo ""

# Query using bq command line tool
bq query --use_legacy_sql=false --format=prettyjson "
SELECT 
  COUNT(*) as total_trades,
  COUNT(DISTINCT wallet_address) as unique_wallets,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade
FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
WHERE DATE(timestamp) = CURRENT_DATE()
" 2>&1

echo ""
echo "📊 Trades in last 24 hours:"
bq query --use_legacy_sql=false --format=prettyjson "
SELECT 
  COUNT(*) as total_trades,
  COUNT(DISTINCT wallet_address) as unique_wallets
FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
" 2>&1
