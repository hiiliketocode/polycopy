-- Add new columns to ft_wallets for counters and dynamic allocation
-- Run this if you already have the ft_wallets table from the previous migration

-- Counters
ALTER TABLE public.ft_wallets 
ADD COLUMN IF NOT EXISTS trades_seen INTEGER DEFAULT 0;

ALTER TABLE public.ft_wallets 
ADD COLUMN IF NOT EXISTS trades_skipped INTEGER DEFAULT 0;

-- Legacy allocation weight
ALTER TABLE public.ft_wallets 
ADD COLUMN IF NOT EXISTS bet_allocation_weight DECIMAL(4,2) DEFAULT 1.00;

-- Dynamic allocation settings
ALTER TABLE public.ft_wallets 
ADD COLUMN IF NOT EXISTS allocation_method TEXT DEFAULT 'KELLY';

ALTER TABLE public.ft_wallets 
ADD COLUMN IF NOT EXISTS kelly_fraction DECIMAL(4,2) DEFAULT 0.25;

ALTER TABLE public.ft_wallets 
ADD COLUMN IF NOT EXISTS min_bet DECIMAL(10,2) DEFAULT 0.50;

ALTER TABLE public.ft_wallets 
ADD COLUMN IF NOT EXISTS max_bet DECIMAL(10,2) DEFAULT 10.00;

-- Update existing rows to have default values
UPDATE public.ft_wallets 
SET 
  trades_seen = COALESCE(trades_seen, 0), 
  trades_skipped = COALESCE(trades_skipped, 0),
  bet_allocation_weight = COALESCE(bet_allocation_weight, 1.00),
  allocation_method = COALESCE(allocation_method, 'KELLY'),
  kelly_fraction = COALESCE(kelly_fraction, 0.25),
  min_bet = COALESCE(min_bet, 0.50),
  max_bet = COALESCE(max_bet, 10.00);
