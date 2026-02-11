# Request for Proposal: Live Trading System Rebuild

**Project**: PolyCopy Live Trading System Rebuild  
**Date**: February 11, 2026  
**Status**: Draft for Review  
**Priority**: Critical

---

## Executive Summary

This RFP outlines the complete rebuild of the PolyCopy Live Trading (LT) system to address critical issues with overcomplexity, unreliable trade execution, inconsistent P&L calculations, and risk management failures. The rebuild will create a simple, reliable, and maintainable system that mirrors the proven Forward Testing (FT) architecture while adding real-world trade execution capabilities.

### Key Objectives

1. **Simplicity First**: Build from scratch with clean, component-based architecture
2. **Reuse Proven Systems**: Leverage working FT logic and core trading infrastructure
3. **Unified UI**: Single interface for both FT and LT with consistent UX
4. **Reliable Execution**: Best-in-class trade execution with proper handling of slippage, fills, and timing
5. **Clear Tracking**: Transparent logging and tracking at every step
6. **Safe Migration**: Zero impact on existing manual trading and FT systems

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Problems Identified](#2-problems-identified)
3. [High-Level Goals](#3-high-level-goals)
4. [System Architecture](#4-system-architecture)
5. [Core Components](#5-core-components)
6. [Database Design](#6-database-design)
7. [Execution Flow](#7-execution-flow)
8. [Trade Matching & Timing](#8-trade-matching--timing)
9. [Risk Management](#9-risk-management)
10. [UI/UX Requirements](#10-uiux-requirements)
11. [Testing Strategy](#11-testing-strategy)
12. [Migration & Cleanup Plan](#12-migration--cleanup-plan)
13. [Success Criteria](#13-success-criteria)
14. [Timeline & Milestones](#14-timeline--milestones)
15. [Best Practices from Reference Implementations](#15-best-practices-from-reference-implementations)

---

## 1. Current State Analysis

### 1.1 What's Working Well

#### Forward Testing (FT) System ✅
- **Proven Strategy Logic**: FT wallets successfully test trading strategies with virtual capital
- **Clean Trade Evaluation**: `shared-logic.ts` provides robust trade qualification logic
- **Accurate P&L Calculation**: FT P&L formulas are correct and battle-tested
- **Bet Sizing**: Multiple allocation methods (FIXED, KELLY, EDGE_SCALED, TIERED, CONVICTION, ML_SCALED) work well
- **Sync Mechanism**: `/api/cron/ft-sync` reliably fetches trades from Polymarket API and filters them
- **Data Model**: `ft_wallets` and `ft_orders` tables are well-designed and performant
- **UI**: `/app/ft/page.tsx` provides excellent visibility into strategy performance

#### Core Trading Infrastructure ✅
- **Order Placement**: `placeOrderCore()` handles CLOB API with Evomi proxy, Cloudflare mitigation, retries
- **Order Polling**: CLOB polling for fill status works reliably
- **Order Tracking**: `orders` table and `order_events_log` provide comprehensive audit trail
- **CLOB Integration**: `@polymarket/clob-client` integration is solid
- **Turnkey Wallet Management**: Wallet creation and signing work well

### 1.2 What's Broken (Live Trading)

#### Architectural Issues 🔴
- **Overcomplicated**: Multiple iterations of fixes have created spaghetti code
- **Unclear Flow**: Difficult to trace how FT signals become LT executions
- **Sync Confusion**: Unclear relationship between `last_sync_time` and trade detection
- **Code Duplication**: Logic duplicated instead of reused from FT

#### Execution Problems 🔴
- **Unreliable Fills**: Inconsistent handling of partial fills and order status
- **Timing Issues**: Latency between FT signal and LT execution not properly tracked
- **Slippage Tracking**: Inadequate measurement and reporting of execution slippage
- **Token Resolution**: `resolveTokenId()` has retry logic but no caching, hits API repeatedly

#### P&L Issues 🔴
- **Complex Calculations**: Overly complex formulas that differ from FT
- **Bug History**: Recent migration (`20260211_fix_lt_resolved_pnl.sql`) shows P&L bugs (treated shares as USD)
- **Inconsistency**: LT P&L doesn't match FT P&L for same trades

#### Risk Management Problems 🔴
- **Rule Violations**: Risk rules not being enforced (e.g., `20260337_clear_daily_budget_pct_when_no_usd.sql`)
- **Hidden Limits**: Daily budget defaulting to 10% even when not configured
- **Arbitrary Blocks**: Trades being rejected for unclear reasons
- **Poor Feedback**: Users don't understand why trades are blocked

#### Data Model Issues 🔴
- **Column Confusion**: Mixture of `executed_size` (shares) vs `signal_size_usd` (dollars)
- **Redundant Tables**: `lt_orders`, `orders`, `order_events_log` overlap
- **No Deduplication**: `ft_seen_trades` pattern not applied to LT
- **Stale Data**: `last_sync_time` not properly maintained

---

## 2. Problems Identified

### 2.1 Core Problems

| Problem | Impact | Root Cause |
|---------|--------|------------|
| **Unreliable Execution** | Trades don't execute when they should | Complex flow, unclear state management |
| **Inconsistent P&L** | Can't trust performance metrics | Different formulas from FT, bugs in calculation |
| **Risk Rule Failures** | Strategies break budget limits | Rules not enforced, defaults wrong |
| **Poor Observability** | Can't debug issues | Logging scattered, no clear audit trail |
| **Duplicate Trades** | Same trade executed multiple times | No deduplication mechanism |
| **Timing Slippage** | Delay between FT signal and execution | No time-based filtering, polling issues |

### 2.2 Why Complexity Arose

1. **Iterative Fixes**: Each bug fix added complexity rather than addressing root causes
2. **Different Patterns**: LT evolved separately from FT instead of reusing FT logic
3. **No Clear Spec**: No reference implementation to follow
4. **Premature Optimization**: Complex risk management before basic execution worked

### 2.3 User Impact

- **Loss of Confidence**: Users don't trust the system to execute correctly
- **Manual Intervention**: Constant monitoring and manual fixes required
- **Missed Opportunities**: Good trades not executed due to bugs
- **Financial Risk**: Incorrect P&L and risk calculations could lead to losses

---

## 3. High-Level Goals

### 3.1 Primary Goals

1. **Match FT Logic Exactly**
   - Use identical trade evaluation logic from `shared-logic.ts`
   - Apply same bet sizing calculations
   - Calculate P&L identically to FT
   - Reuse FT's sync pattern and deduplication

2. **Best-in-Class Execution**
   - Study reference implementations (earthskyorg, DanielnKim repos)
   - Handle partial fills gracefully
   - Track and report slippage accurately
   - Minimize latency between signal and execution

3. **Simple & Maintainable**
   - Single, clear flow from FT signal → execution → tracking
   - Reuse existing components (placeOrderCore, order polling)
   - Minimal new code, maximum reuse
   - Easy to understand and debug

4. **Unified UI**
   - Same interface for FT and LT
   - Tabs to switch between strategies
   - Consistent metrics and display
   - Same pause/resume/settings controls

5. **Comprehensive Logging**
   - Log every decision point
   - Track timing at each step
   - Record all risk checks
   - Enable post-mortem debugging

### 3.2 Non-Goals (Out of Scope)

- ❌ Changing FT system (it works!)
- ❌ Modifying manual trading system
- ❌ Changing UI design (reuse existing)
- ❌ Advanced features (webhooks, alerts, ML)
- ❌ Selling/closing positions (Phase 2)

---

## 4. System Architecture

### 4.1 Architecture Principles

```
┌─────────────────────────────────────────────────────────────────┐
│                         UNIFIED FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FT Wallet (Virtual) ──┐                                        │
│                        │                                        │
│                        ├──→ Shared Trade Logic ──→ FT Order     │
│                        │    (shared-logic.ts)                   │
│  LT Strategy (Real) ───┤                                        │
│                        │                                        │
│                        └──→ Shared Trade Logic ──→ LT Execution │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Unified Flow Design

**Key Insight**: FT and LT share 95% of logic. The only difference is what happens after a trade qualifies:

```typescript
// SHARED (used by both FT and LT)
1. Fetch trades from Polymarket API
2. Enrich with trader stats
3. Evaluate against strategy rules (evaluateTrade)
4. Calculate bet size (calculateBetSize)
5. Check if already processed

// DIVERGENCE
FT: Insert into ft_orders (virtual)
LT: Call executeTrade() → placeOrderCore() → CLOB (real)
```

### 4.3 Component Reuse Strategy

| Component | FT Usage | LT Usage | Shared? |
|-----------|----------|----------|---------|
| **Trade Evaluation** | ✅ | ✅ | ✅ Reuse `evaluateTrade()` |
| **Bet Sizing** | ✅ | ✅ | ✅ Reuse `calculateBetSize()` |
| **Trade Deduplication** | ✅ `ft_seen_trades` | ⚠️ Need `lt_seen_trades` | ✅ Same pattern |
| **Sync Polling** | ✅ `/api/cron/ft-sync` | ❌ Current `/api/lt/execute` wrong | ⚠️ Needs redesign |
| **Order Placement** | ❌ N/A | ✅ `placeOrderCore()` | ✅ Already shared |
| **Order Polling** | ❌ N/A | ✅ CLOB status check | ✅ Use FT pattern |
| **P&L Calculation** | ✅ Working | ❌ Broken | ✅ Copy FT formulas |

---

## 5. Core Components

### 5.1 Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CORE COMPONENTS                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Trade Sync Service                                      │
│     - Fetches trades from Polymarket                        │
│     - Enriches with trader stats                            │
│     - Polls every minute (cron)                             │
│                                                             │
│  2. Trade Evaluator (SHARED with FT)                        │
│     - evaluateTrade() from shared-logic.ts                  │
│     - Uses strategy rules                                   │
│     - Calculates bet size                                   │
│                                                             │
│  3. LT Executor                                             │
│     - Takes qualified trades                                │
│     - Checks risk rules                                     │
│     - Calls placeOrderCore()                                │
│     - Polls for fill status                                 │
│                                                             │
│  4. Order Tracker                                           │
│     - Monitors order status                                 │
│     - Updates fill information                              │
│     - Calculates slippage                                   │
│                                                             │
│  5. P&L Calculator                                          │
│     - Uses FT formulas exactly                              │
│     - Tracks realized/unrealized                            │
│     - Updates on resolution                                 │
│                                                             │
│  6. Risk Manager (SIMPLE)                                   │
│     - Daily budget check                                    │
│     - Position size limit                                   │
│     - Max exposure check                                    │
│     - Circuit breaker                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Trade Sync Service (New)

**Purpose**: Mirror FT sync but execute real trades

**Location**: `/lib/live-trading/sync-service.ts`

**Responsibilities**:
1. Poll active LT strategies every minute
2. For each strategy, get its FT wallet's recent orders
3. Check if each FT order has been executed yet
4. If not, queue for execution
5. Deduplicate using `lt_seen_trades`

**Key Insight**: Don't re-fetch from Polymarket. FT already did that. Just read `ft_orders`.

```typescript
// Pseudocode
export async function syncLTStrategy(strategyId: string) {
  const strategy = await getLTStrategy(strategyId);
  const ftWallet = await getFTWallet(strategy.ft_wallet_id);
  
  // Get FT orders since our last sync
  const ftOrders = await getRecentFTOrders(ftWallet.wallet_id, strategy.last_sync_time);
  
  for (const ftOrder of ftOrders) {
    // Check if we've seen this trade
    const seen = await hasSeenTrade(strategyId, ftOrder.source_trade_id);
    if (seen) continue;
    
    // Check if already executed
    const executed = await hasExecutedTrade(strategyId, ftOrder.source_trade_id);
    if (executed) {
      await markAsSeen(strategyId, ftOrder.source_trade_id, 'already_executed');
      continue;
    }
    
    // Execute
    const result = await executeTrade(strategy, ftOrder, ftWallet);
    
    // Mark as seen
    await markAsSeen(strategyId, ftOrder.source_trade_id, result.success ? 'executed' : result.reason);
  }
  
  // Update last sync time
  await updateLastSyncTime(strategyId);
}
```

### 5.3 LT Executor (Simplified)

**Purpose**: Execute a single trade with proper error handling

**Location**: `/lib/live-trading/executor.ts` (rebuild)

**Flow**:
```
1. Risk Check (simple, clear rules)
   ↓
2. Resolve token_id (with caching!)
   ↓
3. Prepare order (reuse prepareOrderParamsForClob)
   ↓
4. Place order (reuse placeOrderCore)
   ↓
5. Poll for fill (reuse polling logic)
   ↓
6. Record results (orders + lt_orders + lt_execute_logs)
   ↓
7. Update risk state
```

**Key Changes from Current**:
- ✅ Token ID caching (don't hit API repeatedly)
- ✅ Simple risk checks (no hidden defaults)
- ✅ Proper fill rate calculation
- ✅ Slippage tracking vs FT signal price
- ✅ Comprehensive logging at each step

### 5.4 P&L Calculator (Copy FT Exactly)

**Purpose**: Calculate realized and unrealized P&L

**Location**: `/lib/live-trading/pnl-calculator.ts` (new)

**Formula (from FT)**:
```typescript
// BUY WON: payout = shares purchased * $1
// Cost: size_usd
// Profit: payout - cost = (size_usd / entry_price) - size_usd
// Simplified: size_usd * ((1 - entry_price) / entry_price)

export function calculatePnL(order: LTOrder): number {
  const cost = order.executed_size * order.executed_price; // USD spent
  
  if (order.outcome === 'WON') {
    // Shares convert to $1 each
    const payout = order.executed_size * 1.0;
    return payout - cost;
    // OR: cost * (1 - entry_price) / entry_price  [same result]
  }
  
  if (order.outcome === 'LOST') {
    return -cost; // Lost all money spent
  }
  
  // OPEN: unrealized based on current price
  if (order.outcome === 'OPEN') {
    const currentValue = order.executed_size * getCurrentPrice(order.token_id);
    return currentValue - cost;
  }
  
  return 0;
}
```

**Why This Works**:
- ✅ Matches FT exactly
- ✅ Simple, clear formulas
- ✅ No confusion between shares and USD
- ✅ Easy to verify

---

## 6. Database Design

### 6.1 Keep These Tables ✅

**No changes needed**:
- `ft_wallets` - Working perfectly
- `ft_orders` - Source of truth for FT signals
- `orders` - Core order tracking (used by manual + LT)
- `order_events_log` - Audit trail for all order attempts
- `lt_strategies` - Strategy configuration
- `lt_risk_rules` - Risk configuration
- `lt_risk_state` - Current risk state

### 6.2 Simplify lt_orders Table

**Current problems**:
- Too many columns
- Confusion between `executed_size` (shares) and `signal_size_usd` (USD)
- Redundancy with `orders` table

**New schema**:
```sql
CREATE TABLE public.lt_orders (
    -- IDs
    lt_order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    ft_order_id UUID REFERENCES public.ft_orders(order_id),  -- Link to FT signal
    order_id UUID NOT NULL REFERENCES public.orders(order_id),  -- Real order
    
    -- Source
    source_trade_id TEXT NOT NULL,  -- Deduplication key
    trader_address TEXT,
    condition_id TEXT NOT NULL,
    token_id TEXT NOT NULL,  -- CRITICAL: store token_id, don't resolve repeatedly
    
    -- FT Signal (what FT wanted)
    ft_price DECIMAL(6,4),  -- FT entry price (with slippage)
    ft_size_usd DECIMAL(10,2),  -- FT bet size in USD
    
    -- Execution (what actually happened)
    executed_price DECIMAL(6,4),  -- Actual fill price
    executed_shares DECIMAL(18,8),  -- Shares purchased
    executed_usd DECIMAL(10,2),  -- USD spent (price * shares)
    
    -- Quality Metrics
    slippage_pct DECIMAL(6,4),  -- (executed_price - ft_price) / ft_price
    fill_rate DECIMAL(5,4),  -- executed_shares / intended_shares
    latency_ms INTEGER,  -- Time from FT signal to execution
    
    -- Outcome
    outcome TEXT DEFAULT 'OPEN',  -- OPEN, WON, LOST
    pnl DECIMAL(10,2),  -- Calculated using FT formula
    
    -- Timing
    ft_signal_time TIMESTAMP WITH TIME ZONE,  -- When FT created order
    executed_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(strategy_id, source_trade_id)
);

CREATE INDEX idx_lt_orders_strategy_outcome ON public.lt_orders(strategy_id, outcome);
CREATE INDEX idx_lt_orders_condition ON public.lt_orders(condition_id);
```

### 6.3 Add lt_seen_trades Table (Same Pattern as FT)

**Purpose**: Deduplicate trades across syncs

```sql
CREATE TABLE public.lt_seen_trades (
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    source_trade_id TEXT NOT NULL,
    outcome TEXT NOT NULL,  -- 'executed', 'skipped', 'failed'
    skip_reason TEXT,  -- Why skipped (if applicable)
    seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (strategy_id, source_trade_id)
);

CREATE INDEX idx_lt_seen_trades_strategy ON public.lt_seen_trades(strategy_id, seen_at DESC);
```

### 6.4 Extend orders Table (Minimal)

**Current**:
```sql
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS lt_strategy_id TEXT REFERENCES public.lt_strategies(strategy_id),
    ADD COLUMN IF NOT EXISTS lt_order_id UUID REFERENCES public.lt_orders(lt_order_id);
```

**Keep**: This is fine. Allows linking back from orders to LT.

### 6.5 Token ID Cache Table (New)

**Purpose**: Don't resolve token_id repeatedly

```sql
CREATE TABLE public.token_id_cache (
    condition_id TEXT NOT NULL,
    token_label TEXT NOT NULL,  -- YES or NO
    token_id TEXT NOT NULL,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (condition_id, token_label)
);

CREATE INDEX idx_token_id_cache_fetched ON public.token_id_cache(fetched_at DESC);
```

---

## 7. Execution Flow

### 7.1 End-to-End Flow

```
┌───────────────────────────────────────────────────────────────────────┐
│                    LIVE TRADING EXECUTION FLOW                        │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  STEP 1: FT Sync (Every 1 min, existing cron)                        │
│  ───────────────────────────────────────────────────                 │
│  /api/cron/ft-sync                                                    │
│    → Fetch trades from Polymarket                                    │
│    → Filter by FT wallet rules                                       │
│    → Insert into ft_orders                                           │
│    → Mark in ft_seen_trades                                          │
│                                                                       │
│  STEP 2: LT Sync (Every 1 min, new cron)                             │
│  ───────────────────────────────────────────────────                 │
│  /api/cron/lt-sync                                                    │
│    → Get active LT strategies                                        │
│    → For each strategy:                                              │
│      ├─→ Get recent ft_orders for its FT wallet                      │
│      ├─→ Filter already seen (lt_seen_trades)                        │
│      ├─→ Filter already executed (lt_orders)                         │
│      └─→ Queue for execution                                         │
│                                                                       │
│  STEP 3: LT Execute (Every 30 sec, new cron)                         │
│  ───────────────────────────────────────────────────                 │
│  /api/cron/lt-execute                                                 │
│    → Get queued trades (from Step 2)                                 │
│    → For each trade:                                                 │
│      ├─→ Risk check (simple, clear)                                  │
│      ├─→ Resolve token_id (with cache)                               │
│      ├─→ Prepare order (prepareOrderParamsForClob)                   │
│      ├─→ Place order (placeOrderCore)                                │
│      ├─→ Poll for fill (250ms interval, 30s max)                     │
│      ├─→ Record results                                              │
│      │   ├─→ orders table (if filled)                                │
│      │   ├─→ lt_orders table                                         │
│      │   └─→ lt_execute_logs table                                   │
│      └─→ Mark as seen (lt_seen_trades)                               │
│                                                                       │
│  STEP 4: Status Update (Every 1 min, modified existing)              │
│  ───────────────────────────────────────────────────                 │
│  /api/cron/lt-sync-order-status                                       │
│    → Poll CLOB for PENDING orders                                    │
│    → Update fill status                                              │
│    → Calculate slippage                                              │
│    → Update lt_orders                                                │
│                                                                       │
│  STEP 5: Resolution (Every 10 min, existing)                         │
│  ───────────────────────────────────────────────────                 │
│  /api/cron/lt-resolve                                                 │
│    → Check for resolved markets                                      │
│    → Update outcome (WON/LOST)                                       │
│    → Calculate P&L (using FT formula)                                │
│    → Update risk state                                               │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### 7.2 Timing & Polling Strategy

**Current Issue**: Single cron (`/api/cron/lt-execute`) tries to do everything.

**New Approach**: Separate concerns

| Cron Job | Frequency | Purpose | Timeout |
|----------|-----------|---------|---------|
| `ft-sync` | 1 min | Fetch trades from Polymarket → ft_orders | 30s |
| `lt-sync` | 1 min | Queue FT orders for LT execution | 10s |
| `lt-execute` | 30 sec | Execute queued trades (small batches) | 45s |
| `lt-sync-order-status` | 1 min | Poll CLOB for pending orders | 30s |
| `lt-resolve` | 10 min | Resolve markets, calculate P&L | 60s |

**Why This Works**:
- ✅ Each job has single responsibility
- ✅ Fast jobs (lt-sync) run frequently
- ✅ Slow jobs (lt-execute) have time to complete
- ✅ No overlapping executions
- ✅ Clear separation of concerns

### 7.3 Detailed Execution Flow

```typescript
// /api/cron/lt-execute
export async function POST(request: Request) {
  // 1. Get all active strategies
  const strategies = await getActiveStrategies();
  
  // 2. For each strategy, get queued trades (limit 5 per run)
  for (const strategy of strategies) {
    const queuedTrades = await getQueuedTrades(strategy.strategy_id, { limit: 5 });
    
    for (const ftOrder of queuedTrades) {
      // 3. Start timing
      const startTime = Date.now();
      
      // 4. Risk check
      const riskCheck = await checkRiskRules(strategy, ftOrder);
      if (!riskCheck.allowed) {
        await logExecution(strategy, ftOrder, 'risk_blocked', riskCheck.reason);
        await markAsSeen(strategy, ftOrder, 'risk_blocked');
        continue;
      }
      
      // 5. Resolve token_id (with cache)
      const tokenId = await resolveTokenIdCached(ftOrder.condition_id, ftOrder.token_label);
      if (!tokenId) {
        await logExecution(strategy, ftOrder, 'token_resolution_failed');
        await markAsSeen(strategy, ftOrder, 'token_resolution_failed');
        continue;
      }
      
      // 6. Prepare order
      const price = ftOrder.entry_price;
      const sizeContracts = ftOrder.size / price;
      const prepared = await prepareOrderParamsForClob(tokenId, price, sizeContracts, 'BUY');
      if (!prepared) {
        await logExecution(strategy, ftOrder, 'order_prep_failed');
        await markAsSeen(strategy, ftOrder, 'order_prep_failed');
        continue;
      }
      
      // 7. Place order
      const orderResult = await placeOrderCore({
        supabase,
        userId: strategy.user_id,
        tokenId,
        price: prepared.price,
        size: prepared.size,
        side: 'BUY',
        orderType: 'IOC',  // Immediate-Or-Cancel for high fill rate
        requestId: `lt_${strategy.strategy_id}_${Date.now()}`,
        orderIntentId: randomUUID(),
        useAnyWallet: true,
        conditionId: ftOrder.condition_id,
        outcome: ftOrder.token_label,
      });
      
      if (!orderResult.success) {
        await logExecution(strategy, ftOrder, 'order_placement_failed', orderResult.evaluation.message);
        await markAsSeen(strategy, ftOrder, 'order_placement_failed');
        continue;
      }
      
      // 8. Poll for fill
      const pollResult = await pollOrderUntilTerminal(strategy.user_id, orderResult.orderId!, 30000);
      
      // 9. Calculate metrics
      const executionLatency = Date.now() - startTime;
      const slippage = (prepared.price - ftOrder.entry_price) / ftOrder.entry_price;
      const fillRate = pollResult.sizeMatched / prepared.size;
      
      // 10. Record results
      if (pollResult.sizeMatched > 0) {
        // Filled (at least partially)
        await recordLTOrder({
          strategy_id: strategy.strategy_id,
          ft_order_id: ftOrder.order_id,
          order_id: orderResult.orderId,
          source_trade_id: ftOrder.source_trade_id,
          token_id: tokenId,
          condition_id: ftOrder.condition_id,
          ft_price: ftOrder.entry_price,
          ft_size_usd: ftOrder.size,
          executed_price: prepared.price,
          executed_shares: pollResult.sizeMatched,
          executed_usd: pollResult.sizeMatched * prepared.price,
          slippage_pct: slippage,
          fill_rate: fillRate,
          latency_ms: executionLatency,
          outcome: 'OPEN',
        });
        
        await logExecution(strategy, ftOrder, 'executed', {
          order_id: orderResult.orderId,
          filled: pollResult.sizeMatched,
          latency_ms: executionLatency,
        });
      } else {
        // Not filled
        await logExecution(strategy, ftOrder, 'not_filled', {
          order_id: orderResult.orderId,
          status: pollResult.status,
        });
      }
      
      // 11. Mark as seen
      await markAsSeen(strategy, ftOrder, pollResult.sizeMatched > 0 ? 'executed' : 'not_filled');
      
      // 12. Update risk state
      if (pollResult.sizeMatched > 0) {
        await updateRiskStateAfterTrade(strategy, pollResult.sizeMatched * prepared.price);
      }
    }
  }
}
```

---

## 8. Trade Matching & Timing

### 8.1 Critical Timing Considerations

**The Challenge**: FT generates signals instantly when Polymarket trades happen. LT must execute those signals, but with real-world constraints:

1. **FT Signal Time**: When the Polymarket trader placed their trade (from `order_time`)
2. **FT Processing Time**: When FT sync captured it (within 1 minute)
3. **LT Queue Time**: When LT sync queued it (within 1 minute after FT)
4. **LT Execution Time**: When LT executed it (within 30 seconds of queuing)
5. **Fill Time**: When CLOB filled the order (0-30 seconds)

**Total Latency**: 2-3 minutes from original Polymarket trade

### 8.2 How to Match Trades

**Current Problem**: `/api/lt/execute` looks at `ft_orders` with a 24-hour lookback, but doesn't filter by what's already been processed.

**New Approach**: Use `lt_seen_trades` (same pattern as FT):

```typescript
// /api/cron/lt-sync
async function queueTradesForExecution(strategyId: string, ftWalletId: string) {
  // 1. Get last sync time for THIS strategy
  const lastSync = await getLastSyncTime(strategyId);
  
  // 2. Get FT orders since last sync (with reasonable max: 1 hour)
  const maxLookback = new Date(Date.now() - 60 * 60 * 1000);
  const minTime = lastSync > maxLookback ? lastSync : maxLookback;
  
  const ftOrders = await supabase
    .from('ft_orders')
    .select('*')
    .eq('wallet_id', ftWalletId)
    .eq('outcome', 'OPEN')
    .gte('order_time', minTime.toISOString())
    .order('order_time', { ascending: true });
  
  // 3. Filter already seen
  const seenIds = await getSeenTradeIds(strategyId, ftOrders.map(o => o.source_trade_id));
  const unseenOrders = ftOrders.filter(o => !seenIds.has(o.source_trade_id));
  
  // 4. Queue for execution (mark as 'queued' in lt_seen_trades)
  for (const order of unseenOrders) {
    await markAsSeen(strategyId, order.source_trade_id, 'queued');
  }
  
  // 5. Update last sync time to latest FT order time (not current time!)
  if (ftOrders.length > 0) {
    const latestOrderTime = ftOrders[ftOrders.length - 1].order_time;
    await updateLastSyncTime(strategyId, latestOrderTime);
  }
}
```

**Key Insights**:
- ✅ Use FT `order_time`, not `created_at` (FT might process historical trades)
- ✅ Track `last_sync_time` per strategy (not global)
- ✅ Use `lt_seen_trades` to avoid reprocessing
- ✅ Limit lookback to prevent explosion (1 hour max)

### 8.3 Slippage Handling

**Two Types of Slippage**:

1. **FT Slippage** (0.3%): Built into FT entry_price
   - FT uses: `price * 1.003` as entry price
   - This accounts for expected slippage when copying a trade

2. **LT Execution Slippage**: Actual vs intended
   - Intended: `ft_order.entry_price` (already includes FT slippage)
   - Actual: `executed_price` from CLOB
   - LT Slippage: `(executed_price - ft_order.entry_price) / ft_order.entry_price`

**Example**:
```
Polymarket trader buys at 0.50
FT captures as 0.5015 (0.50 * 1.003)
FT entry_price = 0.5015

LT executes at 0.5025 (CLOB fill price)
LT slippage = (0.5025 - 0.5015) / 0.5015 = 0.2%

Total slippage from original trade = 0.5%
```

**How to Handle**:
```typescript
// Don't add slippage twice! FT already did it.
const intendedPrice = ftOrder.entry_price;  // Already has 0.3% slippage
const maxPrice = intendedPrice * (1 + strategy.slippage_tolerance_pct / 100);

// Place limit order at maxPrice
const orderResult = await placeOrderCore({
  ...
  price: maxPrice,
  orderType: 'IOC',  // Immediate-Or-Cancel
});

// Measure actual slippage
const actualSlippage = (orderResult.actualFillPrice - intendedPrice) / intendedPrice;
```

---

## 9. Risk Management

### 9.1 Simplified Risk Rules

**Current Problem**: Too many rules, hidden defaults, confusing interactions.

**New Approach**: Three simple rules with explicit values.

```sql
CREATE TABLE public.lt_risk_rules (
    rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    
    -- Budget Limits (ONE limit, no hidden defaults)
    daily_budget_usd DECIMAL(12,2),  -- NULL = no limit
    
    -- Position Limits (ONE limit, no hidden defaults)
    max_position_size_usd DECIMAL(10,2),  -- NULL = no limit
    
    -- Exposure Limits (ONE limit, no hidden defaults)
    max_total_exposure_usd DECIMAL(12,2),  -- NULL = no limit
    
    -- Circuit Breakers (explicit)
    max_consecutive_losses INTEGER DEFAULT 5,
    max_drawdown_pct DECIMAL(5,3) DEFAULT 0.20,  -- 20%
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(strategy_id)
);
```

**Risk Check Logic**:
```typescript
export async function checkRiskRules(strategy: LTStrategy, trade: { size_usd: number }) {
  const rules = await getRiskRules(strategy.strategy_id);
  const state = await getRiskState(strategy.strategy_id);
  
  // 1. Daily budget (if set)
  if (rules.daily_budget_usd != null) {
    if (state.daily_spent_usd + trade.size_usd > rules.daily_budget_usd) {
      return {
        allowed: false,
        reason: `Daily budget exceeded: $${state.daily_spent_usd.toFixed(2)} + $${trade.size_usd.toFixed(2)} > $${rules.daily_budget_usd.toFixed(2)}`
      };
    }
  }
  
  // 2. Position size (if set)
  if (rules.max_position_size_usd != null) {
    if (trade.size_usd > rules.max_position_size_usd) {
      return {
        allowed: false,
        reason: `Position size $${trade.size_usd.toFixed(2)} exceeds max $${rules.max_position_size_usd.toFixed(2)}`
      };
    }
  }
  
  // 3. Total exposure (if set)
  if (rules.max_total_exposure_usd != null) {
    const currentExposure = await getCurrentExposure(strategy.strategy_id);
    if (currentExposure + trade.size_usd > rules.max_total_exposure_usd) {
      return {
        allowed: false,
        reason: `Total exposure $${(currentExposure + trade.size_usd).toFixed(2)} exceeds max $${rules.max_total_exposure_usd.toFixed(2)}`
      };
    }
  }
  
  // 4. Consecutive losses
  if (state.consecutive_losses >= rules.max_consecutive_losses) {
    return {
      allowed: false,
      reason: `Max ${rules.max_consecutive_losses} consecutive losses reached (circuit breaker)`
    };
  }
  
  // 5. Drawdown
  const drawdown = (state.peak_equity - state.current_equity) / state.peak_equity;
  if (drawdown > rules.max_drawdown_pct) {
    return {
      allowed: false,
      reason: `Drawdown ${(drawdown * 100).toFixed(1)}% exceeds max ${(rules.max_drawdown_pct * 100).toFixed(1)}% (circuit breaker)`
    };
  }
  
  return { allowed: true };
}
```

**Key Principles**:
- ✅ NULL = no limit (explicit, not hidden default)
- ✅ Clear error messages (tell user exactly why blocked)
- ✅ Simple logic (no complex interactions)
- ✅ Fail-safe (if check fails, block trade)

### 9.2 Risk State Tracking

```sql
CREATE TABLE public.lt_risk_state (
    state_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    
    -- Capital
    current_equity DECIMAL(12,2) NOT NULL,
    peak_equity DECIMAL(12,2) NOT NULL,
    
    -- Drawdown
    current_drawdown_pct DECIMAL(5,3) DEFAULT 0,
    consecutive_losses INTEGER DEFAULT 0,
    
    -- Daily Tracking (resets at midnight UTC)
    daily_spent_usd DECIMAL(12,2) DEFAULT 0,
    daily_reset_at DATE DEFAULT CURRENT_DATE,
    
    -- Status
    is_paused BOOLEAN DEFAULT FALSE,
    pause_reason TEXT,
    
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(strategy_id)
);
```

**Update Logic**:
```typescript
export async function updateRiskStateAfterTrade(
  strategyId: string,
  tradeSize: number,
  isWin: boolean | null = null
) {
  const state = await getRiskState(strategyId);
  
  // Reset daily if needed
  const today = new Date().toISOString().slice(0, 10);
  if (state.daily_reset_at < today) {
    state.daily_spent_usd = 0;
    state.daily_reset_at = today;
  }
  
  // Update daily spent
  state.daily_spent_usd += tradeSize;
  
  // Update equity (subtract trade cost)
  state.current_equity -= tradeSize;
  
  // Update peak
  if (state.current_equity > state.peak_equity) {
    state.peak_equity = state.current_equity;
  }
  
  // Update drawdown
  state.current_drawdown_pct = (state.peak_equity - state.current_equity) / state.peak_equity;
  
  // Update consecutive losses
  if (isWin === true) {
    state.consecutive_losses = 0;
  } else if (isWin === false) {
    state.consecutive_losses += 1;
  }
  
  await saveRiskState(strategyId, state);
}
```

---

## 10. UI/UX Requirements

### 10.1 Unified Dashboard

**Goal**: Single page for both FT and LT strategies with consistent UX.

**Location**: `/app/ft/page.tsx` (rename to `/app/strategies/page.tsx`)

**Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│  Strategies Dashboard                           [Create New] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Performance] [Compare] [Live]                             │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Strategy           Type  Balance  P&L   Trades  WR  │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │  High Conviction    FT    $1,234   +23%   45    67% │   │
│  │  Model Balanced     FT    $987    +15%   89    61%  │   │
│  │  → Live HC         LT    $2,100   +18%   12    75%  │   │
│  │  Underdog Hunter    FT    $1,456   +31%   34    71%  │   │
│  │  → Live UH         LT    $3,200   +24%   8     88%  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Legend: FT = Forward Test (virtual), LT = Live Trading    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Features**:
- ✅ Same table for FT and LT (differentiated by badge/icon)
- ✅ LT strategies indented under their FT parent
- ✅ Click strategy → detailed view (same as current FT detail page)
- ✅ Same metrics (balance, P&L, trades, win rate)
- ✅ Same controls (pause, resume, settings)

### 10.2 LT Detail View

**Extends FT detail view** (`/app/ft/[id]/page.tsx`) **with LT-specific metrics**:

**Additional Metrics**:
```
┌─────────────────────────────────────────────────────────────┐
│  Live Trading: High Conviction                              │
│  Following FT: FT_HIGH_CONVICTION                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Performance              Execution Quality                 │
│  ─────────────            ───────────────────               │
│  Balance:    $2,100       Fill Rate:       95%             │
│  P&L:        +$120 (6%)   Avg Slippage:    0.4%            │
│  Trades:     12           Avg Latency:     45s             │
│  Win Rate:   75%          Blocked:         2 (risk rules)  │
│  Sharpe:     1.2          Failed:          1 (no fill)     │
│                                                             │
│  Recent Trades                                              │
│  ─────────────                                              │
│  [Same as FT, plus execution metrics]                       │
│                                                             │
│  Trade    FT Price  Exec Price  Slippage  Fill   Latency   │
│  ───────────────────────────────────────────────────────    │
│  Market1  0.50      0.5025      0.5%      100%    42s      │
│  Market2  0.65      0.6540      0.6%      100%    38s      │
│  Market3  0.45      0.4530      0.7%      95%     51s      │
│                                                             │
│  Risk Status                                                │
│  ────────────                                               │
│  Daily Budget:   $150 / $500 (30%)                          │
│  Exposure:       $180 / $1000 (18%)                         │
│  Drawdown:       -2% / 20% (healthy)                        │
│  Circuit Breaker: OFF                                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.3 Settings Panel

**Same as FT settings** (`/app/ft/[id]/settings/page.tsx`) **plus LT-specific**:

```
┌─────────────────────────────────────────────────────────────┐
│  Strategy Settings                                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Trading Rules (from FT)                                    │
│  ─────────────────────                                      │
│  [Read-only display of FT rules]                            │
│                                                             │
│  Risk Management                                            │
│  ────────────────                                           │
│  Daily Budget:         [___] USD  [or leave blank]          │
│  Max Position Size:    [___] USD  [or leave blank]          │
│  Max Total Exposure:   [___] USD  [or leave blank]          │
│  Max Consecutive Losses: [5_]                               │
│  Max Drawdown:         [20_]%                               │
│                                                             │
│  Execution Settings                                         │
│  ───────────────────                                        │
│  Slippage Tolerance:   [0.5]%                               │
│  Order Type:           [IOC ▾] (IOC, FOK, GTC)              │
│                                                             │
│  Wallet                                                     │
│  ──────                                                     │
│  Trading Wallet:       0x1234...5678                        │
│  [Change Wallet]                                            │
│                                                             │
│  [Save Settings]                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 10.4 Logs View

**New page**: `/app/lt/logs/page.tsx`

**Purpose**: Show execution logs from `lt_execute_logs` table

```
┌─────────────────────────────────────────────────────────────┐
│  Live Trading Execution Logs                    [Auto-Refresh]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Filter: [All Strategies ▾]  [Last Hour ▾]  [All Levels ▾] │
│                                                             │
│  Time        Strategy      Level   Message                  │
│  ────────────────────────────────────────────────────────   │
│  12:34:56    Live HC       info    Trade executed: Market1  │
│  12:34:12    Live UH       warn    Risk check blocked: $150 │
│  12:33:45    Live HC       info    Order filled: 100%       │
│  12:33:22    Live UH       error   Token resolution failed  │
│                                                             │
│  [Load More]                                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 11. Testing Strategy

### 11.1 Force Test Mode

**Purpose**: Test LT execution without affecting FT or using real money.

**Implementation**:
```typescript
// Add to lt_orders table
ALTER TABLE public.lt_orders
    ADD COLUMN is_force_test BOOLEAN DEFAULT FALSE;

// Force test endpoint: POST /api/lt/force-test
export async function POST(request: Request) {
  // 1. Create a test FT order (not saved to ft_orders)
  const testFTOrder = {
    condition_id: 'test_condition_123',
    token_label: 'YES',
    entry_price: 0.50,
    size: 10.00,
    source_trade_id: `force_test_${Date.now()}`,
    // ... other fields
  };
  
  // 2. Execute through LT flow
  const result = await executeTrade(strategy, testFTOrder, ftWallet, null);
  
  // 3. Mark as force test
  if (result.success) {
    await supabase
      .from('lt_orders')
      .update({ is_force_test: true })
      .eq('lt_order_id', result.lt_order_id);
  }
  
  // 4. Return results
  return NextResponse.json({
    success: true,
    test_result: result,
    message: result.success
      ? 'Force test executed successfully'
      : `Force test failed: ${result.error}`,
  });
}
```

**UI**: Button on `/app/lt/page.tsx` to run force test.

### 11.2 Unit Tests

**Key Test Files**:
```
lib/live-trading/__tests__/
├── executor.test.ts         # Test executeTrade() flow
├── pnl-calculator.test.ts   # Test P&L formulas match FT
├── risk-manager.test.ts     # Test risk checks
└── sync-service.test.ts     # Test trade queuing
```

**Critical Test Cases**:
1. **P&L Accuracy**: Compare LT and FT P&L for same trades
2. **Risk Rules**: Verify rules block trades correctly
3. **Token Resolution**: Test caching and fallback
4. **Deduplication**: Ensure same trade not executed twice
5. **Timing**: Verify latency tracking
6. **Slippage**: Verify slippage calculation

### 11.3 Integration Tests

**Test Scenarios**:
1. **End-to-End**: FT order → LT execution → Fill → Resolution
2. **Partial Fills**: Order only partially filled
3. **No Fill**: Order not filled, retry logic
4. **Risk Block**: Trade blocked by risk rules
5. **Multiple Strategies**: Multiple LT strategies executing simultaneously

---

## 12. Migration & Cleanup Plan

### 12.1 Pre-Migration Checklist

**Before starting rebuild**:

- [ ] **Backup Database**: Full snapshot of production database
- [ ] **Pause LT**: Pause all active LT strategies
- [ ] **Document Current State**: Export current LT orders and settings
- [ ] **Test FT**: Verify FT still working perfectly
- [ ] **Review Code**: Tag current version in git

### 12.2 Migration Steps

**Phase 1: Preparation (No user impact)**

1. Create new tables:
   - `lt_seen_trades`
   - `token_id_cache`

2. Update existing tables:
   - Add new columns to `lt_orders`
   - Update indexes

3. Build new components:
   - `sync-service.ts`
   - `executor.ts` (rewritten)
   - `pnl-calculator.ts`
   - Simplified `risk-manager.ts`

4. Write unit tests

**Phase 2: Parallel Deployment (Shadow mode)**

1. Deploy new code with feature flag
2. Run new LT sync in shadow mode (don't execute, just log)
3. Compare: What would new system do vs old system?
4. Fix any discrepancies

**Phase 3: Migration (Gradual rollout)**

1. Create new LT strategies (not convert existing)
2. Test with force test
3. Test with small capital ($100)
4. Monitor for 24 hours
5. Gradually increase capital
6. Enable for all new LT strategies

**Phase 4: Cleanup (After new system proven)**

1. Migrate existing LT strategies to new format
2. Clean up old code:
   - Remove old `executor.ts` logic
   - Remove unused columns
   - Remove old cron jobs
3. Archive old data:
   - Move old `lt_orders` to `lt_orders_archive`

### 12.3 Database Cleanup

**Columns to Remove (after migration)**:
```sql
-- From lt_orders (if simplified schema adopted)
ALTER TABLE public.lt_orders
    DROP COLUMN IF EXISTS polymarket_order_id,  -- Redundant with order_id
    DROP COLUMN IF EXISTS market_slug,          -- Can get from markets table
    DROP COLUMN IF EXISTS market_title,         -- Can get from markets table
    DROP COLUMN IF EXISTS trader_address,       -- Can get from ft_orders
    DROP COLUMN IF EXISTS risk_check_passed,    -- Implied by status
    DROP COLUMN IF EXISTS risk_check_reason;    -- Move to logs
```

**Tables to Archive**:
```sql
-- Keep for historical reference but don't use
CREATE TABLE public.lt_orders_v1_archive AS
SELECT * FROM public.lt_orders WHERE created_at < '2026-02-11';

-- Then clear from main table
DELETE FROM public.lt_orders WHERE lt_order_id IN (
    SELECT lt_order_id FROM public.lt_orders_v1_archive
);
```

**Cron Jobs to Remove** (from `vercel.json`):
```json
// OLD (remove after migration)
{"path":"/api/cron/lt-execute","schedule":"* * * * *"}

// NEW (keep)
{"path":"/api/cron/lt-sync","schedule":"* * * * *"}
{"path":"/api/cron/lt-execute-v2","schedule":"*/30 * * * *"}
```

### 12.4 Rollback Plan

**If new system fails**:

1. **Immediate**: Disable new cron jobs
2. **Revert**: Rollback to previous deployment
3. **Restore**: Restore database from backup (if needed)
4. **Analyze**: Review logs to understand failure
5. **Fix**: Address issues in development
6. **Retry**: Attempt migration again with fixes

**Rollback Triggers**:
- Execution success rate < 80%
- P&L calculation errors
- Database errors
- User-reported issues

---

## 13. Success Criteria

### 13.1 Functional Requirements ✅

| Requirement | Success Metric |
|-------------|----------------|
| **Execution Reliability** | >95% of qualified FT trades execute successfully |
| **P&L Accuracy** | LT P&L matches FT P&L within 0.1% |
| **Risk Enforcement** | 100% of risk rules honored |
| **Fill Rate** | >90% average fill rate on IOC orders |
| **Latency** | <3 minutes from FT signal to execution |
| **Slippage** | <0.5% average execution slippage |
| **Deduplication** | 0 duplicate trades |

### 13.2 Non-Functional Requirements ✅

| Requirement | Success Metric |
|-------------|----------------|
| **Code Simplicity** | <1000 lines of code (vs current >2000) |
| **Maintainability** | Developer can understand flow in <30 min |
| **Observability** | Every decision logged in lt_execute_logs |
| **Performance** | Cron jobs complete within timeout |
| **Reliability** | >99.9% uptime (no crashes) |

### 13.3 User Experience ✅

| Requirement | Success Metric |
|-------------|----------------|
| **UI Consistency** | Same UX for FT and LT |
| **Clarity** | User understands why trades blocked |
| **Confidence** | User trusts execution will happen |
| **Visibility** | User can see execution quality metrics |
| **Control** | User can pause/resume/adjust settings |

### 13.4 Definition of Done ✅

A rebuild is complete when:

- [ ] All functional requirements met
- [ ] All non-functional requirements met
- [ ] All user experience requirements met
- [ ] Unit tests pass (>80% coverage)
- [ ] Integration tests pass
- [ ] Force test works reliably
- [ ] Deployed to production with monitoring
- [ ] No critical bugs for 7 days
- [ ] Documentation complete
- [ ] Old code cleaned up

---

## 14. Timeline & Milestones

### 14.1 Estimated Timeline

**Total Duration**: 3-4 weeks

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| **Phase 1: Research & Design** | 3 days | RFP, Architecture Doc, Database Schema |
| **Phase 2: Core Components** | 5 days | sync-service, executor, pnl-calculator |
| **Phase 3: Risk & Logging** | 3 days | risk-manager, lt_execute_logs integration |
| **Phase 4: UI Updates** | 3 days | Unified dashboard, detail views, settings |
| **Phase 5: Testing** | 4 days | Unit tests, integration tests, force test |
| **Phase 6: Migration** | 2 days | Database migration, cleanup, deployment |
| **Phase 7: Monitoring** | 5 days | Monitor production, fix issues, optimize |

### 14.2 Milestones

**Milestone 1: Architecture Approved** (Day 3)
- RFP reviewed and approved
- Database schema finalized
- Component design agreed

**Milestone 2: Core Components Working** (Day 8)
- sync-service queues trades correctly
- executor places and polls orders
- P&L calculation matches FT

**Milestone 3: Full Integration Complete** (Day 14)
- Risk management enforced
- Logging comprehensive
- UI updated

**Milestone 4: Testing Complete** (Day 18)
- All tests passing
- Force test working
- Performance acceptable

**Milestone 5: Production Deployment** (Day 20)
- Migrated to production
- Old code cleaned up
- Documentation complete

**Milestone 6: Validation Complete** (Day 25)
- 5 days of stable production
- Success criteria met
- User confidence restored

---

## 15. Best Practices from Reference Implementations

### 15.1 earthskyorg/Polymarket-Copy-Trading-Bot

**Repository**: https://github.com/earthskyorg/Polymarket-Copy-Trading-Bot

**Key Learnings**:

1. **Clean Architecture**:
   - Separate modules for monitoring, execution, risk management
   - Clear separation of concerns
   - Modular design for easy testing

2. **Real-Time Monitoring**:
   - Poll trader activity every 1 second
   - Detect new positions immediately
   - Minimize latency

3. **Position Sizing**:
   - Calculate proportional to capital
   - Support multiple allocation methods
   - Respect min/max bet sizes

4. **Error Handling**:
   - Comprehensive error catching
   - Retry logic for transient failures
   - Graceful degradation

5. **Multi-Trader Support**:
   - Independent config per trader
   - Concurrent execution
   - Separate tracking

**Code Patterns to Adopt**:

```typescript
// Trade monitoring pattern
async function monitorTraders() {
  const traders = await getActiveTraders();
  
  for (const trader of traders) {
    const newPositions = await getNewPositions(trader);
    
    for (const position of newPositions) {
      await executeTrade(position);
    }
  }
}

// Position sizing
function calculatePositionSize(
  traderBalance: number,
  ourBalance: number,
  traderBetSize: number,
  multiplier: number = 1.0
): number {
  const ratio = ourBalance / traderBalance;
  return traderBetSize * ratio * multiplier;
}
```

### 15.2 DanielnKim/polymarket-copy-trading-bot

**Repository**: https://github.com/DanielnKim/polymarket-copy-trading-bot

**Key Learnings**:

1. **Database Integration**:
   - MongoDB for persistent storage
   - Track all trades and positions
   - Historical analytics

2. **CLOB Client Usage**:
   - Proper authentication
   - Order creation and management
   - Status polling

3. **Price Protection**:
   - Slippage checks
   - Spread validation
   - Liquidity requirements

4. **Docker Deployment**:
   - Containerized for production
   - docker-compose for easy setup
   - Health checks included

**Code Patterns to Adopt**:

```typescript
// Order placement with protection
async function placeProtectedOrder(
  tokenId: string,
  price: number,
  size: number,
  maxSlippage: number = 0.01
) {
  // Check spread
  const orderbook = await client.getOrderbook(tokenId);
  const spread = orderbook.ask - orderbook.bid;
  if (spread > maxSlippage) {
    throw new Error('Spread too wide');
  }
  
  // Place with limit
  const limitPrice = price * (1 + maxSlippage);
  return await client.postOrder({
    tokenId,
    price: limitPrice,
    size,
    side: 'BUY'
  });
}

// Health monitoring
async function healthCheck() {
  return {
    execution_latency: await getAvgLatency(),
    fill_rate: await getAvgFillRate(),
    error_count: await getRecentErrors(),
  };
}
```

### 15.3 Common Patterns Across Both

**1. Polling Strategy**:
- Monitor trader activity frequently (1 min)
- Use reasonable timeouts
- Implement exponential backoff on errors

**2. Deduplication**:
- Track processed trades
- Use unique identifiers (transaction hash)
- Prevent double-execution

**3. Risk Management**:
- Budget limits per day/week/month
- Position size limits
- Circuit breakers for losses

**4. Logging & Monitoring**:
- Log all decisions
- Track execution metrics
- Enable post-mortem analysis

**5. Error Recovery**:
- Retry transient failures
- Graceful degradation
- Clear error messages

### 15.4 What NOT to Copy

**Avoid These Patterns**:

1. ❌ **Rebuilding CLOB Client**: Use official `@polymarket/clob-client`
2. ❌ **Custom Authentication**: Use existing Turnkey integration
3. ❌ **Polling Polymarket Directly**: Use FT as source of truth
4. ❌ **Complex Risk Models**: Keep it simple initially
5. ❌ **Over-Engineering**: Start with MVP, add features later

### 15.5 Integration Recommendations

**Adopt These Immediately**:

✅ **Token ID Caching**:
```typescript
const tokenCache = new Map<string, string>();

async function resolveTokenIdCached(conditionId: string, outcome: string) {
  const key = `${conditionId}_${outcome}`;
  
  if (tokenCache.has(key)) {
    return tokenCache.get(key);
  }
  
  const tokenId = await resolveTokenId(conditionId, outcome);
  tokenCache.set(key, tokenId);
  
  return tokenId;
}
```

✅ **Execution Metrics Tracking**:
```typescript
interface ExecutionMetrics {
  latency_ms: number;
  slippage_pct: number;
  fill_rate: number;
  success: boolean;
}

async function trackExecution(metrics: ExecutionMetrics) {
  await logMetrics(metrics);
  await updateAverages(metrics);
}
```

✅ **Health Check Endpoint**:
```typescript
// GET /api/lt/health
export async function GET() {
  const activeStrategies = await getActiveStrategiesCount();
  const recentExecutions = await getRecentExecutionsCount(24); // Last 24 hours
  const successRate = await getSuccessRate(24);
  const avgLatency = await getAvgLatency(24);
  
  return NextResponse.json({
    status: successRate > 0.9 ? 'healthy' : 'degraded',
    active_strategies: activeStrategies,
    executions_24h: recentExecutions,
    success_rate: successRate,
    avg_latency_ms: avgLatency,
  });
}
```

---

## Conclusion

This RFP outlines a comprehensive rebuild of the Live Trading system with a focus on **simplicity, reliability, and reuse of proven components**. The key insight is that LT should mirror FT as closely as possible, leveraging the same trade evaluation logic, bet sizing, and P&L calculations while adding real-world execution.

### Key Principles

1. **Reuse, Don't Rebuild**: Leverage FT logic and core trading infrastructure
2. **Simple > Complex**: Every line of code should have a clear purpose
3. **Fail-Safe**: Better to block a trade than execute incorrectly
4. **Observable**: Log everything for debugging
5. **Test Thoroughly**: Use force test before risking real money

### Next Steps

1. **Review & Approve**: Review this RFP with team
2. **Refine**: Address any questions or concerns
3. **Begin Implementation**: Start with Phase 1 (Core Components)
4. **Iterate**: Build, test, deploy incrementally
5. **Monitor**: Watch metrics closely after deployment

### Success Definition

The rebuild is successful when:
- ✅ Users trust the system to execute correctly
- ✅ P&L matches FT within 0.1%
- ✅ Risk rules are honored 100%
- ✅ Developers can understand and maintain the code
- ✅ No critical bugs for 7 days post-deployment

---

**Document Version**: 1.0  
**Last Updated**: February 11, 2026  
**Status**: Draft for Review  
**Next Review Date**: TBD
