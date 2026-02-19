-- Create the trades_public table for real-time trade ingestion from the trade-stream worker.
-- This table backs the v2 feed and replaces per-trader Polymarket API polling.

CREATE TABLE IF NOT EXISTS public.trades_public (
  trade_id       TEXT PRIMARY KEY,
  trader_wallet  TEXT NOT NULL,
  trader_id      TEXT,
  transaction_hash TEXT,
  asset          TEXT,
  condition_id   TEXT NOT NULL,
  market_slug    TEXT,
  event_slug     TEXT,
  market_title   TEXT,
  side           TEXT,
  outcome        TEXT,
  outcome_index  SMALLINT,
  size           NUMERIC,
  price          NUMERIC,
  trade_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw            JSONB,
  ingested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_trades_public_wallet_ts
  ON public.trades_public (trader_wallet, trade_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_trades_public_condition
  ON public.trades_public (condition_id);

CREATE INDEX IF NOT EXISTS idx_trades_public_ts
  ON public.trades_public (trade_timestamp DESC);

-- RLS: service_role can do everything; authenticated users can read
ALTER TABLE public.trades_public ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.trades_public
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read" ON public.trades_public
  FOR SELECT TO authenticated USING (true);

-- Grant permissions
GRANT SELECT ON public.trades_public TO authenticated;
GRANT ALL ON public.trades_public TO service_role;
