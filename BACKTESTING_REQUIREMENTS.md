# PolyCopy Backtesting Platform Requirements

## What This Document Is

This document defines the requirements for building a **backtesting platform** - a system that tests trading strategies on historical data to see if they would have been profitable.

**This is NOT about:**
- Training the ML model (see `ML_IMPROVEMENT_PLAN.md`)
- Building new features
- The live trading system

**This IS about:**
- Testing "what if we had followed Strategy X for the last 6 months?"
- Measuring strategy performance with proper methodology
- Creating auditable, reproducible proof of results
- Learning what works and what doesn't

---

## The Goal

Build a backtesting system where you can:

1. **Set up a test**: Pick a strategy, time period, and capital
2. **Run it**: Simulate trading through historical data
3. **Analyze results**: See P&L, win rate, risk metrics
4. **Document it**: Export proof of methodology and results
5. **Compare**: Track all tests to find what actually works

The results need to be **trustworthy enough to bet real money on**.

---

## Project Plan Overview

### Phase 0: Understand & Validate Requirements (This Document)

| Step | Task | Output |
|------|------|--------|
| 0.1 | Read and understand these requirements | Team alignment |
| 0.2 | Validate against industry standards | Confirmation or adjustments |
| 0.3 | Identify what data we have vs need | Gap analysis |
| 0.4 | Estimate effort for each phase | Project timeline |

### Phase 1: Data Foundation

| Step | Task | Output |
|------|------|--------|
| 1.1 | Build `trader_stats_daily` table | Point-in-time trader data |
| 1.2 | Backfill historical daily snapshots | ~12-24 months of daily stats |
| 1.3 | Set up prediction logging | Forward-testing capability |
| 1.4 | Create backtest metadata tables | Run tracking, audit storage |

### Phase 2: Core Backtest Engine

| Step | Task | Output |
|------|------|--------|
| 2.1 | Create Cloud Function skeleton | Python runtime in GCP |
| 2.2 | Implement point-in-time data retrieval | No look-ahead bias |
| 2.3 | Implement strategy evaluation | Trade decisions |
| 2.4 | Implement execution simulation | Slippage, costs |
| 2.5 | Implement audit logging | Every decision traced |

### Phase 3: Analysis & Metrics

| Step | Task | Output |
|------|------|--------|
| 3.1 | Performance metrics (Sharpe, drawdown) | Standard quant metrics |
| 3.2 | Statistical significance tests | Know if results are luck |
| 3.3 | Regime/segment analysis | What works where |
| 3.4 | Comparison framework | Strategy vs strategy |

### Phase 4: UI & Documentation

| Step | Task | Output |
|------|------|--------|
| 4.1 | Setup UI (strategy, params, period) | Easy test creation |
| 4.2 | Results dashboard | Visual analysis |
| 4.3 | Export system (PDF, CSV, JSON) | Proof documents |
| 4.4 | Backtest archive browser | Find past tests |

### Phase 5: Validation & Launch

| Step | Task | Output |
|------|------|--------|
| 5.1 | Run known-outcome validation | System verification |
| 5.2 | Write methodology docs | External scrutiny ready |
| 5.3 | Run initial strategy tests | Real insights |
| 5.4 | Iterate and improve | Production system |

---

## Part 1: The Core Problem We're Solving

### Why Current Backtests Are Unreliable

Your current paper trading system has a fundamental problem called **look-ahead bias**:

```
WHAT HAPPENS NOW (WRONG):
┌─────────────────────────────────────────────────────────────────┐
│ Evaluating a trade from January 15, 2025:                       │
│                                                                  │
│ "What's this trader's win rate?"                                │
│ System answers: "58.2%" ← Calculated from ALL their trades      │
│                            including Feb, Mar, Apr 2025!        │
│                                                                  │
│ This is like checking tomorrow's lottery numbers before betting │
└─────────────────────────────────────────────────────────────────┘
```

```
WHAT SHOULD HAPPEN (CORRECT):
┌─────────────────────────────────────────────────────────────────┐
│ Evaluating a trade from January 15, 2025:                       │
│                                                                  │
│ "What's this trader's win rate?"                                │
│ System answers: "55.1%" ← Calculated ONLY from trades           │
│                            before January 15, 2025              │
│                                                                  │
│ This is like making a bet with only the info you actually had   │
└─────────────────────────────────────────────────────────────────┘
```

