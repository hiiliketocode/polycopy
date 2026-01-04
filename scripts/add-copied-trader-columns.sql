-- Adds copied trader references so Orders can display who was copied.
-- Run in Supabase: psql < scripts/add-copied-trader-columns.sql

-- orders table (always present)
ALTER TABLE IF EXISTS public.orders
  ADD COLUMN IF NOT EXISTS copied_trader_id uuid REFERENCES public.traders(id),
  ADD COLUMN IF NOT EXISTS copied_trader_wallet text;

CREATE INDEX IF NOT EXISTS idx_orders_copied_trader_id ON public.orders(copied_trader_id);

-- trades table (only in some environments). Guarded to avoid 42P01 errors.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename = 'trades'
  ) THEN
    ALTER TABLE IF EXISTS public.trades
      ADD COLUMN IF NOT EXISTS copied_trader_id uuid REFERENCES public.traders(id),
      ADD COLUMN IF NOT EXISTS copied_trader_wallet text;

    CREATE INDEX IF NOT EXISTS idx_trades_copied_trader_id ON public.trades(copied_trader_id);
  END IF;
END $$;
