# Forward Testing: Key Learnings & Improvements

**Date:** February 2026  
**Purpose:** Share findings and planned improvements with cofounders and team.

---

## Executive Summary

We ran 66 forward-testing strategies on live Polymarket data. Early results (Day 1–2, ~51% resolution rate) revealed strong signals and clear problem areas. This doc summarizes learnings, improvements in progress, and recommendations.

---

## 1. Key Learnings from FT Analysis

### 1.1 Win Rate vs PnL: Why Low WR Can Mean Positive PnL

**Finding:** Overall win rate is ~27% but the system can be profitable. This is expected for underdog-heavy strategies.

| Metric | Value |
|--------|-------|
| Overall WR | 26.8% |
| Avg Win | $18.13 |
| Avg Loss | $10.49 |
| Win:Loss Ratio | 1.73:1 |

**Explanation:** When buying at 30¢, a loss costs ~$1.20 but a win pays ~$2.80. Break-even WR is ~30%. Underdog strategies can be profitable with WR well below 50%.

### 1.2 Entry Price Sweet Spot: 20–40¢

| Price Range | Trades | WR | Total PnL | PnL/Trade |
|-------------|--------|-----|-----------|-----------|
| 0–20¢ (longshots) | 1,045 | 1.6% | -$10,326 | -$9.88 |
| **20–40¢ (underdogs)** | **1,247** | **42.5%** | **+$6,869** | **+$5.51** |
| 40–60¢ (mid-range) | 1,563 | 25.7% | -$7,954 | -$5.09 |
| 60–80¢ (favorites) | 72 | 81.9% | +$122 | +$1.70 |
| 80–100¢ (heavy fav) | 63 | 95.2% | -$13 | -$0.21 |

**Takeaway:** 20–40¢ is the clear sweet spot. Longshots (&lt;20¢) lose heavily. Favorites are marginal.

### 1.3 Crypto Markets Are Destroying Performance

| Category | % of Trades | Total PnL | WR |
|----------|-------------|-----------|-----|
| Crypto (BTC/ETH short-term) | 55.7% | **-$12,591** | 14.3% |
| Non-crypto | 44.3% | **+$1,225** | 42.5% |

**Takeaway:** Without crypto price markets, the system is net positive. Short-term crypto price direction appears near-random; our traders and model don’t have edge there.

### 1.4 Conviction Is the Strongest Signal

| Conviction | Trades | WR | PnL |
|------------|--------|-----|-----|
| &lt;1x | 577 | 25.6% | -$2,131 |
| 3–5x | 121 | 36.4% | **+$168** |
| 5x+ | 126 | 48.4% | **+$89** |

**Takeaway:** When traders bet 3x+ their usual size, outcomes are profitable. Conviction outperforms ML score, trader WR, and edge in our sample.

### 1.5 Trader WR Sweet Spot: 55–60%

Traders with 55–60% historical WR had **82% actual win rate** on copied trades. Higher WR bands (60–65%, 65%+) underperformed.

**Hypothesis:** 55–60% WR traders may be less arbitraged and offer better value than “elite” 65%+ traders.

### 1.6 Model Impact: Mixed

- **Model + price filtering works:** Underdog Hunter (model + underdogs) +$315 vs High Conviction (no model) -$288.
- **Model-only underperforms:** Model Only strategy lost -$1,075.
- **ML confidence bands matter:** 60–65% ML bucket had 73.5% WR; 55–60% had 34.9% WR (worst).
- **Kelly sizing amplifies losses:** Bologna FC (wrong ML call) caused large Kelly-sized losses.

### 1.7 Top Performers (Realized PnL)

1. **Underdog Hunter** (+$315) – Model 50%+, underdogs 0–50¢, 5% edge
2. **ML Sharp Shooter** (+$163) – ML 55%+, 1.5x conviction
3. **T4 Contrarian + Conviction** (+$102) – 10–40¢, 2x conviction, no model

### 1.8 Anti-Strategies Validation

T5 strategies (Low WR, Negative Edge, Random) are losing as expected. Thesis validation holds.

---

## 2. Improvements in Progress

### 2.1 Thesis Integrity: Leave Existing Strategies Unchanged

We are **not** modifying existing strategies mid-test. Changing rules would break before/after comparisons and the controlled experiment design.

### 2.2 New Iterative Strategies (Deployed)

New strategies test specific hypotheses derived from the analysis:

| Strategy | Hypothesis |
|----------|------------|
| **Sweet Spot 20–40** | Is 20–40¢ the best band when made explicit? |
| **Conviction 3x** | Does requiring 3x+ conviction improve underdog selection? |
| **Underdog No Crypto** | Does excluding crypto improve Underdog Hunter performance? |
| **ML Band 60%** | Does ML 60%+ (narrower than 55%+) improve precision? |

