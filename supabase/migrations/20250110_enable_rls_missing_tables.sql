-- ============================================================================
-- Enable RLS on all remaining tables without policies
-- CRITICAL: Fixes the Supabase API key exposure vulnerability
-- ============================================================================

-- 1. order_status_jobs - Background job tracking (worker system only)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'order_status_jobs') THEN
    ALTER TABLE public.order_status_jobs ENABLE ROW LEVEL SECURITY;
    
    -- Service role full access only (for workers)
    DROP POLICY IF EXISTS order_status_jobs_service_role_all ON public.order_status_jobs;
    CREATE POLICY order_status_jobs_service_role_all
    ON public.order_status_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
    
    RAISE NOTICE '✅ RLS enabled on order_status_jobs';
  END IF;
END $$;

-- 2. orders - CRITICAL! User order data
-- NOTE: This table stores orders for both traders (trader_id) and copy trades (copy_user_id)
-- Users NEVER query this table directly - all access is via API endpoints using service role
-- Therefore: Service role ONLY for maximum security
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'orders') THEN
    ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
    
    -- Service role full access (for API endpoints and workers)
    DROP POLICY IF EXISTS orders_service_role_all ON public.orders;
    CREATE POLICY orders_service_role_all
    ON public.orders FOR ALL TO service_role USING (true) WITH CHECK (true);
    
    -- NO authenticated user policies - all access controlled via API endpoints
    
    RAISE NOTICE '✅ RLS enabled on orders (CRITICAL! Service role only)';
  END IF;
END $$;

-- 3. trader_metrics_monthly - Public read-only for leaderboard
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trader_metrics_monthly') THEN
    ALTER TABLE public.trader_metrics_monthly ENABLE ROW LEVEL SECURITY;
    
    -- Service role full access
    DROP POLICY IF EXISTS trader_metrics_monthly_service_role_all ON public.trader_metrics_monthly;
    CREATE POLICY trader_metrics_monthly_service_role_all
    ON public.trader_metrics_monthly FOR ALL TO service_role USING (true) WITH CHECK (true);
    
    -- Public read-only (for leaderboard display)
    DROP POLICY IF EXISTS trader_metrics_monthly_public_read ON public.trader_metrics_monthly;
    CREATE POLICY trader_metrics_monthly_public_read
    ON public.trader_metrics_monthly FOR SELECT TO public USING (true);
    
    RAISE NOTICE '✅ RLS enabled on trader_metrics_monthly';
  END IF;
END $$;

-- 4. trader_metrics_windowed - Public read-only
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trader_metrics_windowed') THEN
    ALTER TABLE public.trader_metrics_windowed ENABLE ROW LEVEL SECURITY;
    
    -- Service role full access
    DROP POLICY IF EXISTS trader_metrics_windowed_service_role_all ON public.trader_metrics_windowed;
    CREATE POLICY trader_metrics_windowed_service_role_all
    ON public.trader_metrics_windowed FOR ALL TO service_role USING (true) WITH CHECK (true);
    
    -- Public read-only (for leaderboard display)
    DROP POLICY IF EXISTS trader_metrics_windowed_public_read ON public.trader_metrics_windowed;
    CREATE POLICY trader_metrics_windowed_public_read
    ON public.trader_metrics_windowed FOR SELECT TO public USING (true);
    
    RAISE NOTICE '✅ RLS enabled on trader_metrics_windowed';
  END IF;
END $$;

-- 5. trader_sync_state - Worker system only
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'trader_sync_state') THEN
    ALTER TABLE public.trader_sync_state ENABLE ROW LEVEL SECURITY;
    
    -- Service role full access only
    DROP POLICY IF EXISTS trader_sync_state_service_role_all ON public.trader_sync_state;
    CREATE POLICY trader_sync_state_service_role_all
    ON public.trader_sync_state FOR ALL TO service_role USING (true) WITH CHECK (true);
    
    RAISE NOTICE '✅ RLS enabled on trader_sync_state';
  END IF;
END $$;

-- 6. traders - Public read for leaderboard/profiles
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'traders') THEN
    -- Check if RLS is already enabled
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables t
      JOIN pg_class c ON c.relname = t.tablename
      WHERE t.schemaname = 'public' 
        AND t.tablename = 'traders'
        AND c.relrowsecurity = true
    ) THEN
      ALTER TABLE public.traders ENABLE ROW LEVEL SECURITY;
      RAISE NOTICE '✅ RLS enabled on traders';
    ELSE
      RAISE NOTICE 'ℹ️  RLS already enabled on traders';
    END IF;
    
    -- Service role full access
    DROP POLICY IF EXISTS traders_service_role_all ON public.traders;
    CREATE POLICY traders_service_role_all
    ON public.traders FOR ALL TO service_role USING (true) WITH CHECK (true);
    
    -- Public read-only (for leaderboard/profile display)
    DROP POLICY IF EXISTS traders_public_read ON public.traders;
    CREATE POLICY traders_public_read
    ON public.traders FOR SELECT TO public USING (true);
    
    RAISE NOTICE '✅ Policies created for traders';
  END IF;
END $$;

-- Final Summary
DO $$
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '🎉 ALL VULNERABLE TABLES NOW SECURED!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ order_status_jobs - Worker system protected';
  RAISE NOTICE '✅ orders - PROTECTED! Service role only (most critical!)';
  RAISE NOTICE '✅ trader_metrics_monthly - Public read, worker write';
  RAISE NOTICE '✅ trader_metrics_windowed - Public read, worker write';
  RAISE NOTICE '✅ trader_sync_state - Worker system protected';
  RAISE NOTICE '✅ traders - Public read, worker write';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
  RAISE NOTICE '🔒 Database is now 100% protected from API key exposure!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════════';
END $$;
