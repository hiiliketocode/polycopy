-- Migration: 032_relax_orders_time_in_force
-- Purpose: Allow NULL time_in_force for incomplete CLOB payloads

ALTER TABLE public.orders
  ALTER COLUMN time_in_force DROP NOT NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_time_in_force_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_time_in_force_check
    CHECK (time_in_force IS NULL OR time_in_force IN ('GTC', 'GTD', 'FOK', 'FAK'));
