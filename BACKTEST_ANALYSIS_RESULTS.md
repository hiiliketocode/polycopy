# Systematic Backtest Analysis Results

**Date**: February 6, 2026  
**Test Periods**: Jan 15-31, 2026 (Holdout) & Dec 15-31, 2025 (Validation)  
**Model**: PnL-weighted Logistic Regression (`model_logistic_pnl_weighted`)

---

## Executive Summary

The ML model provides **significant, robust value** across different market conditions. All model-based configurations were profitable in both test periods, while the baseline (no model) was unreliable.

### Top Recommendation

| Use Case | Recommended Config | Expected PnL/Trade | Notes |
|----------|-------------------|-------------------|-------|
| **Bot Trading** | MODEL_50 | +12-14%/trade | Maximum volume, consistent returns |
| **Manual Trading** | UNDERDOG_M50_E5 | +43-49%/trade | Higher efficiency, fewer trades |

---

## Phase 1: Single-Factor Analysis

### 1a. Model Threshold Impact

Testing on Jan 15-31, 2026 with Top 50 traders by win rate:

| Threshold | Trades | Win Rate | Total PnL |
|-----------|--------|----------|-----------|
| No Model | 44,704 | 98.6% | +865 |
| 50% | 44,722 | 99.0% | **+903** |
| 60% | 44,665 | 99.1% | +263 |
| 70% | 44,627 | 99.2% | +272 |
| 80% | 44,416 | 99.6% | +425 |

**Learning**: Lower thresholds (50%) capture more profitable trades. Higher thresholds filter too aggressively.

### 1b. Trading Style (Price Band) Impact

Testing all traders (no selection):

| Style | Trades | Win Rate | Avg PnL | Total PnL |
|-------|--------|----------|---------|-----------|
| All Prices | 1.6M | 60.2% | +6.15% | +99,906 |
| Underdog (<50%) | 639K | 31.3% | +15.12% | **+96,661** |
| Balanced (30-70%) | 703K | 51.6% | +3.04% | +21,370 |
| Favorite (>70%) | 633K | 89.7% | -0.04% | **-232** |

**Learning**: 
- **Underdogs generate the most profit** despite lower win rates
- **Favorites are actually LOSING** on average without filtering
- "Top by win rate" selection biases toward favorites, missing profitable underdogs

### 1c. Edge Filter Impact

| Edge Filter | Trades | Win Rate | Avg PnL | Total PnL |
|-------------|--------|----------|---------|-----------|
| 0% | 1.6M | 60.2% | +6.15% | +99,906 |
| 5% | 645K | 32.6% | +15.17% | +97,920 |
| 10% | 529K | 28.8% | +17.82% | +94,364 |

**Learning**: Edge filter improves avg PnL but reduces volume. Best for quality over quantity.

---

## Phase 2: Key Interactions

### 2a. Model × Trading Style

| Style | No Model | Model 50% | Model 60% | Model 70% |
|-------|----------|-----------|-----------|-----------|
| All | +99,906 | **+356,653** | +301,630 | +234,594 |
| Underdog | +96,661 | **+246,096** | +171,960 | +99,106 |
| Balanced | +21,370 | **+255,678** | +242,839 | +200,534 |
| Favorite | -232 | +23,090 | +29,059 | **+34,323** |

**Learning**:
- Model 50% provides best total PnL for All, Underdog, and Balanced
- For Favorites, higher thresholds (70%) work better
- Model turns Favorites from LOSING (-232) to PROFITABLE (+34K)

### 2b. Model × Edge Filter

| Edge | No Model | Model 50% | Model 60% | Model 70% |
|------|----------|-----------|-----------|-----------|
| 0% | +99,906 | **+356,653** | +301,630 | +234,594 |
| 5% | +97,920 | +193,583 | +126,596 | +68,438 |
| 10% | +94,364 | +151,264 | +89,788 | +41,836 |

**Learning**: Model + No Edge provides highest total PnL. Edge filter reduces volume too much when combined with model.

---

## Phase 3: Optimal Configurations

### Ranked by Total PnL

