-- Additional Security Hardening
-- Run this to add extra security measures

-- 1. Ensure service_role can bypass RLS for admin operations
-- This is safe because service_role key is never exposed to client

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 2. Restrict anon role to only what's needed
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;

-- 3. Grant specific permissions to anon (public access)
-- Only allow SELECT on public-facing tables
GRANT SELECT ON public.traders TO anon;
GRANT SELECT ON public.trader_metrics_monthly TO anon;
GRANT SELECT ON public.trader_metrics_windowed TO anon;

-- 4. Ensure authenticated users have proper access
-- RLS policies will still apply
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT SELECT ON public.traders TO authenticated;
GRANT SELECT ON public.orders TO authenticated;
GRANT SELECT ON public.copied_trades TO authenticated;

-- 5. Create function to check rate limits (optional)
-- Useful for preventing API abuse
CREATE OR REPLACE FUNCTION check_rate_limit(
  user_identifier TEXT,
  action_type TEXT,
  max_attempts INTEGER DEFAULT 10,
  window_seconds INTEGER DEFAULT 60
) RETURNS BOOLEAN AS $$
DECLARE
  attempt_count INTEGER;
BEGIN
  -- Count recent attempts
  SELECT COUNT(*)
  INTO attempt_count
  FROM auth.audit_log_entries
  WHERE 
    payload->>'user_id' = user_identifier
    AND payload->>'action' = action_type
    AND created_at > NOW() - (window_seconds || ' seconds')::INTERVAL;
  
  RETURN attempt_count < max_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Add indexes for performance and security
-- Faster queries = harder to DoS
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_follows_user_trader ON public.follows(user_id, trader_wallet);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders(trader_id, created_at DESC);

-- 7. Enable pg_stat_statements for query monitoring (if not already enabled)
-- Helps detect suspicious query patterns
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

COMMENT ON FUNCTION check_rate_limit IS 'Rate limiting helper function for API endpoints';
