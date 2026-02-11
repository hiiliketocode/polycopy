-- LT Execute logs: persisted for display on /lt/logs page
-- Pruned periodically (e.g. keep last 7 days)

CREATE TABLE IF NOT EXISTS public.lt_execute_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    level TEXT NOT NULL,  -- 'info' | 'warn' | 'error'
    message TEXT NOT NULL,
    strategy_id TEXT,
    ft_wallet_id TEXT,
    source_trade_id TEXT,
    extra JSONB  -- optional structured data
);

CREATE INDEX IF NOT EXISTS idx_lt_execute_logs_created ON public.lt_execute_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lt_execute_logs_strategy ON public.lt_execute_logs (strategy_id, created_at DESC);

ALTER TABLE public.lt_execute_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access lt_execute_logs"
    ON public.lt_execute_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.lt_execute_logs IS 'LT execute runtime logs for /lt/logs page. Prune rows older than 7 days.';
