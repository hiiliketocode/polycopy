-- Run these in BigQuery Console (https://console.cloud.google.com/bigquery)
-- Project: gen-lang-client-0299056258, Dataset: polycopy_v1
-- Copy each query into the editor and Run. This shows recent trade timestamps so you can confirm the pipeline is good.

-- 1) Latest trade and how many minutes ago (healthy = minutes_ago under ~45 if sync runs every 30 min)
SELECT
  MAX(timestamp) AS latest_trade,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), MAX(timestamp), MINUTE) AS minutes_ago
FROM `gen-lang-client-0299056258.polycopy_v1.trades`;

-- 2) Last 15 trade timestamps (most recent first)
SELECT timestamp, wallet_address
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
ORDER BY timestamp DESC
LIMIT 15;

-- 3) Last sync checkpoint (should have run in last ~30–60 min for incremental)
SELECT
  last_sync_time,
  trades_fetched,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), last_sync_time, MINUTE) AS minutes_since_sync
FROM `gen-lang-client-0299056258.polycopy_v1.daily_sync_checkpoint`
ORDER BY last_sync_time DESC
LIMIT 1;

-- 4) Trade count by hour (last 3 hours) – shows steady ingestion
SELECT
  TIMESTAMP_TRUNC(timestamp, HOUR) AS hour_utc,
  COUNT(*) AS trades
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 3 HOUR)
GROUP BY 1
ORDER BY 1 DESC;
