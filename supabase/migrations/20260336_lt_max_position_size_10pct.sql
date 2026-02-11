-- Increase max position size to 10% for all LT strategies
UPDATE public.lt_risk_rules
SET max_position_size_pct = 0.10,
    max_position_size_usd = NULL,  -- use pct not fixed $
    updated_at = NOW();
