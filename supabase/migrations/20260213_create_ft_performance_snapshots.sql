-- =============================================================================
-- FT Performance Snapshots - Hourly time series for PnL, cash, and returns
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ft_performance_snapshots (
  wallet_id TEXT NOT NULL REFERENCES public.ft_wallets(wallet_id),
  snapshot_at TIMESTAMP WITH TIME ZONE NOT NULL,
  starting_balance NUMERIC(12,2) NOT NULL,
  cash NUMERIC(12,2) NOT NULL,
  realized_pnl NUMERIC(12,2) NOT NULL,
  unrealized_pnl NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_pnl NUMERIC(12,2) NOT NULL,
  return_pct NUMERIC(8,2) NOT NULL,
  open_exposure NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_trades INT NOT NULL DEFAULT 0,
  open_positions INT NOT NULL DEFAULT 0,
  CONSTRAINT ft_performance_snapshots_pkey PRIMARY KEY (wallet_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS idx_ft_performance_snapshots_wallet
  ON public.ft_performance_snapshots (wallet_id);

CREATE INDEX IF NOT EXISTS idx_ft_performance_snapshots_at
  ON public.ft_performance_snapshots (snapshot_at);

COMMENT ON TABLE public.ft_performance_snapshots IS
  'Hourly snapshots of FT wallet performance for line charts (PnL %, cash, cumulative return).';
