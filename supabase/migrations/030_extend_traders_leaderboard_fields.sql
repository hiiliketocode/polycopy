-- Migration: 030_extend_traders_leaderboard_fields
-- Purpose: Add Polymarket leaderboard fields not covered in 029

ALTER TABLE public.traders
  ADD COLUMN IF NOT EXISTS x_username TEXT NULL,
  ADD COLUMN IF NOT EXISTS verified_badge BOOLEAN NULL;
