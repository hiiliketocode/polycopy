-- Aggregate function for ft_orders stats per wallet.
-- Replaces the slow client-side pagination loop in /api/ft/wallets/public.
CREATE OR REPLACE FUNCTION public.ft_wallet_order_stats()
RETURNS TABLE (
  wallet_id TEXT,
  total_orders BIGINT,
  won BIGINT,
  lost BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    o.wallet_id,
    COUNT(*)::BIGINT AS total_orders,
    COUNT(*) FILTER (WHERE o.outcome = 'WON')::BIGINT AS won,
    COUNT(*) FILTER (WHERE o.outcome = 'LOST')::BIGINT AS lost
  FROM public.ft_orders o
  GROUP BY o.wallet_id;
$$;

GRANT EXECUTE ON FUNCTION public.ft_wallet_order_stats() TO service_role;