### The Impact

If your current system shows "Strategy X returns +25%", the real performance might be:
- +15% (somewhat overstated)
- +5% (significantly overstated)
- -5% (actually loses money!)

**You cannot make capital allocation decisions on current results.**

---

## Part 2: Data Layer Requirements

### 2.1 What Data We Have Now

| Table | Location | Contents | Volume |
|-------|----------|----------|--------|
| `trades` | BigQuery | All Polymarket trades | ~100M+ rows |
| `markets` | BigQuery | Market metadata, outcomes | ~50K+ rows |
| `trader_global_stats` | BigQuery | Lifetime trader stats | ~500K traders |
| `trader_profile_stats` | BigQuery | Stats by niche | ~2M rows |

**Problem**: These stats tables are "as of now" - they don't tell us what the stats were at any point in the past.

### 2.2 What Data We Need to Build

#### Table 1: `trader_stats_daily` (CRITICAL)

Daily snapshots of every trader's stats. This enables point-in-time lookups.

```sql
-- For a trade on Jan 15, 2025:
SELECT * FROM trader_stats_daily 
WHERE wallet_address = '0x...' 
AND snapshot_date = '2025-01-14'  -- Day before = stats available at trade time
```

| Column | Type | Description |
|--------|------|-------------|
| wallet_address | STRING | Trader identifier |
| snapshot_date | DATE | Which day this snapshot represents |
| total_trades | INT64 | Cumulative trades as of this date |
| total_wins | INT64 | Cumulative wins as of this date |
| win_rate | FLOAT64 | Win rate as of this date |
| d7_trades | INT64 | Trades in prior 7 days |
| d7_win_rate | FLOAT64 | Win rate for prior 7 days |
| d30_trades | INT64 | Trades in prior 30 days |
| d30_win_rate | FLOAT64 | Win rate for prior 30 days |
| total_pnl_usd | FLOAT64 | Cumulative P&L |
| roi_pct | FLOAT64 | ROI as of this date |

**Estimated size**: 500K traders × 365 days × 2 years = ~365M rows
**Storage cost**: ~$5-10/month in BigQuery

#### Table 2: `backtest_runs` (Run Tracking)

Track every backtest execution for documentation and comparison.

| Column | Type | Description |
|--------|------|-------------|
| run_id | STRING | Unique identifier (UUID) |
| run_name | STRING | Human-readable name ("V11 High Edge Test") |
| created_at | TIMESTAMP | When test started |
| created_by | STRING | Who ran it |
| description | STRING | What this test is trying to learn |
| config | JSON | Full configuration (strategy, params, period) |
| status | STRING | 'running', 'completed', 'failed' |
| summary_metrics | JSON | Key results (return, Sharpe, etc.) |
| code_version | STRING | Git hash of strategy code |
| data_version | STRING | Hash of data snapshot used |

#### Table 3: `backtest_trades` (Audit Trail)

Every trade decision in every backtest, with full inputs.

| Column | Type | Description |
|--------|------|-------------|
| run_id | STRING | Links to backtest_runs |
| trade_seq | INT64 | Order within the run |
| timestamp | TIMESTAMP | When trade was evaluated |
| condition_id | STRING | Market being evaluated |
| decision | STRING | 'ENTER', 'SKIP' |
| skip_reason | STRING | Why skipped (if applicable) |
| inputs_snapshot | JSON | All data used to make decision |
| entry_price | FLOAT64 | Price if entered |
| position_size | FLOAT64 | Size if entered |
| exit_price | FLOAT64 | Resolution price |
| pnl_usd | FLOAT64 | Profit/loss |

### 2.3 Data We Should Consider (Phase 2+)

#### Order Book / Market Depth Data

**What it is**: The Dome API provides historical order book snapshots showing:
- Bids and asks at each price level
- Market liquidity depth
- Bid-ask spread over time

**Available from**: `GET /polymarket/orderbooks?condition_id=X&start_time=Y&end_time=Z`

**Benefits for backtesting**:
- More accurate slippage modeling (know actual liquidity at trade time)
- Better capacity analysis (how much could we actually trade?)
- Market microstructure features for ML

**Concerns**:
- **Volume**: Each market × each day × multiple snapshots = MASSIVE data
- **Complexity**: Need to interpolate between snapshots
- **Diminishing returns**: For most strategies, 4% fixed slippage is close enough

