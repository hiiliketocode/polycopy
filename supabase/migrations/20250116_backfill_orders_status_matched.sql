-- Backfill order status to use "matched" instead of "filled" for historical rows.

UPDATE public.orders
SET status = 'matched'
WHERE status = 'filled';
