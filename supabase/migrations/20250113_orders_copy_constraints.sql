-- Guardrail: ensure copy-trade metadata isn’t partially populated.
-- Use NOT VALID so existing inconsistent rows can be cleaned before validation.
-- Idempotent: only add if it doesn’t already exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_copy_metadata_consistency'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_copy_metadata_consistency
      CHECK (
        -- If we mark a row as a copy (wallet/id present), require an owner and a known method.
        (copied_trader_wallet IS NULL AND copied_trade_id IS NULL)
        OR (copy_user_id IS NOT NULL AND trade_method IN ('quick', 'manual'))
      ) NOT VALID;

    COMMENT ON CONSTRAINT orders_copy_metadata_consistency ON public.orders IS
      'Copy rows must have copy_user_id and trade_method when copy metadata is present';
  END IF;
END
$$;
