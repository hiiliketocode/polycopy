-- ============================================
-- CREATE PROFILES TABLE
-- RUN THIS IN SUPABASE SQL EDITOR
-- ============================================

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  avatar_url text,
  bio text,
  wallet_address text,
  trading_wallet_address text,
  privy_user_id text,
  privy_wallet_id text,
  wallet_created_at timestamptz,
  wallet_connected_at timestamptz,
  is_premium boolean DEFAULT false,
  premium_expires_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow everyone to view all profiles (public data for trader discovery)
CREATE POLICY "Users can view all profiles"
ON profiles
FOR SELECT
USING (true);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert their own profile"
ON profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Allow users to update their own profile  
CREATE POLICY "Users can update their own profile"
ON profiles
FOR UPDATE
USING (auth.uid() = id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_profiles_wallet ON profiles(wallet_address);
CREATE INDEX IF NOT EXISTS idx_profiles_trading_wallet ON profiles(trading_wallet_address);
CREATE INDEX IF NOT EXISTS idx_profiles_privy_user_id ON profiles(privy_user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_privy_wallet_id ON profiles(privy_wallet_id);

-- Insert profile for current user
INSERT INTO profiles (id, email)
VALUES ('b2ec6399-abcf-4b12-bb16-2f55d0e8a29d', 'donraw@gmail.com')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- Verify
SELECT * FROM profiles WHERE id = 'b2ec6399-abcf-4b12-bb16-2f55d0e8a29d';


