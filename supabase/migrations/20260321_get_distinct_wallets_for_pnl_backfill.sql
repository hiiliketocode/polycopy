-- Distinct wallet lists for wallet_realized_pnl_daily backfill.
-- Used by scripts/backfill-wallet-pnl.js to include wallets we have trades or copy orders for.

CREATE OR REPLACE FUNCTION public.get_distinct_trader_wallets_from_trades_public()
RETURNS TABLE(wallet text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT LOWER(TRIM(trader_wallet)) AS wallet
  FROM trades_public
  WHERE trader_wallet IS NOT NULL AND TRIM(trader_wallet) <> '';
$$;

COMMENT ON FUNCTION public.get_distinct_trader_wallets_from_trades_public() IS
  'Distinct trader_wallet from trades_public for PnL backfill wallet list.';

CREATE OR REPLACE FUNCTION public.get_distinct_copied_trader_wallets_from_orders()
RETURNS TABLE(wallet text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT LOWER(TRIM(copied_trader_wallet)) AS wallet
  FROM orders
  WHERE copied_trader_wallet IS NOT NULL AND TRIM(copied_trader_wallet) <> '';
$$;

COMMENT ON FUNCTION public.get_distinct_copied_trader_wallets_from_orders() IS
  'Distinct copied_trader_wallet from orders for PnL backfill wallet list.';

GRANT EXECUTE ON FUNCTION public.get_distinct_trader_wallets_from_trades_public() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_distinct_copied_trader_wallets_from_orders() TO service_role;
