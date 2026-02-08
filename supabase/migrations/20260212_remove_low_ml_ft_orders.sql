-- =============================================================================
-- Remove FT orders where model_probability does not meet the wallet's threshold
-- =============================================================================
-- For use_model wallets, only orders with model_probability >= model_threshold
-- should exist. Legacy orders (from before the ML pre-check fix) may have been
-- inserted based on trader WR and later backfilled with low ML scores.
-- This migration deletes those invalid orders and recomputes wallet balances.
-- =============================================================================

-- 1. Delete orders where ML score doesn't meet threshold
--    (model_probability IS NULL OR model_probability < model_threshold)
DELETE FROM public.ft_orders
WHERE wallet_id IN (
  SELECT wallet_id FROM public.ft_wallets
  WHERE use_model = TRUE AND model_threshold IS NOT NULL
)
AND (
  model_probability IS NULL
  OR model_probability < (SELECT model_threshold FROM public.ft_wallets w WHERE w.wallet_id = ft_orders.wallet_id)
);

-- 2. Recompute wallet stats for affected use_model wallets
--    Wallets with remaining orders: aggregate from ft_orders
UPDATE public.ft_wallets w
SET
  total_trades = agg.cnt,
  open_positions = agg.open_cnt,
  total_pnl = agg.total_pnl,
  current_balance = COALESCE(w.starting_balance, 1000) + COALESCE(agg.total_pnl, 0),
  updated_at = NOW()
FROM (
  SELECT
    o.wallet_id,
    COUNT(*)::int AS cnt,
    COUNT(*) FILTER (WHERE o.outcome = 'OPEN')::int AS open_cnt,
    COALESCE(SUM(o.pnl) FILTER (WHERE o.outcome IN ('WON', 'LOST')), 0)::numeric(12,2) AS total_pnl
  FROM public.ft_orders o
  JOIN public.ft_wallets w ON w.wallet_id = o.wallet_id
  WHERE w.use_model = TRUE AND w.model_threshold IS NOT NULL
  GROUP BY o.wallet_id
) agg
WHERE w.wallet_id = agg.wallet_id;

-- 2b. Reset wallets that now have zero orders (all were deleted)
UPDATE public.ft_wallets
SET
  total_trades = 0,
  open_positions = 0,
  total_pnl = 0,
  current_balance = COALESCE(starting_balance, 1000),
  updated_at = NOW()
WHERE use_model = TRUE
  AND model_threshold IS NOT NULL
  AND wallet_id NOT IN (SELECT DISTINCT wallet_id FROM public.ft_orders);
