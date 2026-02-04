# Feed Flow Explanation - How It Should Work

## Expected Flow

### STEP 1: Trade Comes In
- Trade fetched from Polymarket API
- Extract `conditionId` from trade

### STEP 2: Feed Queries Markets Table
- Query: `SELECT condition_id, tags, market_subtype, final_niche, bet_structure FROM markets WHERE condition_id IN (...)`
- Store results in `marketDataMap`

### STEP 3: Check What's Missing
- Markets NOT in DB → add to `missingConditionIds`
- Markets with NO tags → add to `missingConditionIds`
- Markets with tags but NO classification (`market_subtype` OR `final_niche` is NULL) → add to `missingConditionIds`

### STEP 4: Ensure Missing Markets (CRITICAL)
- **First 10 markets**: Call `/api/markets/ensure` SYNCHRONOUSLY (blocking)
  - Wait for response
  - Update `marketDataMap` with classification from response
- **Remaining markets**: Call `/api/markets/ensure` in background (non-blocking)

### STEP 5: Format Trades
- For each trade, get market data from `marketDataMap`
- Pass to TradeCard:
  - `marketSubtype`: `dbMarketData.market_subtype || dbMarketData.final_niche`
  - `betStructure`: `dbMarketData.bet_structure`
  - `tags`: `dbMarketData.tags`

### STEP 6: PredictionStats Receives Props
- If `propMarketSubtype` provided → use immediately, skip DB query
- If `propBetStructure` provided → use immediately
- Query `trader_profile_stats` using `final_niche` (from props)

## What Could Be Breaking

1. **Feed not querying `final_niche`** → Fixed: Added to select query
2. **Feed not calling ensure for markets with tags but no classification** → Fixed: Added check
3. **Ensure API not blocking for first 10** → Fixed: Made synchronous
4. **marketDataMap not updated after ensure** → Fixed: Updates from ensure response
5. **PredictionStats not using props** → Fixed: Skips DB query when props provided
6. **Tags not being saved** → Verified: Ensure API saves tags correctly

## Current Status

Based on test:
- ✅ Markets table has tags
- ✅ Markets table has `market_subtype`
- ⚠️ Markets table missing `final_niche` (but we're writing to it now)
- ✅ Ensure API saves tags correctly
- ✅ Ensure API saves classification correctly

## Next Steps to Debug

1. Check if feed is actually calling ensure API
2. Check if ensure API response is updating marketDataMap
3. Check if TradeCard is receiving props
4. Check if PredictionStats is using props