**Recommendation**: 
- **Phase 1**: Skip order book data, use fixed slippage model
- **Phase 2**: Add order book for TOP markets only (highest volume)
- **Phase 3**: Consider full order book if capacity becomes a concern

**Why wait**: The point-in-time trader stats problem is 10x more impactful than slippage modeling precision. Fix the big problem first.

---

## Part 3: Backtest Archive & Documentation System

### 3.1 The Problem We're Solving

After running 50 backtests, you'll have questions like:
- "Which test had the best Sharpe ratio?"
- "Did we ever test Strategy X with min_edge=7%?"
- "What changed between the test that worked and the one that didn't?"

Without good documentation, you'll lose track and repeat work.

### 3.2 Backtest Naming Convention

Every backtest gets a structured name:

```
[DATE]_[STRATEGY]_[VARIANT]_[PERIOD]

Examples:
2026-02-06_PURE_VALUE_baseline_2024H2
2026-02-06_PURE_VALUE_edge5pct_2024H2
2026-02-07_WEIGHTED_v2_full2024
```

### 3.3 Required Documentation Per Backtest

Every run must capture:

```yaml
# backtest_metadata.yaml
run_id: "bt_20260206_001"
name: "PURE_VALUE_SCORE with 5% minimum edge"
created_at: "2026-02-06T14:30:00Z"
created_by: "rawdon"

# What we're trying to learn
hypothesis: "Higher edge threshold improves Sharpe ratio"
compared_to: "bt_20260205_003"  # baseline to compare against

# Configuration
strategy:
  type: "PURE_VALUE_SCORE"
  version: "v11"
  parameters:
    min_value_score: 70
    min_edge_pct: 5
    position_sizing: "edge_based"
    max_position_usd: 100

period:
  start: "2024-07-01"
  end: "2024-12-31"
  holdout_excluded: true

capital:
  initial: 1000
  slippage_model: "fixed_4pct"

# Data versions (for reproducibility)
data_snapshot:
  trader_stats_daily: "2026-02-06"
  trades_table: "polycopy_v1.trades"
  code_commit: "abc123def"

# Results summary
results:
  total_return_pct: 23.5
  sharpe_ratio: 1.42
  max_drawdown_pct: 12.3
  total_trades: 402
  win_rate: 58.2
  
# Learnings
conclusion: "5% edge threshold improved Sharpe from 1.21 to 1.42 while reducing trades by 30%"
next_steps: "Try 7% edge threshold"
```

### 3.4 Backtest Comparison Dashboard

The UI should show a table of all runs:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ BACKTEST ARCHIVE                                            [New Test] [Export]│
├───────────────────────────────────────────────────────────────────────────────┤
│ Filter: [Strategy ▼] [Date Range] [Min Trades: 100] [Search...]              │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│ ☐ │ Run ID          │ Strategy    │ Period      │ Return │ Sharpe │ Trades │
│───┼─────────────────┼─────────────┼─────────────┼────────┼────────┼────────│
│ ☑ │ bt_20260206_003 │ PURE_VALUE  │ 2024 H2     │ +23.5% │ 1.42   │ 402    │
│ ☑ │ bt_20260205_003 │ PURE_VALUE  │ 2024 H2     │ +18.2% │ 1.21   │ 578    │
│ ☐ │ bt_20260204_001 │ WEIGHTED    │ 2024 Full   │ +31.0% │ 1.15   │ 1,204  │
│ ☐ │ bt_20260203_002 │ SINGLES_V1  │ 2024 Q4     │ +8.5%  │ 0.89   │ 156    │
│                                                                               │
│                              [Compare Selected (2)]                           │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 3.5 Comparison Report

