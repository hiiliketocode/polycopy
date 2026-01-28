-- ============================================================================
-- Migration: Trade timing - ON-DEMAND computation (no upfront processing)
-- Purpose: Calculate when trades occurred relative to game start and market end
--          to enable analysis of trading patterns (pre-game, during-game, etc.)
-- Date: January 26, 2026
--
-- APPROACH: Computed VIEW (no storage, calculates on-demand)
--   - No ALTER TABLE on 15M+ row trades table
--   - No upfront processing needed
--   - Computes timing only when queried
--   - Can add optional cache table later for frequently accessed trades
--
-- Why seconds?
--   - PostgreSQL EXTRACT(EPOCH FROM ...) returns seconds (standard database unit)
--   - Precise for calculations (e.g., "trades 5 minutes before game" = -300 seconds)
--   - Easy to convert to minutes/hours in queries: seconds / 60 or seconds / 3600
--   - Positive values = before event, Negative values = after event
--
-- Trade Timing Category:
--   Groups trades into buckets for easier analysis:
--   - Sports markets: "pre-game" (before game_start_time), "during-game" (after game_start_time, before close_time), "post-game" (after close_time)
--   - Non-sports markets: "during-market" (before close_time), "post-market" (after close_time)
--   - Unknown: when timing data unavailable
-- Note: We use close_time (when betting stops) NOT end_time (final confirmation/resolution)
-- Note: We don't track "pre-market" because trades can only happen after market opens (start_time)
-- ============================================================================

-- Optional: Small cache table for frequently accessed trades (populate incrementally)
-- This is optional - the view works without it, but caching can speed up repeated queries
CREATE TABLE IF NOT EXISTS public.trade_timing_cache (
  trade_id UUID PRIMARY KEY REFERENCES public.trades(id) ON DELETE CASCADE,
  seconds_before_game_start NUMERIC,
  seconds_before_market_end NUMERIC,
  trade_timing_category TEXT,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_timing_cache_category 
ON public.trade_timing_cache (trade_timing_category)
WHERE trade_timing_category IS NOT NULL;

COMMENT ON TABLE public.trade_timing_cache IS
  'Optional cache for trade timing data. Populate incrementally for frequently accessed trades. The view will use cache when available, otherwise computes on-demand.';

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_trade_timing_category 
ON public.trade_timing (trade_timing_category)
WHERE trade_timing_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trade_timing_seconds_before_game_start 
ON public.trade_timing (seconds_before_game_start)
WHERE seconds_before_game_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trade_timing_seconds_before_market_end 
ON public.trade_timing (seconds_before_market_end)
WHERE seconds_before_market_end IS NOT NULL;

COMMENT ON TABLE public.trade_timing IS
  'Timing data for trades relative to game/market events. Separate table to avoid ALTER on huge trades table. Join with trades ON trades.id = trade_timing.trade_id.';

-- Create function to calculate timing values
-- This function can be used in UPDATE statements for batch processing
CREATE OR REPLACE FUNCTION public.calculate_trade_timing(
  p_trade_timestamp TIMESTAMPTZ,
  p_condition_id TEXT
)
RETURNS TABLE (
  seconds_before_game_start NUMERIC,
  seconds_before_market_end NUMERIC,
  trade_timing_category TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_game_start TIMESTAMPTZ;
  v_market_end TIMESTAMPTZ;
  v_secs_before_game NUMERIC;
  v_secs_before_market_end NUMERIC;
  v_category TEXT;
BEGIN
  -- Get market timing data
  -- IMPORTANT: Use close_time (betting window closes) NOT end_time (final confirmation)
  -- - close_time: When betting/trading stops (what we care about for trade timing)
  -- - end_time: When final confirmation/resolution happens (usually later)
  -- Note: We don't use start_time because trades can only happen after market opens
  SELECT 
    m.game_start_time,
    m.close_time
  INTO 
    v_game_start,
    v_market_end
  FROM public.markets m
  WHERE m.condition_id = p_condition_id;

  -- If no market found, return NULLs
  IF v_game_start IS NULL AND v_market_end IS NULL THEN
    RETURN QUERY SELECT NULL::NUMERIC, NULL::NUMERIC, 'unknown'::TEXT;
    RETURN;
  END IF;

  -- Calculate seconds differences
  -- Positive = before the event, Negative = after the event
  v_secs_before_game := CASE 
    WHEN v_game_start IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (v_game_start - p_trade_timestamp))
    ELSE NULL
  END;

  v_secs_before_market_end := CASE 
    WHEN v_market_end IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (v_market_end - p_trade_timestamp))
    ELSE NULL
  END;

  -- Determine category based on timing
  -- For sports markets (has game_start_time):
  --   - pre-game: trade happened before game_start_time
  --   - during-game: trade happened after game_start_time but before market close_time
  --   - post-game: trade happened after market close_time
  -- For non-sports markets (no game_start_time):
  --   - during-market: trade happened before market close_time
  --   - post-market: trade happened after market close_time
  IF v_game_start IS NOT NULL THEN
    -- Sports market
    IF v_secs_before_game > 0 THEN
      v_category := 'pre-game';
    ELSIF v_secs_before_game <= 0 AND (v_market_end IS NULL OR v_secs_before_market_end > 0) THEN
      v_category := 'during-game';
    ELSE
      v_category := 'post-game';
    END IF;
  ELSIF v_market_end IS NOT NULL THEN
    -- Non-sports market
    IF v_secs_before_market_end > 0 THEN
      v_category := 'during-market';
    ELSE
      v_category := 'post-market';
    END IF;
  ELSE
    v_category := 'unknown';
  END IF;

  RETURN QUERY SELECT 
    v_secs_before_game,
    v_secs_before_market_end,
    v_category;
