# ML Test Brainstorm & Research: Why So Many Losing Tests?

**Purpose:** Research why many FT strategies lose, then brainstorm new ML-related tests (live-only, niche, ML-based allocation, etc.) that could outperform.

---

## Part 1: Why Are So Many Tests Losing?

### 1.1 Root Causes (from FT Learnings & System Explainer)

| Driver | Evidence | Implication |
|--------|----------|-------------|
| **Price band** | 0–20¢ longshots: 1.6% WR, -$10.3k PnL. 20–40¢: 42.5% WR, +$6.9k. 40–60¢ mid-range: 25.7% WR, -$8k. | Longshots and mid-range destroy value. 20–40¢ is the only clear sweet spot. Many strategies use 0–50¢ or 10–40¢ and pull in toxic longshots. |
| **Crypto** | Crypto (BTC/ETH short-term): 55.7% of trades, -$12.6k, 14.3% WR. Non-crypto: +$1.2k, 42.5% WR. | Any strategy that doesn’t exclude crypto is dragged down. |
| **ML band** | 55–60% ML: 34.9% WR (worst). 60–65% ML: 73.5% WR. | Using ML 55% as a gate lets in the worst ML band. Model-only (no price/conviction filter) lost -$1,075. |
| **Conviction** | &lt;1x: 25.6% WR, -$2.1k. 3–5x: 36.4% WR, +$168. 5x+: 48.4% WR, +$89. | Low-conviction trades lose; 3x+ is profitable. Many strategies have min_conviction=0. |
| **Kelly sizing** | “Kelly sizing amplifies losses” when the model is wrong (e.g. Bologna FC). | Edge-based Kelly blows up on bad edges; wrong ML call → large loss. |
| **Strategy sprawl** | 66+ strategies; many are underdog-heavy (T2 contrarian, 10–40¢) or no price filter. | Audit: 0.21–0.40¢ bucket ~3% WR; 0.61–0.80¢ ~80% WR. Underdog-heavy strategies are statistically losing. |
| **No ML in sizing** | `calculateBetSize` uses FIXED, KELLY (edge), CONVICTION, CONFIDENCE (edge+WR+conviction). **ML score is never used for allocation.** | We gate on ML but don’t “bet more when ML is higher”; opportunity left on the table. |

### 1.2 What’s Working (to double down on)

- **Underdog Hunter**: Model 50%+, 0–50¢, 5% edge — +$315.
- **ML Sharp Shooter**: ML 55%+, 1.5x conviction — +$163.
- **T4 Contrarian + Conviction**: 10–40¢, 2x conviction, **no model** — +$102.
- **20–40¢ band** and **3x+ conviction**; **60–65% ML band**; **non-crypto**.

---

## Part 2: New ML Test Dimensions (Brainstorm)

### 2.1 ML + Context (Where does ML help most?)

| Idea | Config sketch | Hypothesis |
|------|----------------|------------|
| **ML Live Games Only** | use_model=true, trade_live_only=true, 20–40¢ or 60–80¢, CONVICTION allocation. | ML may add more value when the event has started (more information). Compare vs LIVE_WR_ONLY and LIVE_MODEL_ONLY. |
| **ML No Crypto** | use_model=true, market_categories = non-crypto (exclude CRYPTO/BTC/ETH), 20–40¢ or full range. | Replicate “Underdog No Crypto” but with explicit ML gate; crypto kills WR so ML on non-crypto may shine. |
| **ML Sports Only** | use_model=true, market_categories = [SPORTS, NBA, NFL, …], 20–40¢ or 55–85¢. | Model may be better calibrated on sports; test if niche restriction improves ML value. |
| **ML Politics Only** | use_model=true, market_categories = [POLITICS, ELECTIONS], 0–100¢. | Same idea for politics. |
| **ML Favorites Band** | use_model=true, 55–85¢ (or 60–80¢), 5% edge. | FT: 60–80¢ had 81.9% WR. Restrict to favorites + ML and measure PnL/trade. |
| **ML Sweet Spot Only** | use_model=true, 20–40¢, 5% edge, CONVICTION. | Combine the only profitable price band with ML and conviction sizing. |

### 2.2 Using ML Score for Allocation (New allocation type)

**Current state:** Allocation methods are FIXED, KELLY (edge), EDGE_SCALED, TIERED, CONVICTION, CONFIDENCE (edge+WR+conviction). **None use `model_probability`.**

