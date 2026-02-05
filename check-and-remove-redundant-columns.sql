-- ============================================================================
-- Check and Remove Redundant Classification Columns
-- Purpose: Verify usage and remove final_type and final_subtype columns
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Check current column usage
SELECT 
  'Column Usage Check' as check_type,
  COUNT(*) as total_markets,
  COUNT(final_type) as markets_with_final_type,
  COUNT(final_subtype) as markets_with_final_subtype,
  COUNT(market_type) as markets_with_market_type,
  COUNT(market_subtype) as markets_with_market_subtype,
  COUNT(final_niche) as markets_with_final_niche
FROM public.markets;

-- 2. Verify columns exist before dropping
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'markets'
  AND column_name IN ('final_type', 'final_subtype', 'market_type', 'market_subtype', 'final_niche', 'bet_structure')
ORDER BY column_name;

-- 3. Drop redundant columns (uncomment to execute)
-- ALTER TABLE public.markets
--   DROP COLUMN IF EXISTS final_type,
--   DROP COLUMN IF EXISTS final_subtype;

-- 4. Verify columns were removed (run after step 3)
-- SELECT 
--   column_name,
--   data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'markets'
--   AND column_name IN ('final_type', 'final_subtype');
-- Expected: No rows returned (columns should be removed)
