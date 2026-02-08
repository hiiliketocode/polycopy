-- Migration: Fix negative cash in FT wallets
-- Date: Feb 2026
--
-- Problem: Some FT wallets had cash_available < 0 because open_exposure exceeded
--   starting_balance + realized_pnl. Cash = starting_balance + realized_pnl - open_exposure.
--
-- Solution: For each wallet with negative cash, increase starting_balance by the
--   shortfall + small buffer so cash stays non-negative. P&L figures are unchanged
--   (total_pnl = realized + unrealized, independent of starting_balance).
--
-- We append a note to detailed_description for affected wallets so the adjustment
--   is documented.

-- Step 1: Update affected wallets
WITH wallet_stats AS (
  SELECT
    w.wallet_id,
    w.starting_balance,
    w.detailed_description,
    COALESCE(SUM(CASE WHEN o.outcome IN ('WON', 'LOST') THEN o.pnl ELSE 0 END), 0)::DECIMAL(12,2) AS realized_pnl,
    COALESCE(SUM(CASE WHEN o.outcome = 'OPEN' THEN o.size ELSE 0 END), 0)::DECIMAL(12,2) AS open_exposure
  FROM public.ft_wallets w
  LEFT JOIN public.ft_orders o ON o.wallet_id = w.wallet_id
  GROUP BY w.wallet_id, w.starting_balance, w.detailed_description
),
cash_calc AS (
  SELECT
    wallet_id,
    starting_balance,
    detailed_description,
    realized_pnl,
    open_exposure,
    (COALESCE(starting_balance, 1000) + realized_pnl - open_exposure) AS cash_available
  FROM wallet_stats
),
needs_fix AS (
  SELECT
    wallet_id,
    starting_balance,
    detailed_description,
    cash_available,
    -- Amount to add: make cash = 10 (small buffer above zero)
    GREATEST(0, CEIL(ABS(cash_available)::NUMERIC) + 10) AS add_amount
  FROM cash_calc
  WHERE cash_available < 0
)
UPDATE public.ft_wallets w
SET
  starting_balance = w.starting_balance + nf.add_amount,
  detailed_description = CASE
    WHEN COALESCE(nf.detailed_description, '') LIKE '%Starting balance was increased%' THEN nf.detailed_description
    ELSE COALESCE(nf.detailed_description, '') || E'\n\n**Note (Feb 2026):** Starting balance was increased by $' || nf.add_amount::TEXT || ' to correct negative cash. Open exposure had exceeded available balance. P&L figures are unchanged.'
  END,
  updated_at = NOW()
FROM needs_fix nf
WHERE w.wallet_id = nf.wallet_id;

-- Step 2: Log how many were updated (for verification)
-- SELECT COUNT(*) FROM needs_fix;  -- run manually if needed
