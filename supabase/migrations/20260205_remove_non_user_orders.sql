-- Migration: Remove non-user orders from orders table
-- These orders were synced from tracked traders but are not actual user copy trades
-- 
-- SAFETY: Only deletes orders where copy_user_id IS NULL (i.e., not placed by users)
-- The orders table should only contain copy trades placed by PolyCopy users

-- First, log how many rows will be affected
DO $$
DECLARE
  count_to_delete INTEGER;
  count_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO count_to_delete FROM public.orders WHERE copy_user_id IS NULL;
  SELECT COUNT(*) INTO count_remaining FROM public.orders WHERE copy_user_id IS NOT NULL;
  
  RAISE NOTICE 'Orders to delete (copy_user_id IS NULL): %', count_to_delete;
  RAISE NOTICE 'Orders to keep (copy_user_id IS NOT NULL): %', count_remaining;
END $$;

-- Delete non-user orders
DELETE FROM public.orders
WHERE copy_user_id IS NULL;

-- Verify the cleanup
DO $$
DECLARE
  remaining_null INTEGER;
  total_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_null FROM public.orders WHERE copy_user_id IS NULL;
  SELECT COUNT(*) INTO total_remaining FROM public.orders;
  
  IF remaining_null > 0 THEN
    RAISE EXCEPTION 'Migration failed: % orders still have NULL copy_user_id', remaining_null;
  END IF;
  
  RAISE NOTICE 'Migration successful: % orders remaining (all with copy_user_id)', total_remaining;
END $$;

-- Add a comment explaining the change
COMMENT ON TABLE public.orders IS 'User copy trades only - orders placed by PolyCopy users. All orders must have copy_user_id set.';
