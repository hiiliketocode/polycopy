-- Fix LT resolved PnL formula (align with FT)
-- Bug: LT used executed_size (SHARES) as if it were USD in PnL formulas.
-- FT uses size in USD. Correct: cost = executed_size * executed_price, then same formulas as FT.
--
-- BUY LOST: was -executed_size (wrong, treated 581 shares as $581 loss)
--           correct: -cost = -(executed_size * executed_price)
-- BUY WON:  was executed_size * (1 - price) / price (wrong when size=shares)
--           correct: cost * (1 - price) / price

-- WON: cost * (1 - price) / price
UPDATE public.lt_orders
SET pnl = (executed_size * executed_price) * (1 - executed_price) / executed_price
WHERE outcome = 'WON'
  AND executed_size > 0
  AND executed_price > 0
  AND executed_price < 1;

-- WON fallback: use signal_size_usd as cost when no executed_size
UPDATE public.lt_orders
SET pnl = signal_size_usd * (1 - COALESCE(executed_price, signal_price)) / COALESCE(executed_price, signal_price)
WHERE outcome = 'WON'
  AND (executed_size IS NULL OR executed_size = 0)
  AND signal_size_usd > 0
  AND COALESCE(executed_price, signal_price) > 0
  AND COALESCE(executed_price, signal_price) < 1;

-- LOST: -cost
UPDATE public.lt_orders
SET pnl = -(executed_size * executed_price)
WHERE outcome = 'LOST'
  AND executed_size > 0
  AND executed_price > 0;

-- LOST fallback: -signal_size_usd when no executed_size
UPDATE public.lt_orders
SET pnl = -signal_size_usd
WHERE outcome = 'LOST'
  AND (executed_size IS NULL OR executed_size = 0)
  AND signal_size_usd > 0;
