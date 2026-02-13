-- =============================================================================
-- ADD wallet_label TO profiles
-- =============================================================================
-- Allows admins to have a short display handle (e.g. "Rawdy") shown as a badge
-- on their LT/FT strategies so other admins can see who owns what.
-- =============================================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS wallet_label TEXT;

COMMENT ON COLUMN public.profiles.wallet_label IS
  'Short display handle for admin badge (e.g. "Rawdy"). Shown on LT/FT strategies so other admins can identify ownership.';

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_profiles_wallet_label
ON public.profiles (wallet_label)
WHERE wallet_label IS NOT NULL;

-- Set the current admin's label
-- (Use polymarket_username as a fallback identifier; the admin can update this anytime)
UPDATE public.profiles
SET wallet_label = 'Rawdy'
WHERE is_admin = TRUE
  AND wallet_label IS NULL
  AND id = (
    SELECT id FROM public.profiles
    WHERE is_admin = TRUE
    ORDER BY created_at ASC
    LIMIT 1
  );
