# PolyPredictor Model Audit - V9 Design

## Executive Summary

This audit examines the current ML model (V7/V8) and proposes improvements based on:
1. Analysis of current feature redundancies and issues
2. Research on prediction market ML best practices
3. Academic literature on trader skill identification

---

## Stage 1: Current Model Issues

### Critical Redundancies Found in V8

| Feature Pair | Correlation | Issue |
|--------------|-------------|-------|
| `price_bracket` vs `entry_price` | 1.000 | Identical (bucketed) |
| `bracket_win_rate` vs `niche_win_rate_history` | 1.000 | Set to same value in SQL |
| `trade_size_log` vs `total_exposure_log` | 1.000 | Set to same value in SQL |
| `niche_win_rate` vs `global_win_rate` | 0.930 | High (90% "OTHER" fallback) |

### Feature Attribution Problem

Current V8 model:
- **84%** attribution to trade/market features
- **Only 16%** attribution to trader-specific features
- `entry_price` alone = **62%** of signal

This means the model is learning "price predicts outcome" rather than "trader skill predicts outcome."

### Niche Classification Problem

V8 had 89.9% classified as "OTHER" because we only used `market_subtype` (30% coverage).
**Solution**: Use market_slug pattern matching → achieves **84.6% classification**.

---

## Stage 2: Research Findings

### Best Practices from Literature

1. **Avoid price momentum features** - Creates data leakage and circular reasoning [Navnoor Bawa]
2. **Realistic accuracy is 55-60%** for statistical edge, not 93%+ [Polymarket Analytics]
3. **Profitability > Accuracy** as the primary metric [Academic research]
4. **XGBoost** outperforms other models for betting strategies [arXiv]
5. **Reduce correlation with published odds** to exploit inefficiencies [ScienceDirect]

### Trader Classification Research

Academic research identifies **7 trader types** based on:
- Knowledge/experience
- Selectivity (how picky they are)
- Volume and holding duration
- Margin and profit composition

**Key insight**: "Makers" profit by taking opposite side of biased order flow from "Takers" [Kalshi research].

### Semantic Relationships

Markets with semantic relationships (e.g., related events) can be used to predict outcomes with **60-70% accuracy** [arXiv 2512.02436].

---

## Stage 3: V9 Feature Design

### Features to REMOVE

| Feature | Reason |
|---------|--------|
| `price_bracket` | Redundant with entry_price |
| `bracket_win_rate` | Redundant with niche_win_rate_history |
| `niche_bracket_win_rate` | Redundant |
| `total_exposure_log` | Was incorrectly set same as trade_size_log |
| `niche_roi_pct` | Redundant with lifetime_roi_pct |

### Features to KEEP (Trader Skill)

| Feature | Importance | Notes |
|---------|------------|-------|
| `global_win_rate` | Core | Trader's overall skill |
| `niche_win_rate_history` | Important | Specialization signal |
| `total_lifetime_trades` | Experience | More trades = more signal |
| `conviction_z_score` | Behavioral | Bet sizing relative to norm |
| `trader_tempo_seconds` | Pattern | Trading rhythm |

### Features to KEEP (Trade Context)

| Feature | Importance | Notes |
|---------|------------|-------|
| `entry_price` | High | But should be normalized |
| `trade_size_log` | Medium | Position sizing |
| `is_chasing_price_up` | Medium | Behavioral flag |
| `is_averaging_down` | Medium | Behavioral flag |
| `position_direction` | Low | LONG/SHORT |

### Features to KEEP (Market Context)

| Feature | Importance | Notes |
|---------|------------|-------|
| `final_niche` | Important | Market category (now properly classified) |
| `bet_structure` | Medium | YES_NO, SPREAD, etc. |
| `volume_momentum_ratio` | Medium | Market activity signal |
| `hours_to_close` | Medium | Timing signal |
| `market_age_days` | Low | Market lifecycle |

### Features to ADD (New)

| Feature | Rationale |
|---------|-----------|
| `price_vs_trader_avg` | Is this trader buying at higher/lower price than their norm? |
| `trader_selectivity` | How picky is this trader? (trades per week) |
| `niche_experience_pct` | What % of trader's trades are in this niche? |
| `is_maker_trade` | Based on trade timing/pattern |
| `skill_x_price` | Interaction: skilled trader at unusual price = edge |

