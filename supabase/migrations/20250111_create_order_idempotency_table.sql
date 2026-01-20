-- Migration: Create Order Idempotency Table
-- Purpose: Prevent duplicate order submissions (race condition fix)
-- Date: January 11, 2026
-- Security Issue: Critical Vulnerability #3 - Race Conditions in Order Placement

-- ===========================================
-- 1. CREATE IDEMPOTENCY TABLE
-- ===========================================

CREATE TABLE IF NOT EXISTS public.order_idempotency (
  -- Primary key: order_intent_id must be unique across all users and time
  order_intent_id TEXT PRIMARY KEY,
  
  -- User who initiated the order
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Order lifecycle status
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  
  -- Polymarket's order ID (only set after successful submission)
  polymarket_order_id TEXT,
  
  -- Result data (cached response for idempotent requests)
  result_data JSONB,
  
  -- Error information (if failed)
  error_code TEXT,
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Auto-expiry: cleanup old entries after 24 hours
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

-- ===========================================
-- 2. INDEXES FOR PERFORMANCE
-- ===========================================

-- Index for querying by user
CREATE INDEX idx_order_idempotency_user_id 
ON public.order_idempotency(user_id);

-- Index for expiry cleanup job
CREATE INDEX idx_order_idempotency_expires 
ON public.order_idempotency(expires_at) 
WHERE status IN ('completed', 'failed');

-- Index for pending orders (monitoring)
CREATE INDEX idx_order_idempotency_pending 
ON public.order_idempotency(created_at) 
WHERE status = 'pending';

-- Composite index for user + status queries
CREATE INDEX idx_order_idempotency_user_status 
ON public.order_idempotency(user_id, status, created_at DESC);

-- ===========================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ===========================================

-- Enable RLS on the table
ALTER TABLE public.order_idempotency ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own idempotency records
CREATE POLICY order_idempotency_user_select
ON public.order_idempotency
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy: Users can insert their own idempotency records
CREATE POLICY order_idempotency_user_insert
ON public.order_idempotency
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own idempotency records
CREATE POLICY order_idempotency_user_update
ON public.order_idempotency
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy: Service role has full access (for API endpoints and cleanup)
CREATE POLICY order_idempotency_service_role_all
ON public.order_idempotency
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ===========================================
-- 4. AUTOMATIC CLEANUP FUNCTION
-- ===========================================

-- Function to cleanup expired idempotency records
CREATE OR REPLACE FUNCTION cleanup_expired_order_idempotency()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete records that have expired and are in terminal states
  DELETE FROM public.order_idempotency
  WHERE expires_at < NOW()
    AND status IN ('completed', 'failed');
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Cleaned up % expired order idempotency records', deleted_count;
  RETURN deleted_count;
END;
$$;

-- Grant execute permission to service role
GRANT EXECUTE ON FUNCTION cleanup_expired_order_idempotency() TO service_role;

-- ===========================================
-- 5. ATOMIC ORDER PLACEMENT FUNCTION
-- ===========================================

-- Function to atomically check and record order intent
-- Returns: {
--   "allowed": true/false,
--   "reason": "new" | "duplicate" | "expired",
--   "existing_order_id": "..." (if duplicate)
-- }
CREATE OR REPLACE FUNCTION check_and_record_order_intent(
  p_order_intent_id TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_record RECORD;
  v_result JSONB;
BEGIN
  -- Try to find existing record with FOR UPDATE lock
  SELECT *
  INTO v_existing_record
  FROM public.order_idempotency
  WHERE order_intent_id = p_order_intent_id
  FOR UPDATE NOWAIT;  -- Don't wait, fail fast on contention
  
  -- Record exists
  IF FOUND THEN
    -- Check if expired
    IF v_existing_record.expires_at < NOW() THEN
      -- Expired, allow reuse
      DELETE FROM public.order_idempotency
      WHERE order_intent_id = p_order_intent_id;
      
      -- Insert new record
      INSERT INTO public.order_idempotency (
        order_intent_id,
        user_id,
        status
      ) VALUES (
        p_order_intent_id,
        p_user_id,
        'pending'
      );
      
      RETURN jsonb_build_object(
        'allowed', true,
        'reason', 'expired_reused',
        'existing_order_id', NULL
      );
    END IF;
    
    -- Not expired, check user
    IF v_existing_record.user_id != p_user_id THEN
      -- Different user trying to use same intent ID
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'intent_id_taken',
        'existing_order_id', NULL
      );
    END IF;
    
    -- Same user, duplicate request
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'duplicate',
      'existing_order_id', v_existing_record.polymarket_order_id,
      'status', v_existing_record.status,
      'result_data', v_existing_record.result_data
    );
  END IF;
  
  -- No existing record, insert new one
  BEGIN
    INSERT INTO public.order_idempotency (
      order_intent_id,
      user_id,
      status
    ) VALUES (
      p_order_intent_id,
      p_user_id,
      'pending'
    );
    
    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'new',
      'existing_order_id', NULL
    );
  EXCEPTION
    WHEN unique_violation THEN
      -- Race condition: another request inserted between our check and insert
      -- This is extremely rare but possible
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'race_detected',
        'existing_order_id', NULL
      );
  END;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_and_record_order_intent(TEXT, UUID) TO authenticated, service_role;

