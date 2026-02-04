# Feed Flow Analysis & Optimization Plan

## Current Flow (Problems Identified)

### 1. Feed Page Load (`app/feed/page.tsx`)
```
User opens feed
  ↓
Fetch followed traders from Supabase
  ↓
For each trader: Fetch trades from Polymarket API (external, slow)
  ↓
Extract tags from API response (often missing!)
  ↓
Format trades into FeedTrade objects
  ↓
[ASYNC] Batch fetch missing tags from database (happens AFTER trades displayed)
  ↓
Display trades (tags might not be ready yet!)
```

**Problems:**
- ❌ Tags from Polymarket API are often missing
- ❌ Tag enrichment happens AFTER trades are displayed (race condition)
- ❌ Only fetches tags, not full market data (market_subtype, bet_structure)

### 2. TradeCard Component (`components/polycopy/trade-card.tsx`)
```
Receives tags prop (might be null/undefined)
  ↓
Process tags in useMemo
  ↓
[FIRE-AND-FORGET] Call /api/markets/ensure (slow, can hit external API)
  ↓
Pass marketTagsForInsights to PredictionStats
```

**Problems:**
- ❌ Still calls slow `/api/markets/ensure` endpoint
- ❌ Fire-and-forget means tags might not be ready when PredictionStats renders

### 3. PredictionStats Component (`components/polyscore/PredictionStats.tsx`)
```
Receives marketTags prop (might be null)
  ↓
Query database for market data (INDIVIDUAL query per trade!)
  ↓
Try to collect tags from props and DB
  ↓
Do semantic mapping lookup
  ↓
Fetch trader stats from database
```

**Problems:**
- ❌ N+1 query problem: Each PredictionStats queries DB individually
- ❌ Tags might not be available when component renders
- ❌ Multiple sequential queries slow down rendering

## Root Causes

1. **Tags not in API response**: Polymarket API trades don't include tags
2. **Async tag enrichment**: Tags fetched AFTER trades displayed
3. **Individual DB queries**: Each PredictionStats queries DB separately
4. **Slow external API calls**: `/api/markets/ensure` can hit CLOB API
5. **No batch market fetching**: Markets not fetched when trades are loaded

## Proposed Solution: Batch Market Fetching

### New Flow

```
User opens feed
  ↓
Fetch followed traders from Supabase
  ↓
Fetch trades from Polymarket API (parallel)
  ↓
Extract conditionIds from all trades
  ↓
[BATCH] Fetch ALL market data from Supabase in ONE query:
  - tags
  - market_subtype
  - bet_structure
  - market_type
  - title
  ↓
Enrich trades with market data BEFORE formatting
  ↓
Format trades with complete market data
  ↓
Display trades (tags guaranteed to be available!)
  ↓
TradeCard receives complete market data
  ↓
PredictionStats receives tags via props (no DB query needed!)
```

### Benefits

✅ **Tags always available**: Fetched before trades displayed
✅ **Single batch query**: All markets fetched at once
✅ **No N+1 queries**: PredictionStats doesn't need to query DB
✅ **No external API calls**: All data from Supabase
✅ **Faster rendering**: Data ready before components render

## Implementation Plan

1. **Modify `processTrades`** to batch fetch market data BEFORE formatting
2. **Remove individual DB queries** from PredictionStats
3. **Remove `/api/markets/ensure` call** from TradeCard
4. **Pass complete market data** through props
5. **Ensure tags are always available** before rendering
