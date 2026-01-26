-- ============================================================================
-- Migration: get_missing_market_condition_ids
-- Purpose: Return distinct condition_ids from trades that are not in markets.
--          Used by match-markets-from-trades.js to ensure all trade markets
--          are matched in the markets table.
-- Date: January 26, 2026
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_missing_market_condition_ids(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (condition_id TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT t.condition_id
  FROM trades t
  LEFT JOIN markets m ON m.condition_id = t.condition_id
  WHERE t.condition_id IS NOT NULL
    AND m.condition_id IS NULL
  ORDER BY t.condition_id
  LIMIT GREATEST(1, p_limit);
$$;

COMMENT ON FUNCTION public.get_missing_market_condition_ids(INTEGER) IS
  'Returns condition_ids from trades that have no row in markets. Used to backfill markets from Dome.';

GRANT EXECUTE ON FUNCTION public.get_missing_market_condition_ids(INTEGER) TO service_role;
