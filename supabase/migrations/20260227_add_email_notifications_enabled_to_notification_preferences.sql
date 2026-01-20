-- Add email notification toggle to notification_preferences

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true;

-- Ensure existing rows are enabled by default (safest assumption)
UPDATE public.notification_preferences
SET email_notifications_enabled = COALESCE(email_notifications_enabled, true)
WHERE email_notifications_enabled IS NULL;

COMMENT ON COLUMN public.notification_preferences.email_notifications_enabled IS
  'Whether the user wants to receive email notifications (default: true).';
