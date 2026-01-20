-- Fix overly permissive RLS policy on payment_history table
-- The current policy uses WITH CHECK (true) which allows unrestricted inserts

-- ============================================================================
-- Fix payment_history RLS policies
-- ============================================================================

DO $$
BEGIN
  -- Check if payment_history table exists
  IF EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'payment_history'
  ) THEN
    RAISE NOTICE 'Fixing RLS policies for payment_history table';
    
    -- Drop the overly permissive policy
    DROP POLICY IF EXISTS "Service role can insert payment history" ON public.payment_history;
    
    -- Create a more restrictive policy
    -- Only service role should be able to insert payment history (for Stripe webhooks)
    -- But we should validate that the data is properly formed
    CREATE POLICY "Service role can insert payment history"
    ON public.payment_history
    FOR INSERT
    TO service_role
    WITH CHECK (
      -- Ensure required fields are present and valid
      user_id IS NOT NULL
      AND amount IS NOT NULL
      AND amount >= 0
      AND status IS NOT NULL
      AND created_at IS NOT NULL
    );
    
    -- Ensure authenticated users can only view their own payment history
    DROP POLICY IF EXISTS "Users can view own payment history" ON public.payment_history;
    CREATE POLICY "Users can view own payment history"
    ON public.payment_history
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());
    
    -- Admins can view all payment history for support purposes
    DROP POLICY IF EXISTS "Admins can view all payment history" ON public.payment_history;
    CREATE POLICY "Admins can view all payment history"
    ON public.payment_history
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
      )
    );
    
    -- No UPDATE or DELETE allowed - payment history is immutable
    -- Only service role can modify via direct SQL if absolutely necessary
    
    RAISE NOTICE 'Payment history RLS policies updated successfully';
    
  ELSE
    RAISE NOTICE 'Table payment_history does not exist, skipping';
  END IF;
END $$;


-- ============================================================================
-- Security improvements
-- ============================================================================
-- Before: WITH CHECK (true) allowed ANY data to be inserted by service role
-- After: 
--   - Validates required fields are present
--   - Validates amount is non-negative
--   - Users can only view their own payment history
--   - Admins can view all history for support
--   - Payment history is immutable (no updates/deletes)
--
-- This prevents:
-- 1. Invalid payment records with missing data
-- 2. Negative amounts
-- 3. Users viewing other users' payment history
-- 4. Unauthorized modification of payment records
