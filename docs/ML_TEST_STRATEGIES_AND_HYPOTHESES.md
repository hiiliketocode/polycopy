# ML Test Strategies & Hypotheses

**Purpose:** Document all ML-related forward-test strategies with their hypotheses for comparison and deployment.

---

## ML Threshold Sweep (Pure Unfiltered ML)

**Goal:** Find the ML score sweet spot. FT analysis: ML 60–65% had 73.5% WR; 55–60% had 34.9% WR. These strategies isolate ML threshold only—no price/edge filters—to map where the sweet spot lies. **Bet sizing uses CONVICTION** (trader bet size vs avg) to scale position size with trader confidence.

| Strategy   | ML % | Price   | Edge | Allocation  | Hypothesis |
|-----------|------|---------|------|-------------|------------|
| ML_SWEEP_50 | 50 | 0–100¢ | 0 | CONVICTION | Does a loose ML 50% threshold add or destroy value vs higher gates? Baseline for sweep comparison. |
| ML_SWEEP_55 | 55 | 0–100¢ | 0 | CONVICTION | FT data: 55–60% ML band had 34.9% WR (worst). Is 55% floor too loose? Compare vs 60/65/70. |
| ML_SWEEP_60 | 60 | 0–100¢ | 0 | CONVICTION | FT data: 60–65% ML band had 73.5% WR. Is 60% the inflection point where ML adds real value? |
| ML_SWEEP_65 | 65 | 0–100¢ | 0 | CONVICTION | Fewer trades but higher model confidence. Does 65% improve precision vs 60%? |
| ML_SWEEP_70 | 70 | 0–100¢ | 0 | CONVICTION | Highest confidence trades only. Does extreme selectivity improve Sharpe or starve the strategy? |

---

## ML Mix (Combined ML + Other Filters)

**Goal:** Pair ML with best-performing non-model strategies to measure incremental value.

| Strategy   | Hypothesis |
|-----------|------------|
| ML_SHARP_SHOOTER | Does ML improve the profitable Sharp Shooter profile? (ML 55% + 1.5x conviction) |
| ML_UNDERDOG | Does ML filter underdogs to only mispriced ones? (ML 55% + 0–50¢, 5% edge) |
| ML_FAVORITES | Does ML improve favorites grinding? (ML 55% + 60–90¢, 3% edge) |
| ML_HIGH_CONV | Does ML + trader conviction = better than either alone? (ML 55% + 2x conviction) |
| ML_EDGE | Does ML + edge beat ML-only or edge-only? (ML 55% + 5% min edge) |
| ML_MIDRANGE | Is ML + mid-range the sweet spot? (ML 55% + 25–75¢ only) |
| ML_STRICT | Does raising ML threshold improve precision? (ML 65% only) |
| ML_LOOSE | Does a lower ML threshold add or destroy value? (ML 50% only) |
| ML_CONTRARIAN | Does ML improve contrarian (underdog) selection? (ML 55% + 10–40¢, 5% edge) |
| ML_HEAVY_FAV | Does ML add value to heavy favorites? (ML 55% + 75–95¢, 2% edge) |

---

## FT Learnings (Feb 2026)

**Goal:** Test hypotheses from early FT analysis.

| Strategy | Hypothesis |
|----------|------------|
| LEARNINGS_SWEET_SPOT | Is 20–40¢ the best band when made explicit? (FT best performer: +$6.9k) |
| LEARNINGS_CONV_3X | Does requiring 3x+ conviction improve underdog selection? |
| LEARNINGS_NO_CRYPTO | Does excluding crypto improve Underdog Hunter performance? (FT: crypto -91% PnL drag) |
| LEARNINGS_ML_60 | Does ML 60%+ (narrower than 55%+) improve precision? (FT: 60–65% had 73.5% WR) |

---

## Thesis T1: Pure ML (Single Factor)

| Strategy | Hypothesis |
|----------|------------|
| T1_PURE_ML | Can the ML model predict winners without trader stats? (ML 60%+ only) |

---

## Deployment

- **Migration:** `supabase/migrations/20260327_add_ml_threshold_sweep_strategies.sql` inserts the 5 ML sweep strategies.
- **Self-healing:** `GET /api/ft/wallets` auto-inserts ML mix + ML sweep strategies if missing.
- **BigQuery:** `app/api/forward-test/update/route.ts` CONFIGS includes ML sweep configs for daily snapshot.
