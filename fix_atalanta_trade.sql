-- Fix the incorrect Atalanta BC trade
-- This trade is showing wrong market title, price, and ROI

-- Step 1: Find the trade (to verify we have the right one)
SELECT 
  id,
  market_title,
  outcome,
  price_when_copied,
  user_exit_price,
  amount_invested,
  roi,
  status,
  created_at,
  market_slug
FROM copied_trades
WHERE market_title ILIKE '%Atalanta BC%2025-12-06%'
ORDER BY created_at DESC
LIMIT 5;

-- Expected result: Should show the trade with:
-- - market_title: "Will Atalanta BC win on 2025-12-06?"
-- - outcome: "NO" 
-- - price_when_copied: 0.29 (29¢)
-- - roi: around +244.8% (WRONG!)

-- Step 2: Update the trade with correct data
-- Based on your screenshots:
-- - Entry price: 29¢ (0.29) ✅ Already correct
-- - Current price: 100¢ (1.00) on LOSING outcome = Actually worth $0
-- - The market resolved with your outcome LOSING
-- - Should show as "Resolved" with -100% ROI

UPDATE copied_trades
SET 
  -- Mark as resolved (market ended, you lost)
  status = 'Resolved',
  
  -- Update to correct market info
  market_title = 'Will Hellas Verona FC win on 2025-12-06?',
  market_slug = 'hellas-verona-fc-vs-atalanta-bc',
  
  -- You closed at $0 (lost the bet)
  user_closed_at = NOW(),
  user_exit_price = 0.0005, -- Polymarket shows 0¢ but technically ~0.0005
  
  -- Recalculate ROI: (0.0005 - 0.29) / 0.29 * 100 = -99.83%
  roi = -99.83,
  
  -- Update timestamp
  updated_at = NOW()
  
WHERE market_title ILIKE '%Atalanta BC%2025-12-06%'
  AND outcome = 'NO';

-- Step 3: Verify the fix
SELECT 
  id,
  market_title,
  market_slug,
  outcome,
  price_when_copied AS entry_price,
  user_exit_price AS exit_price,
  amount_invested,
  roi,
  status,
  user_closed_at
FROM copied_trades
WHERE market_title ILIKE '%Hellas Verona%2025-12-06%'
   OR market_title ILIKE '%Atalanta BC%2025-12-06%'
ORDER BY created_at DESC;

-- Expected after fix:
-- - market_title: "Will Hellas Verona FC win on 2025-12-06?"
-- - market_slug: "hellas-verona-fc-vs-atalanta-bc"
-- - outcome: "NO"
-- - price_when_copied: 0.29
-- - user_exit_price: 0.0005
-- - roi: -99.83
-- - status: "Resolved"
-- - user_closed_at: (current timestamp)

--------------------------------------------------------------------------------
-- ALTERNATIVE: If you want to delete this trade instead of fixing it:
--------------------------------------------------------------------------------
-- DELETE FROM copied_trades
-- WHERE market_title ILIKE '%Atalanta BC%2025-12-06%'
--   AND outcome = 'NO';
