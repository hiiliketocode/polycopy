# ML Testing Platform - Critical Review & Risk Analysis

## Purpose

This document identifies **every potential issue** that could invalidate our test results or require rework. We must address these BEFORE building.

---

## Part 1: Critical Issues Found

### Issue #1: Severe Look-Ahead Bias in Features (CRITICAL)

**The Problem:**

The `enriched_trades_training_v11` table has a fundamental flaw. When we build it:

```sql
-- Line 340-344 of create-enriched-trades-v11.sql
LEFT JOIN `polycopy_v1.trader_global_stats` g ON t.wallet_address = g.wallet_address
```

The `trader_global_stats` table contains stats calculated using **ALL trades ever** with D7/D30 windows calculated relative to **when the table was built**, not when each trade happened.

**Concrete Example:**

```
Trade from January 15, 2024:
├─ global_win_rate: 58.2% ← Includes trades from Feb 2024 - Feb 2026!
├─ D30_win_rate: 62.1%    ← 30 days before Feb 6, 2026, NOT Jan 2024!
├─ D7_win_rate: 55.0%     ← 7 days before Feb 6, 2026, NOT Jan 2024!
└─ These features are COMPLETELY WRONG for this trade
```

**Impact:**
- **ALL features derived from trader stats are contaminated**
- This affects: `global_win_rate`, `D30_win_rate`, `D7_win_rate`, `lifetime_roi_pct`, `D30_roi_pct`, `D7_roi_pct`, `niche_win_rate_history`, `total_lifetime_trades`, and derived features
- Simple time-splitting the training data does NOT fix this
- The model is learning from future information

**Severity: 🔴 CRITICAL - Cannot proceed without fixing**

---

### Issue #2: Market Resolution Timing

**The Problem:**

A trade and its outcome can be separated by months:

```
Trade: January 15, 2024 - Bought "Trump wins 2024 election" at $0.45
Resolution: November 6, 2024 - Market resolves (10+ months later!)
```

If we train on trades through June 2024 and test on July-Dec 2024:
- Training data includes trades whose outcomes aren't known until Nov 2024
- But we need the outcome to train!
- So training data actually requires knowledge through Nov 2024

**Questions to Answer:**
1. What's the distribution of time-to-resolution in our data?
2. How many trades in any given period have unresolved outcomes?
3. Should we only train on trades where `resolution_date < cutoff`?

**Severity: 🟡 HIGH - Must understand before designing splits**

---

### Issue #3: The "Level 1 Fix" Is Insufficient

**The Problem:**

I previously suggested a "quick fix" of just filtering training data by date. This is **misleading** because:

```sql
-- This does NOT fix the problem:
SELECT * FROM enriched_trades_training_v11
WHERE timestamp < '2025-07-01'
```

The features in those rows are STILL calculated using all-time data. We're just filtering which rows to use, not fixing the features themselves.

**True Fix Required:**

We need to **rebuild the enriched trades table** with point-in-time features, NOT just filter it.

**Severity: 🔴 CRITICAL - My earlier suggestion was incomplete**

---

### Issue #4: No Point-in-Time Infrastructure Exists

**The Problem:**

To calculate proper point-in-time features, we need `trader_stats_daily` - daily snapshots of each trader's stats. This table **does not exist**.

Building it requires:
1. For each day in our data range (say 2 years = 730 days)
2. For each trader active up to that day
3. Calculate their cumulative stats as of that day

**Estimated complexity:**
- ~500K traders × ~730 days = ~365 million rows
- Computationally expensive to build
- Needs to be built BEFORE we can create proper training data

**Severity: 🔴 CRITICAL - Foundation must be built first**

---

### Issue #5: Outcome Definition Ambiguity

**The Problem:**

How exactly is `outcome` defined?

```sql
-- From enriched trades:
CASE
  WHEN LOWER(t.token_label) = LOWER(m.winning_label) THEN 'WON'
  ELSE 'LOST'
END as outcome
```

**Questions:**
1. What if `winning_label` is NULL (market not resolved)? → Those rows shouldn't exist in training data
2. What about markets that were voided/cancelled?
3. What about partial wins in multi-outcome markets?
4. What about SELL trades? (Currently filtered out with `WHERE side = 'BUY'`)

**Severity: 🟡 HIGH - Need to verify data quality**

---

### Issue #6: Feature Leakage Beyond Trader Stats

**The Problem:**

Other features might also have look-ahead bias:

| Feature | Potential Issue |
|---------|-----------------|
| `volume_total` | Is this market's total volume, including future? |
| `volume_1_week` | Week relative to when? |
| `market_duration_days` | Requires knowing when market closed |
| `is_with_crowd` | Calculated from all trades in market? |

**Need to audit:** Every feature to ensure it only uses data available at trade time.

