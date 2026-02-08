# PolyCopy ML Model Improvement Plan

## Overview

This document organizes the ML improvement ideas from your consultant conversation, explains each concept in plain terms, maps them to your current v11 model, and provides a prioritized action plan.

---

## Part 1: Understanding The Core Problems

### 1.1 The Overfitting Problem (CRITICAL)

**What is it?**
Overfitting is when your model "memorizes" the training data instead of learning real patterns. It's like a student who memorizes practice exam answers instead of understanding the subject—they'll ace the practice test but fail on new questions.

**Your current situation:**
Your v11 model trains on ALL your historical data, then you test it on... that same data. The model has "seen the answers" during training, so any evaluation is artificially inflated.

```
CURRENT (BAD):
┌─────────────────────────────────────────┐
│            ALL DATA                      │
│  [Train on everything] → [Test on same] │
│         ↓                    ↓           │
│    "72% accurate!"    (but biased)       │
└─────────────────────────────────────────┘
```

**The danger:**
- Your reported 71.8% accuracy might actually be 55-60% on new data
- The model learns spurious correlations specific to historical data
- You can't trust the model's predictions for live trading

**What BigQuery's `data_split_method = 'AUTO_SPLIT'` does:**
It randomly splits 80/20 for train/test. This helps somewhat BUT:
- Random split ignores TIME (future data can "leak" into training)
- You're still training on data where you already know outcomes
- Traders who appear in training ALSO appear in test (cross-contamination)

---

### 1.2 Time-Based Data Leakage

**What is it?**
When you use future information to predict past outcomes. Even subtle leakage destroys validity.

**Your current leakage sources:**
1. **Trader stats are calculated globally** - A trader's D7/D30 win rates include trades AFTER the trade being predicted
2. **No temporal split** - Test data contains trades before some training data
3. **Market outcomes known** - All training data is on resolved markets

**Example of the problem:**
```
Trade from June 2025:
- You calculate D30_win_rate using trades from May-June 2025
- But you ALSO include trades from July-Oct 2025 in that stat
- The model learns "this trader's overall pattern" which includes the future
```

---

### 1.3 Recency Weighting (The Decay Problem)

**What your consultant meant:**
Traders change over time. A trader who was excellent 12 months ago might be average now (or vice versa). Your model currently treats all trades equally.

**The issue with your current approach:**
```sql
-- Your D7/D30/Lifetime stats give equal weight within each window
-- A trade from 6 months ago counts the same as one from yesterday
D30_win_rate = wins_in_30_days / trades_in_30_days  -- Simple average
```

**What exponential weighting does:**
Recent trades count MORE than older trades, with a decay factor:

```
weight = e^(-λ * days_ago)

Example with λ = 0.1:
- Yesterday (1 day):    weight = 0.90 (counts 90%)
- Last week (7 days):   weight = 0.50 (counts 50%)  
- Last month (30 days): weight = 0.05 (counts 5%)
```

This captures whether a trader is improving or declining in a continuous way.

---

## Part 2: Statistical Techniques Explained

### 2.1 Log-Likelihood

**What is it?**
A way to measure how well your model's predicted probabilities match reality. Higher is better.

**In simple terms:**
If your model says "75% chance of winning" and the trade actually wins, log-likelihood rewards that. If it says "75% chance" but it loses, log-likelihood penalizes heavily.

**Why it matters for PolyCopy:**
- AUC-ROC (your current metric) only measures ranking ability
- Log-likelihood measures **calibration** - are your 75% predictions really winning 75% of the time?
- For betting, calibration is MORE important than ranking

**How to check:**
```python
from sklearn.metrics import log_loss
log_loss(y_true, y_pred_proba)  # Lower is better (confusingly)
```

### 2.2 Chi-Square Test

**What is it?**
A statistical test to see if a feature ACTUALLY matters or if patterns are just random noise.

**Why it matters:**
You have 41 features. Some might be noise dressed up as signal. Chi-square helps identify which categorical features (like `performance_regime`, `trader_experience_bucket`) genuinely predict outcomes vs. appearing significant by chance.

**Example:**
```
Does trade_size_tier really predict wins?

         | WON    | LOST   | Chi-square
---------+--------+--------+-----------
WHALE    | 1,200  | 800    | 
LARGE    | 5,000  | 4,800  |   p = 0.001
MEDIUM   | 40,000 | 42,000 |   (significant!)
SMALL    | 60,000 | 65,000 |
```

