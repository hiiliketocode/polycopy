-- Add is_admin column to profiles if it doesn't exist
-- This is required for admin endpoint security

DO $$
BEGIN
  -- Check if is_admin column exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'profiles' 
    AND column_name = 'is_admin'
  ) THEN
    -- Add is_admin column
    ALTER TABLE public.profiles 
    ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
    
    RAISE NOTICE 'Added is_admin column to profiles table';
    
    -- Create index for faster admin checks
    CREATE INDEX IF NOT EXISTS profiles_is_admin_idx 
    ON public.profiles(is_admin) 
    WHERE is_admin = true;
    
    RAISE NOTICE 'Created index on is_admin column';
  ELSE
    RAISE NOTICE 'is_admin column already exists';
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN public.profiles.is_admin IS 'Whether user has admin privileges. Used for admin endpoints that need service role access.';
