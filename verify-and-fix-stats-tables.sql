-- Verify and fix trader stats tables
-- Run this in Supabase SQL Editor

-- Step 1: Check if tables exist and their columns
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('trader_global_stats', 'trader_profile_stats')
ORDER BY table_name, ordinal_position;

-- Step 2: If tables don't have the right columns, recreate them
-- (Only run if Step 1 shows missing columns)

-- Drop and recreate trader_global_stats
DROP TABLE IF EXISTS public.trader_global_stats CASCADE;

CREATE TABLE public.trader_global_stats (
  wallet_address TEXT PRIMARY KEY,
  global_win_rate NUMERIC(10, 4) NOT NULL DEFAULT 0.5,
  global_roi_pct NUMERIC(10, 4) NOT NULL DEFAULT 0.0,
  total_lifetime_trades INTEGER NOT NULL DEFAULT 0,
  avg_bet_size_usdc NUMERIC(18, 2) NOT NULL DEFAULT 0.0,
  stddev_bet_size_usdc NUMERIC(18, 2) NOT NULL DEFAULT 0.0,
  recent_win_rate NUMERIC(10, 4) NOT NULL DEFAULT 0.5,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trader_global_stats_wallet 
ON public.trader_global_stats (wallet_address);

-- Drop and recreate trader_profile_stats
DROP TABLE IF EXISTS public.trader_profile_stats CASCADE;

CREATE TABLE public.trader_profile_stats (
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

CREATE INDEX idx_trader_profile_stats_wallet 
ON public.trader_profile_stats (wallet_address);

CREATE INDEX idx_trader_profile_stats_niche_structure 
ON public.trader_profile_stats (wallet_address, final_niche, bet_structure);

-- Step 3: Refresh PostgREST schema cache
-- This requires superuser access - if it doesn't work, wait a few minutes
-- or restart PostgREST via Supabase dashboard
NOTIFY pgrst, 'reload schema';

-- Step 4: Verify tables are accessible
SELECT COUNT(*) as global_stats_count FROM trader_global_stats;
SELECT COUNT(*) as profile_stats_count FROM trader_profile_stats;
