-- Migration: 028_relax_trades_public_outcome_check
-- Purpose: Allow categorical outcomes in trades_public (not just yes/no)

ALTER TABLE public.trades_public
  DROP CONSTRAINT IF EXISTS spl_outcome_check;
