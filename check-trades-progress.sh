#!/bin/bash

# Quick script to check trade counts in BigQuery
PROJECT_ID="gen-lang-client-0299056258"
DATASET="polycopy_v1"

echo "📊 Current Trade Counts in BigQuery:"
echo ""

# Total trades
TRADES=$(bq query --use_legacy_sql=false --format=csv --project_id=${PROJECT_ID} \
    "SELECT COUNT(*) as cnt FROM \`${PROJECT_ID}.${DATASET}.trades\`" 2>/dev/null | tail -1)
echo "  Total Trades: $(printf "%'d" ${TRADES:-0})"

# Trades added in last hour (if timestamp column exists)
RECENT=$(bq query --use_legacy_sql=false --format=csv --project_id=${PROJECT_ID} \
    "SELECT COUNT(*) as cnt FROM \`${PROJECT_ID}.${DATASET}.trades\` WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 HOUR)" 2>/dev/null | tail -1)
if [ ! -z "$RECENT" ] && [ "$RECENT" != "cnt" ]; then
    echo "  Trades (last hour): $(printf "%'d" ${RECENT})"
fi

# Unique wallets
WALLETS=$(bq query --use_legacy_sql=false --format=csv --project_id=${PROJECT_ID} \
    "SELECT COUNT(DISTINCT wallet_address) as cnt FROM \`${PROJECT_ID}.${DATASET}.trades\`" 2>/dev/null | tail -1)
echo "  Unique Wallets: $(printf "%'d" ${WALLETS:-0})"

# Markets
MARKETS=$(bq query --use_legacy_sql=false --format=csv --project_id=${PROJECT_ID} \
    "SELECT COUNT(*) as cnt FROM \`${PROJECT_ID}.${DATASET}.markets\`" 2>/dev/null | tail -1)
echo "  Markets: $(printf "%'d" ${MARKETS:-0})"

# Events  
EVENTS=$(bq query --use_legacy_sql=false --format=csv --project_id=${PROJECT_ID} \
    "SELECT COUNT(*) as cnt FROM \`${PROJECT_ID}.${DATASET}.events\`" 2>/dev/null | tail -1)
echo "  Events: $(printf "%'d" ${EVENTS:-0})"

echo ""
echo "💡 Run this script repeatedly to see progress: watch -n 30 ./check-trades-progress.sh"
