# Performance Metrics Fix - Current Price Data Issue

## Date: January 5, 2025

## Problem
The new Performance Metrics were showing all N/A values because the blockchain trade data doesn't include `currentPrice` for individual trades. The metrics were trying to calculate ROI from individual trade price movements, but that data wasn't available.

## Root Cause
When fetching trades from the blockchain endpoint (`/api/polymarket/trades-blockchain/[wallet]`), the response includes:
- Entry price (when the trade was made)
- Market details, size, outcome
- **BUT NOT** current price for each position

The code was setting:
```typescript
currentPrice: undefined, // Will be fetched if needed
status: 'Open', // Simplified for now
```

This meant all the new Performance Metrics that relied on comparing `currentPrice` vs `price` returned N/A.

## Solution
Implemented a **dual-mode display** for the Performance Metrics section:

### Mode 1: Aggregate Metrics (When No Current Price Data)
Shows trader-level performance from the leaderboard/trader data:
- **Lifetime ROI**: Overall return on investment
- **Total P&L**: Total profit/loss in dollars
- **Total Volume**: Total trading volume
- **Total Trades**: Number of trades in sample
- **Avg Trade Size**: Average position size
- **Avg ROI/Trade**: Estimated per-trade ROI
- **Open Positions**: Number of active trades
- **Avg P&L/Trade**: Estimated per-trade P&L

**Includes a blue banner** explaining: "Showing aggregate lifetime performance. Individual trade metrics require closed position data."

### Mode 2: Detailed Metrics (When Current Price Data Available)
Shows the original detailed metrics when individual trade prices are available:
- Win Rate, Avg Win, Avg Loss
- Best Trade, Worst Trade
- Profit Factor
- Total Trades, Avg Trade Size

## Changes Made

### File: `/app/trader/[wallet]/page.tsx`

1. **Performance Metrics Section** (lines ~1246-1426)
   - Wrapped the entire metrics section in a conditional check
   - Checks if `trades.filter(t => t.currentPrice && t.price).length > 0`
   - If no current price data → shows aggregate metrics
   - If current price data exists → shows detailed metrics

2. **Top Performing Trades Section** (lines ~1546-1595)
   - Added better empty state message
   - Clarifies that trades will appear "once the trader closes positions"

## Why This Approach?

### Option 1: Fetch Current Prices (Rejected)
Could fetch current prices for each market after loading trades, but:
- Would require additional API calls for each unique market
- Could be slow (dozens of markets)
- Rate limiting concerns
- Complexity

### Option 2: Show Nothing (Rejected)
Could just show N/A for everything, but:
- Wastes valuable screen space
- Provides no value to users
- Bad user experience

### Option 3: Show Aggregate Data (Chosen) ✅
Best of both worlds:
- **Always shows useful data** - aggregate lifetime performance is valuable
- **Educates users** - explains what data is available and why
- **Future-proof** - automatically switches to detailed mode when price data becomes available
- **Low complexity** - uses existing trader data, no additional API calls

## Benefits

1. **Better User Experience**: Users always see meaningful data instead of N/A
2. **Educational**: Banner explains what they're seeing and why
3. **Scalable**: Works for traders with 10 trades or 10,000 trades
4. **Accurate**: Uses official leaderboard data for lifetime performance
5. **Graceful Degradation**: Automatically uses detailed metrics when available

## Testing

To test both modes:

**Aggregate Mode** (most traders):
1. Visit a trader profile with blockchain trade data
2. Click Performance tab
3. Should see blue banner + 8 aggregate metrics

**Detailed Mode** (rare):
1. Visit a trader profile with data-api fallback data (has currentPrice)
2. Click Performance tab
3. Should see original 8 detailed metrics without banner

## Future Enhancements

From the PRD_TRADER_HISTORY_DATABASE.md:
- Build a worker to fetch and store current prices for all markets
- Calculate and store individual trade ROI in database
- Enable full historical detailed metrics for all traders
- Add time-series analysis and trend indicators

## User Profile Page

The user's own Profile page doesn't need these changes because:
- User's copied trades have ROI calculated and stored in the database
- The `copied_trades` table includes a `roi` column
- ROI is calculated when trades are closed
- The existing metrics work correctly

