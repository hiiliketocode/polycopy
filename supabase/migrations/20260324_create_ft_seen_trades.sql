-- Persistent trade ID tracking for FT sync.
-- Avoids re-evaluating trades across syncs and provides audit trail for skipped counts.
-- Pruning: delete rows older than 30 days (run periodically or via trigger).

CREATE TABLE IF NOT EXISTS public.ft_seen_trades (
  wallet_id TEXT NOT NULL,
  source_trade_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('taken', 'skipped')),
  skip_reason TEXT,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ft_seen_trades_pkey PRIMARY KEY (wallet_id, source_trade_id)
);

CREATE INDEX IF NOT EXISTS idx_ft_seen_trades_seen_at ON public.ft_seen_trades (seen_at);

COMMENT ON TABLE public.ft_seen_trades IS
  'Tracks trades seen during FT sync for dedup and audit. Prune rows older than 30d periodically.';

-- Prune function: DELETE FROM ft_seen_trades WHERE seen_at < NOW() - INTERVAL '30 days';
