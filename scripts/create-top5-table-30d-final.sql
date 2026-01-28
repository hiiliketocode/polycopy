-- ============================================================================
-- Create top5_traders_trades table with 30D window traders
-- Run this after backfilling trades
-- ============================================================================

-- Step 1: Delete existing table (if it exists)
DROP TABLE IF EXISTS public.top5_traders_trades;

-- Step 2: Create the table with top 5 traders by 30D window
CREATE TABLE public.top5_traders_trades AS
SELECT t.*
FROM public.trades t
WHERE LOWER(t.wallet_address) IN (
  '0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee',
  '0x0d3b10b8eac8b089c6e4a695e65d8e044167c46b',
  '0xdb27bf2ac5d428a9c63dbc914611036855a6c56e',
  '0xdc876e6873772d38716fda7f2452a78d426d7ab6',
  '0x16b29c50f2439faf627209b2ac0c7bbddaa8a881'
);

-- Step 3: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_wallet_timestamp 
ON public.top5_traders_trades (wallet_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_condition_id 
ON public.top5_traders_trades (condition_id)
WHERE condition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_market_slug 
ON public.top5_traders_trades (market_slug)
WHERE market_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_timestamp 
ON public.top5_traders_trades (timestamp DESC);

-- Step 4: Add comment
COMMENT ON TABLE public.top5_traders_trades IS
  'Copy of trades table containing only top 5 traders by realized PnL rank (30-day window). Created for ML modeling and analysis.';

-- Step 5: Show statistics
SELECT 
  COUNT(*) as total_trades,
  COUNT(DISTINCT wallet_address) as unique_traders,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade
FROM public.top5_traders_trades;
