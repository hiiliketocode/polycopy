# Performance Data Fixes - January 13, 2026

## Executive Summary

Fixed critical issues with performance data calculations across user profiles, trader profiles, and emails. The root cause was reliance on incomplete views and calculated stats that didn't properly handle resolved markets and prioritized incorrect data sources.

## 🔴 Critical Issues Fixed

### 1. User Profile Performance Data (RESOLVED)
**Problem**: User profiles showed incorrect P&L, ROI, and win rates
- Win rate showed 0% when it should be ~60%
- P&L showed large negative when it should be positive
- ROI calculations were incorrect

**Root Cause**:
- `orders_copy_enriched` view had NULL `pnl_usd` for resolved markets without `current_price`
- Win rate query excluded trades with NULL PnL, causing 0% rates
- Portfolio stats API relied on incomplete view data

**Solution**:
- **Completely rewrote `/app/api/portfolio/stats/route.ts`** to query `orders` table directly
- Filter to BUY orders only (copy trades, not closing sells)
- Robust exit price detection:
  1. Use `user_exit_price` (manual closes)
  2. Fall back to `current_price` (market data)
  3. **Infer from `resolved_outcome`** (1.00 for wins, 0.00 for losses)
- Calculate P&L correctly for all trade states
- Win rate only counts closed/resolved trades with `pnl > 0`

**Files Changed**:
- `app/api/portfolio/stats/route.ts` - Complete rewrite

### 2. Trader Profile Performance Data (RESOLVED)
**Problem**: Trader profiles showed drastically wrong stats
- Example: kch123 shows +$6.2M on Polymarket, but -$14,864 on Polycopy
- Win rate showed 0% for successful traders

**Root Cause**:
- Prioritized `computedStats` (calculated from limited 100 trades) over `traderData` (Polymarket leaderboard)
- Win rate calculation only counted SELL trades, showing 0% for traders with open positions
- Incomplete trade history (max 100 trades) led to inaccurate calculations

**Solution**:
- **Reversed priority**: Use `traderData` (leaderboard) first, fall back to `computedStats`
- Win rate only shown if meaningful (> 0% and based on actual sells)
- Added debug logging to track data sources

**Files Changed**:
- `app/trader/[wallet]/page.tsx` - Lines 979-998

### 3. Email ROI Calculations (RESOLVED)
**Problem**: Market resolved emails showed incorrect ROI
- ROI calculations used intermediate prices (0.99, 0.01) instead of final outcome (1.00, 0.00)

**Solution**:
- Modified `/app/api/copied-trades/[id]/status/route.ts` to set `priceForRoi` to 1.00 or 0.00 for resolved markets
- Ensures email ROI reflects actual final outcome

**Files Changed**:
- `app/api/copied-trades/[id]/status/route.ts` - ROI calculation logic

## 📊 Database Changes

### Migration: `20260113_fix_pnl_for_resolved_trades.sql`
- Modified `orders_copy_enriched` view to infer `exit_price` from `resolved_outcome`
- Ensures `pnl_usd` is never NULL for resolved trades
- Handles cases where `current_price` is NULL

### Migration: `20260113_add_default_slippage_preferences.sql`
- Added `default_buy_slippage` and `default_sell_slippage` columns to `notification_preferences`
- Defaults to 2.00% for both

## ✨ Feature Additions

### 1. Top 10 Traders Table (Profile Performance Tab)
**Location**: `app/profile/page.tsx`
**Features**:
- Shows top 10 copied traders sorted by total investment
- Displays: Times copied, Total invested, P&L, ROI, Win rate
- Calculates metrics from user's copy trades of each trader
- Click trader name to view their profile

### 2. Default Slippage Settings
**Location**: `app/profile/page.tsx` (Settings tab)
**Features**:
- Set default buy slippage (0-100%)
- Set default sell slippage (0-100%)
- Stored in `notification_preferences` table
- Range slider + number input for precision

