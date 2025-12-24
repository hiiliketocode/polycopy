-- Migration: 034_trader_metrics_rollups
-- Purpose: Create trader metric dictionary plus windowed and monthly rollups for analytics.

-- ============================================================
-- Table: metric_definitions
-- ============================================================
CREATE TABLE IF NOT EXISTS metric_definitions (
  metric_name TEXT PRIMARY KEY,
  metric_group TEXT NOT NULL,
  description TEXT NOT NULL,
  value_type TEXT NOT NULL,
  window_scope TEXT NOT NULL DEFAULT 'window',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO metric_definitions (metric_name, metric_group, description, value_type, window_scope)
VALUES
  ('trades_count', 'count', 'Number of trades executed in the window', 'integer', 'window'),
  ('activity_count', 'count', 'Number of activity events captured per window', 'integer', 'window'),
  ('markets_traded_count', 'count', 'Unique markets traded (condition_id) in the period', 'integer', 'window'),
  ('categories_traded', 'mix', 'Category breakdown of trade counts and volume', 'jsonb', 'window'),
  ('trade_type_mix', 'mix', 'Counts of buy/sell trades and their ratio', 'jsonb', 'window'),
  ('realized_pnl_usdc', 'performance', 'Realized P&L from closed positions', 'numeric', 'window'),
  ('unrealized_pnl_usdc', 'performance', 'Unrealized P&L from open positions or latest snapshot', 'numeric', 'window'),
  ('total_pnl_usdc', 'performance', 'Sum of realized and unrealized P&L', 'numeric', 'window'),
  ('equity_start_usdc', 'performance', 'Equity at start of the window (snapshot or fallback)', 'numeric', 'window'),
  ('equity_end_usdc', 'performance', 'Equity at end of the window (snapshot or fallback)', 'numeric', 'window'),
  ('roi_pct', 'performance', 'Return on investment percentage for the window', 'numeric', 'window'),
  ('avg_trade_notional_usdc', 'performance', 'Mean notional of trades inside the window', 'numeric', 'window'),
  ('median_trade_notional_usdc', 'performance', 'Median trade notional for the window', 'numeric', 'window'),
  ('biggest_trade_notional_usdc', 'performance', 'Largest individual trade notional', 'numeric', 'window'),
  ('win_rate', 'win_loss', 'Win rate based on closed positions in the window', 'numeric', 'window'),
  ('max_drawdown_pct', 'risk', 'Maximum drawdown for the window', 'numeric', 'window'),
  ('volatility_pct', 'risk', 'Standard deviation of equity log returns', 'numeric', 'window'),
  ('pnl_volatility_usdc', 'risk', 'Standard deviation of realized P&L per closed position', 'numeric', 'window'),
  ('avg_entry_price', 'behavior', 'VWAP entry price for BUY trades', 'numeric', 'window'),
  ('entry_price_bucket_counts', 'behavior', 'Counts of buy trades grouped by price buckets', 'jsonb', 'window'),
  ('trades_by_day', 'behavior', 'Trades count aggregated by day', 'jsonb', 'window'),
  ('trades_by_daypart', 'behavior', 'Trades count for night/morning/afternoon/evening', 'jsonb', 'window'),
  ('redeem_count', 'behavior', 'Redeem activity events inside the window', 'integer', 'window'),
  ('manual_close_count', 'behavior', 'Approximate manual closes (SELL trades)', 'integer', 'window'),
  ('manual_vs_redeem_pct', 'behavior', 'Manual closes compared to redeem events', 'numeric', 'window'),
  ('bet_type_mix', 'profile', 'Bet type breakdown of trades', 'jsonb', 'window')
ON CONFLICT (metric_name) DO UPDATE
SET metric_group = EXCLUDED.metric_group,
    description = EXCLUDED.description,
    value_type = EXCLUDED.value_type,
    window_scope = EXCLUDED.window_scope,
    updated_at = NOW();

-- ============================================================
-- Table: trader_metrics_windowed
-- ============================================================
CREATE TABLE IF NOT EXISTS trader_metrics_windowed (
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  proxy_wallet TEXT NOT NULL,
  window_label TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trades_count INTEGER NOT NULL DEFAULT 0,
  activity_count INTEGER NOT NULL DEFAULT 0,
  markets_traded_count INTEGER NOT NULL DEFAULT 0,
  categories_traded JSONB NOT NULL DEFAULT '{}'::jsonb,
  trade_type_mix JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_freshness_seconds NUMERIC,
  coverage_score NUMERIC,
  realized_pnl_usdc NUMERIC,
  unrealized_pnl_usdc NUMERIC,
  total_pnl_usdc NUMERIC,
  equity_start_usdc NUMERIC,
  equity_end_usdc NUMERIC,
  roi_pct NUMERIC,
  avg_trade_notional_usdc NUMERIC,
  median_trade_notional_usdc NUMERIC,
  biggest_trade_notional_usdc NUMERIC,
  biggest_win_pnl_usdc NUMERIC,
  biggest_loss_pnl_usdc NUMERIC,
  profit_factor NUMERIC,
  wins_count INTEGER,
  losses_count INTEGER,
  win_rate NUMERIC,
  win_rate_by_category JSONB NOT NULL DEFAULT '{}'::jsonb,
  win_rate_by_entry_price_bucket JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_drawdown_pct NUMERIC,
  volatility_pct NUMERIC,
  pnl_volatility_usdc NUMERIC,
  avg_entry_price NUMERIC,
  entry_price_bucket_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  trades_by_day JSONB NOT NULL DEFAULT '{}'::jsonb,
  trades_by_daypart JSONB NOT NULL DEFAULT '{}'::jsonb,
  redeem_count INTEGER,
  manual_close_count INTEGER,
  manual_vs_redeem_pct NUMERIC,
  bet_type_mix JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshots_covered INTEGER,
  expected_snapshots INTEGER,
  PRIMARY KEY (trader_id, window_label)
);

ALTER TABLE trader_metrics_windowed ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_trader_metrics_windowed_proxy_wallet ON trader_metrics_windowed(proxy_wallet, window_end DESC);
CREATE INDEX IF NOT EXISTS idx_trader_metrics_windowed_window_start ON trader_metrics_windowed(window_start);

-- ============================================================
-- Table: trader_metrics_monthly
-- ============================================================
CREATE TABLE IF NOT EXISTS trader_metrics_monthly (
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  proxy_wallet TEXT NOT NULL,
  month_start DATE NOT NULL,
  month_end TIMESTAMPTZ NOT NULL,
  window_label TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trades_count INTEGER NOT NULL DEFAULT 0,
  activity_count INTEGER NOT NULL DEFAULT 0,
  markets_traded_count INTEGER NOT NULL DEFAULT 0,
  categories_traded JSONB NOT NULL DEFAULT '{}'::jsonb,
  trade_type_mix JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_freshness_seconds NUMERIC,
  coverage_score NUMERIC,
  realized_pnl_usdc NUMERIC,
  unrealized_pnl_usdc NUMERIC,
  total_pnl_usdc NUMERIC,
  equity_start_usdc NUMERIC,
  equity_end_usdc NUMERIC,
  roi_pct NUMERIC,
  avg_trade_notional_usdc NUMERIC,
  median_trade_notional_usdc NUMERIC,
  biggest_trade_notional_usdc NUMERIC,
  biggest_win_pnl_usdc NUMERIC,
  biggest_loss_pnl_usdc NUMERIC,
  profit_factor NUMERIC,
  wins_count INTEGER,
  losses_count INTEGER,
  win_rate NUMERIC,
  win_rate_by_category JSONB NOT NULL DEFAULT '{}'::jsonb,
  win_rate_by_entry_price_bucket JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_drawdown_pct NUMERIC,
  volatility_pct NUMERIC,
  pnl_volatility_usdc NUMERIC,
  avg_entry_price NUMERIC,
  entry_price_bucket_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  trades_by_day JSONB NOT NULL DEFAULT '{}'::jsonb,
  trades_by_daypart JSONB NOT NULL DEFAULT '{}'::jsonb,
  redeem_count INTEGER,
  manual_close_count INTEGER,
  manual_vs_redeem_pct NUMERIC,
  bet_type_mix JSONB NOT NULL DEFAULT '{}'::jsonb,
  snapshots_covered INTEGER,
  expected_snapshots INTEGER,
  profitable_month BOOLEAN,
  PRIMARY KEY (trader_id, month_start)
);

ALTER TABLE trader_metrics_monthly ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_trader_metrics_monthly_proxy_wallet ON trader_metrics_monthly(proxy_wallet, month_start DESC);
CREATE INDEX IF NOT EXISTS idx_trader_metrics_monthly_window_label ON trader_metrics_monthly(window_label);

-- ============================================================
-- Indexes for fact tables
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'raw_trades') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_raw_trades_proxy_wallet_ts ON raw_trades(proxy_wallet, timestamp DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_raw_trades_trader_timestamp ON raw_trades(trader_id, timestamp DESC)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'raw_activity') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_raw_activity_proxy_wallet_ts ON raw_activity(proxy_wallet, timestamp DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_raw_activity_trader_timestamp ON raw_activity(trader_id, timestamp DESC)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'closed_positions') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_closed_positions_trader_closed_at ON closed_positions(trader_id, closed_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_closed_positions_proxy_wallet_closed_at ON closed_positions(proxy_wallet, closed_at DESC)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'snapshots_equity') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_snapshots_equity_proxy_ts ON snapshots_equity(proxy_wallet, ts DESC)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'raw_positions') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_raw_positions_proxy_updated ON raw_positions(proxy_wallet, updated_at DESC)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'raw_value') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_raw_value_proxy_updated ON raw_value(proxy_wallet, updated_at DESC)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'markets_lookup') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_markets_lookup_condition ON markets_lookup(condition_id)';
  END IF;
