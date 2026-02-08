-- RPC to get top wallets by realized PnL for daily rotation strategies.
-- Used by /api/cron/rotate-pnl-winners to update FT_TOP_DAILY_WINNERS and FT_TOP_7D_WINNERS.

CREATE OR REPLACE FUNCTION get_top_pnl_wallets(
  p_window TEXT,  -- '1d' = yesterday only, '7d' = last 7 days (through yesterday)
  p_limit INT DEFAULT 10
)
RETURNS TABLE(wallet_address TEXT, pnl_sum NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_yesterday DATE := CURRENT_DATE - 1;
  v_start_7d DATE := CURRENT_DATE - 7;
BEGIN
  IF p_window = '1d' THEN
    RETURN QUERY
    SELECT d.wallet_address::TEXT, d.realized_pnl::NUMERIC
    FROM public.wallet_realized_pnl_daily d
    WHERE d.date = v_yesterday
    ORDER BY d.realized_pnl DESC
    LIMIT p_limit;
  ELSIF p_window = '7d' THEN
    RETURN QUERY
    SELECT d.wallet_address::TEXT, SUM(d.realized_pnl)::NUMERIC
    FROM public.wallet_realized_pnl_daily d
    WHERE d.date >= v_start_7d AND d.date <= v_yesterday
    GROUP BY d.wallet_address
    ORDER BY SUM(d.realized_pnl) DESC
    LIMIT p_limit;
  END IF;
END;
$$;

COMMENT ON FUNCTION get_top_pnl_wallets IS
  'Returns top wallets by daily realized PnL (1d=yesterday, 7d=trailing 7 days). Used by rotate-pnl-winners cron.';
