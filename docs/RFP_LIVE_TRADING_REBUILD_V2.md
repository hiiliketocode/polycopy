# Request for Proposal: Live Trading System Rebuild V2
## Comprehensive Technical Analysis & Implementation Plan

**Version:** 2.0 (Deep Technical Analysis)  
**Date:** February 11, 2026  
**Status:** Draft for Review

---

## Executive Summary

The current Live Trading (LT) system has become unreliable and overly complex due to iterative fixes that have undermined its original design. After deep codebase analysis, I've identified **systemic architectural issues**, **cash management gaps**, and **execution reliability problems** that require a complete rebuild.

### Critical Problems Identified

1. **No Cash Management System**: LT lacks FT's proven cooldown/locked/available capital tracking
2. **Risk Rules Blocking Valid Trades**: Arbitrary exposure limits blocking $15 trades when $192 is "available"
3. **P&L Calculation Bugs**: Confusion between shares and USD (fixed in migration 20260211 but indicates systemic issues)
4. **No Sell/Exit Support**: LT can only open positions, cannot mirror trader exits
5. **Execution Timing Issues**: 2-minute cron with 24-hour lookback creates staleness and duplicates
6. **Order Type Confusion**: Using IOC (normalized to FAK) but unclear why vs FOK or GTC for different scenarios
7. **Inadequate Logging**: Console.log vs structured logs, no trace IDs, missing execution stages
8. **Token Resolution Without Caching**: Repeated expensive lookups with retries but no cache
9. **Complex Database Schema**: `lt_strategies`, `lt_orders`, `lt_risk_rules`, `lt_risk_state`, `lt_redemptions`, `lt_health_checks`, `lt_alerts` - 7 tables when FT uses 2

### What's Working (MUST PRESERVE)

- ✅ FT system architecture (2 tables, clear P&L, cooldown mechanism)
- ✅ `placeOrderCore` (CLOB integration, Evomi proxy, Cloudflare mitigation)
- ✅ `shared-logic.ts` (trade evaluation, bet sizing, filters)
- ✅ `orders` table core structure
- ✅ Token resolution logic (needs caching, but logic is sound)
- ✅ CLOB client with backoff/retry

---

## Table of Contents