---

## Stage 4: V9 Training Data Design

### Data Filtering

1. **Only resolved markets** (winning_label IS NOT NULL)
2. **Only BUY trades** (we predict if buys will win)
3. **Valid price range**: 0.01 < price < 0.99
4. **Minimum trader history**: total_lifetime_trades >= 10

### Niche Classification (Fixed)

```sql
CASE 
    -- Crypto (from slug patterns)
    WHEN LOWER(market_slug) LIKE 'btc%' OR LOWER(market_slug) LIKE '%bitcoin%' THEN 'BITCOIN'
    WHEN LOWER(market_slug) LIKE 'eth%' OR LOWER(market_slug) LIKE '%ethereum%' THEN 'ETHEREUM'
    WHEN LOWER(market_slug) LIKE 'sol%' OR LOWER(market_slug) LIKE '%solana%' THEN 'SOLANA'
    WHEN LOWER(market_slug) LIKE 'xrp%' THEN 'RIPPLE'
    
    -- Sports (from slug patterns)
    WHEN LOWER(market_slug) LIKE 'nba-%' THEN 'NBA'
    WHEN LOWER(market_slug) LIKE 'nfl-%' THEN 'NFL'
    WHEN LOWER(market_slug) LIKE 'mlb-%' THEN 'MLB'
    WHEN LOWER(market_slug) LIKE 'nhl-%' THEN 'NHL'
    -- ... etc
    
    -- Fallback to market_subtype, then market_type
    WHEN market_subtype IS NOT NULL THEN UPPER(market_subtype)
    WHEN market_type IS NOT NULL THEN UPPER(market_type)
    ELSE 'OTHER'
END as final_niche
```

Target: **<20% "OTHER"** (down from 90%)

### Outcome Labeling

- `outcome = 'WON'` if trader bought the winning token
- `outcome = 'LOST'` if trader bought the losing token

---

## Stage 5: Model Training

### Recommended Model Type

**Logistic Regression** (current) vs **Boosted Trees** (XGBoost)

Given the research showing XGBoost outperforms for betting strategies, consider:
- `model_type='BOOSTED_TREE_CLASSIFIER'` in BigQuery ML
- Or stick with Logistic Regression for interpretability

### Class Balancing

Use `auto_class_weights=TRUE` to handle the ~45%/55% WON/LOST imbalance.

### Regularization

- L2 regularization (`l2_reg=0.01`) to prevent overfitting
- `max_iterations=50` sufficient for convergence

---

## Stage 6: Validation Strategy

### Train/Test Split

- 80/20 split by time (train on older data, test on recent)
- Ensures no future data leakage

### Key Metrics

1. **AUC-ROC**: Target >0.75 (realistic for markets)
2. **Accuracy**: Target 60-65% (above random chance)
3. **Calibration**: Predicted probabilities match actual frequencies

### Real-World Validation

Test on held-out trades and measure:
- Simulated profit if following model recommendations
- Kelly criterion bet sizing performance

---

## Action Items

1. [x] Diagnose niche classification issue
2. [x] Create V9 training SQL with proper niche classification
3. [x] Remove redundant features
4. [x] Add new features (price_vs_trader_avg, selectivity, etc.)
5. [x] Train V9 model
6. [x] Compare V9 vs V7 vs V8 performance
7. [x] Update predict-trade function

---

## Stage 8: V10 Model - High-Value Features

Based on comprehensive feature analysis, V10 adds the highest-impact behavioral features.

### New Features Added in V10

| Feature | Win Rate Signal | Attribution |
|---------|-----------------|-------------|
| **is_with_crowd** | 69.4% vs 30.3% | **0.1246** (4th overall!) |
| **trade_size_tier** | 67.9% vs 48.3% | 0.0108 |
| **is_in_best_niche** | 51.8% vs 48.6% | 0.0047 |
| **market_age_bucket** | 52.2% vs 48.8% | 0.0050 |
| **is_hedging** | Directional | 0.0027 |
| **trader_sells_ratio** | 54.0% vs 43.9% | 0.0024 |

### V10 Performance

