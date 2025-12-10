-- Add premium subscription columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS premium_since TIMESTAMPTZ;

-- Create index on stripe_customer_id for faster webhook lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id ON profiles(stripe_customer_id);

-- Create index on is_premium for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_is_premium ON profiles(is_premium);

-- Add comment to document these columns
COMMENT ON COLUMN profiles.stripe_customer_id IS 'Stripe customer ID for subscription management';
COMMENT ON COLUMN profiles.is_premium IS 'Whether user has an active premium subscription';
COMMENT ON COLUMN profiles.premium_since IS 'Timestamp when user first became a premium member';
