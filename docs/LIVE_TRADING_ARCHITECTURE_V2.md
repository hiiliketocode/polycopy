# Live Trading System Architecture V2
## Comprehensive Plan with Risk Management, Redemption & Best Practices

**Date:** February 8, 2026  
**Status:** Updated based on research of other Polymarket bots and industry best practices

---

## Executive Summary

This document provides a **comprehensive, production-ready architecture** for live trading that incorporates:
- ✅ Risk management (budgets, drawdown limits, circuit breakers)
- ✅ Auto-redemption for winning positions
- ✅ Confirmation of losing trades
- ✅ Comprehensive monitoring & alerting
- ✅ Best practices from other Polymarket bots
- ✅ Reuse of existing components

---

## Table of Contents

1. [Research Findings](#1-research-findings)
2. [Architecture Overview](#2-architecture-overview)
3. [Risk Management System](#3-risk-management-system)
4. [Redemption & Confirmation](#4-redemption--confirmation)
5. [Monitoring & Alerting](#5-monitoring--alerting)
6. [Database Schema Updates](#6-database-schema-updates)
7. [Component Reuse Analysis](#7-component-reuse-analysis)
8. [Gap Analysis](#8-gap-analysis)
9. [Implementation Plan](#9-implementation-plan)

---

## 1. Research Findings

### 1.1 Other Polymarket Bots (GitHub)

**Key Features Found**:
- **Novus-Tech-LLC/Polymarket-Arbitrage-Bot**: Stop-loss, take-profit, flash crash detection
- **rjykgafi/polymarket-trading-bot**: Auto take-profit, proportional sizing, whale tracking
- **dappboris-dev/polymarket-trading-bot**: Intelligent sizing, safety checks, position mirroring
- **Poly-Maker**: Real-time orderbook monitoring, position management, automated merging

**Common Patterns**:
1. **Risk Management**: Stop-loss, drawdown limits, position sizing
2. **Automation**: Auto take-profit, auto-close, auto-redeem
3. **Monitoring**: Real-time dashboards, alerts, health checks
4. **Position Management**: Tracking, merging, closing

### 1.2 Redemption Research

**Current Status**:
- ❌ **No official CLOB API `/redeem` endpoint** (open feature request #139)
- ✅ **Conditional Tokens Framework** supports `redeemPositions` for EOA wallets
- ⚠️ **Safe wallets** require custom relayer client (multi-sig execution)

**Solution**:
- Use Conditional Tokens contract directly for EOA wallets
- For Safe wallets, use relayer client or wait for official API
- Track redemption status in database
- Auto-redeem winning positions when market resolves

### 1.3 Risk Management Best Practices

**Industry Standards**:
- **Position Sizing**: 0.25-2% of equity per trade (0.5-2% typical)
- **Drawdown Limits**: Pause after 5 consecutive losses OR 5-7% equity drop
- **Circuit Breakers**: Halt on abnormal spreads, excessive slippage, latency issues
- **Daily Budgets**: Limit daily exposure (e.g., 10% of capital)
- **Volatility Adjustment**: Scale positions based on market volatility (ATR)

---

## 2. Architecture Overview

### 2.1 System Components

```
┌─────────────────────────────────────────────────────────────┐
│              Forward Testing (FT) - Reference               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ ft_wallets  │  │ ft_orders   │  │ ft_sync      │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ (mirrors logic)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Live Trading (LT) - Execution                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ lt_strategies│  │ lt_orders    │  │ lt_executor  │     │
│  │ + risk_mgmt  │  │ + execution │  │ + risk_check │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │                                  │
│                            ▼                                  │
│         ┌──────────────────────────────────┐                │
│         │  Risk Management Layer            │                │
│         │  - Budget limits                  │                │
│         │  - Drawdown control               │                │
│         │  - Circuit breakers              │                │
│         │  - Position sizing               │                │
│         └──────────────────────────────────┘                │
│                            │                                  │
│                            ▼                                  │
│                    ┌──────────────────┐                      │
│                    │ orders table     │                      │
│                    │ (real CLOB)      │                      │
│                    └──────────────────┘                      │
│                            │                                  │
│                            ▼                                  │
│         ┌──────────────────────────────────┐                │
│         │  Redemption & Confirmation        │                │
│         │  - Auto-redeem winners            │                │
│         │  - Confirm losers                │                │
│         │  - Track redemption status        │                │
│         └──────────────────────────────────┘                │
│                            │                                  │
│                            ▼                                  │
│         ┌──────────────────────────────────┐                │
│         │  Monitoring & Alerting           │                │
│         │  - Health checks                 │                │
│         │  - Performance alerts             │                │
│         │  - Error tracking                │                │
│         └──────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Key Flows

**Trade Execution Flow**:
```
FT Signal → Risk Check → Capital Check → Order Placement → Execution Tracking → Redemption
```

**Risk Management Flow**:
```
Trade Request → Budget Check → Drawdown Check → Circuit Breaker → Position Size → Execute
```

**Redemption Flow**:
```
Market Resolved → Check Outcome → Auto-Redeem (if winner) → Confirm Loss (if loser) → Update Status
```

---

## 3. Risk Management System

### 3.1 Risk Rules Schema

```sql
CREATE TABLE public.lt_risk_rules (
    rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    
    -- Budget Limits
    daily_budget_usd DECIMAL(12,2),  -- Max $ per day
    daily_budget_pct DECIMAL(5,3),   -- Max % of capital per day (e.g., 0.10 = 10%)
    weekly_budget_usd DECIMAL(12,2),
    monthly_budget_usd DECIMAL(12,2),
    
    -- Position Limits
    max_position_size_usd DECIMAL(10,2),  -- Max $ per trade
    max_position_size_pct DECIMAL(5,3),   -- Max % of capital per trade (e.g., 0.02 = 2%)
    max_total_exposure_usd DECIMAL(12,2), -- Max total open exposure
    max_total_exposure_pct DECIMAL(5,3),  -- Max % of capital in open positions
    max_positions_per_market INTEGER DEFAULT 1,  -- Max positions per market
    max_concurrent_positions INTEGER DEFAULT 20, -- Max open positions
    
    -- Drawdown Control
    max_drawdown_pct DECIMAL(5,3) DEFAULT 0.07,  -- Pause if equity drops 7%
    max_consecutive_losses INTEGER DEFAULT 5,    -- Pause after 5 losses
    drawdown_resume_threshold_pct DECIMAL(5,3), -- Resume after X% recovery
    
    -- Circuit Breakers
    max_slippage_pct DECIMAL(6,4) DEFAULT 0.01,  -- Reject if slippage > 1%
    max_spread_pct DECIMAL(6,4),                -- Reject if spread > X%
    min_liquidity_usd DECIMAL(10,2),           -- Require min liquidity
    max_latency_ms INTEGER DEFAULT 5000,        -- Reject if latency > 5s
    
    -- Volatility Adjustment
    use_volatility_adjustment BOOLEAN DEFAULT FALSE,
    volatility_lookback_days INTEGER DEFAULT 7,
    low_volatility_multiplier DECIMAL(4,2) DEFAULT 1.0,
    high_volatility_multiplier DECIMAL(4,2) DEFAULT 0.5,
    
    -- Stop Loss (optional)
    enable_stop_loss BOOLEAN DEFAULT FALSE,
    stop_loss_pct DECIMAL(5,3),  -- Exit if price drops X% from entry
    
    -- Take Profit (optional)
    enable_take_profit BOOLEAN DEFAULT FALSE,
    take_profit_pct DECIMAL(5,3),  -- Exit if price rises X% from entry
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(strategy_id)
);
```

### 3.2 Risk State Tracking

```sql
CREATE TABLE public.lt_risk_state (
    state_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    
    -- Current State
    current_equity DECIMAL(12,2) NOT NULL,
    peak_equity DECIMAL(12,2) NOT NULL,
    current_drawdown_pct DECIMAL(5,3) DEFAULT 0,
    consecutive_losses INTEGER DEFAULT 0,
    
    -- Daily Tracking
    daily_spent_usd DECIMAL(12,2) DEFAULT 0,
    daily_trades_count INTEGER DEFAULT 0,
    daily_start_equity DECIMAL(12,2),
    
    -- Weekly/Monthly Tracking
    weekly_spent_usd DECIMAL(12,2) DEFAULT 0,
    monthly_spent_usd DECIMAL(12,2) DEFAULT 0,
    
    -- Circuit Breaker State
    circuit_breaker_active BOOLEAN DEFAULT FALSE,
    circuit_breaker_reason TEXT,
    circuit_breaker_until TIMESTAMP WITH TIME ZONE,
    
    -- Status
    is_paused BOOLEAN DEFAULT FALSE,
    pause_reason TEXT,
    paused_at TIMESTAMP WITH TIME ZONE,
    
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(strategy_id)
);
```

### 3.3 Risk Check Logic

```typescript
async function checkRiskRules(
  strategy: LTStrategy,
  trade: TradeSignal,
  currentState: RiskState
): Promise<{ allowed: boolean; reason?: string }> {
  const rules = await getRiskRules(strategy.strategy_id);
  
  // 1. Circuit Breaker Check
  if (currentState.circuit_breaker_active) {
    if (currentState.circuit_breaker_until && new Date() < currentState.circuit_breaker_until) {
      return { allowed: false, reason: `Circuit breaker active: ${currentState.circuit_breaker_reason}` };
    }
    // Auto-resume if time expired
    await clearCircuitBreaker(strategy.strategy_id);
  }
  
  // 2. Pause Check
  if (currentState.is_paused) {
    return { allowed: false, reason: `Strategy paused: ${currentState.pause_reason}` };
  }
  
  // 3. Drawdown Check
  const drawdown = (currentState.peak_equity - currentState.current_equity) / currentState.peak_equity;
  if (drawdown > rules.max_drawdown_pct) {
    await pauseStrategy(strategy.strategy_id, `Drawdown ${(drawdown * 100).toFixed(1)}% exceeds limit ${(rules.max_drawdown_pct * 100).toFixed(1)}%`);
    return { allowed: false, reason: 'Drawdown limit exceeded' };
  }
  
  // 4. Consecutive Losses Check
  if (currentState.consecutive_losses >= rules.max_consecutive_losses) {
    await pauseStrategy(strategy.strategy_id, `${currentState.consecutive_losses} consecutive losses`);
    return { allowed: false, reason: 'Max consecutive losses reached' };
  }
  
  // 5. Daily Budget Check
  const dailyBudget = rules.daily_budget_usd ?? (currentState.current_equity * (rules.daily_budget_pct ?? 0.10));
  if (currentState.daily_spent_usd + trade.size > dailyBudget) {
    return { allowed: false, reason: 'Daily budget exceeded' };
  }
  
  // 6. Position Size Check
  const maxPositionSize = rules.max_position_size_usd ?? (currentState.current_equity * (rules.max_position_size_pct ?? 0.02));
  if (trade.size > maxPositionSize) {
    return { allowed: false, reason: `Position size $${trade.size} exceeds max $${maxPositionSize}` };
  }
  
  // 7. Total Exposure Check
  const currentExposure = await getCurrentExposure(strategy.strategy_id);
  const maxExposure = rules.max_total_exposure_usd ?? (currentState.current_equity * (rules.max_total_exposure_pct ?? 0.50));
  if (currentExposure + trade.size > maxExposure) {
    return { allowed: false, reason: 'Total exposure limit exceeded' };
  }
  
  // 8. Concurrent Positions Check
  const openPositions = await getOpenPositionsCount(strategy.strategy_id);
  if (openPositions >= rules.max_concurrent_positions) {
    return { allowed: false, reason: `Max ${rules.max_concurrent_positions} concurrent positions` };
  }
  
  // 9. Market-Specific Check
  const positionsInMarket = await getPositionsInMarket(strategy.strategy_id, trade.condition_id);
  if (positionsInMarket >= rules.max_positions_per_market) {
    return { allowed: false, reason: 'Already have position in this market' };
  }
  
  // 10. Slippage Check (pre-order)
  const estimatedSlippage = await estimateSlippage(trade);
  if (estimatedSlippage > rules.max_slippage_pct) {
    return { allowed: false, reason: `Estimated slippage ${(estimatedSlippage * 100).toFixed(2)}% exceeds limit` };
  }
  
  // 11. Spread Check
  const spread = await getMarketSpread(trade.condition_id);
  if (rules.max_spread_pct && spread > rules.max_spread_pct) {
    return { allowed: false, reason: `Spread ${(spread * 100).toFixed(2)}% exceeds limit` };
  }
  
  // 12. Liquidity Check
  if (rules.min_liquidity_usd) {
    const liquidity = await getMarketLiquidity(trade.condition_id);
    if (liquidity < rules.min_liquidity_usd) {
      return { allowed: false, reason: 'Insufficient market liquidity' };
    }
  }
  
  return { allowed: true };
}
```

---

## 4. Redemption & Confirmation

### 4.1 Redemption Schema

```sql
CREATE TABLE public.lt_redemptions (
    redemption_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lt_order_id UUID NOT NULL REFERENCES public.lt_orders(lt_order_id),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    order_id UUID NOT NULL REFERENCES public.orders(order_id),
    
    -- Market Resolution
    condition_id TEXT NOT NULL,
    market_resolved_at TIMESTAMP WITH TIME ZONE,
    winning_outcome TEXT,  -- YES or NO
    user_outcome TEXT,     -- What we bet on
    
    -- Redemption Details
    redemption_type TEXT NOT NULL,  -- 'WINNER' (auto-redeem) or 'LOSER' (confirm)
    redemption_status TEXT DEFAULT 'PENDING',  -- PENDING, REDEEMING, REDEEMED, FAILED
    redemption_tx_hash TEXT,
    redemption_amount_usd DECIMAL(10,2),
    
    -- Attempts
    redemption_attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    
    -- Timing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    redeemed_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(lt_order_id)
);

CREATE INDEX idx_lt_redemptions_strategy_status ON public.lt_redemptions(strategy_id, redemption_status);
CREATE INDEX idx_lt_redemptions_pending ON public.lt_redemptions(redemption_status) WHERE redemption_status = 'PENDING';
```

### 4.2 Redemption Implementation

**For EOA Wallets** (Direct Contract Call):
```typescript
import { ethers } from 'ethers';
import { ConditionalTokens } from '@polymarket/conditional-tokens';

async function redeemWinningPosition(
  walletAddress: string,
  conditionId: string,
  outcomeIndex: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    const signer = await getSignerForWallet(walletAddress); // Your wallet management
    
    const conditionalTokens = new ethers.Contract(
      CONDITIONAL_TOKENS_ADDRESS,
      CONDITIONAL_TOKENS_ABI,
      signer
    );
    
    // Get position balance
    const collectionId = getCollectionId(conditionId, outcomeIndex);
    const balance = await conditionalTokens.balanceOf(walletAddress, collectionId);
    
    if (balance.eq(0)) {
      return { success: false, error: 'No position to redeem' };
    }
    
    // Redeem
    const tx = await conditionalTokens.redeemPositions(
      conditionId,
      [outcomeIndex],
      [balance]
    );
    
    const receipt = await tx.wait();
    
    return { success: true, txHash: receipt.transactionHash };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
```

**For Safe Wallets** (Relayer Client):
```typescript
// Use Safe SDK or relayer client
// This requires Safe-specific implementation
// May need to wait for official CLOB API endpoint
```

### 4.3 Auto-Redemption Flow

```typescript
async function processRedemptions() {
  // Get resolved markets with pending redemptions
  const pendingRedemptions = await getPendingRedemptions();
  
  for (const redemption of pendingRedemptions) {
    const order = await getLTOrder(redemption.lt_order_id);
    const strategy = await getStrategy(redemption.strategy_id);
    
    // Check if winner
    const isWinner = redemption.winning_outcome === redemption.user_outcome;
    
    if (isWinner && redemption.redemption_type === 'WINNER') {
      // Auto-redeem
      const result = await redeemWinningPosition(
        strategy.wallet_address,
        redemption.condition_id,
        getOutcomeIndex(redemption.user_outcome)
      );
      
      if (result.success) {
        await updateRedemption(redemption.redemption_id, {
          redemption_status: 'REDEEMED',
          redemption_tx_hash: result.txHash,
          redeemed_at: new Date().toISOString()
        });
      } else {
        await updateRedemption(redemption.redemption_id, {
          redemption_attempts: redemption.redemption_attempts + 1,
          last_attempt_at: new Date().toISOString(),
          last_error: result.error
        });
      }
    } else if (!isWinner && redemption.redemption_type === 'LOSER') {
      // Confirm loss (just mark as confirmed, no transaction needed)
      await updateRedemption(redemption.redemption_id, {
        redemption_status: 'REDEEMED',  // Or 'CONFIRMED'
        redeemed_at: new Date().toISOString()
      });
    }
  }
}
```

---

## 5. Monitoring & Alerting

### 5.1 Health Check Schema

```sql
CREATE TABLE public.lt_health_checks (
    check_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT NOT NULL REFERENCES public.lt_strategies(strategy_id),
    
    -- Check Type
    check_type TEXT NOT NULL,  -- 'EXECUTION', 'REDEMPTION', 'RISK', 'SYSTEM'
    check_status TEXT NOT NULL,  -- 'HEALTHY', 'WARNING', 'CRITICAL'
    
    -- Metrics
    execution_latency_ms INTEGER,
    fill_rate DECIMAL(5,4),
    rejection_rate DECIMAL(5,4),
    slippage_avg_pct DECIMAL(6,4),
    error_count INTEGER DEFAULT 0,
    
    -- Timestamps
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Details
    details JSONB
);

CREATE INDEX idx_lt_health_strategy_time ON public.lt_health_checks(strategy_id, checked_at DESC);
CREATE INDEX idx_lt_health_status ON public.lt_health_checks(check_status) WHERE check_status IN ('WARNING', 'CRITICAL');
```

### 5.2 Alert Schema

```sql
CREATE TABLE public.lt_alerts (
    alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id TEXT REFERENCES public.lt_strategies(strategy_id),
    
    -- Alert Details
    alert_type TEXT NOT NULL,  -- 'DRAWDOWN', 'CIRCUIT_BREAKER', 'ERROR', 'PERFORMANCE'
    alert_severity TEXT NOT NULL,  -- 'INFO', 'WARNING', 'CRITICAL'
    alert_title TEXT NOT NULL,
    alert_message TEXT NOT NULL,
    
    -- Status
    alert_status TEXT DEFAULT 'ACTIVE',  -- ACTIVE, ACKNOWLEDGED, RESOLVED
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    
    -- Notification
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_channels TEXT[],  -- ['email', 'slack', 'telegram']
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_lt_alerts_strategy_status ON public.lt_alerts(strategy_id, alert_status);
CREATE INDEX idx_lt_alerts_active ON public.lt_alerts(alert_status, alert_severity) WHERE alert_status = 'ACTIVE';
```

### 5.3 Monitoring Endpoints

```typescript
// GET /api/lt/strategies/[id]/health
// Returns current health status

// GET /api/lt/strategies/[id]/alerts
// Returns active alerts

// POST /api/lt/strategies/[id]/alerts/[id]/acknowledge
// Acknowledge an alert

// GET /api/lt/monitoring/dashboard
// Overall system health dashboard
```

---

## 6. Database Schema Updates

### 6.1 Extended lt_strategies

```sql
ALTER TABLE public.lt_strategies
  ADD COLUMN IF NOT EXISTS risk_rules_id UUID REFERENCES public.lt_risk_rules(rule_id),
  ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'HEALTHY',
  ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMP WITH TIME ZONE;
```

### 6.2 Extended lt_orders

```sql
ALTER TABLE public.lt_orders
  ADD COLUMN IF NOT EXISTS risk_check_passed BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS risk_check_reason TEXT,
  ADD COLUMN IF NOT EXISTS redemption_id UUID REFERENCES public.lt_redemptions(redemption_id);
```

---

## 7. Component Reuse Analysis

### 7.1 Existing Components to Reuse

| Component | Location | Reuse For |
|-----------|----------|-----------|
| **Notification System** | `app/api/cron/check-notifications` | Alert system, redemption notifications |
| **Auto-Close Logic** | `app/api/cron/check-notifications` | Stop-loss, take-profit |
| **Order Placement** | `app/api/polymarket/orders/place` | LT order execution |
| **Order Refresh** | `app/api/polymarket/orders/refresh` | Fill tracking |
| **Position Tracking** | `app/api/portfolio/stats` | Exposure calculation |
| **P&L Calculation** | `app/api/portfolio/stats` | Performance tracking |
| **Market Resolution** | `app/api/ft/resolve` | Redemption triggers |

### 7.2 New Components Needed

1. **Risk Management Service** - Budget, drawdown, circuit breaker checks
2. **Redemption Service** - Auto-redeem winners, confirm losers
3. **Health Monitoring** - System health checks, metrics collection
4. **Alert Service** - Alert generation, notification delivery
5. **LT Executor** - Main execution engine (reuses FT sync logic)

---

## 8. Gap Analysis

### 8.1 Missing Features

| Feature | Status | Priority |
|---------|--------|----------|
| **Risk Management** | ❌ Missing | P0 |
| **Auto-Redemption** | ❌ Missing | P0 |
| **Confirmation of Losses** | ❌ Missing | P0 |
| **Circuit Breakers** | ❌ Missing | P0 |
| **Drawdown Limits** | ❌ Missing | P0 |
| **Daily Budgets** | ❌ Missing | P0 |
| **Health Monitoring** | ❌ Missing | P1 |
| **Alert System** | ⚠️ Partial (notifications exist) | P1 |
| **Stop-Loss** | ⚠️ Partial (auto-close exists) | P1 |
| **Take-Profit** | ⚠️ Partial (auto-close exists) | P1 |

### 8.2 Existing Features to Enhance

1. **Notification System**: Extend for LT-specific alerts
2. **Auto-Close**: Enhance for stop-loss/take-profit
3. **Order Placement**: Add risk checks before placement
4. **Position Tracking**: Add exposure limits

---

## 9. Implementation Plan

### Phase 1: Risk Management (Week 1-2)
- [ ] Create `lt_risk_rules` table
- [ ] Create `lt_risk_state` table
- [ ] Build risk check service
- [ ] Integrate into LT executor
- [ ] Add circuit breaker logic

### Phase 2: Redemption (Week 2-3)
- [ ] Create `lt_redemptions` table
- [ ] Build redemption service (EOA wallets)
- [ ] Integrate with market resolution
- [ ] Add auto-redemption cron
- [ ] Add confirmation logic

### Phase 3: Monitoring (Week 3-4)
- [ ] Create `lt_health_checks` table
- [ ] Create `lt_alerts` table
- [ ] Build health check service
- [ ] Build alert service
- [ ] Create monitoring dashboard

### Phase 4: Integration (Week 4-5)
- [ ] Integrate risk checks into executor
- [ ] Integrate redemption into resolver
- [ ] Add monitoring to all services
- [ ] Create admin UI

### Phase 5: Testing (Week 5-6)
- [ ] Test with small capital
- [ ] Test risk limits
- [ ] Test redemption flow
- [ ] Test monitoring & alerts

---

**End of Architecture V2**