### 2.3 GLMM (Generalized Linear Mixed Model)

**What is it?**
A model that accounts for "grouped" data—like when you have multiple trades from the same trader.

**The problem it solves:**
Your data isn't independent. Trader A's 500 trades are correlated with each other. Standard logistic regression assumes each row is independent, which inflates confidence.

**In plain terms:**
- **Fixed effects**: Things that apply to everyone (entry price, market type)
- **Random effects**: Things that vary BY TRADER (skill level, tendencies)

**Why it matters:**
A GLMM would learn that global_win_rate varies BY trader as a random effect, rather than treating each trade independently. This prevents a few high-volume traders from dominating the model.

---

## Part 3: Feature Engineering Improvements

### 3.1 Normalization (Z-Scores & Standardization)

**What your consultant meant:**
Features should be on comparable scales. Your current features have wildly different ranges:

| Feature | Current Range | Problem |
|---------|---------------|---------|
| entry_price | 0.01 - 0.99 | Fine |
| total_lifetime_trades | 10 - 500,000 | HUGE range |
| trade_size_log | 0 - 15 | Medium |
| trader_tempo_seconds | 0 - 86,400 | Large |

**The solution - standardization:**
```
normalized = (value - population_mean) / population_stddev
```

This converts everything to "how many standard deviations from average" (z-scores).

**Your current partial approach:**
- `conviction_z_score` is already normalized ✓
- `price_vs_trader_avg` is partially normalized ✓  
- Most other features are NOT normalized ✗

### 3.2 Win Streaks

**Why it matters:**
Psychological momentum. A trader on a 5-win streak might:
- Be "hot" and making good decisions
- Be overconfident and due for a loss
- Have no correlation (random)

**Your current state:**
You have `performance_regime` (HOT_STREAK, IMPROVING, etc.) which captures direction but NOT streak length.

**What to add:**
```sql
-- Current win streak (consecutive wins before this trade)
-- Current loss streak  
-- Longest win streak (all time)
-- Win streak variance (how streaky is this trader?)
```

### 3.3 Player-Level Weights

**What this means:**
Not all traders should count equally in training. Options:

1. **Sample weighting by reliability:**
   - Traders with 10 trades: weight = 0.1
   - Traders with 1,000 trades: weight = 1.0
   
2. **Inverse frequency weighting:**
   - Prevent high-volume traders from dominating
   
3. **Recency weighting per trader:**
   - Recent trades from each trader count more

---

## Part 4: Advanced Validation Techniques

### 4.1 Proper Train/Test Split (Time-Based)

**What you should do:**
```
CORRECT APPROACH:
┌──────────────────────────────────────────────────────────┐
│ 2023 ─────── 2024 ─────── Jan 2025 ─── Jul 2025 ─── Now │
│   │                          │            │              │
│   │      TRAINING DATA       │  VALIDATE  │    TEST      │
│   │  (learn patterns here)   │  (tune)    │  (final)     │
│   └──────────────────────────┴────────────┴──────────────┘
```

**Key rules:**
- Train ONLY on past data
- Test ONLY on future data (relative to training)
- NEVER let test data leak into training

### 4.2 Walk-Forward / Rolling Cross-Validation

**What your consultant meant:**
Instead of one train/test split, do MULTIPLE sequential splits:

```
Round 1: Train on Jan-Mar → Test on Apr
Round 2: Train on Feb-Apr → Test on May
Round 3: Train on Mar-May → Test on Jun
...etc

Then average the results across all rounds.
```

**Why it's powerful:**
- Tests if your model works across different time periods
- Catches models that only work in specific market conditions
- Most realistic simulation of live trading

### 4.3 Hyperparameter Tuning Across 20+ Models

**What this means:**
Don't just train ONE model. Try many configurations:

| Parameter | Values to Try |
|-----------|---------------|
| L2 regularization | 0.001, 0.01, 0.1, 1.0 |
| Max iterations | 20, 50, 100, 200 |
| Model type | LOGISTIC_REG, BOOSTED_TREE |
| Feature subsets | All, Top 20, Top 10 |

This gives you 4 × 4 × 2 × 3 = 96 combinations to evaluate.

---

## Part 5: Your Current V11 Model - Gap Analysis

### What V11 Does Well ✓

1. **Rich feature set** - 41 features covering skill, behavior, market context
2. **Time-windowed stats** - D7, D30, Lifetime splits
3. **Niche specialization** - 96% market classification
4. **Performance trends** - Captures direction of improvement/decline
5. **Some normalization** - conviction_z_score, price_vs_trader_avg

