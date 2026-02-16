# PolyCopy: AI-Powered Copy Trading — Marketing Value Proposition

**Purpose:** Messaging document for marketing, sales, and investor communications  
**Last Updated:** February 2026

---

## Executive Summary

PolyCopy is the only prediction market copy-trading platform that combines **machine learning trained on 50M+ trades** from Polymarket's top performers with **context-aware performance data** and **live execution controls**. Our AI doesn't just predict winners—it helps you decide *which* trades to copy and *which* to skip, using the same signals that separate profitable copy traders from those who lose money.

---

## 1. The Machine Learning Advantage

### 1.1 Trained on Real Success

Our ML scoring system is built on **50M+ historical trades** from Polymarket's top traders. The pipeline:

- **84M raw trades** → **46M point-in-time enriched trades** → **40M+ training samples**
- **Zero look-ahead bias:** We use trader statistics *as they existed at the moment of each trade*, not future performance
- **Recency weighting:** Recent trades matter more (99-day half-life) because markets evolve
- **PnL-weighted training:** The model optimizes for *profitability*, not accuracy

### 1.2 Why PnL-Weighting Matters

Standard models optimize for accuracy. That's dangerous in prediction markets:

- A model can be 90% accurate but **unprofitable** if it correctly predicts many low-payout favorites (win $0.02 on $1) and misses high-payout underdogs (lose $1 that could have won $19)
- Our model **weights samples by potential PnL impact:** `weight = recency × (1 / entry_price)`
- A 5¢ underdog trade gets **20× more weight** than a 95¢ favorite
- Result: The model learns to prioritize getting high-impact trades right

### 1.3 What the Model Predicts

- **Output:** Probability that a trade will resolve as a **WIN** (0–100%)
- **34+ features** across 11 categories (see Section 3)
- **Verdicts:** STRONG_BUY, BUY, HOLD, AVOID — surfaced on every trade card
- **Backtested:** 2.5–3.5× improvement over baseline; turns favorites from losing to profitable

### 1.4 Key Backtest Results (Jan 2026)

| Configuration | Win Rate | Total PnL | vs. No Model |
|---------------|----------|-----------|---------------|
| No model (baseline) | 60% | +$99K | — |
| **Model 50%** | **72.5%** | **+$356K** | **+257%** |
| Underdog + Model | 52% | +$246K | +155% |
| Favorites (no model) | 90% | **-$232** | Losing |
| Favorites + Model | — | +$34K | **Profitable** |

**Critical finding:** High win rate ≠ profitability. Favorites lose money without the model. The ML filter turns them profitable.

---

## 2. How It Helps You Decide What to Copy

### 2.1 The Core Problem

Polymarket has thousands of trades every day. Top traders make hundreds of bets. **Which ones should you copy?**

- Copy everything → You inherit their losers and their winners. Many top traders have 55% win rates—you need to pick the *right* 55%.
- Copy nothing → You miss alpha.
- Copy blindly by trader → You get their bad bets (low conviction, wrong niche, chasing price).

### 2.2 Our Solution: Multi-Signal Scoring

Every trade is scored by **PolyScore** (our recommendation engine) using:

1. **ML probability** — Model confidence (0–100%)
2. **Edge** — Trader's historical win rate in this context minus entry price (e.g., 65% WR at 50¢ = 15% edge)
3. **Conviction** — Is this trader betting more than usual? (2× normal = high conviction)
4. **Niche fit** — Does this trader have proven edge in *this* market type?
5. **Price band** — 20–40¢ (sweet spot), &lt;20¢ (longshot, risky), 60–90¢ (favorite, different dynamics)
6. **Performance regime** — Is the trader HOT, COLD, or STABLE recently?

### 2.3 Verdicts You See

| Verdict | Meaning | Action |
|---------|---------|--------|
| **STRONG_BUY** | High ML score + strong signals | Best candidates |
| **BUY** | Good signals, above threshold | Copy with confidence |
| **HOLD** | Mixed signals | Proceed with caution |
| **AVOID** | Weak or negative signals | Skip |
| **TOXIC** | Hedging, bad WR, or known pitfalls | Do not copy |

---

## 3. Context-Aware Performance Data

### 3.1 Why Context Matters

