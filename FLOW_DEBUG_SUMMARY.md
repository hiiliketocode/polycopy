# Feed Flow Debug Summary

## How It Should Work

### Complete Flow (Step by Step)

1. **Trade Comes In**
   - Feed fetches trades from Polymarket API
   - Extracts `conditionId` from each trade

2. **Feed Queries Markets Table**
   - Query: `SELECT condition_id, tags, market_subtype, final_niche, bet_structure, market_type FROM markets WHERE condition_id IN (...)`
   - Stores results in `marketDataMap` (Map<conditionId, {tags, market_subtype, final_niche, bet_structure}>)

3. **Identify Missing Markets**
   - Markets NOT in DB → `missingConditionIds`
   - Markets with NO tags → `missingConditionIds`
   - Markets with tags but NO classification (`market_subtype` AND `final_niche` both NULL) → `missingConditionIds`

4. **Ensure Missing Markets (CRITICAL STEP)**
   - **First 10 markets**: Call `/api/markets/ensure` SYNCHRONOUSLY (await)
     - Ensure API fetches from CLOB API if needed
     - Extracts tags from CLOB response
     - Normalizes tags to lowercase
     - Queries `semantic_mapping` table
     - Classifies market (niche, bet_structure, market_type)
     - Saves to DB (`market_subtype`, `final_niche`, `bet_structure`, `tags`)
     - Returns classification in response
   - **Feed updates `marketDataMap`** with classification from ensure API response
   - **Remaining markets**: Call `/api/markets/ensure` in background (non-blocking)

5. **Format Trades**
   - For each trade, get market data from `marketDataMap`
   - Pass to TradeCard:
     - `marketSubtype`: `dbMarketData.market_subtype || dbMarketData.final_niche`
     - `betStructure`: `dbMarketData.bet_structure`
     - `tags`: `dbMarketData.tags` (normalized lowercase array)

6. **TradeCard → PredictionStats**
   - TradeCard receives props and passes to PredictionStats:
     - `marketSubtype` → `propMarketSubtype`
     - `betStructure` → `propBetStructure`
     - `marketTags` → normalized tags array

7. **PredictionStats Uses Classification**
   - If `propMarketSubtype` provided → use immediately, skip DB query
   - If `propBetStructure` provided → use immediately
   - Query `trader_profile_stats` using `final_niche` (from props)
   - Display niche badge and trader stats

## What Was Breaking

### Issue 1: Tags Not Being Saved ✅ FIXED
- **Problem**: Some markets had empty tags arrays `[]`
- **Root Cause**: Ensure API was saving tags, but feed wasn't updating `marketDataMap` with tags from ensure response
- **Fix**: Feed now updates `marketDataMap.tags` when ensure API returns

### Issue 2: Classification Not Immediate ✅ FIXED
- **Problem**: Markets weren't getting classified immediately - had to wait for background ensure
- **Root Cause**: Ensure API was completely non-blocking (fire-and-forget)
- **Fix**: First 10 markets are ensured SYNCHRONOUSLY (blocking), remaining in background

### Issue 3: `final_niche` Not Populated ✅ FIXED
- **Problem**: Markets had `market_subtype` but `final_niche` was NULL
- **Root Cause**: Ensure API and backfill were only writing to `market_subtype`
- **Fix**: Both ensure API and backfill now write to BOTH `market_subtype` AND `final_niche`

### Issue 4: Feed Not Reading `final_niche` ✅ FIXED
- **Problem**: Feed was only querying `market_subtype`, not `final_niche`
- **Root Cause**: Select query didn't include `final_niche`
- **Fix**: Added `final_niche` to select query, use as fallback

### Issue 5: PredictionStats Not Using Props ✅ FIXED
- **Problem**: PredictionStats was still querying DB even when props provided
- **Root Cause**: No check to skip DB query when props available
- **Fix**: Added `hasClassificationFromProps` flag, skip DB query and semantic_mapping when props provided

### Issue 6: Tags Not Normalized ✅ FIXED
- **Problem**: Tags in DB were mixed case, semantic_mapping has lowercase
- **Root Cause**: `normalizeTags` in ensure API wasn't lowercasing
- **Fix**: All `normalizeTags` functions now lowercase tags

## Current Status

✅ **Fixed Issues:**
1. Tags are saved correctly by ensure API
2. Classification is immediate for first 10 markets
3. Both `market_subtype` and `final_niche` are populated
4. Feed reads both columns
5. PredictionStats uses props immediately
6. Tags are normalized to lowercase

## Testing Results

- ✅ Ensure API saves tags correctly
- ✅ Ensure API saves classification correctly
- ✅ Markets table has tags and classification
- ✅ Feed can query and pass classification

## What to Check If Still Not Working

1. **Check Browser Console:**
   - Look for `[Feed] Ensuring X critical markets synchronously...`
   - Look for `[Feed] ✅ Ensured market X synchronously`
   - Look for `[PredictionStats]` logs showing props received

2. **Check Network Tab:**
   - Verify `/api/markets/ensure` is being called
   - Check response includes `market.market_subtype` or `market.final_niche`
   - Check response includes `market.tags` array

3. **Check Database:**
   ```sql
   SELECT condition_id, tags, market_subtype, final_niche, bet_structure
   FROM markets
   WHERE condition_id = 'YOUR_CONDITION_ID'
   ```
   - Should have tags (array)
   - Should have market_subtype OR final_niche
   - Should have bet_structure

4. **Check Feed Logs:**
   - `[Feed] STEP 2:` - Market query results
   - `[Feed] STEP 2.5:` - Ensure API calls
   - `[Feed] STEP 3:` - Tag extraction
   - `[Feed] STEP 6:` - Tags passed to TradeCard

5. **Check PredictionStats Logs:**
   - Should show `propMarketSubtype` received
   - Should skip DB query if props provided
   - Should use niche immediately
