-- ============================================================================
-- Migration: Add error increment function for market_fetch_queue
-- Purpose: Increment error_count and update last_attempt in one statement
-- Date: March 17, 2026
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_market_fetch_queue_error(
  p_condition_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.market_fetch_queue
  SET
    last_attempt = NOW(),
    error_count = error_count + 1
  WHERE condition_id = p_condition_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_market_fetch_queue_error(TEXT) TO service_role;