END$$;


-- ============================================================
-- Function: trader_metric_compute_period
-- Returns metrics for one trader and one window boundary.
-- ============================================================
CREATE OR REPLACE FUNCTION trader_metric_compute_period(
  p_trader_id UUID,
  p_proxy_wallet TEXT,
  p_window_label TEXT,
  p_window_start TIMESTAMPTZ,
  p_window_end TIMESTAMPTZ,
  p_snapshot_interval_seconds INTEGER DEFAULT 3600
)
RETURNS TABLE (
  trader_id UUID,
  proxy_wallet TEXT,
  window_label TEXT,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  computed_at TIMESTAMPTZ,
  trades_count INTEGER,
  activity_count INTEGER,
  markets_traded_count INTEGER,
  categories_traded JSONB,
  trade_type_mix JSONB,
  data_freshness_seconds NUMERIC,
  coverage_score NUMERIC,
  realized_pnl_usdc NUMERIC,
  unrealized_pnl_usdc NUMERIC,
  total_pnl_usdc NUMERIC,
  equity_start_usdc NUMERIC,
  equity_end_usdc NUMERIC,
  roi_pct NUMERIC,
  avg_trade_notional_usdc NUMERIC,
  median_trade_notional_usdc NUMERIC,
  biggest_trade_notional_usdc NUMERIC,
  biggest_win_pnl_usdc NUMERIC,
  biggest_loss_pnl_usdc NUMERIC,
  profit_factor NUMERIC,
  wins_count INTEGER,
  losses_count INTEGER,
  win_rate NUMERIC,
  win_rate_by_category JSONB,
  win_rate_by_entry_price_bucket JSONB,
  max_drawdown_pct NUMERIC,
  volatility_pct NUMERIC,
  pnl_volatility_usdc NUMERIC,
  avg_entry_price NUMERIC,
  entry_price_bucket_counts JSONB,
  trades_by_day JSONB,
  trades_by_daypart JSONB,
  redeem_count INTEGER,
  manual_close_count INTEGER,
  manual_vs_redeem_pct NUMERIC,
  bet_type_mix JSONB,
  snapshots_covered INTEGER,
  expected_snapshots INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH period_window AS (
    SELECT p_window_label AS window_label,
           p_window_start AS window_start,
           p_window_end AS window_end
  )
  SELECT
    p_trader_id,
    p_proxy_wallet,
    w.window_label,
    w.window_start,
    w.window_end,
    NOW() AT TIME ZONE 'UTC' AS computed_at,
    trade_metrics.trades_count,
    activity_metrics.activity_count,
    trade_metrics.markets_traded_count,
    trade_metrics.categories_traded,
    trade_metrics.trade_type_mix,
    COALESCE(EXTRACT(EPOCH FROM NOW() - latest_data.latest_event_ts), 0) AS data_freshness_seconds,
    snapshot_metrics.coverage_score,
    closed_metrics.realized_pnl_usdc,
    COALESCE(position_metrics.unrealized_pnl_usdc, 0) AS unrealized_pnl_usdc,
    COALESCE(closed_metrics.realized_pnl_usdc, 0) + COALESCE(position_metrics.unrealized_pnl_usdc, 0) AS total_pnl_usdc,
    COALESCE(snapshot_metrics.equity_start_snapshot, value_metrics.value_start, value_metrics.value_end) AS equity_start_usdc,
    COALESCE(snapshot_metrics.equity_end_snapshot, value_metrics.value_end, value_metrics.value_start) AS equity_end_usdc,
    CASE
      WHEN COALESCE(snapshot_metrics.equity_start_snapshot, value_metrics.value_start, value_metrics.value_end) = 0 THEN NULL
      ELSE (COALESCE(snapshot_metrics.equity_end_snapshot, value_metrics.value_end, value_metrics.value_start)
            - COALESCE(snapshot_metrics.equity_start_snapshot, value_metrics.value_start, value_metrics.value_end))
           / NULLIF(COALESCE(snapshot_metrics.equity_start_snapshot, value_metrics.value_start, value_metrics.value_end), 0)
    END AS roi_pct,
    trade_metrics.avg_trade_notional_usdc,
    trade_metrics.median_trade_notional_usdc,
    trade_metrics.biggest_trade_notional_usdc,
    closed_metrics.biggest_win_pnl_usdc,
    closed_metrics.biggest_loss_pnl_usdc,
    closed_metrics.profit_factor,
    closed_metrics.wins_count,
    closed_metrics.losses_count,
    closed_metrics.win_rate,
    closed_metrics.win_rate_by_category,
    closed_metrics.win_rate_by_entry_price_bucket,
    snapshot_metrics.max_drawdown_pct,
    snapshot_metrics.volatility_pct,
    closed_metrics.pnl_volatility_usdc,
    trade_metrics.avg_entry_price,
    trade_metrics.entry_price_bucket_counts,
    trade_metrics.trades_by_day,
    trade_metrics.trades_by_daypart,
    activity_metrics.redeem_count,
    trade_metrics.manual_close_count,
    CASE
      WHEN (trade_metrics.manual_close_count + activity_metrics.redeem_count) = 0 THEN NULL
      ELSE trade_metrics.manual_close_count::NUMERIC / (trade_metrics.manual_close_count + activity_metrics.redeem_count)
    END AS manual_vs_redeem_pct,
    trade_metrics.bet_type_mix,
    snapshot_metrics.snapshots_covered,
    snapshot_metrics.expected_snapshots
  FROM period_window w
  CROSS JOIN LATERAL (
    SELECT GREATEST(
      COALESCE((SELECT MAX(rt.timestamp) FROM raw_trades rt WHERE ((rt.trader_id = p_trader_id) OR (p_proxy_wallet IS NOT NULL AND rt.proxy_wallet = p_proxy_wallet))), w.window_start),
      COALESCE((SELECT MAX(ra.timestamp) FROM raw_activity ra WHERE ((ra.trader_id = p_trader_id) OR (p_proxy_wallet IS NOT NULL AND ra.proxy_wallet = p_proxy_wallet))), w.window_start),
      COALESCE((SELECT MAX(se.ts) FROM snapshots_equity se WHERE ((se.trader_id = p_trader_id) OR (p_proxy_wallet IS NOT NULL AND se.proxy_wallet = p_proxy_wallet))), w.window_start),
      COALESCE((SELECT MAX(rv.updated_at) FROM raw_value rv WHERE ((rv.trader_id = p_trader_id) OR (p_proxy_wallet IS NOT NULL AND rv.proxy_wallet = p_proxy_wallet))), w.window_start)
    ) AS latest_event_ts
  ) latest_data
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(COUNT(*), 0) AS activity_count,
      COALESCE(SUM(CASE WHEN UPPER(ra.type) = 'REDEEM' THEN 1 ELSE 0 END), 0) AS redeem_count
    FROM raw_activity ra
    WHERE ((ra.trader_id = p_trader_id) OR (p_proxy_wallet IS NOT NULL AND ra.proxy_wallet = p_proxy_wallet))
      AND ra.timestamp >= w.window_start
      AND ra.timestamp <= w.window_end
  ) activity_metrics
  CROSS JOIN LATERAL (
    WITH filtered_trades AS (
      SELECT
        t.*,
        COALESCE(m.category, t.category, 'unknown') AS resolved_category,
        COALESCE(m.bet_type, 'unknown') AS resolved_bet_type,
        t.price * t.size AS trade_notional,
        DATE_TRUNC('day', t.timestamp) AS trade_day,
        CASE
          WHEN EXTRACT('hour' FROM t.timestamp) < 6 THEN 'night'
          WHEN EXTRACT('hour' FROM t.timestamp) < 12 THEN 'morning'
          WHEN EXTRACT('hour' FROM t.timestamp) < 18 THEN 'afternoon'
          ELSE 'evening'
        END AS daypart
      FROM raw_trades t
      LEFT JOIN markets_lookup m ON t.condition_id = m.condition_id
      WHERE ((t.trader_id = p_trader_id) OR (p_proxy_wallet IS NOT NULL AND t.proxy_wallet = p_proxy_wallet))
        AND t.timestamp >= w.window_start
        AND t.timestamp <= w.window_end
    ),
    trade_counts AS (
      SELECT
        COUNT(*) AS trades_count,
        COUNT(DISTINCT condition_id) AS markets_traded_count,
        SUM(CASE WHEN UPPER(side) = 'BUY' THEN 1 ELSE 0 END) AS buy_count,
        SUM(CASE WHEN UPPER(side) = 'SELL' THEN 1 ELSE 0 END) AS sell_count,
        SUM(trade_notional) AS total_notional,
        SUM(CASE WHEN UPPER(side) = 'BUY' THEN price * size ELSE 0 END) AS buy_notional,
        SUM(CASE WHEN UPPER(side) = 'BUY' THEN size ELSE 0 END) AS buy_size
      FROM filtered_trades
    ),
    category_stats AS (
      SELECT
        resolved_category AS category,
        COUNT(*) AS category_count,
        SUM(trade_notional) AS volume_usdc
      FROM filtered_trades
      GROUP BY resolved_category
    ),
    bet_type_stats AS (
      SELECT
        resolved_bet_type AS bet_type,
        COUNT(*) AS trade_count,
        SUM(trade_notional) AS volume_usdc
      FROM filtered_trades
      GROUP BY resolved_bet_type
    ),
    day_stats AS (
      SELECT
        TO_CHAR(trade_day, 'YYYY-MM-DD') AS day_label,
        COUNT(*) AS day_count
      FROM filtered_trades
      GROUP BY trade_day
    ),
    daypart_stats AS (
      SELECT daypart, COUNT(*) AS daypart_count
      FROM filtered_trades
      GROUP BY daypart
    ),
    entry_price_bucket_counts AS (
      SELECT bucket, COUNT(*) AS bucket_count
      FROM (
        SELECT
          CASE
            WHEN price < 0.10 THEN '<0.10'
            WHEN price < 0.25 THEN '0.10-0.25'
            WHEN price < 0.50 THEN '0.25-0.50'
            ELSE '>0.50'
          END AS bucket
        FROM filtered_trades
        WHERE price IS NOT NULL AND UPPER(side) = 'BUY'
      ) bp
      GROUP BY bucket
    )
    SELECT
      COALESCE(trade_counts.trades_count, 0) AS trades_count,
      COALESCE(trade_counts.markets_traded_count, 0) AS markets_traded_count,
      COALESCE(
        (SELECT jsonb_object_agg(category, jsonb_build_object('count', category_count, 'volume_usdc', volume_usdc)) FROM category_stats),
        '{}'::jsonb
      ) AS categories_traded,
      jsonb_build_object(
        'buy_count', COALESCE(trade_counts.buy_count, 0),
        'sell_count', COALESCE(trade_counts.sell_count, 0),
        'buy_sell_ratio',
          CASE
            WHEN COALESCE(trade_counts.sell_count, 0) = 0 THEN NULL
            ELSE COALESCE(trade_counts.buy_count, 0)::NUMERIC / COALESCE(trade_counts.sell_count, 0)
          END
      ) AS trade_type_mix,
      (SELECT AVG(trade_notional) FROM filtered_trades) AS avg_trade_notional_usdc,
      (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY trade_notional) FROM filtered_trades) AS median_trade_notional_usdc,
      (SELECT MAX(trade_notional) FROM filtered_trades) AS biggest_trade_notional_usdc,
      CASE
        WHEN COALESCE(trade_counts.buy_size, 0) = 0 THEN NULL
        ELSE trade_counts.buy_notional / trade_counts.buy_size
      END AS avg_entry_price,
      jsonb_build_object(
        '<0.10', COALESCE((SELECT bucket_count FROM entry_price_bucket_counts WHERE bucket = '<0.10'), 0),
        '0.10-0.25', COALESCE((SELECT bucket_count FROM entry_price_bucket_counts WHERE bucket = '0.10-0.25'), 0),
        '0.25-0.50', COALESCE((SELECT bucket_count FROM entry_price_bucket_counts WHERE bucket = '0.25-0.50'), 0),
        '>0.50', COALESCE((SELECT bucket_count FROM entry_price_bucket_counts WHERE bucket = '>0.50'), 0)
      ) AS entry_price_bucket_counts,
      COALESCE((SELECT jsonb_object_agg(day_label, day_count) FROM day_stats), '{}'::jsonb) AS trades_by_day,
      COALESCE((SELECT jsonb_object_agg(daypart, daypart_count) FROM daypart_stats), '{}'::jsonb) AS trades_by_daypart,
      COALESCE(trade_counts.sell_count, 0) AS manual_close_count,
      COALESCE(
        (SELECT jsonb_object_agg(bet_type, jsonb_build_object('trade_count', trade_count, 'volume_usdc', volume_usdc)) FROM bet_type_stats),
        '{}'::jsonb
      ) AS bet_type_mix
    FROM trade_counts
    LIMIT 1
  ) trade_metrics
  CROSS JOIN LATERAL (
    WITH filtered_snapshots AS (
      SELECT ts, equity_usdc
      FROM snapshots_equity s
      WHERE ((s.trader_id = p_trader_id) OR (p_proxy_wallet IS NOT NULL AND s.proxy_wallet = p_proxy_wallet))
        AND s.ts >= w.window_start
        AND s.ts <= w.window_end
      ORDER BY ts
    ),
    equity_peaks AS (
      SELECT
        ts,
        equity_usdc,
        MAX(equity_usdc) OVER (ORDER BY ts ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_peak,
        LAG(equity_usdc) OVER (ORDER BY ts) AS prev_equity
      FROM filtered_snapshots
    ),
    return_set AS (
      SELECT LN(equity_usdc / NULLIF(prev_equity, 0)) AS log_return
      FROM equity_peaks
      WHERE prev_equity > 0 AND equity_usdc > 0 AND prev_equity IS NOT NULL
    ),
    duration AS (
      SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM w.window_end - w.window_start) / GREATEST(p_snapshot_interval_seconds, 1)))::INTEGER AS expected_snapshots
    )
    SELECT
      (SELECT equity_usdc FROM filtered_snapshots ORDER BY ts ASC LIMIT 1) AS equity_start_snapshot,
      (SELECT equity_usdc FROM filtered_snapshots ORDER BY ts DESC LIMIT 1) AS equity_end_snapshot,
      (SELECT MIN((equity_usdc - running_peak) / NULLIF(running_peak, 0)) FROM equity_peaks) AS max_drawdown_pct,
      (SELECT STDDEV_POP(log_return) FROM return_set) AS volatility_pct,
      COALESCE((SELECT COUNT(*) FROM filtered_snapshots), 0) AS snapshots_covered,
      duration.expected_snapshots,
      CASE
        WHEN duration.expected_snapshots = 0 THEN NULL
        ELSE LEAST(100, 100 * COALESCE((SELECT COUNT(*) FROM filtered_snapshots), 0)::NUMERIC / duration.expected_snapshots)
      END AS coverage_score
    FROM duration
    LIMIT 1
  ) snapshot_metrics
  CROSS JOIN LATERAL (
    SELECT
      COALESCE(
        (SELECT unrealized_pnl_usdc FROM raw_positions rp
         WHERE ((rp.trader_id = p_trader_id) OR (p_proxy_wallet IS NOT NULL AND rp.proxy_wallet = p_proxy_wallet))
           AND rp.updated_at <= w.window_end
         ORDER BY rp.updated_at DESC
         LIMIT 1),
        0
      ) AS unrealized_pnl_usdc
  ) position_metrics
  CROSS JOIN LATERAL (
    SELECT
      (SELECT total_value FROM raw_value rv
       WHERE ((rv.trader_id = p_trader_id) OR (p_proxy_wallet IS NOT NULL AND rv.proxy_wallet = p_proxy_wallet))
         AND rv.updated_at <= w.window_end
       ORDER BY rv.updated_at DESC
       LIMIT 1) AS value_end,
      (SELECT total_value FROM raw_value rv
       WHERE ((rv.trader_id = p_trader_id) OR (p_proxy_wallet IS NOT NULL AND rv.proxy_wallet = p_proxy_wallet))
         AND rv.updated_at >= w.window_start
       ORDER BY rv.updated_at ASC
       LIMIT 1) AS value_start
  ) value_metrics
  CROSS JOIN LATERAL (
    WITH closed_window AS (
      SELECT
        cp.*,
        COALESCE(m.category, cp.category, 'unknown') AS resolved_category,
        COALESCE(m.bet_type, 'unknown') AS resolved_bet_type,
        cp.entry_price
      FROM closed_positions cp
      LEFT JOIN markets_lookup m ON cp.condition_id = m.condition_id
      WHERE ((cp.trader_id = p_trader_id) OR (p_proxy_wallet IS NOT NULL AND cp.proxy_wallet = p_proxy_wallet))
        AND cp.closed_at >= w.window_start
        AND cp.closed_at <= w.window_end
    ),
    rollups AS (
      SELECT
        COALESCE(SUM(cp.realized_pnl), 0) AS realized_pnl_usdc,
        SUM(CASE WHEN cp.realized_pnl > 0 THEN 1 ELSE 0 END) AS wins_count,
        SUM(CASE WHEN cp.realized_pnl < 0 THEN 1 ELSE 0 END) AS losses_count,
        SUM(CASE WHEN cp.realized_pnl > 0 THEN cp.realized_pnl ELSE 0 END) AS positive_pnl,
        SUM(CASE WHEN cp.realized_pnl < 0 THEN cp.realized_pnl ELSE 0 END) AS negative_pnl,
        MAX(cp.realized_pnl) AS biggest_win_pnl_usdc,
        MIN(cp.realized_pnl) AS biggest_loss_pnl_usdc,
        STDDEV_POP(cp.realized_pnl) AS pnl_volatility_usdc
      FROM closed_window cp
    ),
    category_win_rate AS (
      SELECT
        resolved_category AS category,
        SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END) AS losses
      FROM closed_window
      GROUP BY resolved_category
    ),
    entry_price_buckets AS (
      SELECT
        bucket,
        SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END) AS losses
      FROM (
        SELECT
          CASE
            WHEN entry_price < 0.10 THEN '<0.10'
            WHEN entry_price < 0.25 THEN '0.10-0.25'
            WHEN entry_price < 0.50 THEN '0.25-0.50'
            ELSE '>0.50'
          END AS bucket,
          realized_pnl
        FROM closed_window
        WHERE entry_price IS NOT NULL
      ) bucketed
      GROUP BY bucket
    )
    SELECT
      rollups.realized_pnl_usdc,
      COALESCE(rollups.biggest_win_pnl_usdc, 0) AS biggest_win_pnl_usdc,
      COALESCE(rollups.biggest_loss_pnl_usdc, 0) AS biggest_loss_pnl_usdc,
      CASE
        WHEN rollups.negative_pnl = 0 THEN NULL
        ELSE rollups.positive_pnl / ABS(rollups.negative_pnl)
      END AS profit_factor,
      COALESCE(rollups.wins_count, 0) AS wins_count,
      COALESCE(rollups.losses_count, 0) AS losses_count,
      CASE
        WHEN COALESCE(rollups.wins_count, 0) + COALESCE(rollups.losses_count, 0) = 0 THEN NULL
        ELSE COALESCE(rollups.wins_count, 0)::NUMERIC / (COALESCE(rollups.wins_count, 0) + COALESCE(rollups.losses_count, 0))
      END AS win_rate,
      COALESCE(
        (SELECT jsonb_object_agg(category,
          jsonb_build_object('win_rate',
            CASE
              WHEN (wins + losses) = 0 THEN NULL
              ELSE wins::NUMERIC / (wins + losses)
            END)
        ) FROM category_win_rate),
        '{}'::jsonb
      ) AS win_rate_by_category,
      COALESCE(
        (SELECT jsonb_object_agg(bucket,
          jsonb_build_object('win_rate',
            CASE
              WHEN (wins + losses) = 0 THEN NULL
              ELSE wins::NUMERIC / (wins + losses)
            END)
        ) FROM entry_price_buckets),
        '{}'::jsonb
      ) AS win_rate_by_entry_price_bucket,
      rollups.pnl_volatility_usdc
    FROM rollups
    LIMIT 1
  ) closed_metrics;
