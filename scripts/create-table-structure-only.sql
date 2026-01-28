-- Quick SQL to create empty table structure (runs fast, won't timeout)
-- Run this first, then run the batched insertion script

DROP TABLE IF EXISTS public.top5_traders_trades;

CREATE TABLE public.top5_traders_trades (LIKE public.trades INCLUDING ALL);
