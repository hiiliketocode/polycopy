-- Remove deprecated Auto Copy feature (replaced by Live Trading).
-- Drops auto_copy_logs and auto_copy_configs and related index.

DROP INDEX IF EXISTS public.idx_auto_copy_configs_last_trade_ts;
DROP TABLE IF EXISTS public.auto_copy_logs;
DROP TABLE IF EXISTS public.auto_copy_configs;
