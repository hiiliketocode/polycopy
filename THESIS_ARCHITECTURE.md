# Forward Testing Thesis Architecture

## Goal
Systematically discover which factors drive trading performance through controlled experiments.

## Measurement Dimensions
| Metric | Description | Why It Matters |
|--------|-------------|----------------|
| **Win Rate** | % of trades that profit | Basic success rate |
| **ROI** | Return on investment | Actual dollar performance |
| **Sharpe** | Risk-adjusted returns | Quality of returns vs volatility |
| **Sample Size** | Number of trades | Statistical significance |
| **Max Drawdown** | Worst losing streak | Risk exposure |

---

## Factor Matrix

```
                    ┌─────────────────────────────────────────────────────────────┐
                    │                     FACTOR SPACE                            │
                    ├─────────────────────────────────────────────────────────────┤
                    │                                                             │
    TRADER QUALITY  │  Win Rate ──────┬────── Experience ──────┬──── Conviction  │
                    │     │           │           │            │         │        │
                    │     ▼           ▼           ▼            ▼         ▼        │
                    │  [55-95%]    [30-200+]   [10-200]     [0.5-3x]  [0-15%]    │
                    │                          trades                  edge       │
                    │                                                             │
                    ├─────────────────────────────────────────────────────────────┤
                    │                                                             │
    PRICE/ODDS      │  Longshots ─── Contrarian ─── Mid-Range ─── Favorites ───  │
                    │    <25¢         10-40¢        30-70¢        60-90¢   >75¢  │
                    │                                                             │
                    ├─────────────────────────────────────────────────────────────┤
                    │                                                             │
    MARKET TYPE     │  Sports ──── Crypto ──── Politics ──── Finance ──── Other  │
                    │                                                             │
                    ├─────────────────────────────────────────────────────────────┤
                    │                                                             │
    ML MODEL        │  Off ──────────── 50% ──────────── 55% ──────────── 60%+   │
                    │                                                             │
                    ├─────────────────────────────────────────────────────────────┤
                    │                                                             │
    SIZING          │  Fixed ──── Kelly (0.25) ──── Kelly (0.5) ──── Edge-Scaled │
                    │                                                             │
                    └─────────────────────────────────────────────────────────────┘
```

---

## Strategy Tiers

### TIER 1: Single Factor Tests (6 strategies)
**Purpose:** Isolate each variable to understand its individual contribution.

| Strategy | Variable Tested | Settings | Hypothesis |
|----------|-----------------|----------|------------|
| **T1_BASELINE** | None (control) | No filters | What happens with zero filtering? |
| **T1_PURE_WR** | Win Rate only | WR ≥65% | Does WR alone predict success? |
| **T1_PURE_EDGE** | Edge only | Edge ≥15% | Does math edge alone work? |
| **T1_PURE_CONV** | Conviction only | Conv ≥2x | Does betting big signal knowledge? |
| **T1_PURE_ML** | ML Model only | ML ≥60% | Can AI alone pick winners? |
| **T1_EXPERIENCE** | Experience only | 200+ trades | Does track record matter? |

### TIER 2: Price Band Tests (5 strategies)
**Purpose:** Understand where on the odds curve opportunity exists.

| Strategy | Price Range | Hypothesis |
|----------|-------------|------------|
| **T2_CONTRARIAN** | 10-40¢ | Do underdogs offer best ROI? |
| **T2_MIDRANGE** | 30-70¢ | Is middle ground optimal? |
| **T2_FAVORITES** | 60-90¢ | Can we grind favorites? |
| **T2_LONGSHOTS** | <25¢ | Extreme underdogs +EV? |
| **T2_HEAVY_FAV** | >75¢ | Near-certain bets profitable? |

### TIER 3: Market Specialization (4 strategies)
**Purpose:** Test if certain market types are more predictable.

| Strategy | Markets | Hypothesis |
|----------|---------|------------|
| **T3_SPORTS** | Sports only | Sports betting expertise? |
| **T3_CRYPTO** | Crypto only | Crypto more predictable? |
| **T3_POLITICS** | Politics only | Political prediction edge? |
| **T3_FINANCE** | Finance only | Financial experts better? |

### TIER 4: Compound Strategies (6 strategies)
**Purpose:** Test factor combinations and interactions.

