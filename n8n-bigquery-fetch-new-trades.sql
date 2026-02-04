-- ============================================================================
-- FETCH NEW TRADES FOR PROCESSING
-- Purpose: Get unprocessed trades for n8n workflow
-- Returns: Top 30 unprocessed trades ordered by excitement_score
-- ============================================================================

SELECT *
FROM `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that`
WHERE last_processed_at IS NULL
ORDER BY excitement_score DESC
LIMIT 30;
