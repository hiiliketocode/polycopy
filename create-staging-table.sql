-- Create non-partitioned staging table for backfill
-- This avoids partition modification quota limits

CREATE TABLE IF NOT EXISTS `gen-lang-client-0299056258.polycopy_v1.trades_staging` (
  id STRING,
  condition_id STRING,
  wallet_address STRING,
  timestamp TIMESTAMP,
  side STRING,
  price FLOAT,
  shares_normalized FLOAT,
  token_label STRING,
  token_id STRING,
  tx_hash STRING
)
-- NO PARTITIONING - this avoids partition modification quota
CLUSTER BY wallet_address, timestamp
OPTIONS(
  description="Staging table for backfill. No partitioning to avoid quota limits."
);
