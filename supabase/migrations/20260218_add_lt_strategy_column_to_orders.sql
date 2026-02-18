-- Re-add lt_strategy_id to orders table.
-- This column was originally added in 20260208 but dropped in 20260211 (LT rebuild).
-- Having it directly on the orders table avoids a secondary lookup to lt_orders
-- on every portfolio/trades read, which is the hot path.

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS lt_strategy_id TEXT;

-- Index for filtering bot trades on the portfolio page
CREATE INDEX IF NOT EXISTS idx_orders_lt_strategy
    ON public.orders(lt_strategy_id)
    WHERE lt_strategy_id IS NOT NULL;

-- Backfill from lt_orders for any orders already placed by bots
UPDATE public.orders o
SET lt_strategy_id = lo.strategy_id
FROM public.lt_orders lo
WHERE lo.order_id = o.order_id
  AND lo.order_id IS NOT NULL
  AND o.lt_strategy_id IS NULL;