When comparing two backtests:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ COMPARISON: bt_20260206_003 vs bt_20260205_003                               │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│ WHAT CHANGED:                                                                 │
│ ├─ min_edge_pct: 2% → 5%                                                     │
│ └─ (all other parameters identical)                                          │
│                                                                               │
│ RESULTS IMPACT:                                                               │
│ ┌─────────────────┬──────────────┬──────────────┬─────────────┐              │
│ │ Metric          │ Baseline     │ New          │ Change      │              │
│ ├─────────────────┼──────────────┼──────────────┼─────────────┤              │
│ │ Total Return    │ +18.2%       │ +23.5%       │ +5.3pp ↑    │              │
│ │ Sharpe Ratio    │ 1.21         │ 1.42         │ +0.21 ↑     │              │
│ │ Max Drawdown    │ -15.1%       │ -12.3%       │ +2.8pp ↑    │              │
│ │ Win Rate        │ 55.4%        │ 58.2%        │ +2.8pp ↑    │              │
│ │ Total Trades    │ 578          │ 402          │ -176 ↓      │              │
│ └─────────────────┴──────────────┴──────────────┴─────────────┘              │
│                                                                               │
│ STATISTICAL SIGNIFICANCE:                                                     │
│ The difference in win rate (55.4% vs 58.2%) has p-value = 0.12               │
│ ⚠️ NOT statistically significant at 95% confidence                           │
│ → Need more trades to draw firm conclusions                                   │
│                                                                               │
│ INTERPRETATION:                                                               │
│ Higher edge threshold traded less but with better quality.                    │
│ Returns improved but sample size too small to confirm pattern.                │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 3.6 Learning What Works (Pattern Analysis)

After 20+ backtests, the system should help identify patterns:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ PARAMETER SENSITIVITY ANALYSIS                                                │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│ min_edge_pct impact on Sharpe Ratio (across 12 runs):                        │
│                                                                               │
│  2.0 ┤ ████████████████████████████ 1.21 (n=3)                               │
│  5.0 ┤ ██████████████████████████████████ 1.42 (n=4)                         │
│  7.0 ┤ ████████████████████████████████████ 1.51 (n=3)                       │
│ 10.0 ┤ ██████████████████████ 1.08 (n=2)  ← too few trades                   │
│                                                                               │
│ INSIGHT: Sweet spot appears to be 5-7% edge threshold                        │
│                                                                               │
├───────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│ Strategy performance by market type:                                          │
│                                                                               │
│                 │ Crypto  │ Sports  │ Politics │ Weather │                   │
│ ────────────────┼─────────┼─────────┼──────────┼─────────│                   │
│ PURE_VALUE      │ +31%    │ +18%    │ +12%     │ +5%     │                   │
│ WEIGHTED        │ +28%    │ +22%    │ +8%      │ +15%    │                   │
│ SINGLES_V1      │ N/A     │ +15%    │ N/A      │ N/A     │                   │
│                                                                               │
│ INSIGHT: PURE_VALUE excels in crypto, WEIGHTED better for sports             │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 4: Technical Architecture

### 4.1 System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BACKTESTING ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      DATA LAYER (BigQuery)                              │ │
│  │                                                                         │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────────┐   │ │
│  │  │    trades    │  │   markets    │  │    trader_stats_daily      │   │ │
│  │  │  (raw data)  │  │  (outcomes)  │  │    (point-in-time)         │   │ │
│  │  └──────────────┘  └──────────────┘  └────────────────────────────┘   │ │
│  │                                                                         │ │
│  │  ┌──────────────────────────┐  ┌──────────────────────────────────┐   │ │
│  │  │     backtest_runs        │  │      backtest_trades             │   │ │
│  │  │   (run metadata)         │  │      (audit trail)               │   │ │
│  │  └──────────────────────────┘  └──────────────────────────────────┘   │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                    COMPUTE LAYER (Cloud Function)                       │ │
│  │                                                                         │ │
│  │   Python runtime with:                                                  │ │
│  │   - pandas, numpy (data manipulation)                                   │ │
│  │   - scipy (statistical tests)                                           │ │
│  │   - google-cloud-bigquery (data access)                                 │ │
│  │                                                                         │ │
│  │   Functions:                                                            │ │
│  │   ├─ run_backtest()        - Main simulation loop                       │ │
│  │   ├─ get_pit_trader_stats() - Point-in-time data retrieval             │ │
│  │   ├─ evaluate_strategy()    - Trade decision logic                      │ │
│  │   ├─ simulate_execution()   - Slippage, fill simulation                 │ │
│  │   ├─ calculate_metrics()    - Performance calculations                  │ │
│  │   └─ generate_report()      - Output formatting                         │ │
│  │                                                                         │ │
│  │   Timeout: 60 minutes (can process months of data)                      │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                    │                                         │
│                                    ▼                                         │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                   PRESENTATION LAYER (Vercel + Supabase)                │ │
│  │                                                                         │ │
│  │   Vercel (Next.js):              Supabase (PostgreSQL):                 │ │
│  │   - Setup wizard UI              - User accounts                        │ │
│  │   - Results dashboard            - Quick result cache                   │ │
│  │   - Export/download              - Notifications                        │ │
│  │   - Archive browser              - User preferences                     │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Data Flow for a Single Backtest

