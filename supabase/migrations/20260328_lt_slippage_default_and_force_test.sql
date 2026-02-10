-- 3% default slippage for LT strategies (was 0.5%)
ALTER TABLE public.lt_strategies
  ALTER COLUMN slippage_tolerance_pct SET DEFAULT 3.000;

COMMENT ON COLUMN public.lt_strategies.slippage_tolerance_pct IS
  'Slippage tolerance % applied to limit price when placing BUY orders. Default 3%.';

-- Mark force-test (manual) vs automatic LT orders
ALTER TABLE public.lt_orders
  ADD COLUMN IF NOT EXISTS is_force_test BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.lt_orders.is_force_test IS
  'True when order was placed via force-test (manual replay); false when placed by live executor.';
