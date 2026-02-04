-- ============================================================================
-- MARK TRADES AS PROCESSED
-- Purpose: Update last_processed_at for trades that have tweets generated
-- Usage: Run after successful tweet generation in n8n workflow
-- ============================================================================

-- This query should be executed with trade_ids as parameters
-- Example: Update specific trade_ids that were processed

-- For n8n: Use a Function Node to build this query dynamically
-- Or use parameterized query with trade_id array

UPDATE `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that`
SET last_processed_at = CURRENT_TIMESTAMP()
WHERE trade_id IN (
  -- Replace with actual trade_ids from workflow
  -- This will be populated by n8n Function Node
  '{{trade_id_1}}',
  '{{trade_id_2}}'
  -- ... etc
);

-- Alternative: Mark all unprocessed trades as processed (if processing all)
-- UPDATE `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that`
-- SET last_processed_at = CURRENT_TIMESTAMP()
-- WHERE last_processed_at IS NULL
--   AND trade_id IN (
--     SELECT trade_id FROM (
--       SELECT trade_id 
--       FROM `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that`
--       WHERE last_processed_at IS NULL
--       ORDER BY excitement_score DESC
--       LIMIT 30
--     )
--   );
