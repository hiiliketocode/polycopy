-- Add default slippage preferences to notification_preferences table
-- This allows users to set their default slippage tolerance for buy and sell orders

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS default_buy_slippage NUMERIC(5,2) DEFAULT 2.00,
  ADD COLUMN IF NOT EXISTS default_sell_slippage NUMERIC(5,2) DEFAULT 2.00;

COMMENT ON COLUMN public.notification_preferences.default_buy_slippage IS 
  'Default slippage percentage for buy orders (0.00-100.00). Defaults to 2%.';

COMMENT ON COLUMN public.notification_preferences.default_sell_slippage IS 
  'Default slippage percentage for sell orders (0.00-100.00). Defaults to 2%.';
