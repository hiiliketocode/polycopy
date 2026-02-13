-- Add configurable dead market guard settings to ft_wallets.
-- These control the pre-execution market price check that prevents
-- buying into already-decided markets (e.g., hourly crypto after resolution,
-- sports totals after the game exceeds the line).
--
-- dead_market_guard:   master toggle (default ON for safety)
-- dead_market_floor:   absolute minimum market price for BUY (default 4¢)
-- dead_market_max_drift_pct: max % drop from signal before rejecting (default 80%)

ALTER TABLE public.ft_wallets
ADD COLUMN IF NOT EXISTS dead_market_guard BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.ft_wallets
ADD COLUMN IF NOT EXISTS dead_market_floor NUMERIC(6,4) NOT NULL DEFAULT 0.04;

ALTER TABLE public.ft_wallets
ADD COLUMN IF NOT EXISTS dead_market_max_drift_pct NUMERIC(5,2) NOT NULL DEFAULT 80.00;

COMMENT ON COLUMN public.ft_wallets.dead_market_guard IS
  'Enable pre-execution market price check to prevent buying dead/decided markets';

COMMENT ON COLUMN public.ft_wallets.dead_market_floor IS
  'Minimum market midpoint price for BUY orders (default 0.04 = 4 cents). Only applies when signal was above this floor.';

COMMENT ON COLUMN public.ft_wallets.dead_market_max_drift_pct IS
  'Maximum allowed price drop from signal to current market (default 80%). Rejects trades where market moved too far from the original signal.';