END;
$$;

-- ============================================================
-- Function: compute_trader_metrics_windowed
-- ============================================================
CREATE OR REPLACE FUNCTION compute_trader_metrics_windowed(p_identifier TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trader RECORD;
  v_now TIMESTAMPTZ := NOW() AT TIME ZONE 'UTC';
  v_earliest TIMESTAMPTZ;
BEGIN
  IF p_identifier IS NULL THEN
    RAISE NOTICE 'compute_trader_metrics_windowed requires a trader identifier';
    RETURN;
  END IF;

  SELECT id, wallet_address
  INTO v_trader
  FROM traders
  WHERE wallet_address = p_identifier OR id::TEXT = p_identifier
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'Trader not found for %', p_identifier;
    RETURN;
  END IF;

  SELECT LEAST(
    COALESCE((SELECT MIN(rt.timestamp) FROM raw_trades rt WHERE ((rt.trader_id = v_trader.id) OR (v_trader.wallet_address IS NOT NULL AND rt.proxy_wallet = v_trader.wallet_address))), v_now - INTERVAL '5 years'),
    COALESCE((SELECT MIN(se.ts) FROM snapshots_equity se WHERE ((se.trader_id = v_trader.id) OR (v_trader.wallet_address IS NOT NULL AND se.proxy_wallet = v_trader.wallet_address))), v_now - INTERVAL '5 years'),
    COALESCE((SELECT MIN(rv.updated_at) FROM raw_value rv WHERE ((rv.trader_id = v_trader.id) OR (v_trader.wallet_address IS NOT NULL AND rv.proxy_wallet = v_trader.wallet_address))), v_now - INTERVAL '5 years')
  ) INTO v_earliest;

  IF v_earliest IS NULL OR v_earliest > v_now THEN
    v_earliest := v_now - INTERVAL '5 years';
  END IF;

  WITH windows AS (
    SELECT '24h' AS window_label, v_now - INTERVAL '24 hours' AS window_start, v_now AS window_end
    UNION ALL
    SELECT '7d', v_now - INTERVAL '7 days', v_now
    UNION ALL
    SELECT '30d', v_now - INTERVAL '30 days', v_now
    UNION ALL
    SELECT '90d', v_now - INTERVAL '90 days', v_now
    UNION ALL
    SELECT '1y', v_now - INTERVAL '1 year', v_now
    UNION ALL
    SELECT 'all', v_earliest, v_now
  )
  INSERT INTO trader_metrics_windowed (
    trader_id, proxy_wallet, window_label, window_start, window_end, computed_at,
    trades_count, activity_count, markets_traded_count, categories_traded, trade_type_mix,
    data_freshness_seconds, coverage_score, realized_pnl_usdc, unrealized_pnl_usdc, total_pnl_usdc,
    equity_start_usdc, equity_end_usdc, roi_pct, avg_trade_notional_usdc, median_trade_notional_usdc,
    biggest_trade_notional_usdc, biggest_win_pnl_usdc, biggest_loss_pnl_usdc, profit_factor,
    wins_count, losses_count, win_rate, win_rate_by_category, win_rate_by_entry_price_bucket,
    max_drawdown_pct, volatility_pct, pnl_volatility_usdc, avg_entry_price, entry_price_bucket_counts,
    trades_by_day, trades_by_daypart, redeem_count, manual_close_count, manual_vs_redeem_pct,
    bet_type_mix, snapshots_covered, expected_snapshots
  )
  SELECT tm.*
  FROM windows w
  CROSS JOIN LATERAL trader_metric_compute_period(
    v_trader.id,
    v_trader.wallet_address,
    w.window_label,
    w.window_start,
    w.window_end
  ) tm
  ON CONFLICT (trader_id, window_label) DO UPDATE SET
    proxy_wallet = EXCLUDED.proxy_wallet,
    window_start = EXCLUDED.window_start,
    window_end = EXCLUDED.window_end,
    computed_at = EXCLUDED.computed_at,
    trades_count = EXCLUDED.trades_count,
    activity_count = EXCLUDED.activity_count,
    markets_traded_count = EXCLUDED.markets_traded_count,
    categories_traded = EXCLUDED.categories_traded,
    trade_type_mix = EXCLUDED.trade_type_mix,
    data_freshness_seconds = EXCLUDED.data_freshness_seconds,
    coverage_score = EXCLUDED.coverage_score,
    realized_pnl_usdc = EXCLUDED.realized_pnl_usdc,
    unrealized_pnl_usdc = EXCLUDED.unrealized_pnl_usdc,
    total_pnl_usdc = EXCLUDED.total_pnl_usdc,
    equity_start_usdc = EXCLUDED.equity_start_usdc,
    equity_end_usdc = EXCLUDED.equity_end_usdc,
    roi_pct = EXCLUDED.roi_pct,
    avg_trade_notional_usdc = EXCLUDED.avg_trade_notional_usdc,
    median_trade_notional_usdc = EXCLUDED.median_trade_notional_usdc,
    biggest_trade_notional_usdc = EXCLUDED.biggest_trade_notional_usdc,
    biggest_win_pnl_usdc = EXCLUDED.biggest_win_pnl_usdc,
    biggest_loss_pnl_usdc = EXCLUDED.biggest_loss_pnl_usdc,
    profit_factor = EXCLUDED.profit_factor,
    wins_count = EXCLUDED.wins_count,
    losses_count = EXCLUDED.losses_count,
    win_rate = EXCLUDED.win_rate,
    win_rate_by_category = EXCLUDED.win_rate_by_category,
    win_rate_by_entry_price_bucket = EXCLUDED.win_rate_by_entry_price_bucket,
    max_drawdown_pct = EXCLUDED.max_drawdown_pct,
    volatility_pct = EXCLUDED.volatility_pct,
    pnl_volatility_usdc = EXCLUDED.pnl_volatility_usdc,
    avg_entry_price = EXCLUDED.avg_entry_price,
    entry_price_bucket_counts = EXCLUDED.entry_price_bucket_counts,
    trades_by_day = EXCLUDED.trades_by_day,
    trades_by_daypart = EXCLUDED.trades_by_daypart,
    redeem_count = EXCLUDED.redeem_count,
    manual_close_count = EXCLUDED.manual_close_count,
    manual_vs_redeem_pct = EXCLUDED.manual_vs_redeem_pct,
    bet_type_mix = EXCLUDED.bet_type_mix,
    snapshots_covered = EXCLUDED.snapshots_covered,
    expected_snapshots = EXCLUDED.expected_snapshots;
END;
$$;

-- ============================================================
-- Function: compute_trader_metrics_monthly
-- ============================================================
CREATE OR REPLACE FUNCTION compute_trader_metrics_monthly(p_identifier TEXT, p_month_start DATE DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trader RECORD;
  v_month_start DATE := COALESCE(p_month_start, DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')::DATE);
  v_window_start TIMESTAMPTZ := v_month_start::TIMESTAMPTZ;
  v_window_end TIMESTAMPTZ := (v_month_start + INTERVAL '1 month')::TIMESTAMPTZ;
  v_window_label TEXT := TO_CHAR(v_month_start, 'YYYY-MM');
BEGIN
  IF p_identifier IS NULL THEN
    RAISE NOTICE 'compute_trader_metrics_monthly requires a trader identifier';
    RETURN;
  END IF;

  SELECT id, wallet_address
  INTO v_trader
  FROM traders
  WHERE wallet_address = p_identifier OR id::TEXT = p_identifier
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'Trader not found for %', p_identifier;
    RETURN;
  END IF;

  WITH period_metrics AS (
    SELECT * FROM trader_metric_compute_period(
      v_trader.id,
      v_trader.wallet_address,
      v_window_label,
      v_window_start,
      v_window_end
    )
  )
  INSERT INTO trader_metrics_monthly (
    trader_id, proxy_wallet, month_start, month_end, window_label, window_start, window_end, computed_at,
    trades_count, activity_count, markets_traded_count, categories_traded, trade_type_mix,
    data_freshness_seconds, coverage_score, realized_pnl_usdc, unrealized_pnl_usdc, total_pnl_usdc,
    equity_start_usdc, equity_end_usdc, roi_pct, avg_trade_notional_usdc, median_trade_notional_usdc,
    biggest_trade_notional_usdc, biggest_win_pnl_usdc, biggest_loss_pnl_usdc, profit_factor,
    wins_count, losses_count, win_rate, win_rate_by_category, win_rate_by_entry_price_bucket,
    max_drawdown_pct, volatility_pct, pnl_volatility_usdc, avg_entry_price, entry_price_bucket_counts,
    trades_by_day, trades_by_daypart, redeem_count, manual_close_count, manual_vs_redeem_pct,
    bet_type_mix, snapshots_covered, expected_snapshots, profitable_month
  )
  SELECT
    metrics.trader_id,
    metrics.proxy_wallet,
    v_month_start,
    v_window_end,
    metrics.window_label,
    metrics.window_start,
    metrics.window_end,
    metrics.computed_at,
    metrics.trades_count,
    metrics.activity_count,
    metrics.markets_traded_count,
    metrics.categories_traded,
    metrics.trade_type_mix,
    metrics.data_freshness_seconds,
    metrics.coverage_score,
    metrics.realized_pnl_usdc,
    metrics.unrealized_pnl_usdc,
    metrics.total_pnl_usdc,
    metrics.equity_start_usdc,
    metrics.equity_end_usdc,
    metrics.roi_pct,
    metrics.avg_trade_notional_usdc,
    metrics.median_trade_notional_usdc,
    metrics.biggest_trade_notional_usdc,
    metrics.biggest_win_pnl_usdc,
    metrics.biggest_loss_pnl_usdc,
    metrics.profit_factor,
    metrics.wins_count,
    metrics.losses_count,
    metrics.win_rate,
    metrics.win_rate_by_category,
    metrics.win_rate_by_entry_price_bucket,
    metrics.max_drawdown_pct,
    metrics.volatility_pct,
    metrics.pnl_volatility_usdc,
    metrics.avg_entry_price,
    metrics.entry_price_bucket_counts,
    metrics.trades_by_day,
    metrics.trades_by_daypart,
    metrics.redeem_count,
    metrics.manual_close_count,
    metrics.manual_vs_redeem_pct,
    metrics.bet_type_mix,
    metrics.snapshots_covered,
    metrics.expected_snapshots,
    COALESCE(metrics.realized_pnl_usdc, 0) > 0
  FROM period_metrics metrics
  ON CONFLICT (trader_id, month_start) DO UPDATE SET
    proxy_wallet = EXCLUDED.proxy_wallet,
    month_end = EXCLUDED.month_end,
    window_label = EXCLUDED.window_label,
    window_start = EXCLUDED.window_start,
    window_end = EXCLUDED.window_end,
    computed_at = EXCLUDED.computed_at,
    trades_count = EXCLUDED.trades_count,
    activity_count = EXCLUDED.activity_count,
    markets_traded_count = EXCLUDED.markets_traded_count,
    categories_traded = EXCLUDED.categories_traded,
    trade_type_mix = EXCLUDED.trade_type_mix,
    data_freshness_seconds = EXCLUDED.data_freshness_seconds,
    coverage_score = EXCLUDED.coverage_score,
    realized_pnl_usdc = EXCLUDED.realized_pnl_usdc,
    unrealized_pnl_usdc = EXCLUDED.unrealized_pnl_usdc,
    total_pnl_usdc = EXCLUDED.total_pnl_usdc,
    equity_start_usdc = EXCLUDED.equity_start_usdc,
    equity_end_usdc = EXCLUDED.equity_end_usdc,
    roi_pct = EXCLUDED.roi_pct,
    avg_trade_notional_usdc = EXCLUDED.avg_trade_notional_usdc,
    median_trade_notional_usdc = EXCLUDED.median_trade_notional_usdc,
    biggest_trade_notional_usdc = EXCLUDED.biggest_trade_notional_usdc,
    biggest_win_pnl_usdc = EXCLUDED.biggest_win_pnl_usdc,
    biggest_loss_pnl_usdc = EXCLUDED.biggest_loss_pnl_usdc,
    profit_factor = EXCLUDED.profit_factor,
    wins_count = EXCLUDED.wins_count,
    losses_count = EXCLUDED.losses_count,
    win_rate = EXCLUDED.win_rate,
    win_rate_by_category = EXCLUDED.win_rate_by_category,
    win_rate_by_entry_price_bucket = EXCLUDED.win_rate_by_entry_price_bucket,
    max_drawdown_pct = EXCLUDED.max_drawdown_pct,
    volatility_pct = EXCLUDED.volatility_pct,
    pnl_volatility_usdc = EXCLUDED.pnl_volatility_usdc,
    avg_entry_price = EXCLUDED.avg_entry_price,
    entry_price_bucket_counts = EXCLUDED.entry_price_bucket_counts,
    trades_by_day = EXCLUDED.trades_by_day,
    trades_by_daypart = EXCLUDED.trades_by_daypart,
    redeem_count = EXCLUDED.redeem_count,
    manual_close_count = EXCLUDED.manual_close_count,
    manual_vs_redeem_pct = EXCLUDED.manual_vs_redeem_pct,
    bet_type_mix = EXCLUDED.bet_type_mix,
    snapshots_covered = EXCLUDED.snapshots_covered,
    expected_snapshots = EXCLUDED.expected_snapshots,
    profitable_month = EXCLUDED.profitable_month;
END;
$$;

-- ============================================================
-- Function: refresh_all_traders_metrics
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_all_traders_metrics()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trader_row RECORD;
BEGIN
  FOR trader_row IN
    SELECT wallet_address FROM traders WHERE wallet_address IS NOT NULL AND is_active IS NOT FALSE
  LOOP
    PERFORM compute_trader_metrics_windowed(trader_row.wallet_address);
    PERFORM compute_trader_metrics_monthly(trader_row.wallet_address);
  END LOOP;
END;
$$;