A trader with 60% win rate in **Politics** might have 40% in **Crypto**. A trader great at **underdogs** (&lt;40¢) might be average at **favorites** (&gt;70¢). We measure performance **in context**.

### 3.2 Dimensions We Use

| Dimension | What We Measure | Why It Matters |
|-----------|-----------------|----------------|
| **Market Niche** | NBA, NFL, Politics, Crypto, etc. | Traders specialize. A Politics expert copying an NBA bet is a different signal. |
| **Entry Price** | Underdog (&lt;40¢), Mid (40–60¢), Favorite (&gt;60¢) | Different risk/reward. Underdogs need higher edge. |
| **Bet Type** | STANDARD, OVER_UNDER, SPREAD | SPREAD bets have different dynamics; some traders excel in totals. |
| **Price Bracket** | LOW, MID, HIGH | Matches entry price to trader's historical sweet spot. |

### 3.3 Trader Profile Stats

We maintain **trader_profile_stats**: win rate, ROI, and trade count **per niche + bet structure + price bracket**. When you see a trade:

- **Niche win rate** — e.g., "62% in NBA"
- **Trade count** — e.g., "47 trades in this profile" (sample size matters)
- **ROI** — Historical return in this exact context
- **Data source** — "Specific Profile" (exact match) vs "Niche" vs "Global" (fallback)

### 3.4 In-Context Datapoints on Every Trade

| Datapoint | Description | Use When Deciding |
|-----------|-------------|-------------------|
| **Conviction** | Trade size vs trader's average (e.g., 2.3×) | High conviction + good WR = strongest human signal |
| **ROI** | Trader's ROI in this niche/price band | Positive ROI = proven edge |
| **Trade count** | Resolved trades in this profile | &lt;20 = noisy; 50+ = reliable |
| **Edge %** | Win rate − entry price | +10% = strong; negative = overpaying |
| **ML probability** | Model's win prediction | 55%+ = model approves; 65%+ = high confidence |
| **Performance regime** | HOT / COLD / STABLE | HOT = momentum; COLD = caution |
| **Niche expert** | Is trader in their best niche? | Yes = stronger signal |

---

## 4. Other Signals That Help Your Decision

### 4.1 Behavioral Signals (in the ML Model)

- **Trader selectivity** — Are they picky or spraying?
- **Price vs trader avg** — Betting above/below their usual? (Deviation can mean opportunity or chasing.)
- **Is chasing price up** — Generally negative
- **Is averaging down** — Can be positive with high WR (doubling on conviction)
- **Is hedging** — Different intent; often avoid when edge is negative
- **Trader sells ratio** — Do they exit early? Informs exit strategy
- **Is with crowd** — Contrarian vs consensus

### 4.2 Market & Timing Signals

- **Volume momentum** — Is liquidity growing?
- **Liquidity impact** — Will your size move the market?
- **Market duration** — New markets often have more mispricing
- **Minutes to start** — Live event vs pre-game (different dynamics)
- **Hours to close** — Near resolution = binary gamble

### 4.3 PolySignal (FT-Learnings-Based)

Our **PolySignal** score incorporates forward-test learnings:

- **Conviction 3×+** → Profitable; **&lt;1×** → Lost
- **Trader WR 55–60%** → Sweet spot
- **Entry 20–40¢** → Sweet spot; **&lt;20¢** → Toxic
- **Crypto short-term** → -91% PnL drag (we downweight)

---

## 5. Live Pricing & Slippage Controls

### 5.1 Real-Time Prices

- **Live market prices** from Polymarket via Dome/Gamma APIs
- **Current best bid/ask** — You see the real book before copying
- **Price movement** — Compare trader's entry price to current price (slippage risk)

### 5.2 Slippage Controls

You control how much worse than the current price you're willing to accept:

| Preset | Use Case |
|--------|----------|
| **0%** | Strict—only fill at or better than quote |
| **1%** | Tight—minimal tolerance |
| **3%** | Default—balances fill rate and price |
| **5%** | Loose—higher fill rate in volatile markets |
| **Custom** | Your own % (e.g., 2.5%) |

- **BUY:** Limit price = best ask × (1 + slippage%)
- **SELL:** Limit price = best bid × (1 − slippage%)
- You never pay *more* than your limit; fills can be *better* than limit

### 5.3 Order Types

