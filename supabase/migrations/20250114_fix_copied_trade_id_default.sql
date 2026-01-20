-- Remove the default UUID on copied_trade_id so non-copy orders don’t trip the copy constraint.
-- Normalize existing non-copy rows to NULL for copied_trade_id.

UPDATE public.orders
SET copied_trade_id = NULL
WHERE copy_user_id IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN copied_trade_id DROP DEFAULT;

-- Keep the unique index; copy rows still set copied_trade_id explicitly in code.
