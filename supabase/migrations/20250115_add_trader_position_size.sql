ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS trader_position_size numeric;

COMMENT ON COLUMN public.orders.trader_position_size IS 'Last observed size of the copied trader position for this market/outcome';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'trades' AND n.nspname = 'public'
  ) THEN
    ALTER TABLE public.trades
      ADD COLUMN IF NOT EXISTS trader_position_size numeric;

    COMMENT ON COLUMN public.trades.trader_position_size IS 'Last observed size of the copied trader position for this market/outcome';
  END IF;
END
$$;
