-- Check the actual schema of the tables
-- Run this in Supabase SQL Editor to verify column names

-- Check trader_global_stats columns
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'trader_global_stats'
ORDER BY ordinal_position;

-- Check trader_profile_stats columns
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'trader_profile_stats'
ORDER BY ordinal_position;

-- Try to insert a test row to see what error we get
INSERT INTO trader_global_stats (
    wallet_address,
    global_win_rate,
    global_roi_pct,
    total_lifetime_trades,
    avg_bet_size_usdc,
    stddev_bet_size_usdc,
    recent_win_rate
) VALUES (
    'test_wallet_123',
    0.5,
    0.0,
    0,
    0.0,
    0.0,
    0.5
) ON CONFLICT (wallet_address) DO UPDATE SET
    global_win_rate = EXCLUDED.global_win_rate,
    last_updated = NOW();

-- Clean up test row
DELETE FROM trader_global_stats WHERE wallet_address = 'test_wallet_123';
