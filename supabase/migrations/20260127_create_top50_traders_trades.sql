-- ============================================================================
-- Migration: Create top 50 traders trades table
-- Purpose: Create a copy of trades table with only top 50 traders
--          for ML training and analysis
-- Date: January 27, 2026
-- ============================================================================

-- Step 1: Get top 50 traders by realized PnL rank (30-day window)
CREATE TEMP TABLE top_traders_temp AS
SELECT wallet_address
FROM wallet_realized_pnl_rankings
WHERE window_key = '30D'
ORDER BY rank ASC
LIMIT 50;

-- Step 2: Create the table with top traders' trades
DROP TABLE IF EXISTS public.top50_traders_trades;

CREATE TABLE public.top50_traders_trades (
  LIKE public.trades INCLUDING ALL
);

-- Step 3: Insert trades from top 50 traders
INSERT INTO public.top50_traders_trades
SELECT t.*
FROM public.trades t
INNER JOIN top_traders_temp tt 
  ON LOWER(t.wallet_address) = LOWER(tt.wallet_address);

-- Step 4: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_top50_traders_trades_wallet_timestamp 
ON public.top50_traders_trades (wallet_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_top50_traders_trades_condition_id 
ON public.top50_traders_trades (condition_id)
WHERE condition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_top50_traders_trades_market_slug 
ON public.top50_traders_trades (market_slug)
WHERE market_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_top50_traders_trades_timestamp 
ON public.top50_traders_trades (timestamp DESC);

-- Step 5: Add comments
COMMENT ON TABLE public.top50_traders_trades IS
  'Copy of trades table containing only top 50 traders by realized PnL rank (30-day window). Created for ML training and analysis.';

-- Step 6: Show statistics
DO $$
DECLARE
  v_count BIGINT;
  v_traders BIGINT;
  v_earliest TIMESTAMPTZ;
  v_latest TIMESTAMPTZ;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.top50_traders_trades;
  SELECT COUNT(DISTINCT wallet_address) INTO v_traders FROM public.top50_traders_trades;
  SELECT MIN(timestamp) INTO v_earliest FROM public.top50_traders_trades;
  SELECT MAX(timestamp) INTO v_latest FROM public.top50_traders_trades;
  
  RAISE NOTICE 'Table created: top50_traders_trades';
  RAISE NOTICE 'Total trades: %', v_count;
  RAISE NOTICE 'Unique traders: %', v_traders;
  RAISE NOTICE 'Earliest trade: %', v_earliest;
  RAISE NOTICE 'Latest trade: %', v_latest;
END $$;
