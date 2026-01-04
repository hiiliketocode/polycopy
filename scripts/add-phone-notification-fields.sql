-- Add phone number and notification preferences to profiles table
-- Run this in Supabase SQL Editor

-- Add phone number fields
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS phone_number TEXT,
ADD COLUMN IF NOT EXISTS phone_country_code TEXT DEFAULT '+1',
ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": true, "sms": false, "whatsapp": false}'::jsonb;

-- Add index for phone lookups
CREATE INDEX IF NOT EXISTS idx_profiles_phone_number ON profiles(phone_number) WHERE phone_number IS NOT NULL;

-- Add constraint to ensure phone format
ALTER TABLE profiles 
ADD CONSTRAINT phone_number_format 
CHECK (phone_number IS NULL OR phone_number ~ '^\+?[1-9]\d{1,14}$');

-- Create phone verification codes table
CREATE TABLE IF NOT EXISTS phone_verification_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_phone_verification_user ON phone_verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_phone_verification_code ON phone_verification_codes(code);
CREATE INDEX IF NOT EXISTS idx_phone_verification_expires ON phone_verification_codes(expires_at);

-- Enable RLS
ALTER TABLE phone_verification_codes ENABLE ROW LEVEL SECURITY;

-- Policies for phone verification
CREATE POLICY "Users can view their own verification codes"
ON phone_verification_codes FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own verification codes"
ON phone_verification_codes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own verification codes"
ON phone_verification_codes FOR UPDATE USING (auth.uid() = user_id);

-- Function to clean up expired verification codes
CREATE OR REPLACE FUNCTION clean_expired_verification_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM phone_verification_codes
  WHERE expires_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment on columns
COMMENT ON COLUMN profiles.phone_number IS 'User phone number in E.164 format (e.g., +12025551234)';
COMMENT ON COLUMN profiles.phone_country_code IS 'Country code for phone number (e.g., +1)';
COMMENT ON COLUMN profiles.phone_verified IS 'Whether the phone number has been verified';
COMMENT ON COLUMN profiles.notification_preferences IS 'User notification preferences: {"email": true, "sms": false, "whatsapp": false}';
COMMENT ON TABLE phone_verification_codes IS 'Stores verification codes for phone number verification';

