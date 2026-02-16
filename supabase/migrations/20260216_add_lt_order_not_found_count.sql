-- Add order_not_found_count for lost-order handling
-- When CLOB returns 404/order not found, we increment. After N (e.g. 3), mark as LOST.

ALTER TABLE public.lt_orders
ADD COLUMN IF NOT EXISTS order_not_found_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.lt_orders.order_not_found_count IS 'Incremented when CLOB returns order not found. After threshold (e.g. 3), marks order as LOST.';
