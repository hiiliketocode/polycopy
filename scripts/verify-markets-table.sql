-- ============================================================================
-- Verify and Fix Markets Table Structure
-- Run this in Supabase SQL Editor to check markets table
-- ============================================================================

-- 1. Check if classification columns exist
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'markets'
  AND column_name IN ('market_type', 'market_subtype', 'bet_structure', 'tags')
ORDER BY column_name;

-- 2. Add missing classification columns if they don't exist
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS market_type TEXT,
  ADD COLUMN IF NOT EXISTS market_subtype TEXT,
  ADD COLUMN IF NOT EXISTS bet_structure TEXT;

-- 3. Check sample markets with their tags and classifications
SELECT 
  condition_id,
  title,
  tags,
  market_type,
  market_subtype,
  bet_structure,
  status,
  updated_at
FROM markets
WHERE condition_id IS NOT NULL
ORDER BY updated_at DESC
LIMIT 20;

-- 4. Count markets by classification status
SELECT 
  COUNT(*) as total_markets,
  COUNT(tags) as markets_with_tags,
  COUNT(CASE WHEN tags IS NOT NULL AND jsonb_array_length(tags::jsonb) > 0 THEN 1 END) as markets_with_non_empty_tags,
  COUNT(market_type) as markets_with_type,
  COUNT(market_subtype) as markets_with_subtype,
  COUNT(bet_structure) as markets_with_bet_structure,
  COUNT(CASE WHEN market_type IS NOT NULL AND market_subtype IS NOT NULL AND bet_structure IS NOT NULL THEN 1 END) as fully_classified
FROM markets;

-- 5. Check semantic_mapping table
SELECT 
  COUNT(*) as total_mappings,
  COUNT(DISTINCT original_tag) as unique_tags,
  COUNT(DISTINCT clean_niche) as unique_niches,
  COUNT(DISTINCT type) as unique_types
FROM semantic_mapping;

-- 6. Show sample semantic mappings
SELECT 
  original_tag,
  clean_niche,
  type,
  specificity_score
FROM semantic_mapping
ORDER BY specificity_score, original_tag
LIMIT 30;

-- 7. Find markets with tags but no classification
SELECT 
  condition_id,
  title,
  tags,
  market_type,
  market_subtype,
  bet_structure
FROM markets
WHERE tags IS NOT NULL 
  AND jsonb_array_length(tags::jsonb) > 0
  AND (market_subtype IS NULL OR market_type IS NULL OR bet_structure IS NULL)
LIMIT 20;
