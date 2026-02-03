-- Test query to check market classification data
-- Run this in Supabase SQL Editor to verify data exists

-- 0. First, check if classification columns exist
SELECT 
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'markets'
  AND column_name IN ('market_type', 'market_subtype', 'bet_structure')
ORDER BY column_name;

-- 1. Check if markets table has classification fields (only if columns exist)
-- If columns don't exist, run the migration first: supabase/migrations/20260125_add_market_classification_columns.sql
SELECT 
  condition_id,
  title,
  category,
  tags
FROM markets
WHERE condition_id IS NOT NULL
LIMIT 10;

-- 2. Check semantic_mapping table
SELECT 
  original_tag,
  clean_niche,
  type,
  specificity_score
FROM semantic_mapping
LIMIT 20;

-- 3. Check a specific market (replace with actual condition_id)
-- SELECT 
--   condition_id,
--   title,
--   category,
--   market_type,
--   market_subtype,
--   bet_structure,
--   tags
-- FROM markets
-- WHERE condition_id = 'YOUR_CONDITION_ID_HERE';

-- 4. Check if market_subtype is populated
SELECT 
  COUNT(*) as total_markets,
  COUNT(market_subtype) as markets_with_subtype,
  COUNT(bet_structure) as markets_with_bet_structure,
  COUNT(CASE WHEN market_subtype IS NOT NULL AND market_subtype != '' THEN 1 END) as markets_with_valid_subtype
FROM markets;