| Model | Accuracy | AUC-ROC | Key Changes |
|-------|----------|---------|-------------|
| V8 | 71.85% | 0.8054 | Broken niche, redundant features |
| V9 | 71.75% | 0.7997 | Fixed niche, removed redundancies |
| **V10** | **71.80%** | **0.8032** | +whale, +crowd, +best_niche |

**V10 recovers AUC lost in V9** while maintaining clean, principled feature set.

### predict-trade Function Updated

Updated `supabase/functions/predict-trade/index.ts` to:
- Use `poly_predictor_v10` model
- Calculate V10 features at inference time
- Return V10 feature values in response for transparency

---

## Stage 7: V9 Results and Analysis

### Training Data Improvements

| Metric | V8 | V9 | Change |
|--------|----|----|--------|
| Total rows | 60M | 147M | +145% |
| Niche classified | 10.1% | 96.0% | **+86pp** |
| trade_size vs exposure correlation | 1.0 | 0.34 | **Fixed** |

### Model Performance Comparison

| Model | Accuracy | AUC-ROC | Training Rows | Niche Classification |
|-------|----------|---------|---------------|---------------------|
| V8 | 71.85% | 0.8054 | 60M | 10% classified |
| **V9** | **71.75%** | **0.7997** | **147M** | **96% classified** |

### Feature Attribution Analysis

**V8 Attribution (problem):**
- entry_price: 62%
- Other market features: 22%
- **Trader-specific: 16%** ← Model mostly predicted markets, not trader skill

**V9 Attribution (improved):**
- entry_price: 40%
- price_vs_trader_avg: 34%
- global_win_rate: 13%
- **Trader-specific: 54%** ← Model now weighs individual trader skill heavily

### V9 Feature Importance (Full List)

| Rank | Feature | Attribution | Type |
|------|---------|-------------|------|
| 1 | entry_price | 0.5634 | Trade |
| 2 | price_vs_trader_avg | 0.4735 | **Trader** (NEW) |
| 3 | global_win_rate | 0.1784 | **Trader** |
| 4 | is_averaging_down | 0.0246 | **Trader** |
| 5 | trade_size_log | 0.0235 | Trade |
| 6 | conviction_z_score | 0.0214 | **Trader** |
| 7 | is_chasing_price_up | 0.0192 | **Trader** |
| 8 | final_niche | 0.0156 | Market |
| 9 | total_exposure_log | 0.0149 | Trade |
| 10 | bet_structure | 0.0117 | Market |
| 11 | niche_win_rate_history | 0.0099 | **Trader** |
| 12 | total_lifetime_trades | 0.0091 | **Trader** |

### Key Findings

1. **Trader Attribution improved 3.4x**: From 16% → 54%. The model now considers individual trader characteristics much more heavily.

2. **`price_vs_trader_avg` is highly predictive**: This new feature (0.47 attribution) captures "is this trader buying at an unusual price compared to their historical norm?" - this reveals conviction and edge.

3. **Slight AUC decrease expected**: 0.8054 → 0.7997 (-0.6%) is acceptable because:
   - We removed "cheating" features (price_bracket was just bucketed entry_price)
   - 2.5x more training data reduces overfitting
   - Model focuses on harder-to-learn trader patterns

4. **Niche now meaningful**: With 96% classification (vs 10%), the `final_niche` feature can actually contribute (0.016 attribution).

### Interpretation

The V9 model makes predictions based on:
1. **Where is the price?** (entry_price) - 40%
2. **Is this unusual for THIS trader?** (price_vs_trader_avg) - 34%
3. **How skilled is this trader overall?** (global_win_rate) - 13%
4. **What is the trader's behavior pattern?** (averaging down, chasing, conviction) - 13%

This is a more principled model that identifies trader edge rather than just market signals.

---

## References

1. Navnoor Bawa - "Polymarket Prediction System V2" (Substack)
2. arXiv 2401.06086 - "XGBoost Learning of Dynamic Wager Placement"
3. arXiv 2512.02436 - "Semantic Trading: Agentic AI for Prediction Markets"
4. SSRN 2322420 - "Trading Strategies and Market Microstructure"
5. J. Becker - "Microstructure of Wealth Transfer in Prediction Markets"