### What V11 Is Missing ✗

| Gap | Impact | Difficulty |
|-----|--------|------------|
| Time-based train/test split | CRITICAL | Easy |
| Exponential recency weighting | High | Medium |
| Feature normalization | Medium | Easy |
| Win streak features | Medium | Easy |
| Cross-validation | High | Medium |
| GLMM / mixed effects | Medium | Hard |
| Hyperparameter search | Medium | Easy |
| Calibration metrics | Medium | Easy |
| Player-level weighting | Medium | Medium |

---

## Part 6: The Action Plan

### Phase 1: Fix The Foundation (Do First)

**Goal:** Establish valid evaluation before making any model changes.

#### 1.1 Create Time-Based Holdout Set
```sql
-- Create a FROZEN test set that you NEVER train on
CREATE TABLE `polycopy_v1.test_holdout_2025Q4` AS
SELECT * FROM `polycopy_v1.enriched_trades_training_v11`
WHERE timestamp >= '2025-10-01'  -- Last 4 months
```

**Rule:** This data is SACRED. Never train on it until final evaluation.

#### 1.2 Point-in-Time Trader Stats
Rebuild trainer stats so they only use data BEFORE each trade:

```sql
-- For each trade, calculate stats using only PRIOR trades
-- This is the gold standard for avoiding leakage
```

This is complex but necessary for true out-of-sample testing.

#### 1.3 Add Calibration Metrics
After any model, check:
```python
# Does predicted probability match actual frequency?
predicted_75_pct = predictions[(predictions >= 0.70) & (predictions < 0.80)]
actual_win_rate = outcomes[predicted_75_pct.index].mean()
# Should be close to 0.75
```

### Phase 2: Quick Wins (High Impact, Easy)

#### 2.1 Normalize All Features
Create a normalized training table:
```sql
CREATE TABLE enriched_trades_normalized AS
SELECT 
  *,
  -- Normalize numeric features
  (total_lifetime_trades - AVG(total_lifetime_trades) OVER()) 
    / STDDEV(total_lifetime_trades) OVER() as total_lifetime_trades_z,
  (trader_tempo_seconds - AVG(trader_tempo_seconds) OVER())
    / STDDEV(trader_tempo_seconds) OVER() as trader_tempo_z,
  -- ... etc for all numeric features
FROM enriched_trades_training_v11
```

#### 2.2 Add Win Streak Features
```sql
-- In enriched trades CTE, add:
current_win_streak,           -- Consecutive wins before this trade
current_loss_streak,          -- Consecutive losses before this trade  
is_on_streak,                 -- Boolean: 3+ wins or losses in a row
streak_type                   -- 'WIN_STREAK', 'LOSS_STREAK', 'NORMAL'
```

#### 2.3 Run Hyperparameter Search in BigQuery
```sql
-- Try multiple L2 values
CREATE MODEL model_l2_001 OPTIONS(l2_reg=0.001, ...) AS SELECT ...;
CREATE MODEL model_l2_01  OPTIONS(l2_reg=0.01, ...) AS SELECT ...;
CREATE MODEL model_l2_1   OPTIONS(l2_reg=0.1, ...) AS SELECT ...;

-- Try Boosted Trees
CREATE MODEL model_xgb OPTIONS(model_type='BOOSTED_TREE_CLASSIFIER', ...) AS SELECT ...;

-- Compare all on holdout set
```

### Phase 3: Advanced Improvements (Medium Effort)

#### 3.1 Exponential Recency Weighting
Replace simple averages with weighted:
```sql
-- Current: simple average
D30_win_rate = SUM(is_win) / COUNT(*)

-- Better: exponential weighted
D30_win_rate_exp = SUM(is_win * EXP(-0.1 * days_ago)) 
                 / SUM(EXP(-0.1 * days_ago))
```

#### 3.2 Rolling Cross-Validation
Build 6-8 models on rolling windows:
```
Model 1: Train Jan-Jun 2024 → Test Jul 2024
Model 2: Train Feb-Jul 2024 → Test Aug 2024
Model 3: Train Mar-Aug 2024 → Test Sep 2024
...
Average performance across all = "expected real-world performance"
```

#### 3.3 Chi-Square Feature Selection
For each categorical feature, run chi-square test:
```python
from scipy.stats import chi2_contingency
chi2, p_value, dof, expected = chi2_contingency(contingency_table)
# Keep only features with p < 0.05
```

