-- Create RPC function for fast truncate
-- Run this in Supabase Dashboard SQL Editor first, then use truncate-trades-urgent.js

CREATE OR REPLACE FUNCTION truncate_trades_public()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE TABLE trades_public CASCADE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION truncate_trades_public() TO authenticated;
GRANT EXECUTE ON FUNCTION truncate_trades_public() TO anon;
GRANT EXECUTE ON FUNCTION truncate_trades_public() TO service_role;


