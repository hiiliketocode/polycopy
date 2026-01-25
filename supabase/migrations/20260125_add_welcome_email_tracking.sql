-- Add welcome email tracking columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

-- Create index for efficient querying of users who need welcome emails
CREATE INDEX IF NOT EXISTS idx_profiles_welcome_email_pending 
ON profiles (created_at, welcome_email_sent) 
WHERE welcome_email_sent = FALSE;

-- Add comment for documentation
COMMENT ON COLUMN profiles.welcome_email_sent IS 'Whether the welcome email has been sent to this user';
COMMENT ON COLUMN profiles.welcome_email_sent_at IS 'Timestamp when the welcome email was sent';
