-- Migration: 035_market_and_trader_profiles
-- Purpose: Add market and trader metadata for the orders table

CREATE TABLE IF NOT EXISTS public.market_cache (
  market_id TEXT NOT NULL PRIMARY KEY,
  title TEXT NULL,
  image_url TEXT NULL,
  is_open BOOLEAN NULL,
  metadata JSONB NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_cache_market_id ON public.market_cache (market_id);

CREATE TABLE IF NOT EXISTS public.trader_profiles (
  trader_id UUID NOT NULL PRIMARY KEY REFERENCES public.traders (id) ON DELETE CASCADE,
  display_name TEXT NULL,
  avatar_url TEXT NULL,
  wallet_address TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trader_profiles_trader_id ON public.trader_profiles (trader_id);
CREATE INDEX IF NOT EXISTS idx_trader_profiles_wallet_address ON public.trader_profiles (wallet_address);
