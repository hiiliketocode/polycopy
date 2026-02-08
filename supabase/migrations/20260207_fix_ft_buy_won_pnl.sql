-- Fix FT BUY WON PnL formula
-- Bug: pnl was size * (1 - entry_price) instead of size * (1 - entry_price) / entry_price
-- Correct formula: profit = (size/entry_price) - size = size * (1/entry_price - 1) = size * (1 - entry_price) / entry_price

UPDATE public.ft_orders
SET pnl = size * (1 - entry_price) / entry_price
WHERE outcome = 'WON'
  AND UPPER(COALESCE(side, 'BUY')) = 'BUY'
  AND entry_price > 0
  AND entry_price < 1;