| Idea | Mechanism | Hypothesis |
|------|------------|------------|
| **ML-scaled allocation** | New method e.g. `ML_SCALED`: baseBet * (0.5 + (model_probability - 0.5)) so 55% → 1.05x, 70% → 1.2x. | Bet more when the model is more confident; could improve Sharpe vs FIXED. |
| **ML + Conviction combo** | New method or CONFIDENCE variant: include ML in the score, e.g. mlScore = (model_probability - 0.5) / 0.5; bet ∝ base * (0.5 + 0.25*edge + 0.25*conv + 0.25*ml). | Combine ML with conviction and edge for sizing; test if it beats CONVICTION or CONFIDENCE alone. |
| **ML-tiered** | Like TIERED but for ML: 65%+ → 2x, 60–65% → 1.5x, 55–60% → 1x, &lt;55% don’t take (or 0.5x). | Only for use_model strategies; bet size reflects model confidence band. |

**Implementation note:** Sync would need to pass `model_probability` (or equivalent) into `calculateBetSize` and support a new allocation method (e.g. `ML_SCALED` or `ML_TIERED`).

### 2.3 ML Threshold + Context (Strict gates that avoid known losers)

| Idea | Config | Hypothesis |
|------|--------|------------|
| **ML 60%+ only, 20–40¢** | model_threshold=0.60, price 0.20–0.40, 5% edge, CONVICTION. | Use best ML band (60–65%) and best price band (20–40¢); avoid 55–60% ML and longshots. |
| **ML 65%+ only, no crypto** | model_threshold=0.65, market_categories = non-crypto, CONVICTION. | Highest ML confidence and drop the worst category. |
| **ML 60%+ Live only** | model_threshold=0.60, trade_live_only=true, CONVICTION. | High ML + live-only; does in-play info + model confidence beat generic ML? |

### 2.4 Anti–bad-combo tests (Explicitly avoid what loses)

| Idea | Config | Hypothesis |
|------|--------|------------|
| **No longshots, ML 60%** | model_threshold=0.60, price_min=0.20 (no 0–20¢), CONVICTION. | “No longshots” is the single biggest fix; ML 60% avoids worst ML band. |
| **No crypto, ML 60%, 3x conv** | model_threshold=0.60, market_categories = non-crypto, min_conviction=3, 20–40¢ or 0–50¢. | Combine: no crypto, best ML band, conviction filter, optional sweet-spot band. |

### 2.5 Allocation A/B (Same entry rules, different sizing)

| Idea | Config | Hypothesis |
|------|--------|------------|
| **ML 60% + FIXED vs KELLY vs CONVICTION** | Same entry: ML 60%, 20–40¢, 5% edge. Three wallets: FIXED, KELLY, CONVICTION. | Learnings say Kelly amplifies losses; test whether FIXED or CONVICTION beats KELLY for same ML+price filter. |
| **ML 60% + CONVICTION vs ML_SCALED** | Once ML_SCALED exists: same entry, CONVICTION vs ML_SCALED. | Does sizing by ML beat sizing by trader conviction when both are gated by ML 60%? |

---

## Part 3: Prioritized Short List (High impact, feasible)

1. **ML 60% + 20–40¢ + CONVICTION (no longshots)** — Best ML band + best price band + conviction sizing; no new infra.
2. **ML 60% + No Crypto** — Replicate LEARNINGS_NO_CRYPTO with ML 60% and CONVICTION.
3. **ML Live Only (60% + trade_live_only)** — Use existing LIVE infrastructure; add ML 60% and CONVICTION.
4. **ML Sports Only (60%, 20–40¢ or 55–85¢)** — Use existing `market_categories`; ML + niche.
5. **ML-scaled allocation (new method)** — Implement `ML_SCALED` (or ML in CONFIDENCE), then add 1–2 strategies that use it with ML 60% and 20–40¢.

---

## Part 4: Implementation Notes

- **New allocation method (ML_SCALED):** Extend `lib/ft-sync/shared-logic.ts` and sync route: add a case that takes `modelProbability` and scales bet (e.g. baseBet * (0.5 + (modelProbability - 0.5))), and ensure sync passes `preInsertMlProbability` into the sizing call for use_model wallets.
- **Live + ML:** Use `detailed_description` or wallet column for `trade_live_only`; already supported in sync (extFilters.trade_live_only + game_start_time).
- **Niche (Sports/Politics/No Crypto):** Use `market_categories` on wallet or in extended filters; already supported.
- **New strategies:** Add via migration (e.g. `20260328_add_ml_context_strategies.sql`) and optionally self-healing in `app/api/ft/wallets/route.ts` and forward-test CONFIGS.

---

*Doc created from FT learnings, system explainer, and codebase review. Use this to pick which ML tests to implement next.*
