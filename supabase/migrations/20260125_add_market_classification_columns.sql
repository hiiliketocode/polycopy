-- ============================================================================
-- Migration: Add market classification columns
-- Purpose: Add columns for market_type, market_subtype, and bet_structure
--          to support heuristics-based market classification
-- Date: January 25, 2026
-- ============================================================================

ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS market_type TEXT,
  ADD COLUMN IF NOT EXISTS market_subtype TEXT,
  ADD COLUMN IF NOT EXISTS bet_structure TEXT;

CREATE INDEX IF NOT EXISTS idx_markets_market_type ON public.markets (market_type);
CREATE INDEX IF NOT EXISTS idx_markets_bet_structure ON public.markets (bet_structure);

COMMENT ON COLUMN public.markets.market_type IS
  'Market type classification (Sports, Crypto, Politics, Finance/Tech, Entertainment, Esports, Weather)';
COMMENT ON COLUMN public.markets.market_subtype IS
  'Market subtype classification (e.g., NBA, Bitcoin, Election, etc.)';
COMMENT ON COLUMN public.markets.bet_structure IS
  'Bet structure classification (Prop, Yes/No, Over/Under, Spread, Head-to-Head, Multiple Choice, Other)';
