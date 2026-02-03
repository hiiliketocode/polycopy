-- ============================================================================
-- Migration: Drop trades table and all dependencies
-- Purpose: Remove massive trades table that is no longer needed
-- Date: January 29, 2026
-- ============================================================================
-- 
-- This migration removes:
-- 1. Dependent views (trades_with_timing)
-- 2. Dependent tables (top5_traders_trades, top50_traders_trades)
-- 3. Functions that reference trades
-- 4. The trades table itself
-- 5. Trades-derived columns from wallet_realized_pnl_daily (optional cleanup)
--
-- WARNING: This will permanently delete all trade data. Make sure you have
-- backups if needed.
-- ============================================================================

-- Step 1: Drop dependent views
DROP VIEW IF EXISTS public.trades_with_timing CASCADE;

-- Step 2: Drop dependent tables (copies of trades)
DROP TABLE IF EXISTS public.top5_traders_trades CASCADE;
DROP TABLE IF EXISTS public.top50_traders_trades CASCADE;

-- Step 3: Drop functions that reference trades
DROP FUNCTION IF EXISTS public.enqueue_market_fetch_queue_from_trades() CASCADE;
DROP FUNCTION IF EXISTS public.enqueue_market_fetch_queue_from_trades_page(TEXT, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.get_missing_market_condition_ids(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.cache_trade_timing(UUID[]) CASCADE;
DROP FUNCTION IF EXISTS public.calculate_trade_timing(TIMESTAMPTZ, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.truncate_trades() CASCADE;

-- Step 4: Drop trade timing cache table (if it exists)
DROP TABLE IF EXISTS public.trade_timing_cache CASCADE;

-- Step 5: Drop the trades table itself
DROP TABLE IF EXISTS public.trades CASCADE;

-- Step 6: Remove trades-derived columns from wallet_realized_pnl_daily
-- (These columns were populated from trades table, so they won't update anymore)
-- Note: We're keeping the columns but they'll just be static/default values
-- If you want to remove them entirely, uncomment the following:
/*
ALTER TABLE public.wallet_realized_pnl_daily
  DROP COLUMN IF EXISTS trade_count_total,
  DROP COLUMN IF EXISTS trade_count_buy,
  DROP COLUMN IF EXISTS trade_count_sell,
  DROP COLUMN IF EXISTS notional_total,
  DROP COLUMN IF EXISTS notional_buy,
  DROP COLUMN IF EXISTS notional_sell,
  DROP COLUMN IF EXISTS shares_total,
  DROP COLUMN IF EXISTS unique_markets,
  DROP COLUMN IF EXISTS unique_conditions,
  DROP COLUMN IF EXISTS last_trade_ts,
  DROP COLUMN IF EXISTS fills_source,
  DROP COLUMN IF EXISTS fills_updated_at;
*/

-- Step 7: Update market queue functions to use alternative sources
-- Replace enqueue function to use markets table instead of trades
CREATE OR REPLACE FUNCTION public.enqueue_market_fetch_queue_from_markets()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count BIGINT;
BEGIN
  -- Enqueue all condition_ids from markets table that haven't been fetched yet
  INSERT INTO public.market_fetch_queue (condition_id)
  SELECT DISTINCT m.condition_id
  FROM public.markets m
  WHERE m.condition_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.market_fetch_queue q 
      WHERE q.condition_id = m.condition_id
    )
  ON CONFLICT (condition_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_market_fetch_queue_from_markets() TO service_role;

COMMENT ON FUNCTION public.enqueue_market_fetch_queue_from_markets() IS
  'Enqueue condition_ids from markets table (replacement for trades-based function).';

-- Step 8: Update reset market queue migration to use markets instead of trades
-- This updates the reset function to use markets table
CREATE OR REPLACE FUNCTION public.reset_market_fetch_queue()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count BIGINT;
BEGIN
  TRUNCATE TABLE public.market_fetch_queue;
  
  INSERT INTO public.market_fetch_queue (condition_id)
  SELECT DISTINCT m.condition_id
  FROM public.markets m
  WHERE m.condition_id IS NOT NULL
  ON CONFLICT (condition_id) DO NOTHING;
  
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_market_fetch_queue() TO service_role;

COMMENT ON FUNCTION public.reset_market_fetch_queue() IS
  'Reset and repopulate market_fetch_queue from markets table (replacement for trades-based reset).';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- 
-- The trades table and all its dependencies have been removed.
-- 
-- If you need to repopulate market_fetch_queue, use:
--   SELECT public.enqueue_market_fetch_queue_from_markets();
-- 
-- Or reset it entirely:
--   SELECT public.reset_market_fetch_queue();
-- ============================================================================
