-- Create trader_global_stats and trader_profile_stats tables if they don't exist
-- Based on usage in predict-trade function

-- trader_global_stats table
CREATE TABLE IF NOT EXISTS public.trader_global_stats (
  wallet_address TEXT PRIMARY KEY,
  global_win_rate NUMERIC(10, 4) NOT NULL DEFAULT 0.5,
  global_roi_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.0,
  total_lifetime_trades INTEGER NOT NULL DEFAULT 0,
  avg_bet_size_usdc NUMERIC(18, 2) NOT NULL DEFAULT 0.0,
  stddev_bet_size_usdc NUMERIC(18, 2) NOT NULL DEFAULT 0.0,
  recent_win_rate NUMERIC(10, 4) NOT NULL DEFAULT 0.5,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trader_global_stats_wallet 
ON public.trader_global_stats (wallet_address);

-- trader_profile_stats table
CREATE TABLE IF NOT EXISTS public.trader_profile_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  final_niche TEXT NOT NULL,
  bet_structure TEXT NOT NULL,
  price_bracket TEXT NOT NULL,
  win_rate NUMERIC(10, 4) NOT NULL DEFAULT 0.5,
  roi_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.0,
  trade_count INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wallet_address, final_niche, bet_structure, price_bracket)
);

CREATE INDEX IF NOT EXISTS idx_trader_profile_stats_wallet 
ON public.trader_profile_stats (wallet_address);

CREATE INDEX IF NOT EXISTS idx_trader_profile_stats_niche_structure 
ON public.trader_profile_stats (wallet_address, final_niche, bet_structure);

-- RLS Policies (if needed)
-- ALTER TABLE public.trader_global_stats ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.trader_profile_stats ENABLE ROW LEVEL SECURITY;
