-- Fix 4 ML wallets: use_model=true but model_threshold NULL
UPDATE public.ft_wallets
SET model_threshold = 0.55, updated_at = NOW()
WHERE use_model = TRUE AND model_threshold IS NULL
  AND wallet_id IN ('FT_MODEL_BALANCED','FT_UNDERDOG_HUNTER','FT_SHARP_SHOOTER','FT_MODEL_ONLY');