| Rank | Config | Trades | Win Rate | Avg PnL | Total PnL |
|------|--------|--------|----------|---------|-----------|
| 1 | MODEL_50 | 2.9M | 72.5% | +12.19% | **+356,653** |
| 2 | WIDE_M50 (20-80%) | 2.0M | 63.9% | +16.25% | +322,794 |
| 3 | BALANCED_MODEL50 | 1.5M | 60.8% | +16.78% | +255,678 |
| 4 | UNDERDOG_MODEL50 | 661K | 52.2% | +37.21% | +246,096 |
| 5 | BALANCED_MODEL60 | 1.1M | 65.0% | +21.21% | +242,839 |

### Ranked by Efficiency (Avg PnL/Trade)

| Rank | Config | Avg PnL | Total PnL | Win Rate |
|------|--------|---------|-----------|----------|
| 1 | UNDERDOG_M50_E5 | **+43.37%** | +187,336 | 49.6% |
| 2 | MODEL50_EDGE5 | +40.69% | +193,583 | 51.5% |
| 3 | UNDERDOG_MODEL50 | +37.21% | +246,096 | 52.2% |
| 4 | BALANCED_MODEL60 | +21.21% | +242,839 | 65.0% |
| 5 | BALANCED_MODEL50 | +16.78% | +255,678 | 60.8% |

---

## Phase 4: Robustness Check

Testing top configs on Dec 2025 (validation) vs Jan 2026 (holdout):

| Config | Dec 2025 PnL | Jan 2026 PnL | Robust? |
|--------|-------------|--------------|---------|
| BASELINE (no model) | **-10,701** | +99,906 | ❌ MIXED |
| MODEL_50 | +313,416 | +356,653 | ✅ YES |
| UNDERDOG_MODEL50 | +203,571 | +246,096 | ✅ YES |
| BALANCED_MODEL50 | +206,523 | +255,678 | ✅ YES |
| UNDERDOG_M50_E5 | +155,119 | +187,336 | ✅ YES |

**Critical Finding**: 
- The BASELINE without model **LOST money** in Dec 2025 but made money in Jan 2026
- ALL model-based configs were **profitable in BOTH periods**
- The model provides reliable, robust edge across different market conditions

---

## Key Learnings

### 1. Model Value is Real and Significant
- Without model: Inconsistent (lost money in Dec 2025)
- With model: Consistent profits in both periods
- Model improves total PnL by **2.5-3.5x** vs baseline

### 2. Underdogs > Favorites
- Underdogs (entry price <50%) generate highest total profits
- Favorites (>70%) are actually LOSING without model filtering
- "Top traders by win rate" biases toward favorites - avoid this selection method

### 3. Model Threshold Sweet Spot: 50%
- Higher thresholds (60-80%) filter out too many profitable trades
- 50% threshold captures the most value
- Exception: Favorites benefit from higher thresholds (70%)

### 4. Edge Filter Trade-off
- Edge filter improves per-trade efficiency
- But significantly reduces trade volume
- Best used for manual trading, not bots

### 5. Market Conditions Vary Significantly
- Dec 2025: Underdogs lost (-22K), Favorites won (+6K)
- Jan 2026: Underdogs won (+97K), Favorites lost (-0.2K)
- Model adapts to both conditions successfully

---

## Recommended Configurations

### For Bot Trading (Max Volume)
```
Config: MODEL_50
- Model threshold: 50%
- Price filter: None (all prices)
- Edge filter: None
- Expected: ~12% avg PnL, 2-3M trades/period
```

### For Manual Trading (High Conviction)
```
Config: UNDERDOG_M50_E5
- Model threshold: 50%
- Price filter: Underdogs (<50% entry price)
- Edge filter: 5%
- Expected: ~43% avg PnL, 300-400K trades/period
```

### For Balanced Risk/Reward
```
Config: BALANCED_MODEL50
- Model threshold: 50%
- Price filter: 30-70% entry price
- Edge filter: None
- Expected: ~17% avg PnL, 1.2-1.5M trades/period
```

---

## Next Steps

1. **Implement live paper trading** with recommended configs
2. **Add position sizing** (Kelly criterion with the model scores)
3. **Monitor for model drift** - retrain monthly with fresh data
4. **Test trader selection methods** beyond "all traders"
5. **Explore market-type and bet-structure filters**
