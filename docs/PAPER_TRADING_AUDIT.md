# Paper Trading Framework Audit

## Executive Summary

This document outlines the audit findings and recommended fixes for the paper trading backtest system to ensure it can withstand third-party scrutiny.

## Current Issues

### 1. Value Score Calculation Mismatch

**Problem**: The paper trading system uses a different value score than the production PolyPredict V10 system.

**PolyPredict V10 Value Score** (production - `PolyPredictBadge.tsx`):
```
Value Score = Edge Score (0-50) + Signal Score (0-50)

Edge Score = 25 + (edge_pct × 2.5)
  - Edge -10% → Score 0
  - Edge 0% → Score 25  
  - Edge +10% → Score 50

Signal Score (from V10 features):
  - is_in_best_niche: +10
  - trade_size_tier WHALE: +8
  - trade_size_tier LARGE: +5
  - is_with_crowd: +7
  - is_with_crowd false: -3
  - trader_sells_ratio < 0.1: +5
  - trader_sells_ratio > 0.4: -5
  - market_age_bucket WEEK_1/MONTH_1: +5
  - market_age_bucket OLDER: -5
  - is_hedging: -8

Fallback (when V10 features unavailable):
  - conviction.is_outlier or z_score > 1.5: +8
  - tactical.is_hedged: -8
  - competency.niche_win_rate > 60%: +10
  - competency.niche_win_rate > 50%: +5
  - competency.niche_win_rate < 45%: -5
  - momentum.is_hot: +7
```

**Paper Trading Score** (backtest - `route.ts`):
```
Uses response.prediction?.score_0_100 || response.polyscore || 50
```

These are NOT the same!

### 2. Strategies 3 & 4 Not Entering Trades

**Root Cause**: These strategies require `traderWinRate` thresholds:
- Strategy 3: >= 52%
- Strategy 4: >= 55%

The PolyScore API returns `trader_win_rate` at `analysis.prediction_stats.trader_win_rate` but this may not be populated, defaulting to 50% or 0%.

### 3. No Historical Resolved Data

The Polymarket API only returns recent trades. For proper backtesting we need:
1. Trade data from resolved markets
2. The PolyScore AT THE TIME of entry (not current prices)
3. The actual market outcome

### 4. Market Resolution Limitation

With "Option 2" (only officially resolved markets), most recent trades show $0 P&L since their markets haven't closed.

---

## Recommended Architecture for Rigorous Testing

### Phase 1: Forward Testing (Start Now)

**Goal**: Capture real trades with real scores and wait for actual outcomes.

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Top Traders    │────▶│  Capture Trade   │────▶│  Call PolyScore │
│  Make Trades    │     │  + Timestamp     │     │  (Real-time)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Track P&L by   │◀────│  Market Resolves │◀────│  Store Score +  │
│  Strategy       │     │  (Days/Weeks)    │     │  Entry Details  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

**Implementation**:
1. When a top trader makes a trade:
   - Call PolyScore API immediately
   - Store: trade details, PolyScore response, timestamp
   - Simulate entry for each strategy that would accept this trade
2. When market resolves:
   - Look up all paper trades for this market
   - Calculate actual P&L
   - Update strategy performance

**Database Schema**:
```sql
CREATE TABLE paper_trade_signals (
  id UUID PRIMARY KEY,
  condition_id TEXT NOT NULL,
  trader_wallet TEXT NOT NULL,
  
  -- Entry details (at time of signal)
  entry_price DECIMAL NOT NULL,
  entry_timestamp TIMESTAMPTZ NOT NULL,
  outcome TEXT NOT NULL, -- 'YES' or 'NO'
  
  -- PolyScore at entry (full response)
  polyscore_response JSONB NOT NULL,
  
  -- Calculated scores at entry
  value_score DECIMAL,
  edge_pct DECIMAL,
  polyscore DECIMAL,
  trader_win_rate DECIMAL,
  
  -- Which strategies would enter
  enters_pure_value BOOLEAN,
  enters_weighted BOOLEAN,
  enters_high_value BOOLEAN,
  enters_strict_edge BOOLEAN,
  
  -- Resolution (filled later)
  market_resolved BOOLEAN DEFAULT FALSE,
  winning_outcome TEXT, -- 'YES', 'NO', or NULL
  resolved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Phase 2: Historical Data Collection

**Goal**: Build a database of past trades with known outcomes.

1. Query our existing trades database for resolved markets
2. For each historical trade, calculate what the PolyScore WOULD have been
3. Store the simulated entry + actual outcome

**Challenge**: We can't know what PolyScore would have said in the past without the historical market state. Options:
- Use current model on historical data (biased but consistent)
- Only use trades from when we started storing PolyScore responses

### Phase 3: Backtesting with Real Data

**Goal**: Run simulations on historical data with known outcomes.

Only valid if we have:
1. PolyScore at entry time (or consistent simulation)
2. Entry price and timestamp
3. Market outcome

---

## Immediate Fixes Required

### Fix 1: Align Value Score Calculation

The paper trading must use the EXACT same value score formula as PolyPredict V10.

### Fix 2: Debug Strategies 3 & 4

Add logging to see why trades are rejected:
- Log each filter check
- Log the actual values vs thresholds
- Identify which filter is failing

### Fix 3: Populate Trader Win Rate

Ensure `traderWinRate` is being extracted correctly from:
```javascript
response.analysis?.prediction_stats?.trader_win_rate
// OR
response.drawer?.competency?.global_win_rate
```

### Fix 4: Forward Test Infrastructure

Build the capture system for forward testing immediately.

---

## Validation Requirements for Third Parties

To prove the system is not "bogus", we need:

1. **Transparent Methodology**: Document exactly how scores are calculated
2. **Audit Trail**: Every trade decision logged with:
   - Input data
   - Score calculation
   - Strategy decision (enter/skip)
   - Entry price
   - Outcome
   - P&L
3. **No Hindsight Bias**: Scores must be calculated at entry time, not retrospectively
4. **Verifiable Outcomes**: All market outcomes from official Polymarket API
5. **Statistical Significance**: Enough trades to draw meaningful conclusions

---

## Timeline

1. **Week 1**: Fix value score alignment, debug strategies 3 & 4
2. **Week 2**: Implement forward test capture system
3. **Weeks 3-6**: Run forward test, collect data
4. **Week 6+**: Analyze results with statistically significant sample
