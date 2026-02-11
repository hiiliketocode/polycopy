-- Fix: When Daily Budget (USD) is not set, don't enforce hidden 10% daily limit.
-- Strategies with daily_budget_usd = NULL were still hitting "Daily budget exceeded"
-- because daily_budget_pct defaulted to 0.10. Clear it so "no USD limit" = no limit.
UPDATE public.lt_risk_rules
SET daily_budget_pct = NULL,
    updated_at = NOW()
WHERE daily_budget_usd IS NULL
  AND daily_budget_pct IS NOT NULL;
