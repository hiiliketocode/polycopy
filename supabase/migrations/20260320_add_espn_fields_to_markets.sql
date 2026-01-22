-- ============================================================================
-- Migration: Add ESPN metadata fields to markets
-- Purpose: Cache ESPN event URLs and lookup timestamps for sports markets
-- Date: March 20, 2026
-- ============================================================================

ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS espn_url TEXT,
  ADD COLUMN IF NOT EXISTS espn_game_id TEXT,
  ADD COLUMN IF NOT EXISTS espn_last_checked TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_markets_espn_url ON public.markets (espn_url);
