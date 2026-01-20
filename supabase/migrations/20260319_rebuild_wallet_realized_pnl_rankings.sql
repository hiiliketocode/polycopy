-- Rebuild wallet_realized_pnl_rankings with prior window ranks and total counts

DROP MATERIALIZED VIEW IF EXISTS wallet_realized_pnl_rankings;

CREATE MATERIALIZED VIEW wallet_realized_pnl_rankings AS
WITH stats AS (
  SELECT
    max(date) AS anchor_date,
    min(date) AS min_date
  FROM wallet_realized_pnl_daily
),
windows AS (
  SELECT '1D'::text AS window_key, anchor_date AS window_start, anchor_date AS window_end FROM stats
  UNION ALL
  SELECT '7D'::text, anchor_date - 6, anchor_date FROM stats
  UNION ALL
  SELECT '30D'::text, anchor_date - 29, anchor_date FROM stats
  UNION ALL
  SELECT '3M'::text, anchor_date - 89, anchor_date FROM stats
  UNION ALL
  SELECT '6M'::text, anchor_date - 179, anchor_date FROM stats
  UNION ALL
  SELECT 'ALL'::text, min_date, anchor_date FROM stats
  UNION ALL
  SELECT '1D_PREV'::text, anchor_date - 1, anchor_date - 1 FROM stats
  UNION ALL
  SELECT '7D_PREV'::text, anchor_date - 13, anchor_date - 7 FROM stats
  UNION ALL
  SELECT '30D_PREV'::text, anchor_date - 59, anchor_date - 30 FROM stats
  UNION ALL
  SELECT '3M_PREV'::text, anchor_date - 179, anchor_date - 90 FROM stats
  UNION ALL
  SELECT '6M_PREV'::text, anchor_date - 359, anchor_date - 180 FROM stats
),
aggregated AS (
  SELECT
    w.window_key,
    d.wallet_address,
    w.window_start,
    w.window_end,
    sum(d.realized_pnl) AS pnl_sum
  FROM wallet_realized_pnl_daily d
  CROSS JOIN windows w
  WHERE (w.window_start IS NULL OR d.date >= w.window_start)
    AND (w.window_end IS NULL OR d.date <= w.window_end)
  GROUP BY w.window_key, d.wallet_address, w.window_start, w.window_end
)
SELECT
  window_key,
  wallet_address,
  window_start,
  window_end,
  pnl_sum,
  rank() OVER (PARTITION BY window_key ORDER BY pnl_sum DESC) AS rank,
  count(*) OVER (PARTITION BY window_key) AS total_traders
FROM aggregated;

CREATE UNIQUE INDEX wallet_realized_pnl_rankings_wallet_window
  ON wallet_realized_pnl_rankings (window_key, wallet_address);

CREATE INDEX wallet_realized_pnl_rankings_window_rank
  ON wallet_realized_pnl_rankings (window_key, rank);
