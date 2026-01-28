-- Create top50_traders_trades table structure only (no data)
-- Run this in Supabase SQL editor first, then use populate script

DROP TABLE IF EXISTS public.top50_traders_trades;

CREATE TABLE public.top50_traders_trades (
  LIKE public.trades INCLUDING ALL
);

-- Add indexes for performance
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

COMMENT ON TABLE public.top50_traders_trades IS
  'Copy of trades table containing only top 50 traders by realized PnL rank (30-day window). Created for ML training and analysis.';
