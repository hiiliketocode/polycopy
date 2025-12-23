-- Migration: 029_extend_traders_for_leaderboard
-- Purpose: Add fields to traders for Polymarket leaderboard data

ALTER TABLE public.traders
  ADD COLUMN IF NOT EXISTS display_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS profile_image TEXT NULL,
  ADD COLUMN IF NOT EXISTS pnl NUMERIC(18, 4) NULL,
  ADD COLUMN IF NOT EXISTS volume NUMERIC(18, 4) NULL,
  ADD COLUMN IF NOT EXISTS roi NUMERIC(9, 4) NULL,
  ADD COLUMN IF NOT EXISTS rank INTEGER NULL,
  ADD COLUMN IF NOT EXISTS markets_traded INTEGER NULL,
  ADD COLUMN IF NOT EXISTS total_trades INTEGER NULL,
  ADD COLUMN IF NOT EXISTS win_rate NUMERIC(5, 2) NULL,
  ADD COLUMN IF NOT EXISTS follower_count INTEGER NULL,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Optional: indexes to speed leaderboard queries
CREATE INDEX IF NOT EXISTS idx_traders_rank ON public.traders (rank);
CREATE INDEX IF NOT EXISTS idx_traders_volume ON public.traders (volume);
CREATE INDEX IF NOT EXISTS idx_traders_pnl ON public.traders (pnl);
