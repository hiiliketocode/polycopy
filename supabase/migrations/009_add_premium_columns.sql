-- Add premium subscription columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS premium_since TIMESTAMPTZ;

-- Create index on stripe_customer_id for faster webhook lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);

-- Create index on is_premium for faster queries
CREATE INDEX IF NOT EXISTS idx_users_is_premium ON users(is_premium);

-- Add comment to document these columns
COMMENT ON COLUMN users.stripe_customer_id IS 'Stripe customer ID for subscription management';
COMMENT ON COLUMN users.is_premium IS 'Whether user has an active premium subscription';
COMMENT ON COLUMN users.premium_since IS 'Timestamp when user first became a premium member';
