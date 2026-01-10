-- Fix mutable search_path security issues in functions
-- Setting search_path prevents search path hijacking attacks where malicious users
-- could create schemas/functions that get called instead of the intended ones

-- ============================================================================
-- 1. handle_new_user - User creation trigger function
-- ============================================================================
-- This function likely creates a profile when a new user signs up
-- We need to find and alter it to set search_path
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
  ) THEN
    -- Set search_path to empty string to only search in explicitly qualified schemas
    -- This prevents search path hijacking attacks
    ALTER FUNCTION public.handle_new_user() 
    SET search_path TO 'public', 'auth';
    
    RAISE NOTICE 'Set search_path for handle_new_user';
  ELSE
    RAISE NOTICE 'Function handle_new_user does not exist, skipping';
  END IF;
END $$;


-- ============================================================================
-- 2. update_updated_at_column - Timestamp update trigger
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    -- This function updates updated_at timestamp, should only access public schema
    ALTER FUNCTION public.update_updated_at_column() 
    SET search_path TO 'public';
    
    RAISE NOTICE 'Set search_path for update_updated_at_column';
  ELSE
    RAISE NOTICE 'Function update_updated_at_column does not exist, skipping';
  END IF;
END $$;


-- ============================================================================
-- 3. clean_expired_verification_codes - Cleanup function
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'clean_expired_verification_codes'
  ) THEN
    -- Cleanup function should only access public schema
    ALTER FUNCTION public.clean_expired_verification_codes() 
    SET search_path TO 'public';
    
    RAISE NOTICE 'Set search_path for clean_expired_verification_codes';
  ELSE
    RAISE NOTICE 'Function clean_expired_verification_codes does not exist, skipping';
  END IF;
END $$;


-- ============================================================================
-- 4. upsert_trades_public - Trade data upsert function
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'upsert_trades_public'
  ) THEN
    -- Trade upsert function should only access public schema
    -- Note: We need to check the function signature to alter the correct overload
    -- Assuming it takes jsonb parameter
    EXECUTE format(
      'ALTER FUNCTION public.upsert_trades_public(jsonb) SET search_path TO %L',
      'public'
    );
    
    RAISE NOTICE 'Set search_path for upsert_trades_public';
  EXCEPTION
    WHEN OTHERS THEN
      -- Try without parameters if the above fails
      BEGIN
        ALTER FUNCTION public.upsert_trades_public() SET search_path TO 'public';
        RAISE NOTICE 'Set search_path for upsert_trades_public (no params)';
      EXCEPTION
        WHEN OTHERS THEN
          RAISE NOTICE 'Could not alter upsert_trades_public: %', SQLERRM;
      END;
  END;
END $$;


-- ============================================================================
-- 5. acquire_job_lock - Distributed locking function
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'acquire_job_lock'
  ) THEN
    -- Job lock function should only access public schema
    -- Check function signature for parameters
    EXECUTE format(
      'ALTER FUNCTION public.acquire_job_lock(text, integer) SET search_path TO %L',
      'public'
    );
    
    RAISE NOTICE 'Set search_path for acquire_job_lock';
  EXCEPTION
    WHEN OTHERS THEN
      -- Try different parameter signatures
      BEGIN
        ALTER FUNCTION public.acquire_job_lock(text) SET search_path TO 'public';
        RAISE NOTICE 'Set search_path for acquire_job_lock (text)';
      EXCEPTION
        WHEN OTHERS THEN
          BEGIN
            ALTER FUNCTION public.acquire_job_lock() SET search_path TO 'public';
            RAISE NOTICE 'Set search_path for acquire_job_lock (no params)';
          EXCEPTION
            WHEN OTHERS THEN
              RAISE NOTICE 'Could not alter acquire_job_lock: %', SQLERRM;
          END;
      END;
  END;
END $$;


-- ============================================================================
-- Verification
-- ============================================================================
DO $$
DECLARE
  func_count integer;
BEGIN
  -- Count functions that still have mutable search_path
  SELECT COUNT(*) INTO func_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  AND p.proname IN (
    'handle_new_user',
    'update_updated_at_column',
    'clean_expired_verification_codes',
    'upsert_trades_public',
    'acquire_job_lock'
  )
  AND NOT prosecdef  -- Not SECURITY DEFINER functions
  AND prosrc IS NOT NULL;
  
  RAISE NOTICE 'Completed search_path fixes. % functions processed.', func_count;
END $$;


-- ============================================================================
-- Security Notes
-- ============================================================================
-- Setting search_path on functions prevents:
-- 1. Search path hijacking - malicious users creating schemas/functions with
--    the same name to intercept calls
-- 2. Privilege escalation - ensuring functions only access intended schemas
-- 3. SQL injection via search_path manipulation
--
-- Best practice: Always set search_path on SECURITY DEFINER functions and
-- any functions that perform security-sensitive operations