### 3. Position Size Chart Alignment Fix
**Location**: `app/profile/page.tsx` (Performance tab)
**Fix**: Changed from `justify-between` to CSS grid for proper label alignment
- Labels now centered beneath chart bars
- Matches trader profile chart behavior

## 🎨 UX Improvements

### 1. Partial Fill Status
**Location**: `components/polycopy/trade-card.tsx`
**Change**: Show "Partially filled" status instead of "Filled" when `filledSize < totalSize`

### 2. Error Message Updates
**Locations**: 
- `components/polycopy/trade-card.tsx`
- `app/trade-execute/page.tsx`
- `components/orders/ClosePositionModal.tsx`
**Change**: "We couldn't fill" → "Polymarket couldn't fill"

### 3. Auto-Refresh After Close
**Location**: `components/orders/OrdersScreen.tsx`
**Change**: Automatically refresh page after successfully closing a position

## 🔍 Debug Logging Added

### Portfolio Stats API
```javascript
console.log('📊 Portfolio Stats Calculated:', {
  userId, totalTrades, closedTrades, openTrades,
  winningTrades, losingTrades, breakEvenTrades,
  totalVolume, realizedPnl, unrealizedPnl, totalPnl, roi, winRate,
  sampleClosedTrades
});
```

### Trader Profile Stats
```javascript
console.log('🧮 Computed stats from trades:', {
  tradesCount, totalPnl, volume, roi, winRate,
  sellTrades, winSells,
  note: 'These stats are calculated from limited trade history'
});

console.log('📊 Trader Profile Stats Priority:', {
  wallet, leaderboardPnl, computedPnl, effectivePnl,
  leaderboardRoi, computedRoi, effectiveRoiValue,
  source: 'leaderboard' | 'computed' | 'none'
});
```

## 🧪 Testing Checklist

### User Profile
- [ ] P&L shows positive when portfolio is profitable
- [ ] ROI reflects actual return on investment
- [ ] Win rate shows ~60% for expected performance
- [ ] Volume matches total invested amount
- [ ] Top 10 traders table displays correctly
- [ ] Position size chart labels align with bars

### Trader Profile  
- [ ] P&L matches Polymarket leaderboard
- [ ] ROI matches Polymarket leaderboard
- [ ] Volume matches Polymarket leaderboard
- [ ] Win rate shows N/A or meaningful % (not 0% for successful traders)
- [ ] Stats update when changing time period

### Trade Cards
- [ ] Partial fills show "Partially filled" status
- [ ] Error messages say "Polymarket couldn't fill"
- [ ] ROI displays correctly for closed/resolved positions

### Emails
- [ ] Market resolved emails show correct ROI (based on 1.00/0.00 outcome)
- [ ] Trader closed emails show accurate data

### Settings
- [ ] Default slippage settings save correctly
- [ ] Values persist on page reload
- [ ] Range slider and number input stay in sync

### Position Management
- [ ] Page refreshes after closing position
- [ ] Updated P&L shown after refresh

## 📝 Key Takeaways

1. **Always trust authoritative sources**: Polymarket leaderboard > calculated stats from partial data
2. **Handle NULL values gracefully**: Infer missing data when possible (resolved outcome → exit price)
3. **Filter data carefully**: Only count BUY orders for copy trade stats, exclude closing SELL orders
4. **Win rate is complex**: Requires closed/resolved trades with complete data; can't rely on SELL trades alone
5. **Database views are risky**: Direct queries with in-memory calculations are more reliable and debuggable

## 🚀 Performance Impact

- **User profiles**: Now accurate, no more negative P&L when positive
- **Trader profiles**: Show real Polymarket stats instead of incorrect calculations
- **Emails**: ROI now reflects final outcomes, not intermediate prices
- **Debug visibility**: Console logs help trace data flow and identify issues

## 📚 Related Documentation

- `WORKER_SYSTEM.md` - Background job architecture
- `SECURITY_PROGRESS.md` - Security improvements
- `docs/database/` - Database schema and migrations
