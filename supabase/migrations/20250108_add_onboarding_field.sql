-- Add has_completed_onboarding field to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS has_completed_onboarding BOOLEAN DEFAULT FALSE;

-- Update existing users to have completed onboarding (so they don't see it)
UPDATE profiles 
SET has_completed_onboarding = TRUE 
WHERE has_completed_onboarding IS NULL OR has_completed_onboarding = FALSE;

-- For new users going forward, the default FALSE will apply
