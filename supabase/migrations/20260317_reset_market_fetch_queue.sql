-- ============================================================================
-- Migration: Reset market_fetch_queue
-- Purpose: Clear queue and repopulate from trades to restart backfill
-- Date: March 17, 2026
-- ============================================================================

TRUNCATE TABLE public.market_fetch_queue;

INSERT INTO public.market_fetch_queue (condition_id)
SELECT DISTINCT t.condition_id
FROM public.trades t
WHERE t.condition_id IS NOT NULL
ON CONFLICT (condition_id) DO NOTHING;