1. [Deep Problem Analysis](#1-deep-problem-analysis)
2. [Reference Implementation Analysis](#2-reference-implementation-analysis)
3. [Cash Management Architecture](#3-cash-management-architecture)
4. [Execution Speed & Latency Optimization](#4-execution-speed--latency-optimization)
5. [Order Types & Fill Strategy](#5-order-types--fill-strategy)
6. [Sell/Exit Architecture](#6-sellexit-architecture)
7. [Database Schema Redesign](#7-database-schema-redesign)
8. [Comprehensive Logging Strategy](#8-comprehensive-logging-strategy)
9. [Risk Management Redesign](#9-risk-management-redesign)
10. [Cron Optimization & Timing](#10-cron-optimization--timing)
11. [Implementation Plan](#11-implementation-plan)
12. [Testing Strategy](#12-testing-strategy)

---

## 1. Deep Problem Analysis

### 1.1 Current LT Execution Flow Issues

**Screenshot Evidence: "Total exposure limit exceeded: $192.13 + $15.00 > $197.39"**

This exemplifies the core problem:
- System has `current_equity: $197.39`
- Has `$192.13` in "open exposure" (locked in positions)
- Blocking a `$15` trade because `$192.13 + $15 > $197.39`
- **But**: This calculation is wrong! It should be checking `cash_available`, not total equity

**Current Risk Check Logic (lib/live-trading/risk-manager.ts:285-296)**
```typescript
// 5. Daily Budget Check (only when a limit is configured)
const dailyBudget =
    rules.daily_budget_usd !== null
        ? rules.daily_budget_usd
        : rules.daily_budget_pct != null
            ? currentState.current_equity * rules.daily_budget_pct
            : null;

if (dailyBudget !== null && currentState.daily_spent_usd + trade.size > dailyBudget) {
    return {
        allowed: false,
        reason: `Daily budget exceeded: $${currentState.daily_spent_usd.toFixed(2)} + $${trade.size.toFixed(2)} > $${dailyBudget.toFixed(2)}`,
    };
}
```

**Problems**:
1. No `cash_available` tracking - uses `current_equity` instead
2. No cooldown mechanism - capital from resolved positions immediately available
3. `total_exposure_limit_usd` calculated as equity, not as "max open positions value"
4. Confusion between "budget" (how much I want to trade) vs "available cash" (how much I have unlocked)

### 1.2 FT Cash Management (WORKING MODEL)

**From paper-trading/portfolio.ts:57-87**
```typescript
return {
    strategyType,
    initialCapital,
    availableCash: initialCapital,      // Ready to trade
    lockedCapital: 0,                    // In open positions
    cooldownCapital: 0,                  // Resolved, waiting 3 hours
    
    openPositions: [],
    closedPositions: [],
    cooldownQueue: [],                   // [{amount: 100, availableAt: timestamp}]
    
    totalPnL: 0,
    totalTrades: 0,
    // ... stats
    
    startedAt: timestamp,
    endsAt: timestamp + duration
};
```

**Cash Flow Logic**:
```typescript
// On trade entry
availableCash -= sizeUsd;
lockedCapital += sizeUsd;

// On trade resolution (WON)
lockedCapital -= investedUsd;
cooldownCapital += exitValue;
cooldownQueue.push({
    amount: exitValue,
    availableAt: currentTime + (3 * HOUR)
});

// On trade resolution (LOST)
lockedCapital -= investedUsd;
// Lost capital does NOT go to cooldown, it's gone

// Processing cooldowns
for (const item of cooldownQueue) {
    if (currentTime >= item.availableAt) {
        availableCash += item.amount;
        cooldownCapital -= item.amount;
    }
}
```

**Key Insight**: FT tracks 3 capital buckets with explicit flows. LT only tracks `current_equity` and `daily_spent_usd`, creating confusion.

### 1.3 P&L Calculation Issues

**Bug Evidence (supabase/migrations/20260211_fix_lt_resolved_pnl.sql)**:
```sql
-- BEFORE (BUG): treated executed_size (shares) as if it were USD
pnl = actualFillPrice > 0 
    ? executed_size * (1 - actualFillPrice) / actualFillPrice  -- WRONG: executed_size is shares!
    : 0;

-- AFTER (FIX): calculate cost first
const costUsd = sharesFilled * actualFillPrice;  -- Cost in USD
pnl = actualFillPrice > 0 
    ? costUsd * (1 - actualFillPrice) / actualFillPrice 
    : 0;
```

**Root Cause**: Schema confusion between:
- `signal_size_usd` (USD amount intended)
- `executed_size` (shares filled)
- FT uses `size` as USD consistently

**FT P&L Calculation (app/api/ft/resolve/route.ts:196-206)**:
```typescript
const side = (order.side || 'BUY').toUpperCase();
const ep = order.entry_price ?? 0;
const sz = order.size ?? 0;  // SIZE IS IN USD

let pnl: number;
if (side === 'BUY') {
    if (outcome === 'WON') {
        pnl = ep > 0 ? sz * (1 - ep) / ep : 0;  // sz is USD
    } else {
        pnl = -sz;  // Lost all invested USD
    }
} else {
    if (outcome === 'WON') pnl = sz * ep;
    else pnl = -sz * (1 - ep);
}
```

**Solution**: Use same schema as FT - `size` in USD, derive shares when needed.

### 1.4 Sell/Exit Gap

**Current State**:
- FT: Only tracks BUY trades (app/api/ft/sync/route.ts:493)
- LT: Only executes BUY orders (lib/live-trading/executor.ts:237)
- Manual trades: Support SELL via ClosePositionModal
- Auto-close: Exists for copy trades (app/api/cron/check-notifications/route.ts) but NOT for LT

**Reference Bot Sell Logic (earthskyorg/postOrder.ts:320-495)**:
```typescript
// When trader sells, calculate % of position sold
const trader_sell_percent = trade.size / (user_position.size + trade.size);

// Track purchases to know what we bought
const totalBoughtTokens = previousBuys.reduce(
    (sum, buy) => sum + (buy.myBoughtSize || 0), 0
);

// Apply same % to our tracked purchases
let baseSellSize = totalBoughtTokens * trader_sell_percent;

// Apply multiplier (same as buy side)
const multiplier = getTradeMultiplier(config, trade.usdcSize);
remaining = baseSellSize * multiplier;

// Sell execution (uses orderbook best bid, FOK order type)
```

**Key Features**:
1. **Tracks purchases**: `myBoughtSize` field stores tokens bought per trade
2. **Proportional exits**: If trader sells 25% of position, bot sells 25% of tracked tokens
3. **Symmetrical multipliers**: Same tiered logic as buys
4. **Order book usage**: Gets best bid before placing sell

**Gap in Current System**: LT has NO mechanism to:
- Detect when FT trader exits position
- Store "what we bought" to know what to sell
- Calculate proportional sell size
- Execute SELL orders

### 1.5 Execution Timing & Staleness

**Current Cron Schedule (vercel.json)**:
```json
{
    "path": "/api/cron/lt-execute",
    "schedule": "*/2 * * * *"  // Every 2 minutes
}
```

**Current Execution Logic (app/api/cron/lt-execute/route.ts)**:
```typescript
// 24-hour lookback
const minOrderTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);

const { data: ftOrders } = await supabase
    .from('ft_orders')
    .select('*')
    .eq('wallet_id', strategy.ft_wallet_id)
    .gte('order_time', minOrderTime)
    .order('order_time', { ascending: true });

// Filter out already executed
const newTrades = ftOrders?.filter(
    (order) => !executedSourceIds.has(order.order_id)
) || [];
```

**Problems**:
1. **24-hour window**: Unnecessarily broad, queries 1000s of orders
2. **2-minute delay**: Trades can be 0-120 seconds stale before execution
3. **No real-time**: Unlike reference bots (~1 second detection)
4. **Vercel cold starts**: First execution after idle can take 5-10 seconds

**Reference Bot Timing (earthskyorg/tradeExecutor.ts)**:
```typescript
// 300ms polling interval
while (isRunning) {
    const trades = await readTempTrades();
    
    if (trades.length > 0) {
        await doTrading(clobClient, trades);
    }
    
    await new Promise((resolve) => setTimeout(resolve, 300));
}
```

**Execution Flow**:
1. Monitor detects trade in ~1 second (MongoDB change stream or API polling)
2. Executor checks every 300ms for new trades
3. Trade execution starts within ~1-2 seconds of detection

**Latency Sources**:
- **Detection**: Polymarket Data API delay (~500ms after on-chain)
- **Processing**: Trade qualification, position sizing (~50ms)
- **Execution**: CLOB order placement (~200-500ms)
- **Confirmation**: Order fill confirmation (FAK: immediate, GTC: variable)

**Best Practices** (from web research):
- Host on VPS near Polygon RPC (reduce network latency)
- Use WebSocket feeds where possible
- Precompute position sizing
- Keep processing pipeline lightweight
- **Sub-second execution critical for arbitrage/copy trading**

---

## 2. Reference Implementation Analysis

### 2.1 earthskyorg/Polymarket-Copy-Trading-Bot

**Architecture**:
```
tradeMonitor.ts → MongoDB → tradeExecutor.ts → CLOB
    ↓                           ↓
 (fetches activity)    (processes & executes)
```

**Key Design Patterns**:

1. **Dual Collection Model**:
   - `UserActivity` collection per trader (stores trades)
   - `UserPosition` collection per trader (stores current positions)
   - Bot marks processed trades with `bot: true, botExcutedTime: timestamp`

2. **Trade Aggregation** (optional feature):
   ```typescript
   // Combine small trades over time window
   if (totalUsdcSize < MIN_USD && timeElapsed < WINDOW_SECONDS) {
       // Buffer and wait for more
   } else if (totalUsdcSize >= MIN_USD) {
       // Execute aggregated trade
   }
   ```

3. **Copy Strategy System**:
   ```typescript
   enum CopyStrategy {
       PERCENTAGE,  // Copy X% of trader's size
       FIXED,       // Copy fixed $Y per trade
       ADAPTIVE     // Scale based on trader's order size
   }
   
   // Tiered multipliers
   interface MultiplierTier {
       min: number;      // $100
       max: number|null; // $500 or null for infinity
       multiplier: number; // 0.2x
   }
   ```

4. **Order Book Integration**:
   ```typescript
   // Always check orderbook before placing
   const orderBook = await clobClient.getOrderBook(trade.asset);
   const bestAsk = orderBook.asks[0];  // For buys
   const bestBid = orderBook.bids[0];  // For sells
   
   // Use FOK to get best execution or cancel
   const resp = await clobClient.postOrder(signedOrder, OrderType.FOK);
   ```

5. **Sell Tracking**:
   ```typescript
   // On buy: store how many tokens we bought
   await UserActivity.updateOne(
       { _id: trade._id },
       { myBoughtSize: totalBoughtTokens }
   );
   
   // On sell: look up all previous buys
   const previousBuys = await UserActivity.find({
       asset: trade.asset,
       side: 'BUY',
       myBoughtSize: { $exists: true, $gt: 0 }
   });
   ```

**What to Adopt**:
- ✅ Trade aggregation for small orders
- ✅ Tiered multiplier system
- ✅ Order book checks before execution
- ✅ FOK order type for immediate fills
- ✅ Sell tracking with `myBoughtSize`
- ✅ Processed trade marking to avoid duplicates

**What to Adapt (Not Copy)**:
- ❌ MongoDB (we use PostgreSQL/Supabase)
- ❌ Per-trader collections (we use ft_wallets)
- ❌ In-process execution loop (we use cron)

### 2.2 Key Learnings from Reference Bots

1. **Order Types**:
   - **FOK** (Fill-Or-Kill): All or nothing, best for buying exact amount
   - **FAK** (Fill-And-Kill): Partial fills OK, best when liquidity uncertain
   - **GTC** (Good-Til-Cancel): For limit orders, not for copy trading

2. **Execution Speed** (from web research):
   - Arbitrage windows: 2-3 seconds
   - Copy trading: 500ms-2s acceptable
   - Price slippage tolerance: 0.05 ($0.05 or 5¢)

3. **Position Sizing** (from earthskyorg/copyStrategy.ts):
   ```typescript
   // Step 1: Base amount
   baseAmount = traderOrderSize * (PERCENTAGE / 100);
   
   // Step 2: Apply multiplier
   finalAmount = baseAmount * getTradeMultiplier(config, traderOrderSize);
   
   // Step 3: Safety limits
   if (finalAmount > MAX_ORDER_SIZE) finalAmount = MAX_ORDER_SIZE;
   if (finalAmount > availableBalance * 0.99) finalAmount = balance * 0.99;
   if (finalAmount < MIN_ORDER_SIZE) finalAmount = 0;
   ```

---

## 3. Cash Management Architecture

### 3.1 Three-Bucket Capital Model

**Implementation**:
```sql
-- lt_strategies table additions
ALTER TABLE lt_strategies ADD COLUMN initial_capital NUMERIC(12,2) NOT NULL DEFAULT 1000.00;
ALTER TABLE lt_strategies ADD COLUMN available_cash NUMERIC(12,2) NOT NULL DEFAULT 1000.00;
ALTER TABLE lt_strategies ADD COLUMN locked_capital NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE lt_strategies ADD COLUMN cooldown_capital NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Cooldown tracking
CREATE TABLE lt_cooldown_queue (
    id BIGSERIAL PRIMARY KEY,
    strategy_id TEXT NOT NULL REFERENCES lt_strategies(strategy_id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    available_at TIMESTAMPTZ NOT NULL,
    lt_order_id TEXT REFERENCES lt_orders(lt_order_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    INDEX idx_cooldown_strategy_available (strategy_id, available_at)
);
```

**Capital Flow Functions**:
```typescript
// lib/live-trading/capital-manager.ts

interface CapitalState {
    available_cash: number;
    locked_capital: number;
    cooldown_capital: number;
}

export async function lockCapitalForTrade(
    supabase: SupabaseClient,
    strategyId: string,
    amount: number
): Promise<{ success: boolean; error?: string }> {
    // 1. Get current state
    const { data: strategy } = await supabase
        .from('lt_strategies')
        .select('available_cash')
        .eq('strategy_id', strategyId)
        .single();
    
    if (!strategy || strategy.available_cash < amount) {
        return { 
            success: false, 
            error: `Insufficient available cash: need $${amount}, have $${strategy.available_cash}` 
        };
    }
    
    // 2. Atomic update
    const { error } = await supabase
        .from('lt_strategies')
        .update({
            available_cash: strategy.available_cash - amount,
            locked_capital: supabase.raw(`locked_capital + ${amount}`)
        })
        .eq('strategy_id', strategyId)
        .eq('available_cash', strategy.available_cash);  // Optimistic concurrency
    
    if (error) {
        return { success: false, error: error.message };
    }
    
    return { success: true };
}

export async function releaseCapitalFromTrade(
    supabase: SupabaseClient,
    strategyId: string,
    investedAmount: number,
    exitValue: number,
    cooldownHours: number = 3
): Promise<void> {
    const availableAt = new Date(Date.now() + cooldownHours * 3600000);
    
    // 1. Move from locked to cooldown
    await supabase
        .from('lt_strategies')
        .update({
            locked_capital: supabase.raw(`GREATEST(0, locked_capital - ${investedAmount})`),
            cooldown_capital: supabase.raw(`cooldown_capital + ${exitValue}`)
        })
        .eq('strategy_id', strategyId);
    
    // 2. Queue release
    if (exitValue > 0) {
        await supabase
            .from('lt_cooldown_queue')
            .insert({
                strategy_id: strategyId,
                amount: exitValue,
                available_at: availableAt.toISOString()
            });
    }
}

export async function processCooldowns(
    supabase: SupabaseClient,
    strategyId: string
): Promise<number> {
    const now = new Date().toISOString();
    
    // 1. Get ready items
    const { data: ready } = await supabase
        .from('lt_cooldown_queue')
        .select('id, amount')
        .eq('strategy_id', strategyId)
        .lte('available_at', now)
        .is('released_at', null);
    
    if (!ready || ready.length === 0) return 0;
    
    const totalReleased = ready.reduce((sum, item) => sum + item.amount, 0);
    const readyIds = ready.map(item => item.id);
    
    // 2. Mark as released
    await supabase
        .from('lt_cooldown_queue')
        .update({ released_at: now })
        .in('id', readyIds);
    
    // 3. Move to available
    await supabase
        .from('lt_strategies')
        .update({
            available_cash: supabase.raw(`available_cash + ${totalReleased}`),
            cooldown_capital: supabase.raw(`GREATEST(0, cooldown_capital - ${totalReleased})`)
        })
        .eq('strategy_id', strategyId);
    
    return totalReleased;
}
```

### 3.2 Integration with Execution

**Before Trade**:
```typescript
// Process pending cooldowns first
await processCooldowns(supabase, strategyId);

// Check available cash
const { data: strategy } = await supabase
    .from('lt_strategies')
    .select('available_cash, locked_capital')
    .eq('strategy_id', strategyId)
    .single();

if (!strategy) throw new Error('Strategy not found');

if (strategy.available_cash < tradeSize) {
    await ltLog(supabase, 'warn', 
        `Insufficient cash: need $${tradeSize}, have $${strategy.available_cash} available (locked: $${strategy.locked_capital})`,
        { strategy_id: strategyId }
    );
    return { success: false, error: 'Insufficient available cash' };
}

// Lock capital
const lockResult = await lockCapitalForTrade(supabase, strategyId, tradeSize);
if (!lockResult.success) {
    return { success: false, error: lockResult.error };
}
```

**After Trade (Resolution)**:
```typescript
// Calculate exit value
const won = outcome === 'WON';
const exitValue = won ? shares * 1.0 : 0;  // $1 per share if won, $0 if lost

// Release capital to cooldown
await releaseCapitalFromTrade(
    supabase,
    strategyId,
    investedAmount,
    exitValue,
    3  // 3-hour cooldown
);

await ltLog(supabase, 'info',
    `Position resolved: ${won ? 'WON' : 'LOST'}. Released $${investedAmount} to cooldown, will receive $${exitValue} in 3 hours`,
    { strategy_id: strategyId, lt_order_id: ltOrderId }
);
```

### 3.3 Budget vs Available Cash

**Concept**:
- **Available Cash**: Physical constraint (how much money is unlocked and ready)
- **Budget**: Risk management constraint (how much I'm *willing* to trade today)

**Implementation**:
```typescript
// Check 1: Physical constraint
if (tradeSize > strategy.available_cash) {
    return { success: false, error: 'Insufficient available cash' };
}

// Check 2: Daily budget (if configured)
if (rules.daily_budget_usd && state.daily_spent_usd + tradeSize > rules.daily_budget_usd) {
    return { success: false, error: 'Daily budget exceeded' };
}

// Check 3: Position limit (if configured)
if (rules.max_position_size_usd && tradeSize > rules.max_position_size_usd) {
    return { success: false, error: 'Position size exceeds limit' };
}
```

**Key Difference**: Current system conflates these, leading to "total exposure limit exceeded" errors when plenty of cash is available.

---

## 4. Execution Speed & Latency Optimization

### 4.1 Current Bottlenecks

1. **Cron-based execution**: 0-120 second delay
2. **Token resolution**: 3 retries × exponential backoff = ~7 seconds per resolution
3. **FT orders query**: 24-hour window = 1000s of rows
4. **No connection pooling**: Cold CLOB client instantiation per cron run
5. **Vercel cold starts**: First execution after idle = 5-10 seconds

### 4.2 Optimization Strategy

**Goal**: Reduce execution latency to <5 seconds from FT signal to LT order placed.

**Approach**:

1. **Reduce Cron Interval** (1 minute instead of 2)
   ```json
   {
       "path": "/api/cron/lt-execute",
       "schedule": "* * * * *"  // Every minute
   }
   ```

2. **Narrow Time Window** (5 minutes instead of 24 hours)
   ```typescript
   // Only look at recent FT orders
   const minOrderTime = new Date(now.getTime() - 5 * 60 * 1000);
   ```

3. **Token ID Caching**
   ```typescript
   // lib/live-trading/token-cache.ts
   
   interface TokenCacheEntry {
       conditionId: string;
       outcome: string;
       tokenId: string;
       cachedAt: number;
   }
   
   const cache = new Map<string, TokenCacheEntry>();
   const CACHE_TTL_MS = 3600000;  // 1 hour
   
   export async function resolveTokenIdWithCache(
       conditionId: string,
       outcome: string
   ): Promise<string | null> {
       const key = `${conditionId}:${outcome}`;
       const entry = cache.get(key);
       
       // Check cache
       if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS) {
           return entry.tokenId;
       }
       
       // Fetch and cache
       const tokenId = await resolveTokenId(conditionId, outcome);
       if (tokenId) {
           cache.set(key, {
               conditionId,
               outcome,
               tokenId,
               cachedAt: Date.now()
           });
       }
       
       return tokenId;
   }
   ```

4. **Batch Token Resolution**
   ```typescript
   // Resolve all tokens for a batch of FT orders in parallel
   const tokenResolutions = await Promise.all(
       ftOrders.map(async (order) => {
           const tokenId = await resolveTokenIdWithCache(
               order.condition_id,
               order.token_label
           );
           return { order, tokenId };
       })
   );
   
   // Filter out failed resolutions
   const readyToExecute = tokenResolutions.filter(r => r.tokenId);
   ```

5. **Pre-warm CLOB Client** (keep alive between cron runs)
   ```typescript
   // Global client instance (Vercel supports some state between warm invocations)
   let globalClobClient: ClobClient | null = null;
   let lastClientUse = 0;
   const CLIENT_TTL_MS = 300000;  // 5 minutes
   
   export function getOrCreateClobClient(userId: string): ClobClient {
       const now = Date.now();
       if (globalClobClient && now - lastClientUse < CLIENT_TTL_MS) {
           lastClientUse = now;
           return globalClobClient;
       }
       
       globalClobClient = await getAuthedClobClientForUserAnyWallet(userId);
       lastClientUse = now;
       return globalClobClient;
   }
   ```

### 4.3 Expected Latency Breakdown

| Stage | Current | Optimized | Notes |
|-------|---------|-----------|-------|
| Cron interval | 0-120s | 0-60s | Change to 1-minute cron |
| Cold start | 5-10s | 2-3s | Pre-warm client, smaller dependencies |
| FT query | 500ms | 100ms | 5-min window instead of 24h |
| Token resolution | 7s × N | 50ms × N | Cache + parallel |
| Risk check | 200ms | 100ms | Simplified rules |
| Order placement | 500ms | 300ms | Reuse CLOB client |
| **Total** | **~15-25s** | **~3-5s** | 5× faster |

---

## 5. Order Types & Fill Strategy

### 5.1 Order Type Comparison

| Type | Behavior | Use Case | Pros | Cons |
|------|----------|----------|------|------|
| **FOK** | All-or-nothing, immediate | Exact amount needed | Predictable size | May not fill |
| **FAK** | Partial fill, cancel rest | Fast execution | Always fills something | Variable size |
| **GTC** | Remains on book | Limit orders | Best price | Slow, may not fill |
| **IOC** | Same as FAK | (alias for FAK) | - | - |

### 5.2 Current System

**place-order-core.ts:179**:
```typescript
const normalizedOrderType = orderType === 'IOC' ? 'FAK' : orderType;
```

**executor.ts:219**:
```typescript
const orderType = (strategy.order_type || 'IOC') as 'GTC' | 'FOK' | 'FAK' | 'IOC';
```

**Problem**: Using IOC/FAK by default, but:
- Reference bots use **FOK** for both buy and sell
- FAK allows partial fills, which complicates tracking
- No clear reasoning for IOC choice

### 5.3 Recommended Strategy

**Use FOK (Fill-Or-Kill) as default**:

**Reasoning**:
1. **Predictable sizing**: Know exact amount executed
2. **Faster accounting**: No partial fill tracking needed
3. **Reference bot consistency**: earthskyorg uses FOK
4. **Retry logic**: If FOK fails (not enough liquidity), can retry with adjusted size

**Fallback to FAK for large orders**:
```typescript
export async function executeTrade(
    supabase: SupabaseClient,
    strategy: LTStrategy,
    ftOrder: FTOrder,
    tokenId: string
): Promise<ExecuteResult> {
    // ... preparation ...
    
    // Default to FOK for exact fills
    let orderType: 'FOK' | 'FAK' = 'FOK';
    
    // Use FAK for large orders (>$100) where partial fills acceptable
    if (finalSize > 100) {
        orderType = 'FAK';
        await ltLog(supabase, 'info', 
            `Using FAK for large order ($${finalSize}) to maximize fill rate`,
            { strategy_id: strategy.strategy_id }
        );
    }
    
    const result = await placeOrderCore({
        supabase,
        userId: strategy.user_id,
        tokenId,
        price: finalPrice,
        size: finalSize,
        side: 'BUY',
        orderType,
        // ...
    });
    
    // Handle partial fills for FAK
    if (orderType === 'FAK' && result.filledSize < result.size) {
        await ltLog(supabase, 'warn',
            `Partial fill: requested $${result.size}, filled $${result.filledSize} (${(result.filledSize / result.size * 100).toFixed(1)}%)`,
            { strategy_id: strategy.strategy_id, order_id: result.orderId }
        );
    }
    
    return result;
}
```

### 5.4 Order Book Integration

**Current**: Token resolution, price rounding, size adjustment, then submit
**Missing**: Check order book depth before placing

**Add order book check** (optional but recommended):
```typescript
export async function prepareOrderWithOrderBook(
    clobClient: ClobClient,
    tokenId: string,
    side: 'BUY' | 'SELL',
    desiredSize: number
): Promise<{ price: number; size: number; available: number }> {
    // Fetch order book
    const orderBook = await clobClient.getOrderBook(tokenId);
    
    if (side === 'BUY') {
        // Check available liquidity on ask side
        const bestAsk = orderBook.asks[0];
        if (!bestAsk) {
            throw new Error('No asks available');
        }
        
        const availableSize = parseFloat(bestAsk.size);
        const price = parseFloat(bestAsk.price);
        
        // Adjust size if needed
        const finalSize = Math.min(desiredSize, availableSize);
        
        return { price, size: finalSize, available: availableSize };
    } else {
        // Check available liquidity on bid side
        const bestBid = orderBook.bids[0];
        if (!bestBid) {
            throw new Error('No bids available');
        }
        
        const availableSize = parseFloat(bestBid.size);
        const price = parseFloat(bestBid.price);
        
        const finalSize = Math.min(desiredSize, availableSize);
        
        return { price, size: finalSize, available: availableSize };
    }
}
```

**Benefits**:
- Know liquidity before placing
- Adjust size to match available depth
- Better execution prices
- Avoid rejected orders

---

## 6. Sell/Exit Architecture

### 6.1 Requirements

1. **Detect trader exits**: When FT order is marked WON/LOST, check if trader still holds position
2. **Track purchases**: Store shares bought per LT order
3. **Calculate proportional exits**: If trader sells 30%, sell 30% of tracked shares
4. **Execute sell orders**: Place SELL orders to CLOB
5. **Update tracking**: Reduce or clear tracked shares after sell

### 6.2 Database Schema

**Add to lt_orders**:
```sql
ALTER TABLE lt_orders ADD COLUMN shares_bought NUMERIC(18,6);  -- Tokens we purchased
ALTER TABLE lt_orders ADD COLUMN shares_remaining NUMERIC(18,6);  -- Tokens still held
```

**Track sells separately** (optional):
```sql
CREATE TABLE lt_sells (
    sell_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    strategy_id TEXT NOT NULL REFERENCES lt_strategies(strategy_id) ON DELETE CASCADE,
    lt_order_id TEXT REFERENCES lt_orders(lt_order_id),  -- Original buy order
    ft_trader_address TEXT NOT NULL,
    condition_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    
    -- Trigger
    trigger_type TEXT NOT NULL,  -- 'TRADER_EXIT', 'STOP_LOSS', 'TAKE_PROFIT', 'TIME_EXIT'
    trader_position_before NUMERIC(18,6),
    trader_position_after NUMERIC(18,6),
    trader_sell_pct NUMERIC(5,4),  -- 0.30 = 30%
    
    -- Execution
    shares_to_sell NUMERIC(18,6) NOT NULL,
    sell_price NUMERIC(12,6),
    proceeds_usd NUMERIC(12,2),
    order_id TEXT,  -- CLOB order ID
    
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    INDEX idx_lt_sells_strategy (strategy_id, created_at DESC),
    INDEX idx_lt_sells_order (lt_order_id)
);
```

### 6.3 Sell Detection Logic

**Option A: Polling Polymarket positions API** (like reference bot):
```typescript
// New cron: /api/cron/lt-check-exits (runs every 5 minutes)

export async function detectTraderExits(
    supabase: SupabaseClient
): Promise<ExitSignal[]> {
    const exits: ExitSignal[] = [];
    
    // 1. Get all open LT orders
    const { data: openOrders } = await supabase
        .from('lt_orders')
        .select('*, lt_strategies(*)')
        .eq('outcome', 'OPEN')
        .gt('shares_remaining', 0);
    
    if (!openOrders) return exits;
    
    // 2. Group by trader wallet + condition_id
    const positionMap = new Map<string, {
        traderWallet: string;
        conditionId: string;
        outcome: string;
        orders: typeof openOrders;
    }>();
    
    for (const order of openOrders) {
        const key = `${order.ft_trader_wallet}:${order.condition_id}:${order.outcome}`;
        if (!positionMap.has(key)) {
            positionMap.set(key, {
                traderWallet: order.ft_trader_wallet,
                conditionId: order.condition_id,
                outcome: order.outcome,
                orders: []
            });
        }
        positionMap.get(key)!.orders.push(order);
    }
    
    // 3. Check each trader's current position
    for (const [key, position] of positionMap) {
        try {
            // Fetch trader's current positions
            const response = await fetch(
                `https://data-api.polymarket.com/positions?user=${position.traderWallet}`,
                { cache: 'no-store' }
            );
            const positions = await response.json();
            
            // Find matching position
            const currentPosition = positions.find(
                (p: any) => p.conditionId === position.conditionId && 
                           p.outcome.toUpperCase() === position.outcome.toUpperCase()
            );
            
            // Calculate previous position size (from our records)
            const previousSize = position.orders.reduce(
                (sum, o) => sum + (o.ft_trader_position_size || 0), 
                0
            );
            
            // Detect exit
            if (!currentPosition || currentPosition.size === 0) {
                // Full exit
                exits.push({
                    traderWallet: position.traderWallet,
                    conditionId: position.conditionId,
                    outcome: position.outcome,
                    exitType: 'FULL',
                    positionBefore: previousSize,
                    positionAfter: 0,
                    exitPct: 1.0,
                    orders: position.orders
                });
            } else if (currentPosition.size < previousSize * 0.95) {
                // Partial exit (only if >5% reduction to avoid noise)
                const exitPct = (previousSize - currentPosition.size) / previousSize;
                exits.push({
                    traderWallet: position.traderWallet,
                    conditionId: position.conditionId,
                    outcome: position.outcome,
                    exitType: 'PARTIAL',
                    positionBefore: previousSize,
                    positionAfter: currentPosition.size,
                    exitPct,
                    orders: position.orders
                });
            }
        } catch (error) {
            console.error(`Failed to check position for ${key}:`, error);
        }
    }
    
    return exits;
}
```

**Option B: Watch FT resolve events** (simpler):
```typescript
// When FT order resolves, check if trader still has position
// If not, trigger sell

// In /api/cron/ft-resolve (after resolving FT orders):
for (const resolvedOrder of newlyResolved) {
    // Check if any LT strategies are copying this FT wallet
    const { data: ltStrategies } = await supabase
        .from('lt_strategies')
        .select('*')
        .eq('ft_wallet_id', resolvedOrder.wallet_id)
        .eq('is_active', true);
    
    if (!ltStrategies || ltStrategies.length === 0) continue;
    
    // Check trader's position
    const response = await fetch(
        `https://data-api.polymarket.com/positions?user=${resolvedOrder.trader_wallet}`
    );
    const positions = await response.json();
    
    const traderPosition = positions.find(
        (p: any) => p.conditionId === resolvedOrder.condition_id
    );
    
    // If trader has no position, they exited
    if (!traderPosition || traderPosition.size === 0) {
        // Trigger sell for all copying strategies
        for (const strategy of ltStrategies) {
            await triggerStrategySell(supabase, strategy.strategy_id, resolvedOrder);
        }
    }
}
```

### 6.4 Sell Execution Logic

```typescript
export async function executeSell(
    supabase: SupabaseClient,
    strategy: LTStrategy,
    exitSignal: ExitSignal
): Promise<ExecuteResult> {
    // 1. Get our open orders for this position
    const { data: ourOrders } = await supabase
        .from('lt_orders')
        .select('*')
        .eq('strategy_id', strategy.strategy_id)
        .eq('condition_id', exitSignal.conditionId)
        .eq('outcome', exitSignal.outcome)
        .eq('outcome', 'OPEN')
        .gt('shares_remaining', 0);
    
    if (!ourOrders || ourOrders.length === 0) {
        return { success: false, error: 'No open position to sell' };
    }
    
    // 2. Calculate how much to sell
    const totalSharesHeld = ourOrders.reduce(
        (sum, o) => sum + (o.shares_remaining || 0), 
        0
    );
    
    const sharesToSell = totalSharesHeld * exitSignal.exitPct;
    
    if (sharesToSell < 0.01) {
        return { success: false, error: 'Sell size too small' };
    }
    
    // 3. Resolve token ID
    const tokenId = await resolveTokenIdWithCache(
        exitSignal.conditionId,
        exitSignal.outcome
    );
    
    if (!tokenId) {
        return { success: false, error: 'Failed to resolve token ID' };
    }
    
    // 4. Get current market price (order book best bid)
    const { client } = await getAuthedClobClientForUserAnyWallet(strategy.user_id);
    const orderBook = await client.getOrderBook(tokenId);
    
    if (!orderBook.bids || orderBook.bids.length === 0) {
        return { success: false, error: 'No buyers available' };
    }
    
    const bestBid = orderBook.bids[0];
    const sellPrice = parseFloat(bestBid.price);
    const availableLiquidity = parseFloat(bestBid.size);
    
    // Adjust size to available liquidity
    const finalShares = Math.min(sharesToSell, availableLiquidity);
    
    // 5. Place SELL order
    const result = await placeOrderCore({
        supabase,
        userId: strategy.user_id,
        tokenId,
        price: sellPrice,
        size: finalShares,
        side: 'SELL',
        orderType: 'FOK',  // All-or-nothing for sells
        // ...
    });
    
    if (!result.success) {
        return result;
    }
    
    // 6. Update tracking
    const proceeds = finalShares * sellPrice;
    
    // Reduce shares_remaining proportionally across orders
    let remainingToReduce = finalShares;
    for (const order of ourOrders) {
        if (remainingToReduce <= 0) break;
        
        const reduction = Math.min(order.shares_remaining, remainingToReduce);
        
        await supabase
            .from('lt_orders')
            .update({
                shares_remaining: order.shares_remaining - reduction
            })
            .eq('lt_order_id', order.lt_order_id);
        
        remainingToReduce -= reduction;
    }
    
    // 7. Record sell
    await supabase
        .from('lt_sells')
        .insert({
            strategy_id: strategy.strategy_id,
            lt_order_id: ourOrders[0].lt_order_id,  // Link to first/main order
            ft_trader_address: exitSignal.traderWallet,
            condition_id: exitSignal.conditionId,
            outcome: exitSignal.outcome,
            trigger_type: exitSignal.exitType === 'FULL' ? 'TRADER_EXIT' : 'TRADER_PARTIAL',
            trader_position_before: exitSignal.positionBefore,
            trader_position_after: exitSignal.positionAfter,
            trader_sell_pct: exitSignal.exitPct,
            shares_to_sell: finalShares,
            sell_price: sellPrice,
            proceeds_usd: proceeds,
            order_id: result.orderId,
            executed_at: new Date().toISOString()
        });
    
    // 8. Release capital (proceeds go to cooldown)
    await releaseCapitalFromTrade(
        supabase,
        strategy.strategy_id,
        0,  // No invested amount (this is a sell)
        proceeds,
        3  // 3-hour cooldown
    );
    
    await ltLog(supabase, 'info',
        `Sold ${finalShares.toFixed(2)} shares @ $${sellPrice.toFixed(4)} = $${proceeds.toFixed(2)} proceeds`,
        { strategy_id: strategy.strategy_id, order_id: result.orderId }
    );
    
    return { success: true, orderId: result.orderId };
}
```

### 6.5 Stop-Loss & Take-Profit (Future)

**Schema**:
```sql
ALTER TABLE lt_strategies ADD COLUMN stop_loss_pct NUMERIC(5,2);  -- -10.00 = -10% stop
ALTER TABLE lt_strategies ADD COLUMN take_profit_pct NUMERIC(5,2);  -- 25.00 = +25% target
ALTER TABLE lt_strategies ADD COLUMN max_hold_hours INT;  -- Auto-exit after X hours
```

**Logic** (new cron: /api/cron/lt-check-exits):
```typescript
// Check each open position
for (const order of openOrders) {
    const currentPrice = await getCurrentPrice(order.condition_id, order.outcome);
    const pnlPct = ((currentPrice - order.entry_price) / order.entry_price) * 100;
    
    // Stop-loss
    if (strategy.stop_loss_pct && pnlPct <= strategy.stop_loss_pct) {
        await executeSell(supabase, strategy, {
            // ... sell entire position
            exitType: 'STOP_LOSS'
        });
    }
    
    // Take-profit
    if (strategy.take_profit_pct && pnlPct >= strategy.take_profit_pct) {
        await executeSell(supabase, strategy, {
            // ... sell entire position
            exitType: 'TAKE_PROFIT'
        });
    }
    
    // Time-based exit
    if (strategy.max_hold_hours) {
        const hoursHeld = (Date.now() - new Date(order.order_placed_at).getTime()) / 3600000;
        if (hoursHeld >= strategy.max_hold_hours) {
            await executeSell(supabase, strategy, {
                // ... sell entire position
                exitType: 'TIME_EXIT'
            });
        }
    }
}
```

---

## 7. Database Schema Redesign

### 7.1 Current Schema (7 tables)

```
lt_strategies         -- Strategy config
lt_orders            -- Executed trades
lt_risk_rules        -- Risk management rules
lt_risk_state        -- Current risk state
lt_redemptions       -- Resolved positions
lt_health_checks     -- Monitoring
lt_alerts            -- Issues/notifications
```

**Problems**:
- Too many tables for simple use case
- Redundant data between `lt_orders` and `orders`
- `lt_risk_rules` and `lt_risk_state` separated (should be one table)
- `lt_health_checks` and `lt_alerts` unused

### 7.2 Simplified Schema (3 tables)

```
lt_strategies        -- Strategy config + risk state + cash management
lt_orders           -- Executed trades (links to FT orders and orders table)
lt_cooldown_queue   -- Capital cooldown tracking
```

**Migration Plan**:

```sql
-- Step 1: Consolidate lt_risk_rules and lt_risk_state into lt_strategies
ALTER TABLE lt_strategies 
    -- Cash management (NEW)
    ADD COLUMN initial_capital NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
    ADD COLUMN available_cash NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
    ADD COLUMN locked_capital NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN cooldown_capital NUMERIC(12,2) NOT NULL DEFAULT 0,
    
    -- Risk rules (from lt_risk_rules)
    ADD COLUMN max_position_size_usd NUMERIC(12,2),
    ADD COLUMN max_total_exposure_usd NUMERIC(12,2),
    ADD COLUMN daily_budget_usd NUMERIC(12,2),
    ADD COLUMN max_daily_loss_usd NUMERIC(12,2),
    ADD COLUMN circuit_breaker_loss_pct NUMERIC(5,2),
    
    -- Risk state (from lt_risk_state)
    ADD COLUMN daily_spent_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN daily_loss_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
    ADD COLUMN consecutive_losses INT NOT NULL DEFAULT 0,
    ADD COLUMN peak_equity NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
    ADD COLUMN current_drawdown_pct NUMERIC(5,4) NOT NULL DEFAULT 0,
    ADD COLUMN circuit_breaker_active BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN last_reset_date DATE;

-- Step 2: Create cooldown queue
CREATE TABLE lt_cooldown_queue (
    id BIGSERIAL PRIMARY KEY,
    strategy_id TEXT NOT NULL REFERENCES lt_strategies(strategy_id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    available_at TIMESTAMPTZ NOT NULL,
    lt_order_id TEXT REFERENCES lt_orders(lt_order_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    INDEX idx_cooldown_strategy_available (strategy_id, available_at),
    INDEX idx_cooldown_released (released_at) WHERE released_at IS NULL
);

-- Step 3: Migrate existing data
UPDATE lt_strategies s
SET 
    max_position_size_usd = r.max_position_size_usd,
    max_total_exposure_usd = r.total_exposure_limit_usd,
    daily_budget_usd = r.daily_budget_usd,
    max_daily_loss_usd = r.max_daily_loss_usd,
    circuit_breaker_loss_pct = r.circuit_breaker_loss_pct,
    daily_spent_usd = st.daily_spent_usd,
    daily_loss_usd = st.daily_loss_usd,
    consecutive_losses = st.consecutive_losses,
    peak_equity = st.peak_equity,
    current_drawdown_pct = st.current_drawdown_pct,
    circuit_breaker_active = st.circuit_breaker_active,
    last_reset_date = st.last_reset_date
FROM lt_risk_rules r
JOIN lt_risk_state st ON r.strategy_id = st.strategy_id
WHERE s.strategy_id = r.strategy_id;

-- Step 4: Calculate initial cash state
UPDATE lt_strategies s
SET 
    available_cash = 1000.00 - COALESCE(
        (SELECT SUM(signal_size_usd) FROM lt_orders WHERE strategy_id = s.strategy_id AND outcome = 'OPEN'),
        0
    ),
    locked_capital = COALESCE(
        (SELECT SUM(signal_size_usd) FROM lt_orders WHERE strategy_id = s.strategy_id AND outcome = 'OPEN'),
        0
    );

-- Step 5: Clean up old tables (after verification)
-- DROP TABLE lt_risk_rules;
-- DROP TABLE lt_risk_state;
-- DROP TABLE lt_redemptions;  (move redemption tracking to lt_orders)
-- DROP TABLE lt_health_checks;  (not used)
-- DROP TABLE lt_alerts;  (not used)
```

### 7.3 Unified lt_orders Schema

**Current issues**:
- `executed_size` (shares) vs `signal_size_usd` (USD) confusion
- Missing `shares_bought` and `shares_remaining` for sell tracking
- Redundant fields between `lt_orders` and `orders` table

**Simplified schema**:
```sql
CREATE TABLE lt_orders (
    -- Identity
    lt_order_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    strategy_id TEXT NOT NULL REFERENCES lt_strategies(strategy_id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    
    -- Source
    ft_order_id TEXT NOT NULL,  -- Which FT order triggered this
    ft_wallet_id TEXT NOT NULL,
    ft_trader_wallet TEXT,
    
    -- Market
    condition_id TEXT NOT NULL,
    token_id TEXT NOT NULL,
    token_label TEXT NOT NULL,  -- YES/NO
    market_title TEXT,
    market_slug TEXT,
    
    -- Trade details
    side TEXT NOT NULL DEFAULT 'BUY',  -- BUY or SELL
    signal_price NUMERIC(12,6) NOT NULL,  -- Price from FT
    signal_size_usd NUMERIC(12,2) NOT NULL,  -- Size from FT (in USD)
    
    executed_price NUMERIC(12,6),  -- Actual fill price
    executed_size_usd NUMERIC(12,2),  -- Actual USD invested
    shares_bought NUMERIC(18,6),  -- Tokens purchased (executed_size_usd / executed_price)
    shares_remaining NUMERIC(18,6),  -- Tokens still held (reduced by sells)
    
    -- Execution
    order_id TEXT,  -- CLOB order ID (from orders table)
    status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING, FILLED, PARTIAL, REJECTED, CANCELLED
    fill_rate NUMERIC(5,4),  -- filled / requested
    slippage_bps INT,  -- (executed_price - signal_price) / signal_price * 10000
    
    -- Outcome
    outcome TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN, WON, LOST, CANCELLED
    winning_label TEXT,
    pnl NUMERIC(12,2),
    ft_pnl NUMERIC(12,2),  -- FT order's P&L for comparison
    
    -- Timestamps
    order_placed_at TIMESTAMPTZ,
    fully_filled_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata
    rejection_reason TEXT,
    risk_check_reason TEXT,
    execution_latency_ms INT,  -- Time from FT order to LT order placed
    is_force_test BOOLEAN NOT NULL DEFAULT false,
    
    -- Indexes
    INDEX idx_lt_orders_strategy_created (strategy_id, created_at DESC),
    INDEX idx_lt_orders_ft_order (ft_order_id),
    INDEX idx_lt_orders_order_id (order_id),
    INDEX idx_lt_orders_outcome (outcome) WHERE outcome = 'OPEN',
    INDEX idx_lt_orders_condition (condition_id, token_label) WHERE outcome = 'OPEN'
);
```

**Key Changes**:
1. `executed_size_usd` instead of `executed_size` (clarity)
2. `shares_bought` and `shares_remaining` for sell tracking
3. `slippage_bps` for execution quality metrics
4. `execution_latency_ms` for monitoring
5. Removed redundant fields (linked via `order_id` to `orders` table)

---

## 8. Comprehensive Logging Strategy

### 8.1 Current Logging Problems

1. **Two log systems**: Console.log vs `ltLog()` (lt_execute_logs table)
2. **No trace IDs**: Can't correlate logs for a single trade execution
3. **Missing execution stages**: Token resolution, risk checks, CLOB interaction not logged
4. **No metrics**: No latency tracking, no fill rate tracking
5. **Error swallowing**: `ltLog()` catches DB insert errors silently

### 8.2 Structured Logging Design

**Log Levels**:
- `TRACE`: Detailed execution flow (disabled in prod)
- `DEBUG`: Diagnostic information (cache hits, timing)
- `INFO`: Normal operations (trade executed, order filled)
- `WARN`: Concerning but not critical (partial fills, high slippage)
- `ERROR`: Failures (risk check failed, order rejected)

**Log Fields**:
```typescript
interface LTLogEntry {
    // Identity
    log_id: string;  // UUID
    trace_id: string;  // Correlate logs for single execution
    execution_id: string;  // Cron run ID
    
    // Context
    strategy_id?: string;
    ft_wallet_id?: string;
    ft_order_id?: string;
    lt_order_id?: string;
    order_id?: string;  // CLOB order ID
    
    // Log content
    level: 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    stage: string;  // 'FT_QUERY', 'TOKEN_RESOLVE', 'RISK_CHECK', 'ORDER_PLACE', 'ORDER_POLL'
    message: string;
    
    // Timing
    created_at: timestamp;
    elapsed_ms?: number;  // Time since trace started
    
    // Metadata
    extra?: JSONB;
}
```

**Implementation**:
```typescript
// lib/live-trading/logger.ts

interface LogContext {
    trace_id: string;
    execution_id: string;
    strategy_id?: string;
    ft_wallet_id?: string;
    trace_start_ms: number;
}

class LTLogger {
    private context: LogContext;
    
    constructor(executionId: string) {
        this.context = {
            trace_id: randomUUID(),
            execution_id: executionId,
            trace_start_ms: Date.now()
        };
    }
    
    withContext(updates: Partial<LogContext>): LTLogger {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), {
            context: { ...this.context, ...updates }
        });
    }
    
    async log(
        level: 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
        stage: string,
        message: string,
        extra?: Record<string, unknown>
    ): Promise<void> {
        const elapsed_ms = Date.now() - this.context.trace_start_ms;
        
        const entry = {
            log_id: randomUUID(),
            trace_id: this.context.trace_id,
            execution_id: this.context.execution_id,
            strategy_id: this.context.strategy_id,
            ft_wallet_id: this.context.ft_wallet_id,
            level,
            stage,
            message,
            elapsed_ms,
            extra,
            created_at: new Date().toISOString()
        };
        
        // Write to console (always)
        const icon = {
            TRACE: '🔍',
            DEBUG: '🐛',
            INFO: 'ℹ️ ',
            WARN: '⚠️ ',
            ERROR: '❌'
        }[level];
        
        console.log(
            `${icon} [${this.context.trace_id.slice(0, 8)}] [+${elapsed_ms}ms] [${stage}] ${message}`,
            extra ? JSON.stringify(extra) : ''
        );
        
        // Write to DB (async, non-blocking)
        this.persistLog(entry).catch(err => {
            console.error('[LTLogger] Failed to persist log:', err);
        });
    }
    
    private async persistLog(entry: any): Promise<void> {
        const supabase = createAdminServiceClient();
        await supabase.from('lt_execute_logs').insert(entry);
    }
    
    // Convenience methods
    trace(stage: string, message: string, extra?: Record<string, unknown>) {
        return this.log('TRACE', stage, message, extra);
    }
    
    debug(stage: string, message: string, extra?: Record<string, unknown>) {
        return this.log('DEBUG', stage, message, extra);
    }
    
    info(stage: string, message: string, extra?: Record<string, unknown>) {
        return this.log('INFO', stage, message, extra);
    }
    
    warn(stage: string, message: string, extra?: Record<string, unknown>) {
        return this.log('WARN', stage, message, extra);
    }
    
    error(stage: string, message: string, extra?: Record<string, unknown>) {
        return this.log('ERROR', stage, message, extra);
    }
}

export function createLogger(executionId: string): LTLogger {
    return new LTLogger(executionId);
}
```

**Usage**:
```typescript
// app/api/cron/lt-execute/route.ts

export async function POST(request: Request) {
    const executionId = randomUUID();
    const logger = createLogger(executionId);
    
    await logger.info('EXECUTION_START', 'Starting LT execution run');
    
    // Process each strategy
    for (const strategy of strategies) {
        const strategyLogger = logger.withContext({
            strategy_id: strategy.strategy_id,
            ft_wallet_id: strategy.ft_wallet_id
        });
        
        await strategyLogger.info('STRATEGY_START', `Processing strategy ${strategy.strategy_id}`);
        
        // Execute trades
        for (const ftOrder of ftOrders) {
            const tradeLogger = strategyLogger.withContext({
                ft_order_id: ftOrder.order_id
            });
            
            await tradeLogger.debug('TOKEN_RESOLVE_START', 'Resolving token ID');
            const tokenId = await resolveTokenIdWithCache(ftOrder.condition_id, ftOrder.token_label);
            
            if (!tokenId) {
                await tradeLogger.error('TOKEN_RESOLVE_FAILED', 'Failed to resolve token ID');
                continue;
            }
            
            await tradeLogger.debug('TOKEN_RESOLVE_SUCCESS', `Resolved to ${tokenId}`);
            
            await tradeLogger.debug('RISK_CHECK_START', 'Checking risk rules');
            const riskCheck = await checkRisk(supabase, strategy, ftOrder);
            
            if (!riskCheck.allowed) {
                await tradeLogger.warn('RISK_CHECK_FAILED', riskCheck.reason, {
                    risk_check_reason: riskCheck.reason
                });
                continue;
            }
            
            await tradeLogger.info('ORDER_PLACE_START', `Placing order: ${ftOrder.market_title}`);
            const result = await executeTrade(supabase, strategy, ftOrder, tokenId, tradeLogger);
            
            if (result.success) {
                await tradeLogger.info('ORDER_PLACE_SUCCESS', `Order placed: ${result.orderId}`);
            } else {
                await tradeLogger.error('ORDER_PLACE_FAILED', result.error);
            }
        }
    }
    
    await logger.info('EXECUTION_END', 'Completed LT execution run');
}
```

### 8.3 Log Analysis & Monitoring

**Query patterns**:
```sql
-- Get all logs for a single trade execution
SELECT * FROM lt_execute_logs
WHERE trace_id = 'abc123...'
ORDER BY created_at;

-- Get execution timing breakdown
SELECT 
    stage,
    AVG(elapsed_ms) as avg_ms,
    MAX(elapsed_ms) as max_ms,
    COUNT(*) as count
FROM lt_execute_logs
WHERE execution_id = 'xyz789...'
GROUP BY stage
ORDER BY avg_ms DESC;

-- Get failure reasons
SELECT 
    message,
    COUNT(*) as count,
    MAX(created_at) as last_seen
FROM lt_execute_logs
WHERE level = 'ERROR' 
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY message
ORDER BY count DESC;

-- Get risk check rejections
SELECT 
    strategy_id,
    extra->>'risk_check_reason' as reason,
    COUNT(*) as count
FROM lt_execute_logs
WHERE stage = 'RISK_CHECK_FAILED'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY strategy_id, reason
ORDER BY count DESC;
```

**Dashboard metrics**:
- Executions per hour
- Average execution time
- Error rate by stage
- Top risk rejection reasons
- Fill rate distribution
- Slippage distribution

---

## 9. Risk Management Redesign

### 9.1 Current Problems

**From screenshot**: "Total exposure limit exceeded: $192.13 + $15.00 > $197.39"

**Analysis**:
```typescript
// Current logic (lib/live-trading/risk-manager.ts)
if (currentState.open_exposure_usd + trade.size > rules.total_exposure_limit_usd) {
    return {
        allowed: false,
        reason: `Total exposure limit exceeded: ...`
    };
}
```

**Problems**:
1. **Wrong exposure calculation**: Should use `locked_capital`, not `current_equity`
2. **No distinction** between "exposure limit" (max open positions) and "available cash"
3. **Budget vs capital confusion**: Daily budget treated as hard limit, not preference

### 9.2 Simplified Risk Rules

**Philosophy**:
- **Cash management** handles "can I afford this?"
- **Risk rules** handle "should I take this risk?"

**Risk Checks (in order)**:

1. **Available Cash** (hard constraint):
   ```typescript
   if (tradeSize > strategy.available_cash) {
       return { allowed: false, reason: 'Insufficient available cash' };
   }
   ```

2. **Position Size Limit** (per-trade max):
   ```typescript
   if (strategy.max_position_size_usd && tradeSize > strategy.max_position_size_usd) {
       return { allowed: false, reason: 'Position size exceeds max' };
   }
   ```

3. **Total Exposure Limit** (max open positions value):
   ```typescript
   const totalExposure = strategy.locked_capital + tradeSize;
   if (strategy.max_total_exposure_usd && totalExposure > strategy.max_total_exposure_usd) {
       return { allowed: false, reason: 'Total exposure exceeds max' };
   }
   ```

4. **Daily Budget** (soft limit, resets daily):
   ```typescript
   if (strategy.daily_budget_usd && 
       strategy.daily_spent_usd + tradeSize > strategy.daily_budget_usd) {
       return { allowed: false, reason: 'Daily budget exceeded' };
   }
   ```

5. **Daily Loss Limit** (circuit breaker):
   ```typescript
   if (strategy.max_daily_loss_usd && 
       strategy.daily_loss_usd >= strategy.max_daily_loss_usd) {
       return { allowed: false, reason: 'Daily loss limit hit - circuit breaker active' };
   }
   ```

6. **Drawdown Limit** (circuit breaker):
   ```typescript
   const currentEquity = strategy.available_cash + strategy.locked_capital + strategy.cooldown_capital;
   const drawdown = (strategy.peak_equity - currentEquity) / strategy.peak_equity;
   
   if (strategy.circuit_breaker_loss_pct && 
       drawdown >= strategy.circuit_breaker_loss_pct / 100) {
       return { allowed: false, reason: 'Drawdown circuit breaker active' };
   }
   ```

**Key Changes**:
- Check available cash FIRST (physical constraint)
- Total exposure uses locked capital, not equity
- Clear separation between hard limits and soft preferences
- Descriptive error messages

### 9.3 Risk State Management

**Daily Reset** (runs at midnight UTC):
```typescript
export async function resetDailyRiskState(
    supabase: SupabaseClient
): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    await supabase
        .from('lt_strategies')
        .update({
            daily_spent_usd: 0,
            daily_loss_usd: 0,
            consecutive_losses: 0,
            last_reset_date: today
        })
        .neq('last_reset_date', today)
        .eq('is_active', true);
}
```

**Update After Trade**:
```typescript
export async function updateRiskStateAfterTrade(
    supabase: SupabaseClient,
    strategyId: string,
    investedAmount: number,
    won: boolean
): Promise<void> {
    const { data: strategy } = await supabase
        .from('lt_strategies')
        .select('*')
        .eq('strategy_id', strategyId)
        .single();
    
    if (!strategy) return;
    
    // Update daily spending
    const newDailySpent = strategy.daily_spent_usd + investedAmount;
    
    // Update daily loss (if lost)
    const newDailyLoss = won 
        ? strategy.daily_loss_usd 
        : strategy.daily_loss_usd + investedAmount;
    
    // Update consecutive losses
    const newConsecutiveLosses = won 
        ? 0 
        : strategy.consecutive_losses + 1;
    
    // Update peak equity
    const currentEquity = strategy.available_cash + strategy.locked_capital + strategy.cooldown_capital;
    const newPeakEquity = Math.max(strategy.peak_equity, currentEquity);
    
    // Calculate drawdown
    const drawdown = newPeakEquity > 0 
        ? (newPeakEquity - currentEquity) / newPeakEquity 
        : 0;
    
    // Check circuit breaker
    const circuitBreakerActive = 
        (strategy.max_daily_loss_usd && newDailyLoss >= strategy.max_daily_loss_usd) ||
        (strategy.circuit_breaker_loss_pct && drawdown >= strategy.circuit_breaker_loss_pct / 100);
    
    // Update
    await supabase
        .from('lt_strategies')
        .update({
            daily_spent_usd: newDailySpent,
            daily_loss_usd: newDailyLoss,
            consecutive_losses: newConsecutiveLosses,
            peak_equity: newPeakEquity,
            current_drawdown_pct: drawdown,
            circuit_breaker_active: circuitBreakerActive
        })
        .eq('strategy_id', strategyId);
}
```

### 9.4 Default Risk Rules

**Conservative** (for new users):
```typescript
const CONSERVATIVE_DEFAULTS = {
    max_position_size_usd: 50,      // Max $50 per trade
    max_total_exposure_usd: 500,    // Max $500 in open positions
    daily_budget_usd: 100,          // Max $100 traded per day
    max_daily_loss_usd: 50,         // Stop if lose $50 in a day
    circuit_breaker_loss_pct: 10    // Stop if down 10% from peak
};
```

**Moderate** (recommended):
```typescript
const MODERATE_DEFAULTS = {
    max_position_size_usd: 100,     // Max $100 per trade
    max_total_exposure_usd: null,   // No hard limit (use available cash)
    daily_budget_usd: 250,          // Max $250 traded per day
    max_daily_loss_usd: 100,        // Stop if lose $100 in a day
    circuit_breaker_loss_pct: 20    // Stop if down 20% from peak
};
```

**Aggressive** (for experienced traders):
```typescript
const AGGRESSIVE_DEFAULTS = {
    max_position_size_usd: null,    // No per-trade limit
    max_total_exposure_usd: null,   // No hard limit
    daily_budget_usd: null,         // No daily budget
    max_daily_loss_usd: 200,        // Stop only if lose $200 in a day
    circuit_breaker_loss_pct: 30    // Stop if down 30% from peak
};
```

---

## 10. Cron Optimization & Timing

### 10.1 Current Cron Jobs (vercel.json)

```json
{
    "crons": [
        { "path": "/api/cron/ft-sync", "schedule": "*/15 * * * *" },
        { "path": "/api/cron/ft-resolve", "schedule": "*/10 * * * *" },
        { "path": "/api/cron/lt-execute", "schedule": "*/2 * * * *" },
        { "path": "/api/cron/lt-sync-order-status", "schedule": "* * * * *" },
        { "path": "/api/cron/lt-resolve", "schedule": "*/10 * * * *" }
    ]
}
```

### 10.2 Recommended Schedule

**Phase 1: Improved timing**
```json
{
    "crons": [
        // FT system (unchanged)
        { "path": "/api/cron/ft-sync", "schedule": "*/15 * * * *" },  // Every 15 min
        { "path": "/api/cron/ft-resolve", "schedule": "*/10 * * * *" },  // Every 10 min
        
        // LT execution (faster)
        { "path": "/api/cron/lt-execute", "schedule": "* * * * *" },  // Every 1 min (was 2)
        { "path": "/api/cron/lt-sync-order-status", "schedule": "* * * * *" },  // Every 1 min
        { "path": "/api/cron/lt-resolve", "schedule": "*/10 * * * *" },  // Every 10 min
        
        // NEW: Exit detection
        { "path": "/api/cron/lt-check-exits", "schedule": "*/5 * * * *" },  // Every 5 min
        
        // NEW: Daily reset
        { "path": "/api/cron/lt-daily-reset", "schedule": "0 0 * * *" }  // Daily at midnight UTC
    ]
}
```

**Phase 2: Real-time (future)**
```json
{
    "crons": [
        // FT system (unchanged)
        { "path": "/api/cron/ft-sync", "schedule": "*/15 * * * *" },
        { "path": "/api/cron/ft-resolve", "schedule": "*/10 * * * *" },
        
        // LT execution (real-time via WebSocket or 30-second polling)
        { "path": "/api/cron/lt-execute", "schedule": "*/1 * * * *" },  // Backup cron
        // Primary: WebSocket connection to ft_orders table (Supabase Realtime)
        
        // Order status (faster)
        { "path": "/api/cron/lt-sync-order-status", "schedule": "*/1 * * * *" },
        
        // Resolution (unchanged)
        { "path": "/api/cron/lt-resolve", "schedule": "*/10 * * * *" },
        
        // Exit detection (unchanged)
        { "path": "/api/cron/lt-check-exits", "schedule": "*/5 * * * *" },
        
        // Daily reset (unchanged)
        { "path": "/api/cron/lt-daily-reset", "schedule": "0 0 * * *" }
    ]
}
```

### 10.3 Cron Cleanup

**Delete unused crons**:
- `lt-health-check` (diagnostics should be on-demand, not cron)
- `check-notifications` (only needed for manual copy trades, not LT)
- Any orphaned crons from old implementations

**Audit existing crons**:
```typescript
// scripts/audit-cron-jobs.ts

const EXPECTED_CRONS = [
    '/api/cron/ft-sync',
    '/api/cron/ft-resolve',
    '/api/cron/lt-execute',
    '/api/cron/lt-sync-order-status',
    '/api/cron/lt-resolve',
    '/api/cron/lt-check-exits',
    '/api/cron/lt-daily-reset'
];

// Check vercel.json
const vercelConfig = require('../vercel.json');
const configuredCrons = vercelConfig.crons.map(c => c.path);

// Find unexpected
const unexpected = configuredCrons.filter(c => !EXPECTED_CRONS.includes(c));
if (unexpected.length > 0) {
    console.warn('⚠️  Unexpected crons found:', unexpected);
}

// Find missing
const missing = EXPECTED_CRONS.filter(c => !configuredCrons.includes(c));
if (missing.length > 0) {
    console.warn('⚠️  Missing expected crons:', missing);
}
```

---

## 11. Implementation Plan

### Phase 1: Foundation (Week 1)

**Goals**: Establish new database schema and cash management system

1. **Database Migration**
   - [ ] Create `lt_cooldown_queue` table
   - [ ] Add cash management columns to `lt_strategies`
   - [ ] Add tracking columns to `lt_orders`
   - [ ] Migrate data from `lt_risk_rules` and `lt_risk_state`
   - [ ] Verify migration with test data

2. **Cash Management Module**
   - [ ] Create `lib/live-trading/capital-manager.ts`
   - [ ] Implement `lockCapitalForTrade()`
   - [ ] Implement `releaseCapitalFromTrade()`
   - [ ] Implement `processCooldowns()`
   - [ ] Write unit tests for capital flows

3. **Logging Infrastructure**
   - [ ] Update `lt_execute_logs` schema
   - [ ] Create `lib/live-trading/logger.ts`
   - [ ] Implement structured logger with trace IDs
   - [ ] Add log analysis queries

**Deliverable**: Cash management system working, logs structured

### Phase 2: Execution Rebuild (Week 2)

**Goals**: Rebuild LT executor with new architecture

1. **Token ID Caching**
   - [ ] Create `lib/live-trading/token-cache.ts`
   - [ ] Implement in-memory cache with TTL
   - [ ] Add cache metrics to logs

2. **Risk Manager Redesign**
   - [ ] Rewrite `lib/live-trading/risk-manager.ts`
   - [ ] Implement 6-step risk check sequence
   - [ ] Add detailed logging for each check
   - [ ] Add risk check unit tests

3. **Executor Rebuild**
   - [ ] Rewrite `lib/live-trading/executor.ts`
   - [ ] Integrate cash management
   - [ ] Integrate new logger
   - [ ] Use 5-minute lookback instead of 24-hour
   - [ ] Add execution timing metrics

4. **Order Type Strategy**
   - [ ] Change default to FOK
   - [ ] Add fallback to FAK for large orders
   - [ ] Add order book pre-check (optional)

**Deliverable**: LT executor placing trades with new system

### Phase 3: Sell/Exit Support (Week 3)

**Goals**: Add sell detection and execution

1. **Sell Detection**
   - [ ] Create `app/api/cron/lt-check-exits/route.ts`
   - [ ] Implement trader position polling
   - [ ] Detect full and partial exits
   - [ ] Add exit signal logging

2. **Sell Execution**
   - [ ] Create `lib/live-trading/sell-executor.ts`
   - [ ] Implement proportional sell logic
   - [ ] Add order book integration for sells
   - [ ] Update shares tracking after sell

3. **Database Support**
   - [ ] Create `lt_sells` table
   - [ ] Add sell tracking to UI
   - [ ] Add sell metrics to dashboard

**Deliverable**: LT can mirror trader exits

### Phase 4: Optimization (Week 4)

**Goals**: Speed and reliability improvements

1. **Cron Optimization**
   - [ ] Change lt-execute to 1-minute interval
   - [ ] Add lt-daily-reset cron
   - [ ] Audit and remove unused crons
   - [ ] Add cron monitoring

2. **Performance Tuning**
   - [ ] Add CLOB client pre-warming
   - [ ] Optimize FT order queries
   - [ ] Add parallel token resolution
   - [ ] Measure and log timing at each stage

3. **Testing**
   - [ ] Force test trades for each feature
   - [ ] Shadow mode with real FT but simulated LT
   - [ ] Compare LT vs FT P&L accuracy

**Deliverable**: LT execution <5 seconds end-to-end

### Phase 5: Cleanup & Polish (Week 5)

**Goals**: Remove old code, update UI

1. **Code Cleanup**
   - [ ] Delete old risk tables
   - [ ] Remove unused LT routes
   - [ ] Delete unused components
   - [ ] Update type definitions

2. **UI Updates**
   - [ ] Update LT strategy creation form
   - [ ] Add cash management display
   - [ ] Add sell history display
   - [ ] Add real-time execution logs view

3. **Documentation**
   - [ ] Update README with new architecture
   - [ ] Add runbook for common issues
   - [ ] Document all cron jobs
   - [ ] Add operator guide

**Deliverable**: Clean, documented, production-ready system

---

## 12. Testing Strategy

### 12.1 Unit Tests

**Cash Management**:
```typescript
describe('Capital Manager', () => {
    it('should lock capital for trade', async () => {
        // Setup: strategy with $1000 available
        // Action: lock $100
        // Assert: available = $900, locked = $100
    });
    
    it('should reject trade when insufficient funds', async () => {
        // Setup: strategy with $50 available
        // Action: try to lock $100
        // Assert: error returned
    });
    
    it('should release capital to cooldown', async () => {
        // Setup: strategy with $100 locked, trade resolved WON
        // Action: release $150 to cooldown (profit)
        // Assert: locked -= $100, cooldown += $150, queue entry created
    });
    
    it('should process cooldowns after time elapsed', async () => {
        // Setup: cooldown queue with entry ready
        // Action: process cooldowns
        // Assert: available += amount, cooldown -= amount, entry marked released
    });
});
```

**Risk Manager**:
```typescript
describe('Risk Manager', () => {
    it('should allow trade within all limits', async () => {
        // Setup: strategy with ample cash and no limits hit
        // Action: check $50 trade
        // Assert: allowed = true
    });
    
    it('should reject when daily budget exceeded', async () => {
        // Setup: strategy with daily_budget_usd = 100, daily_spent = 90
        // Action: check $20 trade
        // Assert: allowed = false, reason includes 'daily budget'
    });
    
    it('should reject when circuit breaker active', async () => {
        // Setup: strategy down 25%, circuit_breaker_loss_pct = 20
        // Action: check any trade
        // Assert: allowed = false, reason includes 'circuit breaker'
    });
});
```

### 12.2 Integration Tests

**End-to-End Execution**:
```typescript
describe('LT Execution', () => {
    it('should execute FT order to LT order', async () => {
        // Setup: Create FT wallet, strategy, add FT order
        // Action: Run LT execute cron
        // Assert:
        //   - LT order created
        //   - Order placed to CLOB (mocked)
        //   - Capital locked
        //   - Logs created
    });
    
    it('should detect and execute trader exit', async () => {
        // Setup: LT strategy with open position
        // Mock: Trader position API returns 0 size
        // Action: Run lt-check-exits cron
        // Assert:
        //   - Sell order created
        //   - Shares_remaining updated
        //   - Capital released to cooldown
    });
});
```

### 12.3 Force Test Trades

**Manual Testing Interface**:
```typescript
// app/api/lt/force-test/route.ts (already exists)

// Enhancements:
// 1. Add "force sell" endpoint
// 2. Add "trigger cooldown" endpoint
// 3. Add "simulate FT order" endpoint

export async function POST(request: Request) {
    const body = await request.json();
    const { action, strategy_id, params } = body;
    
    switch (action) {
        case 'buy':
            // Existing force test logic
            break;
            
        case 'sell':
            // NEW: Force a sell of current position
            await executeForceSell(supabase, strategy_id, params);
            break;
            
        case 'cooldown':
            // NEW: Trigger cooldown processing
            await processCooldowns(supabase, strategy_id);
            break;
            
        case 'simulate_ft':
            // NEW: Create fake FT order and execute
            await simulateFTOrder(supabase, strategy_id, params);
            break;
    }
}
```

### 12.4 Shadow Mode

**Run LT execution without placing real orders**:
```typescript
// Add to lt_strategies table
ALTER TABLE lt_strategies ADD COLUMN shadow_mode BOOLEAN NOT NULL DEFAULT false;

// In executor
if (strategy.shadow_mode) {
    // Simulate order placement
    const simulatedResult = {
        success: true,
        orderId: `SHADOW_${randomUUID()}`,
        filledSize: finalSize,
        executionPrice: finalPrice
    };
    
    await ltLog(supabase, 'info', 
        '[SHADOW MODE] Would place order',
        { simulated_result: simulatedResult }
    );
    
    // Record to lt_orders with special flag
    await supabase.from('lt_orders').insert({
        ...orderData,
        is_shadow: true,
        status: 'FILLED'
    });
} else {
    // Real execution
    const result = await placeOrderCore(...);
}
```

**Benefits**:
- Test LT logic without risking capital
- Verify P&L calculation accuracy
- Compare shadow LT performance vs actual FT

### 12.5 Success Criteria

**Reliability**:
- [ ] 95%+ execution success rate (orders placed vs signals)
- [ ] 99%+ P&L accuracy (LT matches FT within 2%)
- [ ] 0 capital accounting errors (cash + locked + cooldown = initial + realized P&L)

**Performance**:
- [ ] <5 seconds average execution latency
- [ ] <3 seconds p95 execution latency
- [ ] <10 seconds p99 execution latency

**Risk Management**:
- [ ] 0 trades executed when cash unavailable
- [ ] 100% risk rule compliance
- [ ] 0 trades larger than configured limits

**Monitoring**:
- [ ] All execution stages logged with trace IDs
- [ ] Real-time dashboard showing LT status
- [ ] Alerts for execution failures

---

## Appendix A: Key Reference Code Locations

### Working Code to Preserve
```
/lib/polymarket/place-order-core.ts        -- CLOB integration
/lib/polymarket/authed-client.ts          -- Client authentication
/lib/polymarket/order-prep.ts             -- Price/size rounding
/lib/ft-sync/shared-logic.ts              -- Trade evaluation
/lib/paper-trading/portfolio.ts           -- Cash management model
/app/api/ft/resolve/route.ts              -- P&L calculation
```

### Code to Rebuild
```
/lib/live-trading/executor.ts             -- Core LT execution
/lib/live-trading/risk-manager.ts         -- Risk checks
/app/api/lt/execute/route.ts              -- Execution cron
/app/api/cron/lt-execute/route.ts         -- Cron wrapper
```

### Code to Delete
```
/lib/live-trading/redemption-service.ts   -- Not yet implemented
/app/api/lt/health-check/                 -- Unused
supabase/migrations/*lt_health_checks*    -- Unused table
supabase/migrations/*lt_alerts*           -- Unused table
```

---

## Appendix B: Order Type Decision Tree

```
Should I use FOK or FAK?

├─ Is this a BUY order?
│  ├─ Yes: Is order size > $100?
│  │  ├─ Yes: Use FAK (partial fills OK for large orders)
│  │  └─ No: Use FOK (want exact amount)
│  └─ No: Is this a SELL order?
│     └─ Yes: Use FOK (exact position exit)
│
└─ Did FOK fail with "not enough liquidity"?
   └─ Yes: Retry with FAK or smaller size
```

---

## Appendix C: Cash Flow Diagram

```
Initial Capital: $1000
       ↓
  [Available Cash: $1000]
       ↓
   Trade Entry ($100)
       ↓
  [Available: $900] [Locked: $100]
       ↓
  Trade Resolves (WON: $130)
       ↓
  [Available: $900] [Locked: $0] [Cooldown: $130]
       ↓
   3 hours pass
       ↓
  [Available: $1030] [Locked: $0] [Cooldown: $0]
```

---

## Appendix D: Execution Timeline Comparison

**Current System**:
```
0s: FT order created
... (up to 2 minutes) ...
120s: LT cron runs
127s: FT orders queried (24h window)
134s: Token resolution (7s with retries)
134.2s: Risk check
134.7s: Order placement
135.2s: Order placed to CLOB
Total: ~135 seconds
```

**Optimized System**:
```
0s: FT order created
... (up to 1 minute) ...
60s: LT cron runs (1-min interval)
60.1s: FT orders queried (5-min window)
60.2s: Token resolution (cached, 50ms)
60.3s: Risk check (simplified)
60.6s: Order placement
60.9s: Order placed to CLOB
Total: ~61 seconds (2.2× faster)
```

**Future Real-Time System**:
```
0s: FT order created
0.5s: WebSocket notification received
0.6s: Token resolution (cached)
0.7s: Risk check
1.0s: Order placement
1.3s: Order placed to CLOB
Total: ~1.3 seconds (100× faster)
```

---

## Next Steps

1. **Review this RFP** with the team
2. **Approve database schema changes**
3. **Create GitHub issues** for each phase
4. **Start Phase 1**: Database migration and cash management
5. **Weekly check-ins** to track progress

**Estimated Timeline**: 5 weeks to production-ready system

**Risk Mitigation**:
- Shadow mode testing before real money
- Force test trades at each milestone
- Gradual rollout (one strategy → all strategies)
- Rollback plan (keep old system running in parallel)

---

**Questions?** Let's discuss specific sections before implementation begins.
