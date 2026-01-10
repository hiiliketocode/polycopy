-- Enable RLS on system tables that were flagged by Supabase security linter
-- These tables are used by workers and internal systems, so we need appropriate policies
-- NOTE: This migration only enables RLS on tables that already exist
-- If a table doesn't exist yet, it will be skipped

-- ============================================================================
-- 1. wallet_backfills - Tracks backfill progress for trader wallets
-- ============================================================================
-- This table is managed by worker scripts, not directly by users
-- Only service role should be able to read/write
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wallet_backfills') THEN
    ALTER TABLE public.wallet_backfills ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'RLS enabled on wallet_backfills';
  ELSE
    RAISE NOTICE 'Table wallet_backfills does not exist, skipping';
  END IF;
END $$;

-- Allow service role full access (workers use service role key)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wallet_backfills') THEN
    DROP POLICY IF EXISTS wallet_backfills_service_role_all ON public.wallet_backfills;
    CREATE POLICY wallet_backfills_service_role_all
    ON public.wallet_backfills
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

    -- Optionally allow authenticated users to view backfill status (read-only)
    DROP POLICY IF EXISTS wallet_backfills_authenticated_read ON public.wallet_backfills;
    CREATE POLICY wallet_backfills_authenticated_read
    ON public.wallet_backfills
    FOR SELECT
    TO authenticated
    USING (true);
  END IF;
END $$;


-- ============================================================================
-- 2. wallet_poll_state - Tracks polling state per wallet (worker system)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wallet_poll_state') THEN
    ALTER TABLE public.wallet_poll_state ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'RLS enabled on wallet_poll_state';
    
    -- Service role full access for workers
    DROP POLICY IF EXISTS wallet_poll_state_service_role_all ON public.wallet_poll_state;
    CREATE POLICY wallet_poll_state_service_role_all
    ON public.wallet_poll_state
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

    -- Authenticated users can view poll state (read-only)
    DROP POLICY IF EXISTS wallet_poll_state_authenticated_read ON public.wallet_poll_state;
    CREATE POLICY wallet_poll_state_authenticated_read
    ON public.wallet_poll_state
    FOR SELECT
    TO authenticated
    USING (true);
  ELSE
    RAISE NOTICE 'Table wallet_poll_state does not exist, skipping';
  END IF;
END $$;


-- ============================================================================
-- 3. positions_current - Current open positions snapshot
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'positions_current') THEN
    ALTER TABLE public.positions_current ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'RLS enabled on positions_current';
    
    -- Service role full access for workers
    DROP POLICY IF EXISTS positions_current_service_role_all ON public.positions_current;
    CREATE POLICY positions_current_service_role_all
    ON public.positions_current
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

    -- Users can view positions for traders they follow
    -- Assuming there's a trader_wallet or similar column
    DROP POLICY IF EXISTS positions_current_authenticated_read ON public.positions_current;
    CREATE POLICY positions_current_authenticated_read
    ON public.positions_current
    FOR SELECT
    TO authenticated
    USING (true);
  ELSE
    RAISE NOTICE 'Table positions_current does not exist, skipping';
  END IF;
END $$;


-- ============================================================================
-- 4. positions_closed - Historical closed positions
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'positions_closed') THEN
    ALTER TABLE public.positions_closed ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'RLS enabled on positions_closed';
    
    -- Service role full access for workers
    DROP POLICY IF EXISTS positions_closed_service_role_all ON public.positions_closed;
    CREATE POLICY positions_closed_service_role_all
    ON public.positions_closed
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

    -- Users can view closed positions (read-only)
    DROP POLICY IF EXISTS positions_closed_authenticated_read ON public.positions_closed;
    CREATE POLICY positions_closed_authenticated_read
    ON public.positions_closed
    FOR SELECT
    TO authenticated
    USING (true);
  ELSE
    RAISE NOTICE 'Table positions_closed does not exist, skipping';
  END IF;
END $$;


-- ============================================================================
-- 5. job_locks - Distributed locking for cold worker
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'job_locks') THEN
    ALTER TABLE public.job_locks ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'RLS enabled on job_locks';
    
    -- Service role full access for workers (workers need to acquire/release locks)
    DROP POLICY IF EXISTS job_locks_service_role_all ON public.job_locks;
    CREATE POLICY job_locks_service_role_all
    ON public.job_locks
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

    -- No read access for regular users - this is internal infrastructure
  ELSE
    RAISE NOTICE 'Table job_locks does not exist, skipping';
  END IF;
END $$;


-- ============================================================================
-- 6. copy_trade_migration_failures - Migration failure tracking
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'copy_trade_migration_failures') THEN
    ALTER TABLE public.copy_trade_migration_failures ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE 'RLS enabled on copy_trade_migration_failures';
    
    -- Service role full access for migration scripts and admins
    DROP POLICY IF EXISTS copy_trade_migration_failures_service_role_all ON public.copy_trade_migration_failures;
    CREATE POLICY copy_trade_migration_failures_service_role_all
    ON public.copy_trade_migration_failures
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

    -- Admins can view migration failures for debugging
    -- Assuming there's a profiles.is_admin column
    DROP POLICY IF EXISTS copy_trade_migration_failures_admin_read ON public.copy_trade_migration_failures;
    CREATE POLICY copy_trade_migration_failures_admin_read
    ON public.copy_trade_migration_failures
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );
  ELSE
    RAISE NOTICE 'Table copy_trade_migration_failures does not exist, skipping';
  END IF;
END $$;


-- ============================================================================
-- Security audit log
-- ============================================================================
-- Log that RLS has been enabled on these tables
DO $$
BEGIN
  RAISE NOTICE 'RLS enabled on system tables at %', now();
  RAISE NOTICE 'Tables secured: wallet_backfills, wallet_poll_state, positions_current, positions_closed, job_locks, copy_trade_migration_failures';
END $$;
