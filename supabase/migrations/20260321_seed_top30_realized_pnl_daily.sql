-- Migration: Seed the top30_realized_pnl_daily table with the latest window
-- Purpose: Aggregate the current top 30 wallets' realized PnL history so the index page can read pre-computed data.

WITH top30 AS (
  SELECT wallet_address
  FROM wallet_realized_pnl_rankings
  WHERE window_key = '30D'
  ORDER BY rank
  LIMIT 30
),
daily_aggregates AS (
  SELECT
    d.date,
    COUNT(*) AS wallet_count,
    SUM(d.realized_pnl) AS total_realized_pnl,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE SUM(d.realized_pnl) / COUNT(*)
    END AS average_realized_pnl
  FROM wallet_realized_pnl_daily d
  JOIN top30 t ON t.wallet_address = d.wallet_address
  GROUP BY d.date
),
with_cumulative AS (
  SELECT
    date,
    COALESCE(wallet_count, 0) AS wallet_count,
    COALESCE(total_realized_pnl, 0) AS total_realized_pnl,
    COALESCE(average_realized_pnl, 0) AS average_realized_pnl,
    SUM(COALESCE(total_realized_pnl, 0)) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_realized_pnl,
    SUM(COALESCE(average_realized_pnl, 0)) OVER (ORDER BY date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumulative_average_pnl
  FROM daily_aggregates
)
INSERT INTO public.top30_realized_pnl_daily (
  date,
  wallet_count,
  total_realized_pnl,
  average_realized_pnl,
  cumulative_realized_pnl,
  cumulative_average_pnl,
  updated_at
)
SELECT
  date,
  wallet_count,
  total_realized_pnl,
  average_realized_pnl,
  cumulative_realized_pnl,
  cumulative_average_pnl,
  now()
FROM with_cumulative
ON CONFLICT (date) DO UPDATE SET
  wallet_count = EXCLUDED.wallet_count,
  total_realized_pnl = EXCLUDED.total_realized_pnl,
  average_realized_pnl = EXCLUDED.average_realized_pnl,
  cumulative_realized_pnl = EXCLUDED.cumulative_realized_pnl,
  cumulative_average_pnl = EXCLUDED.cumulative_average_pnl,
  updated_at = EXCLUDED.updated_at;