**Severity: 🟡 HIGH - Need comprehensive audit**

---

### Issue #7: Prediction Logging for Forward Testing

**The Problem:**

Forward testing requires capturing predictions **in real-time** as they happen. Current state:

```
Current: Trader makes trade → We call PolyScore → Display to user → ??? (not stored)
Needed:  Trader makes trade → We call PolyScore → Store prediction → Wait → Compare to outcome
```

**Questions:**
1. Are we currently storing predictions anywhere? (Need to check)
2. What exactly needs to be stored?
3. How long until we have enough data for meaningful analysis?

**Severity: 🟡 HIGH - Must set up before forward testing can begin**

---

### Issue #8: Sample Size in Test Periods

**The Problem:**

If we split data temporally, do we have enough trades in each period?

**Unknown:**
- How many total trades exist?
- How many resolved trades per month?
- What's the distribution by market type?
- Are there seasonal effects (elections, sports seasons)?

**Example Concern:**
If we hold out Oct 2025 - Feb 2026 for testing, but most of those trades are from one political event (US elections), results may not generalize.

**Severity: 🟡 MEDIUM - Need to analyze data distribution**

---

### Issue #9: Model Versioning & Reproducibility

**The Problem:**

When we retrain models, we need to track:
- Exact training data used (date range, filters)
- Exact features included
- Hyperparameters
- Random seeds (if any)
- Code version

**Currently:**
- Models are named `poly_predictor_v11` with no sub-versioning
- No tracking of what data was used
- No way to reproduce a specific training run

**Severity: 🟡 MEDIUM - Must establish before multiple experiments**

---

### Issue #10: BigQuery ML Limitations

**The Problem:**

BigQuery ML has constraints:

| Constraint | Impact |
|------------|--------|
| Limited model types | Only logistic regression, boosted trees, etc. |
| No custom loss functions | Can't optimize for profit directly |
| Limited hyperparameter search | Manual grid search required |
| No cross-validation built-in | Must implement ourselves |

**For advanced techniques (GLMM, neural nets):** Would need to move to Python.

**Severity: 🟢 LOW - Acceptable for initial testing**

---

## Part 2: Risk Mitigation Plan

### Risk 1: We Build Everything Then Discover Data is Bad

**Mitigation:**
1. **Data audit FIRST** - Before building anything, query BigQuery to understand:
   - Date range of trades
   - Resolution rate by period
   - Trader count by period
   - Market type distribution
2. **Spot-check validation** - Manually verify 10-20 trades for correctness

### Risk 2: Point-in-Time Table is Too Expensive/Slow

**Mitigation:**
1. **Estimate size first** - Calculate expected row count
2. **Build incrementally** - Start with last 6 months, validate, then expand
3. **Consider alternatives** - Could use window functions in training query (slower but simpler)

### Risk 3: Forward Testing Takes Too Long to Get Results

**Mitigation:**
1. **Start capture immediately** - Even while building backtest infrastructure
2. **Focus on fast-resolving markets** - Sports resolve in hours, not months
3. **Parallel track** - Run historical backtests while accumulating forward data

### Risk 4: Results Don't Generalize Across Time Periods

**Mitigation:**
1. **Multiple test periods** - Don't rely on single holdout
2. **Walk-forward validation** - Test across rolling windows
3. **Regime analysis** - Understand when model works vs doesn't

### Risk 5: We Misunderstand a Requirement and Build Wrong Thing

**Mitigation:**
1. **This document** - Explicit listing of all assumptions
2. **Validation step** - Small prototype before full build
3. **Incremental delivery** - Build and verify in stages

---

## Part 3: Corrected Build Plan

### Stage 0: Data Audit & Validation (Do First)

**Goal:** Understand exactly what data we have before building anything.

| Task | Output | Effort |
|------|--------|--------|
| 0.1 Query data date ranges | Min/max dates, gaps | 1 hour |
| 0.2 Analyze resolution timing | Distribution of resolution lag | 2 hours |
| 0.3 Count trades by period | Monthly trade counts | 1 hour |
| 0.4 Audit feature sources | Identify all look-ahead issues | 4 hours |
| 0.5 Spot-check 20 trades | Verify outcome correctness | 2 hours |

**Exit Criteria:** Clear understanding of data quality and constraints.

---

### Stage 1: Point-in-Time Data Infrastructure

**Goal:** Build foundation for unbiased training/testing.

| Task | Output | Effort |
|------|--------|--------|
| 1.1 Design `trader_stats_daily` schema | Table definition | 2 hours |
| 1.2 Build backfill query | SQL to populate historical stats | 8 hours |
| 1.3 Run backfill for 2024-2026 | ~365M rows | 4 hours (compute) |
| 1.4 Validate against known values | Spot-check accuracy | 4 hours |
| 1.5 Create `enriched_trades_pit` table | Training data with point-in-time features | 8 hours |

