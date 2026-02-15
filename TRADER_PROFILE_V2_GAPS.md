# Trader Profile V2 - Missing Features

## What's Currently Missing from `/v2/trader/[wallet]`:

### 1. **Performance Tab (Major Missing Feature)**
The existing page has a full "Performance" tab with:
- [ ] **Realized P&L Chart** (Bar chart for daily, Area chart for cumulative)
  - Time window selector (1D, 7D, 30D, 3M, 6M, ALL)
  - Daily vs Cumulative view toggle
  - Data from `realized_pnl_daily` table
- [ ] **"If You Had Copied" Section**
  - Shows what user's P&L would be if they copied this trader
  - Includes daily P&L bar chart
  - Stats breakdown (Total PnL, Win Rate, Total Trades, Open Trades)
  - Requires `/api/trader/[wallet]/my-trades` API
- [ ] **Position Sizing Analysis** (Bar chart)
  - Shows distribution of trade sizes ($0-$10, $10-$50, etc.)
- [ ] **Category Distribution** (Pie chart)
  - Shows what categories trader trades in (Sports, Politics, etc.)
- [ ] **Computed Stats Section**
  - Realized/Unrealized P&L breakdown
  - ROI calculation
  - Win Rate
  - Volume

### 2. **Trades Tab (Partially Complete)**
What's missing:
- [ ] **Trade Cards with Full Details**
  - Current price vs entry price
  - P&L per trade
  - ESPN scores integration for sports markets
  - Market resolution status
  - Live game status indicators
  - Copy trade functionality (currently just alert)
- [ ] **Filter Options**
  - Show/hide resolved trades toggle
  - Load more functionality
- [ ] **Live Market Data**
  - Real-time price updates
  - Market status (open/closed/resolved)

### 3. **Data Fetching**
Missing API calls:
- [ ] Realized P&L data from `realized_pnl_daily` table
- [ ] Trade statistics computation
- [ ] Position sizing analysis
- [ ] Category distribution
- [ ] "My trades" comparison data
- [ ] Live market prices for open positions

### 4. **Interactive Features**
- [ ] Leaderboard ranking by time window
- [ ] Share trader modal (profile sharing)
- [ ] Copy wallet address button
- [ ] Trade execution notifications
- [ ] Expandable trade details

## Priority Order for Implementation:

1. **HIGH PRIORITY:**
   - Performance tab with P&L chart
   - Trade cards with real data and copy functionality
   - Computed stats (ROI, Win Rate breakdown)

2. **MEDIUM PRIORITY:**
   - Position sizing chart
   - Category distribution pie chart
   - "If You Had Copied" section

3. **LOW PRIORITY:**
   - ESPN scores integration
   - Live price updates
   - Advanced filtering

## Estimated Work:
- This is significant - the existing trader profile is ~3400 lines
- Current v2 version is ~350 lines
- Need to port ~3000 lines of functionality

Would you like me to:
1. Start building out the Performance tab first?
2. Enhance the Trades tab with full trade card functionality?
3. Or create a simplified but functional version of both?