-- ===========================================
-- 6. UPDATE IDEMPOTENCY RECORD FUNCTION
-- ===========================================

-- Function to update idempotency record after order completion
CREATE OR REPLACE FUNCTION update_order_idempotency_result(
  p_order_intent_id TEXT,
  p_status TEXT,
  p_polymarket_order_id TEXT DEFAULT NULL,
  p_result_data JSONB DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.order_idempotency
  SET
    status = p_status,
    polymarket_order_id = COALESCE(p_polymarket_order_id, polymarket_order_id),
    result_data = COALESCE(p_result_data, result_data),
    error_code = p_error_code,
    error_message = p_error_message,
    updated_at = NOW(),
    completed_at = CASE
      WHEN p_status IN ('completed', 'failed') THEN NOW()
      ELSE completed_at
    END
  WHERE order_intent_id = p_order_intent_id;
  
  RETURN FOUND;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_order_idempotency_result(TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) TO service_role;

-- ===========================================
-- 7. COMMENTS FOR DOCUMENTATION
-- ===========================================

COMMENT ON TABLE public.order_idempotency IS 
'Idempotency table for order placement. Prevents duplicate orders from race conditions, double-clicks, and network retries.';

COMMENT ON COLUMN public.order_idempotency.order_intent_id IS 
'Unique identifier for the order intent. Generated by client or server. Prevents duplicate orders.';

COMMENT ON COLUMN public.order_idempotency.status IS 
'Order lifecycle: pending (just created), processing (being submitted), completed (success), failed (error).';

COMMENT ON COLUMN public.order_idempotency.expires_at IS 
'Automatic expiry timestamp. Records older than this are cleaned up by cron job.';

COMMENT ON FUNCTION check_and_record_order_intent(TEXT, UUID) IS 
'Atomically checks if an order intent exists and records it if new. Prevents race conditions.';

COMMENT ON FUNCTION update_order_idempotency_result(TEXT, TEXT, TEXT, JSONB, TEXT, TEXT) IS 
'Updates idempotency record with order result. Called after order completion or failure.';

COMMENT ON FUNCTION cleanup_expired_order_idempotency() IS 
'Cleans up expired idempotency records. Should be called by cron job every hour.';

-- ===========================================
-- 8. VERIFICATION QUERIES
-- ===========================================

-- Verify table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'order_idempotency') THEN
    RAISE NOTICE '✅ order_idempotency table created successfully';
  ELSE
    RAISE EXCEPTION '❌ order_idempotency table creation failed';
  END IF;
END $$;

-- Verify RLS is enabled
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_class
    WHERE relname = 'order_idempotency'
      AND relrowsecurity = true
  ) THEN
    RAISE NOTICE '✅ RLS enabled on order_idempotency';
  ELSE
    RAISE WARNING '⚠️  RLS not enabled on order_idempotency';
  END IF;
END $$;

-- Verify policies exist
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'order_idempotency';
  
  IF policy_count >= 4 THEN
    RAISE NOTICE '✅ % RLS policies created on order_idempotency', policy_count;
  ELSE
    RAISE WARNING '⚠️  Only % RLS policies found (expected 4+)', policy_count;
  END IF;
END $$;

-- ===========================================
-- MIGRATION COMPLETE
-- ===========================================

RAISE NOTICE '🎉 Migration complete: Order idempotency table created';
RAISE NOTICE '📝 Next steps:';
RAISE NOTICE '  1. Update order placement endpoint to use check_and_record_order_intent()';
RAISE NOTICE '  2. Update order completion to call update_order_idempotency_result()';
RAISE NOTICE '  3. Set up cron job to call cleanup_expired_order_idempotency() hourly';
RAISE NOTICE '  4. Test with duplicate order intent IDs';
RAISE NOTICE '  5. Monitor idx_order_idempotency_pending for stuck orders';
