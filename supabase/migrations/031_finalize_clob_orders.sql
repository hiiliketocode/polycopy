-- Migration: 031_finalize_clob_orders
-- Purpose: Finalize CLOB order lifecycle schema + constraints for public.orders

-- Add required columns (MVP-correct)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS time_in_force TEXT,
  ADD COLUMN IF NOT EXISTS expiration TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS raw JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Normalize existing data before applying constraints
UPDATE public.orders
SET side = LOWER(side)
WHERE side IS NOT NULL;

UPDATE public.orders
SET status = LOWER(status)
WHERE status IS NOT NULL;

UPDATE public.orders
SET time_in_force = UPPER(time_in_force)
WHERE time_in_force IS NOT NULL;

UPDATE public.orders
SET time_in_force = UPPER(order_type)
WHERE time_in_force IS NULL
  AND order_type IS NOT NULL
  AND UPPER(order_type) IN ('GTC', 'GTD', 'FOK', 'FAK');

UPDATE public.orders
SET time_in_force = 'GTC'
WHERE time_in_force IS NULL;

-- Constraints (MVP-safe)
ALTER TABLE public.orders
  ADD CONSTRAINT orders_side_check
    CHECK (side IN ('buy', 'sell'));

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
    CHECK (status IN ('delayed', 'open', 'filled', 'canceled', 'expired', 'rejected'));

ALTER TABLE public.orders
  ADD CONSTRAINT orders_time_in_force_check
    CHECK (time_in_force IN ('GTC', 'GTD', 'FOK', 'FAK'));

ALTER TABLE public.orders
  ALTER COLUMN time_in_force SET NOT NULL;

-- Index for polling active orders
CREATE INDEX IF NOT EXISTS idx_orders_trader_status_updated_at
  ON public.orders (trader_id, status, updated_at DESC);