| Strategy | Factors Combined | Hypothesis |
|----------|------------------|------------|
| **T4_WR_CONV** | WR + Conviction | Elite + skin in game? |
| **T4_ML_EDGE** | ML + Edge | Model-validated edges? |
| **T4_CONTR_CONV** | Underdog + Conv | Bold longshot plays? |
| **T4_FAV_WR** | Favorites + WR | Safe + elite traders? |
| **T4_TRIPLE** | WR + Edge + Conv | All signals aligned? |
| **T4_FULL_STACK** | Everything | Maximum filtering? |

### TIER 5: Anti-Strategies (4 strategies)
**Purpose:** Validate by confirming opposites fail.

| Strategy | What It Tests | Expected Result |
|----------|---------------|-----------------|
| **T5_LOW_WR** | Follow bad traders | Should LOSE money |
| **T5_LOW_CONV** | Low conviction trades | Should underperform |
| **T5_NEG_EDGE** | Negative edge trades | Must LOSE money |
| **T5_RANDOM** | Near-random selection | Should break even |

### SPECIAL: Edge Cases (4 strategies)
| Strategy | Experiment | Hypothesis |
|----------|------------|------------|
| **S_WHALE** | Only >$100 trades | Big money = better info? |
| **S_MICRO** | Only <$10 trades | Small trades = noise? |
| **S_KELLY_AGG** | Full Kelly (1.0) | Aggressive sizing better? |
| **S_EDGE_SCALE** | Edge-proportional | Scale with opportunity? |

---

## Analysis Framework

### Phase 1: Baseline Establishment (Days 1-4)
1. Run all strategies simultaneously
2. Establish baseline metrics for each
3. Identify any data quality issues

### Phase 2: Factor Attribution (Days 5-14)
Compare pairs to isolate factor contributions:
```
T1_PURE_WR - T1_BASELINE = Win Rate Effect
T1_PURE_EDGE - T1_BASELINE = Edge Effect
T1_PURE_CONV - T1_BASELINE = Conviction Effect
T1_PURE_ML - T1_BASELINE = ML Model Effect
```

### Phase 3: Interaction Analysis (Days 15-30)
Look for synergies:
```
T4_WR_CONV - (T1_PURE_WR + T1_PURE_CONV) = Interaction Effect
```
Positive interaction = factors amplify each other
Negative interaction = factors overlap (redundant)

### Phase 4: Optimization (Days 30+)
1. Kill underperforming strategies
2. Double down on winners
3. Test variations of top performers

---

## Key Questions to Answer

1. **Which single factor has the largest effect?**
   - Compare T1 strategies to baseline

2. **Is there a "sweet spot" in price bands?**
   - Compare T2 strategies

3. **Are certain markets more predictable?**
   - Compare T3 strategies

4. **Do factors combine additively or multiplicatively?**
   - Compare T4 to sum of T1 components

5. **Does the ML model add value beyond trader stats?**
   - Compare ML-on vs ML-off versions

6. **Is conviction a reliable signal?**
   - Compare high vs low conviction strategies

7. **What's the optimal Kelly fraction?**
   - Compare S_KELLY_AGG to standard strategies

8. **Do anti-strategies confirm our hypotheses?**
   - T5 strategies should underperform/lose

---

## Expected Outcomes

### If Trader Quality Matters Most:
- T1_PURE_WR and T1_EXPERIENCE outperform
- T4_WR_CONV is best compound strategy
- T5_LOW_WR loses significantly

### If Mathematical Edge Matters Most:
- T1_PURE_EDGE outperforms
- T2_CONTRARIAN (high ROI potential) wins
- Conviction less important

### If Conviction Matters Most:
- T1_PURE_CONV outperforms
- T4_CONTR_CONV is best compound
- S_WHALE outperforms (big trades = high conviction)

### If ML Model Adds Value:
- T1_PURE_ML competitive with trader-based
- T4_ML_EDGE outperforms T4 without ML
- ML-on versions beat ML-off versions

---

## Total: 24 Strategies

```
TIER 1 (Single Factor):     6 strategies
TIER 2 (Price Bands):       5 strategies
TIER 3 (Market Types):      4 strategies
TIER 4 (Compound):          6 strategies
TIER 5 (Anti-Strategies):   4 strategies
SPECIAL (Edge Cases):       4 strategies
─────────────────────────────────────────
TOTAL:                     29 strategies
```

Plus existing strategies:
- FT_HIGH_CONVICTION
- FT_MODEL_BALANCED
- FT_UNDERDOG_HUNTER
- FT_FAVORITE_GRINDER
- FT_SHARP_SHOOTER
- FT_MODEL_ONLY

**GRAND TOTAL: ~35 concurrent forward tests**
