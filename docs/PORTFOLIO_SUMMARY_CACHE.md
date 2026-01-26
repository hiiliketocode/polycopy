# Portfolio Summary Cache

## Overview

The `user_portfolio_summary` table caches calculated portfolio performance metrics to avoid expensive on-the-fly calculations every time a user opens their portfolio page.

## Table Schema

**Table:** `public.user_portfolio_summary`

**Columns:**
- `user_id` (UUID, PK) - References auth.users
- `total_pnl` (NUMERIC) - Total profit/loss
- `realized_pnl` (NUMERIC) - Realized P&L from closed positions
- `unrealized_pnl` (NUMERIC) - Unrealized P&L from open positions
- `total_volume` (NUMERIC) - Total capital deployed
- `roi` (NUMERIC) - Return on investment percentage
- `win_rate` (NUMERIC) - Win rate percentage
- `total_trades` (INTEGER) - Total number of trades
- `total_buy_trades` (INTEGER) - Number of buy orders
- `total_sell_trades` (INTEGER) - Number of sell orders
- `open_positions` (INTEGER) - Currently open positions
- `closed_positions` (INTEGER) - Closed positions
- `winning_positions` (INTEGER) - Positions that closed with profit
- `losing_positions` (INTEGER) - Positions that closed with loss
- `calculated_at` (TIMESTAMPTZ) - When first calculated
- `last_updated_at` (TIMESTAMPTZ) - When last updated
- `calculation_version` (INTEGER) - Version of calculation logic

## How It Works

### Cache Strategy

1. **Check Cache First**: When `/api/portfolio/stats` is called, it first checks for a cached summary
2. **Freshness Check**: Cache is considered valid if:
   - It exists
   - It's less than 5 minutes old (`PORTFOLIO_CACHE_STALE_AFTER_MS`)
   - It matches the current `CALCULATION_VERSION`
3. **Return Cached Data**: If valid, return cached data immediately (fast!)
4. **Recalculate if Stale**: If cache is missing or stale, calculate fresh stats
5. **Save to Cache**: After calculation, save results to the table for next time

### Calculation Logic

The calculation uses the same FIFO position-based P&L logic as before:
- Groups orders by `(market_id, outcome)` to form positions
- Matches SELL orders to BUY orders using FIFO (First-In-First-Out)
- Calculates realized P&L from closed positions
- Calculates unrealized P&L from open positions using current market prices
- Handles resolved markets using `outcome_prices` when `winning_side` is missing

### SELL Order Inclusion

SELL orders often lack `copy_user_id` because:
- The close flow doesn't send copy metadata to the place API
- CLOB refresh doesn't set `copy_user_id` on SELL orders

**Solution**: The API now:
1. Fetches copy BUY orders by `copy_user_id`
2. Builds a set of `(market_id, outcome)` keys from copy BUYs
3. Fetches SELL orders by `trader_id` (from wallet via `traders` table)
4. Filters SELLs to only those matching copy positions
5. Merges BUYs + matching SELLs for FIFO calculation

## Usage

### API Endpoint

`GET /api/portfolio/stats?userId={userId}`

**Response:**
```json
{
  "totalPnl": 144.75,
  "realizedPnl": 155.75,
  "unrealizedPnl": -10.99,
  "totalVolume": 1864.54,
  "roi": 7.76,
  "winRate": 55.7,
  "totalTrades": 233,
  "totalBuyTrades": 233,
  "totalSellTrades": 20,
  "openTrades": 40,
  "closedTrades": 176,
  "winningPositions": 98,
  "losingPositions": 78,
  "freshness": "2026-01-25T...",
  "cached": false
}
```

### Manual Cache Refresh

To force a refresh, you can:
1. Delete the row: `DELETE FROM user_portfolio_summary WHERE user_id = '...'`
2. Or increment `CALCULATION_VERSION` in the code (forces all users to recalculate)

### Version Management

When you change the P&L calculation logic:
1. Increment `CALCULATION_VERSION` in `app/api/portfolio/stats/route.ts`
2. This forces all cached summaries to be recalculated
3. Old summaries with mismatched versions are ignored

## Benefits

1. **Performance**: Portfolio page loads instantly with cached data
2. **Reduced Load**: Expensive calculations only run every 5 minutes per user
3. **Consistency**: Same calculation logic, just cached
4. **Scalability**: Can handle many concurrent portfolio page views

## Future Enhancements

- Background job to refresh summaries periodically (e.g., every 5 minutes)
- Invalidate cache on new order placement (real-time updates)
- Add more granular metrics (by time period, by market category, etc.)
- Historical snapshots for portfolio performance over time
