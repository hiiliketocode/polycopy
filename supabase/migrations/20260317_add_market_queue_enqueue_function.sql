-- ============================================================================
-- Migration: Add enqueue function for market_fetch_queue
-- Purpose: Enqueue distinct condition_ids from trades in one DB-side operation
-- Date: March 17, 2026
-- ============================================================================

-- Ensure uniqueness if the queue was created without a primary key.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.market_fetch_queue'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.market_fetch_queue
      ADD CONSTRAINT market_fetch_queue_pkey PRIMARY KEY (condition_id);
  END IF;
END $$;

-- Remove any duplicates and nulls before enforcing uniqueness.
DELETE FROM public.market_fetch_queue
WHERE condition_id IS NULL;

WITH ranked AS (
  SELECT
    ctid,
    condition_id,
    ROW_NUMBER() OVER (
      PARTITION BY condition_id
      ORDER BY last_attempt DESC NULLS LAST, error_count DESC
    ) AS rn
  FROM public.market_fetch_queue
)
DELETE FROM public.market_fetch_queue q
USING ranked r
WHERE q.ctid = r.ctid
  AND r.rn > 1;

-- Insert distinct condition_ids from trades (idempotent).
CREATE OR REPLACE FUNCTION public.enqueue_market_fetch_queue_from_trades()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count BIGINT;
BEGIN
  INSERT INTO public.market_fetch_queue (condition_id)
  SELECT DISTINCT t.condition_id
  FROM public.trades t
  WHERE t.condition_id IS NOT NULL
  ON CONFLICT (condition_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_market_fetch_queue_from_trades() TO service_role;