```
Step 1: User submits backtest configuration
        ↓
Step 2: Vercel creates run_id, stores config in BigQuery backtest_runs
        ↓
Step 3: Vercel triggers Cloud Function with run_id
        ↓
Step 4: Cloud Function fetches config
        ↓
Step 5: For each day in period:
        │
        ├─ Fetch trades that happened that day
        │
        ├─ For each trade:
        │   ├─ Fetch point-in-time trader stats (from trader_stats_daily)
        │   ├─ Evaluate against strategy rules
        │   ├─ If ENTER: simulate execution, update portfolio
        │   ├─ Log decision to backtest_trades
        │   └─ Continue
        │
        ├─ Resolve any markets that closed that day
        │
        └─ Continue to next day
        ↓
Step 6: Calculate final metrics
        ↓
Step 7: Update backtest_runs with results
        ↓
Step 8: Return results to Vercel
        ↓
Step 9: Display to user
```

### 4.3 How Many Backtests Can We Run?

**Cloud Function Limits:**
- Timeout: Up to 60 minutes (configurable)
- Memory: Up to 32 GB
- Concurrent: Many (limited by BigQuery quotas)

**BigQuery Limits:**
- On-demand: 1 TB/month free, then ~$5/TB
- Concurrent queries: 100 per project
- Query timeout: 6 hours

**Practical Capacity:**

| Backtest Type | Duration | Est. Cost | Concurrent |
|---------------|----------|-----------|------------|
| Quick test (1 month) | 2-5 min | ~$0.01 | 20+ |
| Standard test (6 months) | 10-20 min | ~$0.05 | 10+ |
| Full year test | 30-60 min | ~$0.10 | 5+ |
| Parameter sweep (20 configs) | 2-4 hours | ~$1.00 | 1-2 |

**Answer**: You can run dozens of backtests per day without cost concerns.

---

## Part 5: Industry Standard Metrics

### 5.1 Required Performance Metrics

| Metric | What It Measures | Good Value |
|--------|------------------|------------|
| **Total Return** | Raw profit/loss | Positive |
| **Win Rate** | % of trades that profit | >52% |
| **Profit Factor** | Gross wins / Gross losses | >1.5 |
| **Sharpe Ratio** | Risk-adjusted return | >1.0 |
| **Sortino Ratio** | Return / downside deviation | >1.5 |
| **Max Drawdown** | Worst peak-to-trough decline | <25% |
| **Calmar Ratio** | Annual return / Max drawdown | >1.0 |
| **Avg Trade** | Average P&L per trade | Positive |
| **Expectancy** | (Win% × Avg Win) - (Loss% × Avg Loss) | Positive |

### 5.2 Statistical Significance

**Why it matters**: A 58% win rate on 50 trades might be luck. On 500 trades, it's probably real.

**How to check**:
```python
from scipy.stats import binom_test

wins = 234
total = 402
baseline = 0.5  # random chance

p_value = binom_test(wins, total, baseline)
# If p_value < 0.05 → statistically significant
# If p_value > 0.05 → might be luck
```

**Display to user**:
```
Win Rate: 58.2% (234/402)
Statistical test: p = 0.0003
✓ SIGNIFICANT at 95% confidence
→ This result is unlikely to be random chance
```

### 5.3 Sample Size Guidelines

| Conclusion | Minimum Trades | Recommended |
|------------|----------------|-------------|
| "Strategy might work" | 50+ | 100+ |
| "Strategy probably works" | 100+ | 300+ |
| "Strategy definitely works" | 300+ | 500+ |
| "Ready for live trading" | 500+ | 1000+ |

---

## Part 6: Execution Realism

### 6.1 Slippage Model

**Phase 1 (Simple):**
```python
effective_price = market_price × (1 + slippage_pct)
# Default: 4% slippage
```

**Phase 2 (Volume-adjusted):**
```python
base_slippage = 0.02  # 2% base
volume_impact = trade_size / market_daily_volume × 0.10
effective_slippage = base_slippage + volume_impact
```

