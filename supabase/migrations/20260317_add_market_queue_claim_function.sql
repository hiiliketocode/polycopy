-- ============================================================================
-- Migration: Add claim function for market_fetch_queue
-- Purpose: Atomically claim a batch of condition_ids to avoid duplicate requests
-- Date: March 17, 2026
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_market_fetch_queue_batch(
  p_limit INTEGER DEFAULT 200
)
RETURNS TABLE (condition_id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT q.condition_id
    FROM public.market_fetch_queue q
    WHERE q.fetched = FALSE
      AND (
        q.last_attempt IS NULL
        OR q.last_attempt < NOW() - (INTERVAL '1 minute' * POWER(2, LEAST(q.error_count, 6)))
      )
    ORDER BY q.last_attempt NULLS FIRST
    LIMIT GREATEST(1, p_limit)
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.market_fetch_queue q
    SET last_attempt = NOW()
    FROM picked
    WHERE q.condition_id = picked.condition_id
    RETURNING q.condition_id
  )
  SELECT updated.condition_id FROM updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_market_fetch_queue_batch(INTEGER) TO service_role;
