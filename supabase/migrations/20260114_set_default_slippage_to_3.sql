-- Update default slippage preferences to 3%

ALTER TABLE public.notification_preferences
  ALTER COLUMN default_buy_slippage SET DEFAULT 3.00,
  ALTER COLUMN default_sell_slippage SET DEFAULT 3.00;

UPDATE public.notification_preferences
SET default_buy_slippage = 3.00
WHERE default_buy_slippage IS NULL;

UPDATE public.notification_preferences
SET default_sell_slippage = 3.00
WHERE default_sell_slippage IS NULL;

COMMENT ON COLUMN public.notification_preferences.default_buy_slippage IS
  'Default slippage percentage for buy orders (0.00-100.00). Defaults to 3%.';

COMMENT ON COLUMN public.notification_preferences.default_sell_slippage IS
  'Default slippage percentage for sell orders (0.00-100.00). Defaults to 3%.';