### Phase 4: Deep Improvements (Higher Effort)

#### 4.1 Move to Python for Advanced ML
BigQuery ML is limited. For GLMM, deep learning, and sophisticated ensembles:

```python
# Export data from BigQuery
# Use Python libraries:
import statsmodels.api as sm           # For GLMM
import xgboost as xgb                  # For gradient boosting
from sklearn.ensemble import RandomForestClassifier
import tensorflow as tf                 # For neural networks
```

#### 4.2 Implement GLMM
```python
import statsmodels.formula.api as smf

# Mixed effects logistic regression
model = smf.mixedlm(
    "outcome ~ entry_price + global_win_rate + conviction_z_score",
    data,
    groups=data["wallet_address"],  # Random effects by trader
    re_formula="~1"                  # Random intercept per trader
)
```

#### 4.3 Trader-Level Sample Weighting
```python
# Weight samples by trader reliability
sample_weights = data['total_lifetime_trades'].apply(
    lambda x: min(1.0, x / 100)  # Cap at 1.0 for 100+ trades
)
model.fit(X, y, sample_weight=sample_weights)
```

---

## Part 7: Priority Roadmap

### Immediate (This Week)
| # | Task | Why |
|---|------|-----|
| 1 | Create frozen holdout test set | Can't trust any metrics without this |
| 2 | Document current "true" performance on holdout | Baseline before changes |
| 3 | Add win streak features to v12 | Easy win, likely predictive |

### Short-Term (2-3 Weeks)  
| # | Task | Why |
|---|------|-----|
| 4 | Normalize all numeric features | Helps model learn |
| 5 | Build point-in-time trader stats | Eliminates leakage |
| 6 | Run hyperparameter grid search | Find better configuration |
| 7 | Add calibration metrics | Understand real prediction quality |

### Medium-Term (1-2 Months)
| # | Task | Why |
|---|------|-----|
| 8 | Implement exponential recency weighting | Better recency signal |
| 9 | Build rolling cross-validation pipeline | Robust evaluation |
| 10 | Try XGBoost (BOOSTED_TREE) | Often outperforms logistic reg |
| 11 | Chi-square feature selection | Remove noise features |

### Long-Term (2+ Months)
| # | Task | Why |
|---|------|-----|
| 12 | Python ML pipeline with GLMM | Account for trader clustering |
| 13 | Ensemble models | Combine multiple approaches |
| 14 | Live A/B testing framework | Test in production safely |

---

## Part 8: Expected Outcomes

### What "Success" Looks Like

**Current state (estimated):**
- Reported accuracy: 71.8%
- True out-of-sample accuracy: ~55-60% (unknown)
- Calibration: Unknown

**After Phase 1-2 (realistic):**
- True accuracy: 58-62% (now measurable!)
- Calibration error: <5%
- Confidence in predictions: HIGH

**After Phase 3-4 (optimistic):**
- True accuracy: 60-65%
- Multiple validated models
- Profitable in backtesting

### Key Insight
A **properly validated 58% accuracy** is MORE VALUABLE than a **misleadingly reported 72%**. You can bet real money on 58% if you trust it. You can't bet on 72% that might actually be 52%.

---

## Glossary

| Term | Plain English |
|------|---------------|
| **Overfitting** | Memorizing training data instead of learning patterns |
| **Data leakage** | Accidentally using future info to predict past |
| **Holdout set** | Data you never train on, only test on at the end |
| **Cross-validation** | Testing on multiple different train/test splits |
| **Calibration** | Whether your 75% predictions really win 75% of the time |
| **Log-likelihood** | Score for how well probabilities match reality |
| **Chi-square** | Test to see if a feature actually matters |
| **GLMM** | Model that accounts for grouped data (trades by trader) |
| **Regularization** | Penalty that prevents memorization (L2) |
| **Z-score** | Value expressed as "standard deviations from average" |
| **Exponential decay** | Recent data counts more than old data |

---

## Summary

Your v11 model is feature-rich but **unvalidated**. The most important immediate action is creating a proper holdout test set and measuring TRUE performance. Only then can you meaningfully improve the model.

The techniques your consultant mentioned—GLMM, chi-square, exponential weighting—are all valuable but secondary to **fixing the validation problem first**.

Think of it this way:
1. **Phase 1:** Build a trustworthy speedometer
2. **Phase 2-4:** Then make the car faster

You can't improve what you can't measure accurately.
