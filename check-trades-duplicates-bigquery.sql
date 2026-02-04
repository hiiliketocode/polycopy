-- ============================================================================
-- Check for duplicates in BigQuery trades table
-- Purpose: Identify duplicate trades using multiple criteria
-- ============================================================================

-- 1. Check for duplicate IDs (should be unique)
SELECT 
  'Duplicate IDs' as check_type,
  id,
  COUNT(*) as duplicate_count,
  ARRAY_AGG(STRUCT(wallet_address, timestamp, tx_hash, order_hash) ORDER BY timestamp DESC LIMIT 5) as sample_records
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
GROUP BY id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 2. Check for duplicates based on wallet_address + tx_hash + order_hash (idempotency key)
SELECT 
  'Duplicate idempotency keys' as check_type,
  wallet_address,
  tx_hash,
  COALESCE(order_hash, '') as order_hash,
  COUNT(*) as duplicate_count,
  COUNT(DISTINCT id) as distinct_ids,
  ARRAY_AGG(id ORDER BY timestamp DESC LIMIT 5) as sample_ids,
  ARRAY_AGG(timestamp ORDER BY timestamp DESC LIMIT 5) as sample_timestamps
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
GROUP BY wallet_address, tx_hash, COALESCE(order_hash, '')
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 3. Check for duplicates based on wallet_address + tx_hash (when order_hash is NULL)
SELECT 
  'Duplicate wallet+tx_hash (no order_hash)' as check_type,
  wallet_address,
  tx_hash,
  COUNT(*) as duplicate_count,
  COUNT(DISTINCT id) as distinct_ids,
  COUNT(DISTINCT COALESCE(order_hash, '')) as distinct_order_hashes,
  ARRAY_AGG(id ORDER BY timestamp DESC LIMIT 5) as sample_ids,
  ARRAY_AGG(timestamp ORDER BY timestamp DESC LIMIT 5) as sample_timestamps
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE order_hash IS NULL
GROUP BY wallet_address, tx_hash
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 4. Check for duplicates based on wallet_address + order_hash (when order_hash exists)
SELECT 
  'Duplicate wallet+order_hash' as check_type,
  wallet_address,
  order_hash,
  COUNT(*) as duplicate_count,
  COUNT(DISTINCT id) as distinct_ids,
  COUNT(DISTINCT tx_hash) as distinct_tx_hashes,
  ARRAY_AGG(id ORDER BY timestamp DESC LIMIT 5) as sample_ids,
  ARRAY_AGG(timestamp ORDER BY timestamp DESC LIMIT 5) as sample_timestamps
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE order_hash IS NOT NULL
GROUP BY wallet_address, order_hash
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;

-- 5. Summary: Total duplicate counts
SELECT 
  'Summary' as check_type,
  (SELECT COUNT(*) FROM (
    SELECT id FROM `gen-lang-client-0299056258.polycopy_v1.trades`
    GROUP BY id HAVING COUNT(*) > 1
  )) as duplicate_id_count,
  (SELECT COUNT(*) FROM (
    SELECT wallet_address, tx_hash, COALESCE(order_hash, '')
    FROM `gen-lang-client-0299056258.polycopy_v1.trades`
    GROUP BY wallet_address, tx_hash, COALESCE(order_hash, '')
    HAVING COUNT(*) > 1
  )) as duplicate_idempotency_key_count,
  (SELECT COUNT(*) FROM `gen-lang-client-0299056258.polycopy_v1.trades`) as total_rows,
  (SELECT COUNT(DISTINCT id) FROM `gen-lang-client-0299056258.polycopy_v1.trades`) as distinct_ids,
  (SELECT COUNT(DISTINCT CONCAT(wallet_address, '|', tx_hash, '|', COALESCE(order_hash, ''))) 
   FROM `gen-lang-client-0299056258.polycopy_v1.trades`) as distinct_idempotency_keys;

-- 6. Detailed view: Show all duplicates with full details
SELECT 
  id,
  wallet_address,
  timestamp,
  side,
  price,
  shares_normalized,
  tx_hash,
  order_hash,
  condition_id,
  market_slug,
  ROW_NUMBER() OVER (PARTITION BY wallet_address, tx_hash, COALESCE(order_hash, '') ORDER BY timestamp DESC) as rn
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
QUALIFY ROW_NUMBER() OVER (PARTITION BY wallet_address, tx_hash, COALESCE(order_hash, '') ORDER BY timestamp DESC) > 1
ORDER BY wallet_address, tx_hash, timestamp DESC
LIMIT 100;