**Exit Criteria:** Can query "what was trader X's stats on date Y?" accurately.

---

### Stage 2: Model Retraining with Proper Splits

**Goal:** Create properly validated models.

| Task | Output | Effort |
|------|--------|--------|
| 2.1 Define train/validate/test splits | Date boundaries | 2 hours |
| 2.2 Retrain v11 on training period only | `poly_predictor_v11_train` | 2 hours |
| 2.3 Evaluate on validation period | Metrics on unseen data | 2 hours |
| 2.4 Tune hyperparameters | Best configuration | 8 hours |
| 2.5 Final evaluation on holdout | True out-of-sample performance | 2 hours |
| 2.6 Document results | Model card with all details | 4 hours |

**Exit Criteria:** Know true model performance on unseen data.

---

### Stage 3: Backtesting Engine

**Goal:** Simulate trading strategies on historical data.

| Task | Output | Effort |
|------|--------|--------|
| 3.1 Design backtest architecture | Technical spec | 4 hours |
| 3.2 Build Cloud Function skeleton | Deployed function | 4 hours |
| 3.3 Implement point-in-time data retrieval | PIT query function | 4 hours |
| 3.4 Implement strategy evaluation | Trade decisions | 8 hours |
| 3.5 Implement execution simulation | Slippage, fills | 4 hours |
| 3.6 Implement metrics calculation | Sharpe, drawdown, etc. | 4 hours |
| 3.7 Build result storage | Audit trail in BigQuery | 4 hours |
| 3.8 Validate against known outcomes | Sanity checks | 4 hours |

**Exit Criteria:** Can run a backtest and get trustworthy results.

---

### Stage 4: Forward Testing Infrastructure

**Goal:** Capture real-time predictions for future validation.

| Task | Output | Effort |
|------|--------|--------|
| 4.1 Design prediction logging schema | Table definition | 2 hours |
| 4.2 Modify predict-trade to log predictions | Code change | 4 hours |
| 4.3 Build resolution tracking | Match predictions to outcomes | 4 hours |
| 4.4 Build forward test dashboard | View accumulating results | 8 hours |
| 4.5 Set up alerts | Notify when predictions can be evaluated | 2 hours |

**Exit Criteria:** Predictions captured in real-time, outcomes tracked automatically.

---

### Stage 5: Analysis & Comparison Tools

**Goal:** Make sense of multiple experiments.

| Task | Output | Effort |
|------|--------|--------|
| 5.1 Build run comparison tools | Side-by-side analysis | 8 hours |
| 5.2 Build parameter sensitivity analysis | What matters most | 8 hours |
| 5.3 Build regime analysis | When does model work | 8 hours |
| 5.4 Build export/documentation | PDF reports | 8 hours |

**Exit Criteria:** Can identify what works and why.

---

## Part 4: What Must Be True Before Proceeding

### Checklist Before Stage 1

- [ ] Confirmed: Data exists for at least 18 months
- [ ] Confirmed: Resolution timing understood
- [ ] Confirmed: Feature audit complete, all leakage sources identified
- [ ] Confirmed: BigQuery access and permissions verified
- [ ] Confirmed: Storage/compute budget approved

### Checklist Before Stage 2

- [ ] Confirmed: `trader_stats_daily` validated for accuracy
- [ ] Confirmed: `enriched_trades_pit` created with point-in-time features
- [ ] Confirmed: Train/validate/test splits defined

### Checklist Before Stage 3

- [ ] Confirmed: Model retraining complete with documented performance
- [ ] Confirmed: Cloud Function environment set up
- [ ] Confirmed: Point-in-time retrieval tested

### Checklist Before Stage 4

- [ ] Confirmed: Backtest engine validated on historical data
- [ ] Confirmed: Logging infrastructure ready
- [ ] Confirmed: Resolution tracking mechanism works

---

## Part 5: Forward Testing Design

### Why Forward Testing Matters

Backtesting, even with point-in-time features, has limitations:
- Model was developed with knowledge of the test period (indirect leakage)
- Market conditions may have been influenced by events we know about
- True out-of-sample requires predictions on unknown futures

**Forward testing is the gold standard.**

