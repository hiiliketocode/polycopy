# Polycopy V2 - Complete Feature Parity Plan

## Analysis: Current vs V2 Pages

### 1. **FEED PAGE** (`/feed` → `/v2/feed`)

#### Current Features:
- ✅ Fetches from Polymarket API (FIXED)
- ⚠️ Missing features:
  - Fire Feed mode (admin-only, shows top 100 traders with ML scoring)
  - Live market data updates (prices, scores, ESPN integration)
  - Advanced filtering:
    - Category (All, Politics, Sports, Crypto, Culture, Finance, Economics, Tech, Weather)
    - Status (All, Live Games Only)
    - Position-only filter
    - Trade size minimum
    - Trading strategies (Multiple Positions, Hedging, Selling)
    - Resolving window (Any, Hour, Today, Tomorrow, Week)
    - Price range slider
    - Specific trader filter
  - Pinned trades
  - Trade execution (Quick/Manual/Auto modes)
  - Copy trade modal with:
    - Amount input
    - Slippage settings
    - Preview with estimated cost
    - Execution via Turnkey
  - Trade cards with:
    - ESPN scores for sports markets
    - Live game status
    - Market resolution status
    - Current price vs entry price
    - Expanded details view
  - Copied trade tracking
  - Position management (close position modal)
  - Trade notifications
  - Scroll position preservation
  - Auto-refresh with visible countdown
  - Load more functionality

#### Estimated Size: ~4,600 lines

---

### 2. **DISCOVER PAGE** (`/discover` → `/v2/discover`)

#### Current Features:
- ✅ Leaderboard display (DONE)
- ✅ Search (DONE)
- ✅ Follow/unfollow (DONE)
- ⚠️ Missing features:
  - Trending traders section (weekly P&L delta calculation)
  - Biggest trades section (last 24h)
  - Trader cards with:
    - Profile images
    - Win rate display
    - ROI percentage
    - Volume display
    - Follower count
  - Multiple leaderboard views:
    - Default: By PnL
    - Trending: By weekly delta
    - Volume: By total volume
  - Performance charts (sparklines)
  - Copy-on-click directly from discover

#### Estimated Size: ~2,000 lines

---

### 3. **TRADER PROFILE** (`/trader/[wallet]` → `/v2/trader/[wallet]`)

#### Current Features:
- ✅ Basic profile info (DONE)
- ✅ Follow button (DONE)
- ❌ Missing features (documented in TRADER_PROFILE_V2_GAPS.md):
  - **Performance Tab:**
    - Realized P&L chart (bar/area, time windows)
    - "If You Had Copied" section
    - Position sizing analysis
    - Category distribution pie chart
    - Computed stats (realized/unrealized breakdown)
    - Leaderboard rankings by time window
  - **Trades Tab:**
    - Full trade cards with ESPN scores
    - Live market data
    - Copy trade functionality
    - Filter by resolved/open
    - Load more pagination
  - Share trader modal
  - Copy wallet address
  - Trade execution notifications
  - Expandable trade details

#### Estimated Size: ~3,400 lines

---

### 4. **BOTS/TRADING PAGE** (`/trading` → `/v2/bots`)

#### Current Features:
- ✅ Lists FT strategies (DONE)
- ✅ Free/Premium filtering (DONE)
- ⚠️ Missing features:
  - **Performance Tab:**
    - Sortable table with all metrics
    - PnL, Win Rate, Total Trades, Open Positions
    - Sharpe Ratio, Max Drawdown
    - Created date, Last sync time
    - Hours remaining (for time-boxed tests)
    - Status badges (ACTIVE, ENDED, SCHEDULED)
  - **Compare Tab:**
    - Side-by-side strategy comparison
    - Configuration details
    - Parameter comparison (model threshold, price range, min edge, etc.)
  - **Live Tab:**
    - Live trading strategies (real money)
    - LT strategy stats
    - Pause/Resume controls
    - Fill rate tracking
  - **Settings Tab:**
    - Create new strategy
    - Adjust parameters
    - Start/stop controls
  - Charts:
    - Performance sparklines
    - P&L over time
  - Export/share functionality
  - Sync/refresh controls
  - Auto-sync toggle

#### Estimated Size: ~1,300 lines

---

### 5. **PORTFOLIO PAGE** (`/portfolio` → `/v2/portfolio`)

#### Current Features:
- ✅ Basic stats cards (DONE)
- ✅ Open positions (DONE)
- ✅ Order history (DONE)
- ⚠️ Missing features:
  - **Performance Tab:**
    - Realized P&L chart (daily/cumulative)
    - Position sizing distribution
    - Category distribution
    - Time window selectors
  - **Trades Tab:**
    - Full trade cards with market data
    - Close position modal
    - Edit copied trade
    - Mark trade closed
    - P&L calculation per trade
  - Charts:
    - Daily P&L bar chart
    - Cumulative area chart
    - Position size histogram
    - Category pie chart
  - Copied trades tracking
  - Auto-refresh of positions
  - Live price updates
  - Filter options

#### Estimated Size: ~4,400 lines

---

### 6. **LANDING PAGE** (`/` → `/v2/landing`)

#### Current Features:
- ✅ Basic structure (DONE)
- ⚠️ Missing features:
  - Current landing page is simpler
  - Need to check if there are additional sections
  - Testimonials?
  - Feature highlights?
  - Pricing comparison?
  - FAQ section?

#### Estimated Size: ~800 lines

---

## TOTAL SCOPE

**Current codebase pages: ~16,500 lines**
**V2 pages built so far: ~2,500 lines**
**Missing functionality: ~14,000 lines**

---

## RECOMMENDATION

Given the massive scope (14,000+ lines of missing functionality), I recommend:

### **Option A: Full Port (2-3 days of work)**
Port all existing functionality to v2 design system. This gives you complete feature parity but is a significant effort.

### **Option B: Phased Approach (Recommended)**
1. **Phase 1 (Today):** Fix critical missing features on each page
   - Feed: Trade execution, filtering, live data
   - Trader Profile: Performance tab with charts
   - Bots: Full strategy table
   - Portfolio: Charts and position management

2. **Phase 2 (Later):** Advanced features
   - ESPN integration
   - Live price updates
   - Advanced filtering
   - Share modals

3. **Phase 3 (Polish):** 
   - Animations
   - Optimizations
   - Edge cases

### **Option C: Strategic Simplification**
Keep v2 as a "clean" version with core features, document advanced features as "Coming Soon" or "v2.1"

---

## YOUR DECISION

Which approach would you like me to take?

1. **Full Port** - I'll systematically port all 14,000 lines (will take significant time)
2. **Phased** - I'll focus on critical features first, then we iterate
3. **Strategic** - I'll identify which features are truly essential vs nice-to-have

Please let me know and I'll proceed accordingly! 🚀
