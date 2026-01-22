-- Migration: Seed the windowed Top 30 realized PnL table
-- Purpose: Populate common lookback windows (7D, 30D, 90D, 180D, 365D, ALL) using the
--           daily aggregates so dashboards can read ready-made totals and averages.

WITH windows AS (
  SELECT * FROM (VALUES
    ('7D',   7::integer),
    ('30D', 30::integer),
    ('90D', 90::integer),
    ('180D', 180::integer),
    ('365D', 365::integer),
    ('ALL',  NULL::integer)
  ) AS defs(window_key, lookback_days)
),
as_of AS (
  SELECT now()::date AS today
),
params AS (
  SELECT
    window_key,
    lookback_days,
    today AS as_of,
    CASE
      WHEN lookback_days IS NULL THEN COALESCE((SELECT MIN(date) FROM public.top30_realized_pnl_daily), today)
      ELSE today - (lookback_days - 1)
    END AS start_date
  FROM windows, as_of
),
aggregates AS (
  SELECT
    p.window_key,
    p.lookback_days,
    p.as_of,
    p.start_date,
    COALESCE(MAX(d.wallet_count), 0) AS wallet_count,
    COALESCE(SUM(d.total_realized_pnl), 0) AS total_realized_pnl,
    CASE
      WHEN COUNT(*) > 0 THEN SUM(d.average_realized_pnl) / NULLIF(COUNT(*), 0)
      ELSE 0
    END AS average_realized_pnl,
    COALESCE(SUM(d.total_realized_pnl), 0) AS cumulative_realized_pnl,
    COALESCE(SUM(d.average_realized_pnl), 0) AS cumulative_average_pnl
  FROM params p
  LEFT JOIN public.top30_realized_pnl_daily d
    ON d.date BETWEEN p.start_date AND p.as_of
  GROUP BY p.window_key, p.lookback_days, p.as_of, p.start_date
)
INSERT INTO public.top30_realized_pnl_windows (
  window_key,
  as_of,
  lookback_days,
  start_date,
  wallet_count,
  total_realized_pnl,
  average_realized_pnl,
  cumulative_realized_pnl,
  cumulative_average_pnl,
  updated_at
)
SELECT
  window_key,
  as_of,
  lookback_days,
  start_date,
  wallet_count,
  total_realized_pnl,
  average_realized_pnl,
  cumulative_realized_pnl,
  cumulative_average_pnl,
  now()
FROM aggregates
ON CONFLICT (window_key, as_of) DO UPDATE SET
  lookback_days = EXCLUDED.lookback_days,
  start_date = EXCLUDED.start_date,
  wallet_count = EXCLUDED.wallet_count,
  total_realized_pnl = EXCLUDED.total_realized_pnl,
  average_realized_pnl = EXCLUDED.average_realized_pnl,
  cumulative_realized_pnl = EXCLUDED.cumulative_realized_pnl,
  cumulative_average_pnl = EXCLUDED.cumulative_average_pnl,
  updated_at = EXCLUDED.updated_at;