**Phase 3 (Order book based):**
Uses actual historical order book data (if collected).

### 6.2 Capital Constraints

Track and enforce:
- Available cash (can't trade more than you have)
- Position limits (max per market)
- Cooldown periods (capital locked after trade)

---

## Part 7: What Success Looks Like

### After Phase 1 (Data Foundation)

- [ ] Can query "what was Trader X's win rate on Jan 15, 2025?"
- [ ] trader_stats_daily populated for 12+ months
- [ ] Prediction logging capturing new trades

### After Phase 2 (Core Engine)

- [ ] Can run a backtest on 6 months of data in <30 minutes
- [ ] Every trade decision has full audit trail
- [ ] No look-ahead bias (verified)

### After Phase 3 (Analysis)

- [ ] Get Sharpe ratio, max drawdown for any run
- [ ] Statistical significance shown for all results
- [ ] Can compare any two runs

### After Phase 4 (UI)

- [ ] Non-technical user can set up and run a test
- [ ] Can export PDF report for external review
- [ ] Can browse and compare all past tests

### After Phase 5 (Production)

- [ ] Methodology documented for external audit
- [ ] At least 3 strategies tested with 500+ trades each
- [ ] Clear winner identified with statistical confidence

---

## Part 8: Validation Checklist

Before trusting any backtest results, verify:

### Data Integrity
- [ ] Point-in-time stats used (no future data)
- [ ] Market outcomes come from official resolutions
- [ ] No duplicate trades counted

### Execution Realism  
- [ ] Slippage applied to all entries
- [ ] Capital constraints enforced
- [ ] Cooldowns modeled if applicable

### Statistical Validity
- [ ] Sufficient sample size (100+ trades minimum)
- [ ] P-value calculated for key metrics
- [ ] Multiple time periods tested

### Reproducibility
- [ ] Same config produces same results
- [ ] Data version locked
- [ ] Code version tracked

### Documentation
- [ ] Run configuration stored
- [ ] All decisions auditable
- [ ] Comparison to baseline documented

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Look-ahead bias** | Using future information to make past decisions (cheating) |
| **Point-in-time** | Data as it existed at a specific moment, not current values |
| **Sharpe ratio** | Return divided by volatility (risk-adjusted performance) |
| **Max drawdown** | Largest peak-to-trough decline in portfolio value |
| **P-value** | Probability that results are due to random chance |
| **Slippage** | Difference between expected and actual execution price |
| **Walk-forward** | Train on past, test on "future", roll forward repeatedly |
| **Audit trail** | Complete record of every decision and its inputs |

---

## Appendix B: Current vs Target State

| Capability | Current State | Target State |
|------------|---------------|--------------|
| Point-in-time trader stats | ✗ Uses current stats | ✓ Uses historical daily snapshots |
| Audit trail | ✗ Limited logging | ✓ Every decision traced |
| Statistical significance | ✗ Not calculated | ✓ P-values for all metrics |
| Reproducibility | ✗ Results may vary | ✓ Deterministic runs |
| Comparison tools | ✗ Manual | ✓ Built-in comparison |
| Run archive | ✗ Not tracked | ✓ Full history searchable |
| Export/proof | ✗ Not available | ✓ PDF, CSV, JSON exports |
| Order book data | ✗ Not used | ○ Phase 2 consideration |

---

## Appendix C: Questions to Answer Before Building

1. **Data**: How far back do we have reliable trade data? (Need for backfill)
2. **Compute**: Do we have GCP Cloud Functions set up? (Need service account)
3. **Budget**: Any constraints on BigQuery costs? (For large backtests)
4. **Timeline**: When do we need first results? (Prioritization)
5. **Users**: Who will run backtests? (UI complexity decision)

---

## Summary

This backtesting platform will transform PolyCopy's ability to validate trading strategies. The key insight is that **trustworthy results require point-in-time data** - everything else builds on that foundation.

The phased approach allows us to:
1. Fix the data problem first (Phase 1)
2. Build core capability (Phase 2)
3. Add analysis tools (Phase 3)
4. Make it user-friendly (Phase 4)
5. Validate and launch (Phase 5)

Expected outcome: A system where you can confidently say "Strategy X returns 15% annually with a Sharpe of 1.3" and **actually believe it**.
