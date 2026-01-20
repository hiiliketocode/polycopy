-- ============================================================================
-- Migration: Add paged enqueue function for market_fetch_queue
-- Purpose: Enqueue condition_ids from trades in small, ordered pages to avoid timeouts
-- Date: March 17, 2026
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_market_fetch_queue_from_trades_page(
  p_after_condition_id TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE (inserted_count BIGINT, last_condition_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH next_rows AS (
    SELECT t.condition_id
    FROM public.trades t
    WHERE t.condition_id IS NOT NULL
      AND (p_after_condition_id IS NULL OR t.condition_id > p_after_condition_id)
    ORDER BY t.condition_id
    LIMIT GREATEST(1, p_limit)
  ),
  inserted AS (
    INSERT INTO public.market_fetch_queue (condition_id)
    SELECT DISTINCT condition_id
    FROM next_rows
    ON CONFLICT (condition_id) DO NOTHING
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*) FROM inserted)::BIGINT AS inserted_count,
    (SELECT MAX(condition_id) FROM next_rows) AS last_condition_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_market_fetch_queue_from_trades_page(TEXT, INTEGER) TO service_role;
