-- Remove unfilled open orders unless they are GTC.

DELETE FROM public.orders
WHERE lower(status) = 'open'
  AND coalesce(filled_size, 0) = 0
  AND lower(coalesce(time_in_force, order_type, '')) NOT IN (
    'gtc',
    'good_til_cancelled',
    'good_til_canceled',
    'good til cancelled',
    'good til canceled'
  );
