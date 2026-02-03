-- Refresh Supabase PostgREST schema cache
-- Run this if you get "Could not find column" errors after creating tables

-- Option 1: Reload schema (requires superuser or postgres role)
NOTIFY pgrst, 'reload schema';

-- Option 2: If NOTIFY doesn't work, you may need to restart PostgREST
-- This is usually done via Supabase dashboard or API

-- Option 3: Verify tables exist and have correct columns
SELECT 
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('trader_global_stats', 'trader_profile_stats')
ORDER BY table_name, ordinal_position;

-- Option 4: Check if tables are visible to PostgREST
SELECT schemaname, tablename 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('trader_global_stats', 'trader_profile_stats');
