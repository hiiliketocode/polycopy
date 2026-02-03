-- ============================================================================
-- Script: Check and Add Market Classification Columns
-- Purpose: Verify if classification columns exist, and add them if missing
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Step 1: Check if columns exist
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'markets'
  AND column_name IN ('market_type', 'market_subtype', 'bet_structure')
ORDER BY column_name;

-- Step 2: Add columns if they don't exist (safe to run multiple times)
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS market_type TEXT,
  ADD COLUMN IF NOT EXISTS market_subtype TEXT,
  ADD COLUMN IF NOT EXISTS bet_structure TEXT;

-- Step 2b: Add column comments for documentation
COMMENT ON COLUMN public.markets.market_type IS
  'Market type classification (Sports, Crypto, Politics, Finance/Tech, Entertainment, Esports, Weather)';
COMMENT ON COLUMN public.markets.market_subtype IS
  'Market subtype classification (e.g., NBA, Bitcoin, Election, etc.)';
COMMENT ON COLUMN public.markets.bet_structure IS
  'Bet structure classification (Prop, Yes/No, Over/Under, Spread, Head-to-Head, Multiple Choice, Other)';

-- Step 3: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_markets_market_type ON public.markets (market_type);
CREATE INDEX IF NOT EXISTS idx_markets_bet_structure ON public.markets (bet_structure);

-- Step 4: Verify columns were added
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'markets'
  AND column_name IN ('market_type', 'market_subtype', 'bet_structure')
ORDER BY column_name;

-- Step 5: Check current data (should show NULL values until classification is run)
SELECT 
  COUNT(*) as total_markets,
  COUNT(market_type) as markets_with_type,
  COUNT(market_subtype) as markets_with_subtype,
  COUNT(bet_structure) as markets_with_bet_structure
FROM markets;
