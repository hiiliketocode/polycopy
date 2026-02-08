-- Extend orders table to support live trading
-- Add columns to track LT strategy and signal information

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS lt_strategy_id TEXT REFERENCES public.lt_strategies(strategy_id),
    ADD COLUMN IF NOT EXISTS lt_order_id UUID REFERENCES public.lt_orders(lt_order_id),
    ADD COLUMN IF NOT EXISTS signal_price DECIMAL(6,4),
    ADD COLUMN IF NOT EXISTS signal_size_usd DECIMAL(10,2);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_orders_lt_strategy ON public.orders(lt_strategy_id) WHERE lt_strategy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_lt_order ON public.orders(lt_order_id) WHERE lt_order_id IS NOT NULL;
