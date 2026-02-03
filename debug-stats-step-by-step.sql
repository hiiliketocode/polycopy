-- Step-by-step debug query to find the issue
-- Run each section separately to see where data is lost

-- Step 1: Check if wallet exists and has trades
SELECT 
  COUNT(*) as total_trades,
  COUNT(DISTINCT wallet_address) as unique_wallets,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE wallet_address = '0x004c3cab'  -- Replace with your test wallet
  OR wallet_address = LOWER('0x004c3cab');  -- Check both cases

-- Step 2: Check BUY trades for this wallet
SELECT 
  COUNT(*) as buy_trades,
  COUNTIF(side = 'BUY') as buy_count,
  COUNTIF(side = 'SELL') as sell_count,
  COUNTIF(price IS NOT NULL) as has_price,
  COUNTIF(shares_normalized IS NOT NULL) as has_shares
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE LOWER(wallet_address) = LOWER('0x004c3cab');  -- Use lowercase comparison

-- Step 3: Check if markets exist for these trades
WITH wallet_trades AS (
  SELECT DISTINCT condition_id
  FROM `gen-lang-client-0299056258.polycopy_v1.trades`
  WHERE LOWER(wallet_address) = LOWER('0x004c3cab')
    AND side = 'BUY'
    AND price IS NOT NULL
    AND shares_normalized IS NOT NULL
  LIMIT 10
)
SELECT 
  COUNT(*) as trades_with_condition_ids,
  COUNT(DISTINCT m.condition_id) as markets_found,
  COUNTIF(m.status = 'resolved') as resolved_markets,
  COUNTIF(m.status IS NULL) as missing_markets
FROM wallet_trades wt
LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.markets` m 
  ON wt.condition_id = m.condition_id;

-- Step 4: Get sample trades with market data
SELECT 
  t.wallet_address,
  t.timestamp,
  t.side,
  t.price,
  t.shares_normalized,
  t.condition_id,
  t.token_label,
  m.status as market_status,
  m.winning_label,
  CASE 
    WHEN m.status = 'resolved' AND t.token_label = m.winning_label THEN 'WIN'
    WHEN m.status = 'resolved' AND t.token_label != m.winning_label THEN 'LOSS'
    WHEN m.status = 'resolved' THEN 'RESOLVED_UNKNOWN'
    WHEN m.status IS NULL THEN 'NO_MARKET_DATA'
    ELSE 'OPEN'
  END as trade_result
FROM `gen-lang-client-0299056258.polycopy_v1.trades` t
LEFT JOIN `gen-lang-client-0299056258.polycopy_v1.markets` m 
  ON t.condition_id = m.condition_id
WHERE LOWER(t.wallet_address) = LOWER('0x004c3cab')
  AND t.side = 'BUY'
  AND t.price IS NOT NULL
  AND t.shares_normalized IS NOT NULL
ORDER BY t.timestamp DESC
LIMIT 20;

-- Step 5: Find a wallet that HAS data
SELECT 
  wallet_address,
  COUNT(*) as trade_count,
  COUNTIF(side = 'BUY') as buy_count,
  COUNT(DISTINCT condition_id) as unique_markets
FROM `gen-lang-client-0299056258.polycopy_v1.trades`
WHERE side = 'BUY'
  AND price IS NOT NULL
  AND shares_normalized IS NOT NULL
GROUP BY wallet_address
HAVING trade_count >= 10
ORDER BY trade_count DESC
LIMIT 5;