### 2.3 Trade Feed Recommendation Engine (Replaced)

The trade feed recommendation engine has been **fully replaced** with an FT-learnings-based system:

**Scoring weights (FT-based):**
- **Conviction (30%)** – 3x+ = strong positive; &lt;1x = negative
- **Trader WR band (25%)** – 55–65% = sweet spot; &lt;45% with 15+ trades = avoid
- **Entry price band (25%)** – 20–40¢ = sweet spot; &lt;20¢ = toxic
- **Market type (15%)** – Crypto short-term = negative; non-crypto = positive
- **Edge (5%)** – Small adjustment based on AI edge

**Badges:** STRONG_BUY / BUY / NEUTRAL / AVOID / TOXIC (shown to Premium and Admin users)

**Details tray:** Expandable panel with FT indicators: Conviction, Trader WR, Entry Band, Market Type, Edge. Each shows label and status (e.g. "sweet_spot", "avoid", "caution").

### 2.4 FT Dashboard UI Fixes

- **Correct config display:** Badges now show actual wallet config (ML %, price range, edge, conviction).
- **“What This Strategy Tests”** card: Prominent hypothesis/description for each strategy.
- **Value/P&L display:** Positions awaiting resolution now show mark-to-market Value and P&L with "~" prefix instead of "Pending".

---

## 3. Recommendations

### 3.1 For Real Money ($1k Test)

| Rank | Strategy | Rationale |
|------|----------|-----------|
| 1 | **Underdog Hunter** | Best performer; model + underdog + edge; 101 resolved trades. |
| 2 | **ML Sharp Shooter** | Second best; selective, high conviction. |
| 3 | **T4 Contrarian + Conviction** or **Underdog No Crypto** | Contrarian + Conviction: no model, validates conviction. Underdog No Crypto: tests crypto exclusion. |

### 3.2 For Scaling to 100s of Strategies

**Feasibility:** Yes, with engineering and monitoring.

**Technical:** Sync cost scales with wallet count; DB and resolution load increase. Plan for batching, indexing, and rate limits.

**Statistical:** Multiple testing risk. Use holdout validation, corrections, or meta-strategies rather than picking a single “winner.”

**Operational:** Use strategy families (e.g. underdog variants, conviction variants) for aggregation and comparison.

### 3.3 For the ML Model

- Keep the PnL-weighted logistic regression approach.
- Use ML as **one input** in a composite recommendation score, not the sole filter.
- Prefer the 60–65% ML band; treat 55–60% as a weak or negative signal until more data is available.

---

## 4. Data Quality & Anomalies Identified (Fixes Applied)

- **505 open orders past market end time:** Resolution lag → **Fixed:** ft-resolve cron increased from every 10 min to every 5 min.
- **10 wallets with PnL mismatch:** Drift between wallet `total_pnl` and sum of order PnL → **Fixed:** Full wallet stats reconciliation runs hourly (within ft-resolve).
- **Single toxic trader (0xa42f127d):** ~$10k losses across 1,284 trades → **Fixed:** Trader excluded via `FT_EXCLUDED_TRADERS` (default includes 0xa42f127d). Filter applied in FT sync and fire feed.

---

## 5. Next Steps

1. Run new strategies for 2–4 weeks.
2. Re-run `scripts/ft-performance-analysis.ts` as more markets resolve.
3. Evaluate Underdog No Crypto vs Underdog Hunter.
4. Consider excluding or downweighting short-term crypto markets in production strategies.
5. Iterate on recommendation engine weights as more FT data accumulates.

### Recommendations Not Yet Addressed (Operational / Future)

| Item | Status |
|------|--------|
| **Scaling to 100s of strategies** (batching, indexing, rate limits) | Planned; implement when scaling |
| **Multiple testing risk** (holdout validation, meta-strategies) | Statistical consideration for analysis |
| **ML model refinement** (60–65% band preference) | Partially in rec engine; full model retrain TBD |
| **Exclude crypto in production** | Underdog No Crypto strategy tests this; production rollout TBD |

---

## 6. How to Run Analysis & Deploy

```bash
# Full FT performance analysis
npx tsx scripts/ft-performance-analysis.ts

# Anomaly deep dive
npx tsx scripts/ft-anomaly-deep-dive.ts

# Underdog Hunter PnL audit
npx tsx scripts/audit-underdog-hunter-pnl.ts

# Deploy new FT-learnings strategies (run migration)
supabase db push
# Or: supabase migration up
```

**New strategies migration:** `supabase/migrations/20260208_ft_learnings_strategies.sql` adds four wallets: Sweet Spot 20–40¢, Conviction 3x, Underdog No Crypto, ML Band 60%.

---

*Document maintained by the trading team. Last updated February 2026.*
