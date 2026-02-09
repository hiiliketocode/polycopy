-- ============================================================================
-- ML STAGE 1.1 & 1.2: CREATE DEDUPLICATED VIEWS
-- ============================================================================
-- Purpose: Create clean, deduplicated views of trades and markets tables
-- These views will be used for all ML training and backtesting
-- 
-- Run these in BigQuery Console
-- ============================================================================

-- ============================================================================
-- STEP 1: DEDUPLICATED TRADES VIEW
-- ============================================================================
-- Deduplicates by (wallet_address, condition_id, timestamp)
-- Keeps the first occurrence based on id (lexicographic order)
-- Only includes BUY trades (which is what we train on)

CREATE OR REPLACE VIEW `gen-lang-client-0299056258.polycopy_v1.trades_dedup` AS
SELECT * EXCEPT(rn) FROM (
  SELECT 
    *,
    ROW_NUMBER() OVER (
      PARTITION BY wallet_address, condition_id, timestamp
      ORDER BY id
    ) as rn
  FROM `gen-lang-client-0299056258.polycopy_v1.trades`
  WHERE side = 'BUY'
) 
WHERE rn = 1;

-- ============================================================================
-- STEP 2: DEDUPLICATED MARKETS VIEW  
-- ============================================================================
-- Deduplicates by condition_id
-- Keeps the most complete record (prefers closed status, non-null winning_label)

CREATE OR REPLACE VIEW `gen-lang-client-0299056258.polycopy_v1.markets_dedup` AS
SELECT * EXCEPT(rn) FROM (
  SELECT 
    *,
    ROW_NUMBER() OVER (
      PARTITION BY condition_id 
      ORDER BY 
        CASE WHEN status = 'closed' THEN 0 ELSE 1 END,
        CASE WHEN winning_label IS NOT NULL THEN 0 ELSE 1 END,
        CASE WHEN end_time IS NOT NULL THEN 0 ELSE 1 END
    ) as rn
  FROM `gen-lang-client-0299056258.polycopy_v1.markets`
) 
WHERE rn = 1;

-- ============================================================================
-- VERIFICATION QUERIES (run after creating views)
-- ============================================================================

-- Verify trades_dedup
-- SELECT 
--   COUNT(*) as total_rows,
--   COUNT(DISTINCT CONCAT(wallet_address, condition_id, CAST(timestamp AS STRING))) as unique_events
-- FROM `gen-lang-client-0299056258.polycopy_v1.trades_dedup`;
-- Expected: total_rows = unique_events (no duplicates)

-- Verify markets_dedup  
-- SELECT
--   COUNT(*) as total_rows,
--   COUNT(DISTINCT condition_id) as unique_condition_ids
-- FROM `gen-lang-client-0299056258.polycopy_v1.markets_dedup`;
-- Expected: total_rows = unique_condition_ids (no duplicates)
