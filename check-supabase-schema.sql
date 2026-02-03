-- Check actual Supabase schema for trader_profile_stats
-- Run this in Supabase SQL Editor

SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'trader_profile_stats'
ORDER BY ordinal_position;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
