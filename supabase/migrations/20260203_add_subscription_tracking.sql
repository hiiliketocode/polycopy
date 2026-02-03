-- Add subscription tracking columns to profiles table
-- This allows us to track actual MRR vs promotional users

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_amount DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS subscription_status TEXT,
ADD COLUMN IF NOT EXISTS subscription_currency TEXT DEFAULT 'usd';

-- Create index for efficient querying of active subscriptions
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_status 
ON profiles (subscription_status, is_premium) 
WHERE subscription_status IS NOT NULL;

-- Create index for subscription_id lookups
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_subscription_id 
ON profiles (stripe_subscription_id) 
WHERE stripe_subscription_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN profiles.stripe_subscription_id IS 'Stripe subscription ID (sub_xxx) for tracking the actual subscription';
COMMENT ON COLUMN profiles.subscription_amount IS 'Actual monthly subscription amount in dollars (e.g., 0 for promo users, 20 for regular)';
COMMENT ON COLUMN profiles.subscription_status IS 'Stripe subscription status: active, trialing, past_due, canceled, incomplete, etc.';
COMMENT ON COLUMN profiles.subscription_currency IS 'Subscription currency code (default: usd)';