END;
$$;

COMMENT ON FUNCTION public.calculate_trade_timing(TIMESTAMPTZ, TEXT) IS
  'Calculates trade timing relative to game start and market start/end times. Returns seconds differences (positive = before, negative = after) and a timing category.';

-- Create VIEW that computes timing on-demand (uses cache when available)
DROP VIEW IF EXISTS public.trades_with_timing;

CREATE VIEW public.trades_with_timing AS
SELECT 
  t.*,
  COALESCE(
    cache.seconds_before_game_start,
    timing.seconds_before_game_start
  ) AS seconds_before_game_start,
  COALESCE(
    cache.seconds_before_market_end,
    timing.seconds_before_market_end
  ) AS seconds_before_market_end,
  COALESCE(
    cache.trade_timing_category,
    timing.trade_timing_category
  ) AS trade_timing_category
FROM public.trades t
LEFT JOIN public.trade_timing_cache cache ON cache.trade_id = t.id
LEFT JOIN LATERAL public.calculate_trade_timing(t.timestamp, t.condition_id) AS timing ON true
WHERE t.condition_id IS NOT NULL;

COMMENT ON VIEW public.trades_with_timing IS
  'Trades with computed timing data. Uses cache when available, otherwise computes on-demand. No upfront processing needed.';

-- Function to populate cache for specific trades (call incrementally)
CREATE OR REPLACE FUNCTION public.cache_trade_timing(
  p_trade_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  -- Insert into cache for trades that aren't cached yet
  INSERT INTO public.trade_timing_cache (
    trade_id,
    seconds_before_game_start,
    seconds_before_market_end,
    trade_timing_category,
    calculated_at,
    updated_at
  )
  SELECT 
    t.id,
    timing.seconds_before_game_start,
    timing.seconds_before_market_end,
    timing.trade_timing_category,
    NOW(),
    NOW()
  FROM public.trades t
  CROSS JOIN LATERAL public.calculate_trade_timing(t.timestamp, t.condition_id) AS timing
  WHERE t.id = ANY(p_trade_ids)
    AND t.condition_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.trade_timing_cache WHERE trade_id = t.id
    )
  ON CONFLICT (trade_id) DO UPDATE SET
    seconds_before_game_start = EXCLUDED.seconds_before_game_start,
    seconds_before_market_end = EXCLUDED.seconds_before_market_end,
    trade_timing_category = EXCLUDED.trade_timing_category,
    updated_at = NOW();
  
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.cache_trade_timing(UUID[]) IS
  'Populates cache for specific trades. Call incrementally for frequently accessed trades. Returns count of rows cached.';

-- Add column comments for cache table
COMMENT ON COLUMN public.trade_timing_cache.trade_id IS
  'Foreign key to trades.id. One-to-one relationship.';

COMMENT ON COLUMN public.trade_timing_cache.seconds_before_game_start IS
  'Seconds difference: game_start_time - trade_timestamp. Positive = trade happened BEFORE game started, Negative = trade happened AFTER game started. NULL if game_start_time not available. Example: +3600 = 1 hour before game, -1800 = 30 minutes after game started. Only meaningful for sports markets.';

COMMENT ON COLUMN public.trade_timing_cache.seconds_before_market_end IS
  'Seconds difference: close_time - trade_timestamp. Positive = trade happened BEFORE market closed (betting window closed), Negative = trade happened AFTER market closed. NULL if close_time not available. Uses close_time (when betting stops) NOT end_time (final confirmation). Example: +1800 = 30 minutes before market closes, -3600 = 1 hour after market closed.';

COMMENT ON COLUMN public.trade_timing_cache.trade_timing_category IS
  'Categorical label grouping trades by when they occurred relative to game/market events. For sports markets: "pre-game" (before game_start_time), "during-game" (after game_start_time but before market close_time), "post-game" (after market close_time). For non-sports markets: "during-market" (before market close_time), "post-market" (after market close_time). Uses close_time (when betting stops) NOT end_time (final confirmation). "unknown" when timing data unavailable. Useful for analyzing trading patterns (e.g., "do traders bet more before games start?").';
