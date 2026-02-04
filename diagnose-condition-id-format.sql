-- ============================================================================
-- Diagnostic Query: Compare condition_id formatting between markets and trades
-- Purpose: Identify why joins are failing (case sensitivity, prefixes, etc.)
-- ============================================================================

-- 1. Sample condition_ids from markets table
SELECT 
  'MARKETS' as source_table,
  condition_id,
  LENGTH(condition_id) as id_length,
  SUBSTR(condition_id, 1, 2) as first_two_chars,
  SUBSTR(condition_id, -2) as last_two_chars,
  CASE 
    WHEN condition_id LIKE '0x%' THEN 'Has 0x prefix'
    WHEN condition_id LIKE '%[A-Z]%' THEN 'Has uppercase'
    ELSE 'No issues detected'
  END as format_notes
FROM `gen-lang-client-0299056258.polycopy_v1.markets`
WHERE condition_id IS NOT NULL
LIMIT 20;

-- 2. Sample condition_ids from trades table
SELECT 
  'TRADES' as source_table,
  condition_id,
  LENGTH(condition_id) as id_length,
  SUBSTR(condition_id, 1, 2) as first_two_chars,
  SUBSTR(condition_id, -2) as last_two_chars,
  CASE 
    WHEN condition_id LIKE '0x%' THEN 'Has 0x prefix'
    WHEN condition_id LIKE '%[A-Z]%' THEN 'Has uppercase'
    ELSE 'No issues detected'
  END as format_notes
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE condition_id IS NOT NULL
LIMIT 20;

-- 3. Direct comparison: condition_ids that exist in both tables
SELECT 
  m.condition_id as markets_condition_id,
  t.condition_id as trades_condition_id,
  m.condition_id = t.condition_id as exact_match,
  LOWER(m.condition_id) = LOWER(t.condition_id) as case_insensitive_match,
  LENGTH(m.condition_id) as markets_length,
  LENGTH(t.condition_id) as trades_length,
  COUNT(DISTINCT t.wallet_address) as unique_traders,
  COUNT(*) as trade_count
FROM `gen-lang-client-0299056258.polycopy_v1.markets` m
INNER JOIN `gen-lang-client-0299056258.polycopy_v1.trades` t
  ON m.condition_id = t.condition_id
WHERE m.condition_id IS NOT NULL
  AND t.condition_id IS NOT NULL
GROUP BY m.condition_id, t.condition_id
LIMIT 20;

-- 4. Condition_ids in markets but NOT in trades (using exact match)
SELECT 
  'IN MARKETS BUT NOT IN TRADES (exact match)' as check_type,
  condition_id,
  LENGTH(condition_id) as id_length,
  SUBSTR(condition_id, 1, 2) as first_two_chars
FROM `gen-lang-client-0299056258.polycopy_v1.markets` m
WHERE m.condition_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
    WHERE t.condition_id = m.condition_id
  )
LIMIT 20;

-- 5. Condition_ids in trades but NOT in markets (using exact match)
SELECT 
  'IN TRADES BUT NOT IN MARKETS (exact match)' as check_type,
  condition_id,
  LENGTH(condition_id) as id_length,
  SUBSTR(condition_id, 1, 2) as first_two_chars,
  COUNT(*) as trade_count
FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
WHERE t.condition_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 
    FROM `gen-lang-client-0299056258.polycopy_v1.markets` m
    WHERE m.condition_id = t.condition_id
  )
GROUP BY condition_id
ORDER BY trade_count DESC
LIMIT 20;

-- 6. Case-insensitive comparison: condition_ids that match when lowercased
SELECT 
  'CASE INSENSITIVE MATCHES' as check_type,
  LOWER(m.condition_id) as normalized_condition_id,
  COUNT(DISTINCT m.condition_id) as distinct_markets_ids,
  COUNT(DISTINCT t.condition_id) as distinct_trades_ids,
  COUNT(*) as total_matches
FROM `gen-lang-client-0299056258.polycopy_v1.markets` m
INNER JOIN `gen-lang-client-0299056258.polycopy_v1.trades` t
  ON LOWER(m.condition_id) = LOWER(t.condition_id)
WHERE m.condition_id IS NOT NULL
  AND t.condition_id IS NOT NULL
GROUP BY LOWER(m.condition_id)
HAVING COUNT(DISTINCT m.condition_id) > 1 OR COUNT(DISTINCT t.condition_id) > 1
LIMIT 20;

-- 7. Summary statistics
SELECT 
  'SUMMARY' as check_type,
  (SELECT COUNT(DISTINCT condition_id) FROM `gen-lang-client-0299056258.polycopy_v1.markets` WHERE condition_id IS NOT NULL) as distinct_markets_ids,
  (SELECT COUNT(DISTINCT condition_id) FROM `gen-lang-client-0299056258.polycopy_v1.trades` WHERE condition_id IS NOT NULL) as distinct_trades_ids,
  (SELECT COUNT(DISTINCT m.condition_id) 
   FROM `gen-lang-client-0299056258.polycopy_v1.markets` m
   INNER JOIN `gen-lang-client-0299056258.polycopy_v1.trades` t
     ON m.condition_id = t.condition_id
   WHERE m.condition_id IS NOT NULL) as matching_ids_exact,
  (SELECT COUNT(DISTINCT LOWER(m.condition_id))
   FROM `gen-lang-client-0299056258.polycopy_v1.markets` m
   INNER JOIN `gen-lang-client-0299056258.polycopy_v1.trades` t
     ON LOWER(m.condition_id) = LOWER(t.condition_id)
   WHERE m.condition_id IS NOT NULL) as matching_ids_case_insensitive;
