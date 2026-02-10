#!/bin/bash
# Quick check: recent trade timestamps and last sync checkpoint in BigQuery.
# Run with: ./scripts/check-recent-trades-bq.sh
# Requires: bq (BigQuery CLI) and gcloud auth.

set -e
PROJECT="gen-lang-client-0299056258"
DATASET="polycopy_v1"

echo "=============================================="
echo "  RECENT TRADES & SYNC CHECK (BigQuery)"
echo "  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=============================================="
echo ""

echo "--- Latest trade in BigQuery (and minutes ago) ---"
bq query --use_legacy_sql=false --format=prettyjson "
SELECT
  MAX(timestamp) AS latest_trade,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(timestamp), MINUTE) AS minutes_ago
FROM \`${PROJECT}.${DATASET}.trades\`
" 2>/dev/null || true

echo ""
echo "--- Last 10 trade timestamps (most recent first) ---"
bq query --use_legacy_sql=false --format=prettyjson "
SELECT timestamp, wallet_address, condition_id
FROM \`${PROJECT}.${DATASET}.trades\`
ORDER BY timestamp DESC
LIMIT 10
" 2>/dev/null || true

echo ""
echo "--- Last sync checkpoint ---"
bq query --use_legacy_sql=false --format=prettyjson "
SELECT last_sync_time, trades_fetched, TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), last_sync_time, MINUTE) AS minutes_since_sync
FROM \`${PROJECT}.${DATASET}.daily_sync_checkpoint\`
ORDER BY last_sync_time DESC
LIMIT 1
" 2>/dev/null || true

echo ""
echo "--- Trades in last 2 hours (count by hour) ---"
bq query --use_legacy_sql=false --format=prettyjson "
SELECT
  TIMESTAMP_TRUNC(timestamp, HOUR) AS hour_utc,
  COUNT(*) AS trades
FROM \`${PROJECT}.${DATASET}.trades\`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 HOUR)
GROUP BY 1
ORDER BY 1 DESC
LIMIT 6
" 2>/dev/null || true

echo ""
echo "Done. If minutes_ago is under ~45 and last_sync runs every 30 min, pipeline is healthy."