### Forward Testing Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       FORWARD TESTING FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. CAPTURE PHASE (Real-time)                                               │
│  ┌──────────────┐    ┌────────────────┐    ┌────────────────────────────┐  │
│  │ Trader makes │───▶│ PolyScore API  │───▶│ Log to prediction_log     │  │
│  │ a trade      │    │ generates pred │    │ - timestamp                │  │
│  └──────────────┘    └────────────────┘    │ - condition_id             │  │
│                                             │ - model_version            │  │
│                                             │ - all input features       │  │
│                                             │ - predicted_prob           │  │
│                                             │ - strategy_decision        │  │
│                                             └────────────────────────────┘  │
│                                                                              │
│  2. WAIT PHASE (Hours to Months)                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Market remains open... traders trade... outcome unknown...          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  3. RESOLUTION PHASE (When market closes)                                   │
│  ┌──────────────────┐    ┌────────────────────────────────────────────┐    │
│  │ Market resolves  │───▶│ Match predictions to outcome               │    │
│  │ YES/NO winner    │    │ - Calculate P&L                            │    │
│  └──────────────────┘    │ - Update forward test metrics              │    │
│                          │ - Compare predicted vs actual              │    │
│                          └────────────────────────────────────────────┘    │
│                                                                              │
│  4. ANALYSIS PHASE (Ongoing)                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ As predictions resolve, build up sample size                        │   │
│  │ - Track calibration (are 70% predictions winning 70%?)              │   │
│  │ - Track strategy P&L                                                │   │
│  │ - Compare to backtest expectations                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Prediction Log Schema

```sql
CREATE TABLE forward_test_predictions (
  -- Identification
  prediction_id STRING NOT NULL,
  created_at TIMESTAMP NOT NULL,
  
  -- What we're predicting
  condition_id STRING NOT NULL,
  token_label STRING NOT NULL,  -- YES or NO
  trader_wallet STRING NOT NULL,
  original_trade_id STRING,
  
  -- Model details
  model_version STRING NOT NULL,  -- e.g., 'v11_train_jun25'
  model_trained_through DATE,     -- Last date in training data
  
  -- Input features (snapshot at prediction time)
  entry_price FLOAT64,
  trader_win_rate_at_time FLOAT64,
  trader_d30_win_rate_at_time FLOAT64,
  -- ... all features ...
  full_feature_vector JSON,       -- Complete snapshot for audit
  
  -- Predictions
  predicted_probability FLOAT64,  -- Model's P(win)
  edge_pct FLOAT64,               -- predicted - market price
  polyscore FLOAT64,              -- Composite score
  value_score FLOAT64,            -- For strategy decisions
  
  -- Strategy decisions
  strategy_decisions JSON,        -- {"PURE_VALUE": "ENTER", "WEIGHTED": "SKIP", ...}
  
  -- Resolution (filled later)
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  winning_label STRING,           -- Actual winner
  actual_outcome STRING,          -- WON or LOST
  pnl_usd FLOAT64,                -- If we had entered
  
  -- Metadata
  data_version STRING,            -- Hash of data snapshot
);
```

### Forward Test Timeline

| Week | Expected Resolved Predictions | Statistical Power |
|------|------------------------------|-------------------|
| 1-2 | ~50-100 (sports mostly) | Too early |
| 3-4 | ~150-300 | Directional signal |
| 5-8 | ~400-600 | Moderate confidence |
| 8-12 | ~800-1200 | High confidence |

**Key Insight:** Start forward testing capture NOW while building backtest infrastructure. By the time backtesting is ready, you'll have 4+ weeks of forward data accumulating.

---

## Part 6: Summary of Changes from Original Plan

| Original Assumption | Revised Understanding |
|--------------------|-----------------------|
| "Level 1 fix" (date filter) works | NO - features still have future data |
| Can start with existing enriched_trades | NO - must rebuild with PIT features |
| Forward testing is "nice to have" | NO - essential for true validation |
| Can skip data audit | NO - must understand data first |
| D7/D30 features are time-relative | NO - they're relative to table build date |

---

## Part 7: Go/No-Go Decision Points

### Before Investing in Stage 1:

**Must confirm:**
1. Data audit shows sufficient history (18+ months)
2. Resolution timing is acceptable (<30% of trades take >3 months)
3. We have BigQuery capacity for 365M+ row table
4. Team understands this is 2-3 weeks of work before first valid results

### Before Moving to Stage 2:

**Must confirm:**
1. Point-in-time stats validated for accuracy
2. Spot-checks show features are correct
3. No additional leakage sources discovered

### Before Moving to Production:

**Must confirm:**
1. Backtest results are reproducible
2. Forward test results align with backtest expectations (within reason)
3. Statistical significance achieved (p < 0.05)

---

## Appendix: Questions To Answer in Data Audit

1. What is the earliest trade timestamp in our data?
2. What is the latest trade timestamp?
3. How many trades per month?
4. How many unique traders per month?
5. What percentage of trades are resolved (have outcomes)?
6. What is the distribution of time-to-resolution?
7. What percentage of trades are from top 100 traders?
8. How many markets per category (sports, crypto, politics)?
9. Are there any gaps in the data?
10. When was `trader_global_stats` last rebuilt?
