# Live Trading System Architecture Plan
## Real Trading Equivalent of Forward Testing System

**Date:** February 8, 2026  
**Purpose:** Comprehensive architecture for live trading system that mirrors forward testing, with execution quality tracking, slippage management, and performance comparison.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Database Schema](#3-database-schema)
4. [Execution Flow](#4-execution-flow)
5. [Slippage & Execution Quality](#5-slippage--execution-quality)
6. [Naming Conventions](#6-naming-conventions)
7. [Sub-Wallet vs Real Wallet Decision](#7-sub-wallet-vs-real-wallet-decision)
8. [Challenges & Solutions](#8-challenges--solutions)
9. [Implementation Plan](#9-implementation-plan)
10. [User Experience](#10-user-experience)

---

## 1. Executive Summary

### Goal
Build a live trading system that executes real trades following the same signals as forward testing strategies, with comprehensive tracking of execution quality, slippage, and performance differences.

### Key Requirements
- ✅ Execute real trades using same signals as forward tests
- ✅ Track execution quality (fills, partial fills, slippage)
- ✅ Compare live vs forward test performance
- ✅ Handle partial fills and order rejections
- ✅ Support pause/resume functionality
- ✅ Sync strategy changes from forward tests to live
- ✅ Timestamp-based comparison (only measure from launch)
- ✅ Clear naming/structure for tracking

### Core Design Principles
1. **Mirror FT Logic**: Reuse same filtering/decision logic from `ft/sync`
2. **Execution Tracking**: Every order tracked with fill status, slippage, execution time
3. **Performance Comparison**: Side-by-side metrics (FT vs Live) from launch timestamp
4. **Flexible Control**: Pause, resume, adjust parameters without breaking continuity
5. **Transparency**: Clear attribution of trades to strategies

---

## 2. System Architecture

### 2.1 High-Level Flow

```
Forward Test (FT)                    Live Trading (LT)
─────────────────                    ─────────────────
ft_wallets (70 strategies)    →     lt_strategies (1:1 mapping)
ft_orders (virtual trades)    →     lt_orders + orders (real trades)
ft_sync (every 2 min)         →     lt_executor (every 2 min, same logic)
ft_resolve (every 10 min)     →     lt_resolve (uses orders table + market API)
```

### 2.2 Component Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Forward Testing (FT)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ ft_wallets   │  │ ft_orders    │  │ ft_sync      │     │
│  │ (strategies) │  │ (virtual)    │  │ (decision)   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ (mirrors logic)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Live Trading (LT)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ lt_strategies│  │ lt_orders     │  │ lt_executor   │     │
│  │ (1:1 FT map) │  │ (tracking)    │  │ (executes)    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  │                  │              │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                              │                                  │
│                              ▼                                  │
│                    ┌──────────────────┐                        │
│                    │ orders table     │                        │
│                    │ (real CLOB)      │                        │
│                    └──────────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Key Components

| Component | Purpose | Location |
|-----------|---------|----------|
| **lt_strategies** | Live trading strategy configs (linked to ft_wallets) | New table |
| **lt_orders** | Tracking table linking FT signals to real orders | New table |
| **lt_executor** | Cron that executes trades (mirrors ft/sync logic) | `app/api/lt/execute/route.ts` |
| **lt_resolve** | Resolves live positions (uses orders table) | `app/api/lt/resolve/route.ts` |
| **orders** | Existing CLOB orders table (real trades) | Existing |
| **Execution Quality Tracker** | Measures slippage, fill rates, latency | New service |

---

## 3. Database Schema

### 3.1 New Tables

#### `lt_strategies` - Live Trading Strategy Configurations

```sql
CREATE TABLE public.lt_strategies (
    strategy_id TEXT PRIMARY KEY,  -- e.g., "LT_FT_HIGH_CONVICTION"
    ft_wallet_id TEXT NOT NULL REFERENCES public.ft_wallets(wallet_id),
    
    -- Status & Control
    is_active BOOLEAN DEFAULT FALSE,
    is_paused BOOLEAN DEFAULT FALSE,
    launched_at TIMESTAMP WITH TIME ZONE,  -- When live trading started
    
    -- User/Account
    user_id UUID NOT NULL REFERENCES auth.users(id),
    wallet_address TEXT NOT NULL,  -- User's Polymarket wallet
    
    -- Capital Management
    starting_capital DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
    max_position_size DECIMAL(12,2),  -- Optional cap per trade
    max_total_exposure DECIMAL(12,2),  -- Optional total exposure cap
    
    -- Execution Settings
    slippage_tolerance_pct DECIMAL(5,3) DEFAULT 0.5,  -- 0.5% max slippage
    order_type TEXT DEFAULT 'GTC',  -- GTC, FOK, FAK
    min_order_size_usd DECIMAL(10,2) DEFAULT 1.00,
    max_order_size_usd DECIMAL(10,2) DEFAULT 100.00,
    
    -- Sync Settings
    sync_ft_changes BOOLEAN DEFAULT TRUE,  -- Auto-update when FT config changes
    last_sync_time TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    display_name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, ft_wallet_id)  -- One live strategy per user per FT wallet
);
```

**Naming Convention**: `LT_{FT_WALLET_ID}` (e.g., `LT_FT_HIGH_CONVICTION`)

#### `lt_orders` - Live Trading Order Tracking

```sql
CREATE TABLE public.lt_orders (
    lt_order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    ft_order_id UUID REFERENCES public.ft_orders(order_id),  -- Link to FT signal
    
    -- Order Reference
    order_id UUID NOT NULL REFERENCES public.orders(order_id),  -- Real CLOB order
    polymarket_order_id TEXT,  -- From CLOB response
    
    -- Signal Details (from FT)
    source_trade_id TEXT NOT NULL,  -- Same as ft_orders.source_trade_id
    trader_address TEXT,
    condition_id TEXT,
    market_slug TEXT,
    market_title TEXT,
    token_label TEXT,
    
    -- Execution Details
    signal_price DECIMAL(6,4),  -- Price from FT signal
    signal_size_usd DECIMAL(10,2),  -- Size from FT signal
    executed_price DECIMAL(6,4),  -- Actual fill price (from orders table)
    executed_size DECIMAL(10,2),  -- Actual filled size
    order_placed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    first_fill_at TIMESTAMP WITH TIME ZONE,
    fully_filled_at TIMESTAMP WITH TIME ZONE,
    
    -- Execution Quality Metrics
    slippage_pct DECIMAL(6,4),  -- (executed_price - signal_price) / signal_price
    fill_rate DECIMAL(5,4),  -- executed_size / signal_size_usd
    execution_latency_ms INTEGER,  -- Time from signal to order placement
    fill_latency_ms INTEGER,  -- Time from order to first fill
    
    -- Status
    status TEXT DEFAULT 'PENDING',  -- PENDING, PARTIAL, FILLED, REJECTED, CANCELLED
    rejection_reason TEXT,
    
    -- Outcome (resolved)
    outcome TEXT DEFAULT 'OPEN',  -- OPEN, WON, LOST, CLOSED
    winning_label TEXT,
    pnl DECIMAL(10,2),
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Comparison to FT
    ft_entry_price DECIMAL(6,4),  -- FT's entry_price
    ft_size DECIMAL(10,2),  -- FT's size
    ft_pnl DECIMAL(10,2),  -- FT's PnL (when resolved)
    performance_diff_pct DECIMAL(8,4),  -- (live_pnl - ft_pnl) / ft_pnl
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(strategy_id, source_trade_id)  -- One live order per strategy per source trade
);

CREATE INDEX idx_lt_orders_strategy_status ON public.lt_orders(strategy_id, status);
CREATE INDEX idx_lt_orders_order_id ON public.lt_orders(order_id);
CREATE INDEX idx_lt_orders_ft_order ON public.lt_orders(ft_order_id);
CREATE INDEX idx_lt_orders_condition ON public.lt_orders(condition_id);
CREATE INDEX idx_lt_orders_outcome ON public.lt_orders(strategy_id, outcome);
```

#### `lt_execution_quality` - Execution Quality Metrics

```sql
CREATE TABLE public.lt_execution_quality (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    lt_order_id UUID NOT NULL REFERENCES public.lt_orders(lt_order_id),
    
    -- Slippage Analysis
    expected_price DECIMAL(6,4),
    best_bid_at_signal DECIMAL(6,4),
    best_ask_at_signal DECIMAL(6,4),
    mid_price_at_signal DECIMAL(6,4),
    executed_price DECIMAL(6,4),
    slippage_vs_mid_pct DECIMAL(6,4),
    slippage_vs_signal_pct DECIMAL(6,4),
    
    -- Fill Analysis
    order_size_usd DECIMAL(10,2),
    filled_size_usd DECIMAL(10,2),
    fill_rate DECIMAL(5,4),
    partial_fill_count INTEGER DEFAULT 0,
    
    -- Latency
    signal_timestamp TIMESTAMP WITH TIME ZONE,
    order_placed_timestamp TIMESTAMP WITH TIME ZONE,
    first_fill_timestamp TIMESTAMP WITH TIME ZONE,
    latency_order_ms INTEGER,
    latency_fill_ms INTEGER,
    
    -- Market Conditions
    market_volume_24h DECIMAL(12,2),
    market_spread_pct DECIMAL(6,4),
    volatility_pct DECIMAL(6,4),  -- If available
    
    -- Quality Score
    execution_quality_score DECIMAL(5,2),  -- 0-100 composite score
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_lt_eq_strategy ON public.lt_execution_quality(strategy_id, created_at DESC);
```

### 3.2 Extensions to Existing Tables

#### `orders` table (already has copy trade metadata)
- ✅ Already has: `copied_trader_wallet`, `copied_trader_id`, `market_id`, `outcome`
- ➕ Add: `lt_strategy_id TEXT REFERENCES public.lt_strategies(strategy_id)`
- ➕ Add: `lt_order_id UUID REFERENCES public.lt_orders(lt_order_id)`
- ➕ Add: `signal_price DECIMAL(6,4)` - Price from FT signal
- ➕ Add: `signal_size_usd DECIMAL(10,2)` - Size from FT signal

**Migration:**
```sql
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS lt_strategy_id TEXT REFERENCES public.lt_strategies(strategy_id),
  ADD COLUMN IF NOT EXISTS lt_order_id UUID REFERENCES public.lt_orders(lt_order_id),
  ADD COLUMN IF NOT EXISTS signal_price DECIMAL(6,4),
  ADD COLUMN IF NOT EXISTS signal_size_usd DECIMAL(10,2);

CREATE INDEX idx_orders_lt_strategy ON public.orders(lt_strategy_id) WHERE lt_strategy_id IS NOT NULL;
CREATE INDEX idx_orders_lt_order ON public.orders(lt_order_id) WHERE lt_order_id IS NOT NULL;
```

---

## 4. Execution Flow

### 4.1 Live Trading Executor (`lt_executor`)

**Location**: `app/api/lt/execute/route.ts`

**Flow**:
1. **Fetch Active Strategies**: Get `lt_strategies` where `is_active=true` AND `is_paused=false`
2. **Get FT Wallet Config**: Load corresponding `ft_wallets` config
3. **Reuse FT Sync Logic**: Call same filtering logic from `ft/sync` (or extract to shared module)
4. **For Each Qualifying Trade**:
   - Check if already executed (`lt_orders` for this `source_trade_id`)
   - Calculate bet size (same as FT)
   - Check capital/exposure limits
   - Place real CLOB order via `getAuthedClobClientForUser`
   - Create `lt_order` record
   - Link to `orders` table
   - Record execution quality metrics

**Key Differences from FT**:
- ✅ Real order placement (not just DB insert)
- ✅ Handle order rejections/partial fills
- ✅ Track execution latency
- ✅ Measure slippage vs signal price
- ✅ Respect capital/exposure limits

### 4.2 Execution Logic

```typescript
// Pseudo-code for lt_executor

async function executeLiveTrades() {
  const strategies = await getActiveStrategies();
  
  for (const strategy of strategies) {
    const ftWallet = await getFTWallet(strategy.ft_wallet_id);
    
    // Reuse FT sync logic (extract to shared function)
    const qualifyingTrades = await evaluateTrades({
      wallet: ftWallet,
      since: strategy.last_sync_time || strategy.launched_at
    });
    
    for (const trade of qualifyingTrades) {
      // Check if already executed
      const existing = await getLTOrder(strategy.strategy_id, trade.source_trade_id);
      if (existing) continue;
      
      // Calculate bet size (same as FT)
      const betSize = calculateBetSize(ftWallet, trade);
      
      // Check capital limits
      const exposure = await getCurrentExposure(strategy.strategy_id);
      if (exposure + betSize > strategy.max_total_exposure) {
        await logSkipped(strategy, trade, 'exposure_limit');
        continue;
      }
      
      // Place order
      const signalPrice = trade.price;
      const signalSize = betSize;
      const signalTime = Date.now();
      
      try {
        const orderResult = await placeCLOBOrder({
          user: strategy.user_id,
          tokenId: trade.tokenId,
          price: signalPrice,
          size: signalSize,
          side: 'BUY',
          orderType: strategy.order_type,
          slippagePercent: strategy.slippage_tolerance_pct
        });
        
        // Record execution
        await createLTOrder({
          strategy_id: strategy.strategy_id,
          ft_order_id: trade.ft_order_id,
          order_id: orderResult.order_id,
          source_trade_id: trade.source_trade_id,
          signal_price: signalPrice,
          signal_size_usd: signalSize,
          executed_price: orderResult.fill_price || signalPrice,
          executed_size: orderResult.filled_size || 0,
          status: orderResult.status,
          execution_latency_ms: Date.now() - signalTime
        });
        
        // Record execution quality
        await recordExecutionQuality({
          strategy_id: strategy.strategy_id,
          lt_order_id: ltOrderId,
          expected_price: signalPrice,
          executed_price: orderResult.fill_price,
          slippage_pct: calculateSlippage(signalPrice, orderResult.fill_price),
          fill_rate: orderResult.filled_size / signalSize
        });
        
      } catch (error) {
        await logRejected(strategy, trade, error.message);
      }
    }
    
    await updateStrategySyncTime(strategy.strategy_id);
  }
}
```

### 4.3 Resolution Flow (`lt_resolve`)

**Location**: `app/api/lt/resolve/route.ts`

**Flow**:
1. **Get Open LT Orders**: `lt_orders` where `outcome='OPEN'`
2. **Check Orders Table**: Get fill status from `orders` table
3. **Check Market Resolution**: Use same logic as `ft/resolve`
4. **Update Outcomes**: Mark WON/LOST based on market resolution
5. **Calculate PnL**: Use actual fill prices from `orders` table
6. **Compare to FT**: Calculate performance difference

**Key Differences from FT**:
- Uses real fill prices (not signal prices)
- Handles partial fills
- Tracks execution quality impact on PnL

---

## 5. Slippage & Execution Quality

### 5.1 Slippage Calculation

**Types of Slippage**:
1. **Signal Slippage**: `(executed_price - signal_price) / signal_price`
2. **Mid-Price Slippage**: `(executed_price - mid_price) / mid_price`
3. **Expected Slippage**: Based on order book depth (if available)

**Recording**:
- Recorded in `lt_execution_quality` table
- Calculated at order placement and updated on fills
- Aggregated per strategy for reporting

### 5.2 Execution Quality Metrics

**Fill Rate**:
- `fill_rate = executed_size / signal_size`
- Track partial fills vs full fills
- Monitor rejection rates

**Latency**:
- **Order Latency**: Time from signal detection to order placement
- **Fill Latency**: Time from order placement to first fill
- Track percentiles (p50, p95, p99)

**Quality Score**:
Composite score (0-100) based on:
- Slippage (lower is better)
- Fill rate (higher is better)
- Latency (lower is better)
- Market conditions (spread, volatility)

### 5.3 Slippage Management

**Pre-Order Checks**:
- Check order book depth
- Estimate slippage based on size
- Reject if estimated slippage > tolerance

**Post-Order Analysis**:
- Compare actual vs expected slippage
- Identify patterns (time of day, market conditions)
- Adjust tolerance dynamically if needed

**Slippage Rules**:
- **Default**: 0.5% tolerance (configurable per strategy)
- **Strict**: 0.2% for high-conviction trades
- **Loose**: 1.0% for high-volume strategies

---

## 6. Naming Conventions

### 6.1 Strategy IDs

**Format**: `LT_{FT_WALLET_ID}`

**Examples**:
- `LT_FT_HIGH_CONVICTION`
- `LT_FT_MODEL_BALANCED`
- `LT_FT_SHARP_SHOOTER`
- `LT_FT_ML_SHARP_SHOOTER`

**Rationale**:
- Clear prefix `LT_` indicates live trading
- Direct mapping to FT wallet
- Easy to query: `WHERE strategy_id LIKE 'LT_FT_%'`

### 6.2 Order Tracking

**LT Order ID**: UUID (auto-generated)
**Order ID**: UUID from `orders` table
**Source Trade ID**: Same as `ft_orders.source_trade_id`

**Linking**:
```
ft_orders.source_trade_id → lt_orders.source_trade_id → orders (via lt_order_id)
```

### 6.3 Display Names

**Strategy Display**: `{FT Display Name} (Live)`
- Example: `"High Conviction (Live)"`

**Order Display**: Show both FT and Live execution details side-by-side

---

## 7. Sub-Wallet vs Real Wallet Decision

### 7.1 Recommendation: **Sub-Wallets (Phase 1)**

**Pros**:
- ✅ Faster implementation (no Polymarket wallet creation)
- ✅ Easier P&L tracking (isolated per strategy)
- ✅ No user friction (no wallet connection needed)
- ✅ Can show performance in-app immediately
- ✅ Easier to pause/resume without affecting other trades

**Cons**:
- ❌ Not visible on Polymarket leaderboard
- ❌ Can't show "public" performance on Polymarket
- ❌ Requires manual fund management

### 7.2 Real Polymarket Wallets (Phase 2)

**When to Consider**:
- After proving system works with sub-wallets
- When you want public performance visibility
- When users want to see trades on Polymarket directly

**Implementation**:
- Create separate Polymarket wallets per strategy
- Link to `lt_strategies.wallet_address`
- Show on Polymarket leaderboard

### 7.3 Hybrid Approach

**Option**: Use sub-wallets for tracking, but allow users to optionally create real wallets later and migrate.

**Implementation**:
- Start with sub-wallets (virtual tracking)
- Add `polymarket_wallet_address` column (nullable)
- When user creates real wallet, link it
- Show both sub-wallet P&L and real wallet P&L

---

## 8. Challenges & Solutions

### 8.1 Challenge: Partial Fills

**Problem**: Real orders may partially fill, FT assumes full fills.

**Solution**:
- Track `fill_rate` in `lt_orders`
- Calculate PnL based on actual filled size
- Compare to FT's full-fill assumption
- Report fill rate metrics per strategy

### 8.2 Challenge: Order Rejections

**Problem**: Orders may be rejected (insufficient funds, market closed, etc.)

**Solution**:
- Record rejection reason in `lt_orders.rejection_reason`
- Skip rejected trades (don't retry automatically)
- Report rejection rate per strategy
- Alert on high rejection rates

### 8.3 Challenge: Price Movement Between Signal and Execution

**Problem**: Price may move between FT signal and live execution.

**Solution**:
- Record `signal_price` and `executed_price`
- Calculate slippage
- Reject if slippage exceeds tolerance
- Use limit orders with slippage tolerance

### 8.4 Challenge: FT Strategy Changes

**Problem**: FT strategies may change configs, how to sync?

**Solution**:
- `sync_ft_changes` flag in `lt_strategies`
- When FT wallet config changes, update LT strategy
- Only sync non-breaking changes (filters, thresholds)
- Don't auto-sync capital/allocation changes (user decision)

### 8.5 Challenge: Performance Comparison Timing

**Problem**: FT tests started earlier, how to compare fairly?

**Solution**:
- `launched_at` timestamp in `lt_strategies`
- Only compare trades after `launched_at`
- Filter FT orders: `WHERE order_time >= lt_strategy.launched_at`
- Show "since launch" metrics

### 8.6 Challenge: Capital Management

**Problem**: How to handle capital limits, exposure tracking?

**Solution**:
- Track `current_exposure` per strategy
- Calculate: `SUM(size WHERE outcome='OPEN')`
- Enforce `max_total_exposure` limit
- Show available capital: `starting_capital + realized_pnl - open_exposure`

### 8.7 Challenge: Execution Latency

**Problem**: Delays between signal and execution affect performance.

**Solution**:
- Record `execution_latency_ms`
- Monitor latency percentiles
- Alert if latency > threshold (e.g., 5 seconds)
- Optimize cron frequency if needed

---

## 9. Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)

**Tasks**:
1. ✅ Create database migrations
   - `lt_strategies` table
   - `lt_orders` table
   - `lt_execution_quality` table
   - Extend `orders` table
2. ✅ Create API endpoints
   - `POST /api/lt/strategies` - Create strategy
   - `GET /api/lt/strategies` - List strategies
   - `POST /api/lt/strategies/[id]/pause` - Pause/resume
   - `POST /api/lt/execute` - Execute trades (cron)
   - `POST /api/lt/resolve` - Resolve positions (cron)
3. ✅ Extract shared logic
   - Extract trade evaluation from `ft/sync` to shared module
   - Reuse in `lt_executor`

### Phase 2: Execution Engine (Week 2-3)

**Tasks**:
1. ✅ Build `lt_executor`
   - Reuse FT sync logic
   - Place real CLOB orders
   - Handle rejections/partial fills
   - Record execution quality
2. ✅ Build `lt_resolve`
   - Check order fills
   - Resolve positions
   - Calculate PnL
   - Compare to FT
3. ✅ Add cron jobs
   - `lt-execute` (every 2 min)
   - `lt-resolve` (every 10 min)

### Phase 3: Execution Quality Tracking (Week 3-4)

**Tasks**:
1. ✅ Slippage calculation
2. ✅ Fill rate tracking
3. ✅ Latency measurement
4. ✅ Quality score computation
5. ✅ Reporting dashboard

### Phase 4: UI & Controls (Week 4-5)

**Tasks**:
1. ✅ Strategy management UI
   - Create/edit strategies
   - Pause/resume controls
   - Capital management
2. ✅ Performance dashboard
   - Live vs FT comparison
   - Execution quality metrics
   - P&L tracking
3. ✅ Order tracking UI
   - List live orders
   - Show execution quality
   - Compare to FT equivalent

### Phase 5: Testing & Refinement (Week 5-6)

**Tasks**:
1. ✅ Test with small capital
2. ✅ Monitor execution quality
3. ✅ Tune slippage tolerance
4. ✅ Optimize latency
5. ✅ Document edge cases

---

## 10. User Experience

### 10.1 Creating a Live Strategy

**Flow**:
1. User selects FT wallet to mirror
2. Sets capital allocation
3. Configures execution settings (slippage, order type)
4. Reviews strategy config
5. Launches strategy

**UI**:
```
┌─────────────────────────────────────────┐
│ Create Live Trading Strategy            │
├─────────────────────────────────────────┤
│ Forward Test Strategy:                  │
│ [High Conviction ▼]                     │
│                                         │
│ Starting Capital:                       │
│ [$1,000.00]                             │
│                                         │
│ Execution Settings:                     │
│ Slippage Tolerance: [0.5% ▼]           │
│ Order Type: [GTC ▼]                     │
│ Max Position Size: [$100.00]            │
│                                         │
│ [Cancel]  [Launch Strategy]            │
└─────────────────────────────────────────┘
```

### 10.2 Strategy Dashboard

**View**:
- Performance metrics (P&L, win rate)
- Execution quality (slippage, fill rate)
- Comparison to FT (side-by-side)
- Open positions
- Recent orders

**UI**:
```
┌─────────────────────────────────────────────────────────┐
│ High Conviction (Live)                    [Pause] [Edit]│
├─────────────────────────────────────────────────────────┤
│ Performance (since launch)                               │
│ P&L: +$45.20 (+4.52%)    Win Rate: 58%                  │
│                                                          │
│ vs Forward Test                                          │
│ FT P&L: +$52.10 (+5.21%)  Difference: -$6.90 (-1.32%) │
│                                                          │
│ Execution Quality                                        │
│ Avg Slippage: 0.32%    Fill Rate: 98.5%                 │
│ Avg Latency: 1.2s      Rejection Rate: 1.2%             │
│                                                          │
│ Open Positions: 12    Total Trades: 45                  │
└─────────────────────────────────────────────────────────┘
```

### 10.3 Order Details

**View**:
- Signal details (from FT)
- Execution details (actual fills)
- Execution quality metrics
- Comparison to FT

**UI**:
```
┌─────────────────────────────────────────────────────────┐
│ Order: Market XYZ                                       │
├─────────────────────────────────────────────────────────┤
│ Signal (FT):                                            │
│ Price: $0.45    Size: $10.00    Time: 10:23:15         │
│                                                          │
│ Execution (Live):                                        │
│ Price: $0.451    Size: $9.85    Time: 10:23:16         │
│                                                          │
│ Execution Quality:                                       │
│ Slippage: +0.22%    Fill Rate: 98.5%                    │
│ Latency: 1.1s      Status: FILLED                       │
│                                                          │
│ Outcome: OPEN (pending resolution)                      │
└─────────────────────────────────────────────────────────┘
```

---

## 11. Key Design Decisions

### 11.1 Why Separate `lt_orders` Table?

**Rationale**:
- Links FT signals to real orders
- Tracks execution quality separately
- Allows comparison without polluting `orders` table
- Easier to query "all live trades for strategy X"

### 11.2 Why Link to `orders` Table?

**Rationale**:
- `orders` is source of truth for real CLOB orders
- Already has fill tracking, status updates
- Reuse existing order refresh logic
- Single source of truth for order state

### 11.3 Why Track Execution Quality Separately?

**Rationale**:
- Rich metrics (slippage, latency, fill rate)
- Historical analysis
- Pattern detection
- Performance optimization

### 11.4 Why Mirror FT Logic Exactly?

**Rationale**:
- Ensures apples-to-apples comparison
- Validates FT assumptions
- Identifies execution quality impact
- Builds confidence in FT results

---

## 12. Future Enhancements

### Phase 2 Features

1. **Real Polymarket Wallets**
   - Create actual wallets per strategy
   - Show on Polymarket leaderboard
   - Public performance visibility

2. **Advanced Slippage Management**
   - Dynamic slippage tolerance based on market conditions
   - Order book depth analysis
   - Smart order routing

3. **Risk Management**
   - Stop-loss orders
   - Position sizing based on volatility
   - Correlation limits

4. **Performance Analytics**
   - Attribution analysis (execution vs signal quality)
   - Market condition impact
   - Strategy optimization recommendations

---

## Appendix: Key Files to Create/Modify

### New Files
- `supabase/migrations/YYYYMMDD_create_live_trading_tables.sql`
- `app/api/lt/strategies/route.ts`
- `app/api/lt/strategies/[id]/route.ts`
- `app/api/lt/execute/route.ts`
- `app/api/lt/resolve/route.ts`
- `app/api/cron/lt-execute/route.ts`
- `app/api/cron/lt-resolve/route.ts`
- `lib/live-trading/executor.ts`
- `lib/live-trading/quality-tracker.ts`
- `app/lt/page.tsx` (UI)

### Modified Files
- `supabase/migrations/YYYYMMDD_extend_orders_for_lt.sql`
- `vercel.json` (add cron jobs)
- `lib/ft-sync/shared-logic.ts` (extract shared evaluation logic)

---

**End of Architecture Plan**