- **FAK (Fill and Kill)** — Fills immediately for available liquidity; cancels the rest. Recommended for copy trading.
- **GTC (Good 'Til Canceled)** — Order stays on the book until filled or you cancel. For patient limit orders.

---

## 6. Other Features Supporting Manual Trading

| Feature | Description |
|--------|-------------|
| **Trade cards** | Each trade shows ML score, verdict, conviction, edge, niche stats, live price |
| **Insights drawer** | Expand for full PolyScore breakdown, indicators, and Gemini analysis |
| **PredictionStats** | Trader win rate, ROI, trade count by time period (7d, 30d, all) and by niche/bracket |
| **Fire Feed** | Curated feed of high-signal trades (conviction, timing, trader performance) |
| **Trader profiles** | Per-trader stats, niche breakdown, historical performance |
| **Portfolio & positions** | Track your copied positions, PnL, open/closed |
| **Close position modal** | Sell with slippage control, FAK/GTC, live price preview |
| **Limit orders** | All orders are limit orders; you set max (buy) or min (sell) price |
| **Advanced copy** | Custom size, slippage, order type before placing |
| **Gemini trade assessment** | Optional AI analysis ("Run Gemini") for a second opinion on specific trades |
| **Settings** | Default buy/sell slippage, preferences |

---

## 7. The Alpha Agent: AI That Improves Itself

Beyond the ML model, PolyCopy includes **Alpha Agent** — an autonomous AI trading strategist that:

- **Manages 3 bots:** Explorer (experimental), Optimizer (refinement), Conservative (production)
- **Queries live data:** Supabase (orders, wallets, traders), BigQuery (84M+ trades), Dome (prices)
- **Proposes strategy changes:** Model threshold, price bands, edge filters, allocation method
- **Tracks hypotheses:** Stores structured data, runs experiments, learns from outcomes
- **Recursive self-improvement:** Identifies blind spots, proposes new metrics, evaluates decision quality

The agent has **deep ML knowledge** — it understands the 34 features, PnL weighting, and model limitations. It combines ML probability with conviction, edge, and trader quality to make allocation decisions.

---

## 8. Key Messaging Pillars

### For Traders

1. **"Don't guess—use 50M trades of data."**  
   Our ML model learned from the best. It filters out losing trades and surfaces high-probability opportunities.

2. **"Context matters."**  
   We measure trader performance by market niche, entry price, and bet type. A 60% Politics trader isn't automatically good at Crypto.

3. **"Conviction + edge = signal."**  
   When a top trader bets 2× their usual size in their best niche at a price below their win rate, that's a strong signal.

4. **"You stay in control."**  
   Live pricing, slippage controls, FAK/GTC, and limit orders. You decide what to copy and how to execute.

### For Investors / Partners

1. **"Proven edge."**  
   Backtested 2.5–3.5× improvement; model turns favorites from losing to profitable; robust across Dec 2025 and Jan 2026.

2. **"Institutional-grade data pipeline."**  
   84M trades, point-in-time stats, PnL-weighted training, no look-ahead bias.

3. **"Full stack."**  
   ML scoring + context-aware stats + live execution + AI agent. Not just a model—a complete decision-support system.

---

## 9. Competitive Differentiation

| Competitor approach | PolyCopy approach |
|--------------------|-------------------|
| Copy by trader only | Copy by trade—ML + signals filter each trade |
| Global win rate | Niche + price bracket + bet type win rate |
| No slippage control | Configurable slippage, FAK/GTC |
| Black-box model | Transparent verdicts, indicators, explainable factors |
| Accuracy-optimized | PnL-optimized (profitability) |
| Static strategies | Alpha Agent learns and adapts |

---

## 10. Call to Action

**For traders:** Use PolyCopy to copy the *right* trades from the best Polymarket traders—filtered by ML, contextualized by niche and conviction, executed with the controls you need.

**For partners:** PolyCopy's 50M-trade ML pipeline and context-aware data represent a structural edge in prediction market copy trading. We're building the infrastructure for the next generation of informed copy traders.

---

*Document generated from PolyCopy codebase and documentation. Technical details: TRADING_SYSTEM_DOCUMENTATION.md, FORWARD_TESTING_SYSTEM_EXPLAINER.md, lib/alpha-agent/llm-engine.ts, supabase/functions/predict-trade/index.ts.*
