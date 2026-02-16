# PolyCopy Trading Bots — Marketing Value Proposition

**Purpose:** Messaging document for marketing, sales, and user onboarding  
**Last Updated:** February 2026

---

## Executive Summary

PolyCopy trading bots are **backtested, forward-tested, and live-tested** before you risk real money. Every strategy runs through three validation stages: historical backtest, live paper trading (Forward Testing), and optional real-money execution (Live Trading). You can compare 66+ strategies side-by-side, find the best one for your goals, and manage risk with built-in circuit breakers, position limits, and pause controls.

---

## 1. The Three-Stage Validation Pipeline

### 1.1 Backtest — Historical Proof

**What it is:** Run strategies against historical data (Jan 2026 holdout, Dec 2025 validation) using our BigQuery pipeline.

**Key features:**
- **Model threshold filters** — Test 50%, 60%, 70%, 80% ML confidence
- **Price bands** — All, Underdog (&lt;50¢), Balanced (30–70¢), Favorite (&gt;70¢)
- **Edge filters** — 0%, 5%, 10% minimum edge
- **Trader selection** — All, Top by Win Rate, Top by Profit, Specific wallets
- **Metrics** — Total PnL, Win Rate, Avg PnL/Trade, Profit Factor, Max Drawdown, Sharpe Ratio
- **Equity curve** — Day-by-day capital progression

**Why it matters:** You see how a strategy *would have* performed before committing. No look-ahead bias; point-in-time trader stats only.

### 1.2 Forward Test (FT) — Live Paper Trading

**What it is:** Virtual money. Real trades. Strategies run on live Polymarket data and record every decision in `ft_orders`.

**Key features:**
- **66+ strategies** — Original, Thesis (T1–T5), ML Mix families
- **Sync every 2 min** — Fetches new trades from top Polymarket traders
- **Resolve every 10 min** — Marks WON/LOST as markets close
- **ML at sync** — Model probability computed when trade is taken; backfilled if needed
- **Audit trail** — `ft_seen_trades` records every evaluated trade (taken + skipped) with `skip_reason`
- **Cash management** — Sync blocks when cash ≤ 0; no negative balances

**Why it matters:** Forward testing validates that backtest logic works in real time. You see actual fill rates, skip reasons, and live PnL before going live.

### 1.3 Live Trading (LT) — Real Money

**What it is:** Mirror an FT strategy with real capital. LT executes real orders on Polymarket when the FT strategy would take a trade.

**Key features:**
- **1:1 FT mirror** — Each LT strategy links to one FT wallet
- **Your Polymarket wallet** — Orders placed via your connected wallet
- **Cron every 2 min** — LT executor reads OPEN `ft_orders`, places real CLOB orders
- **Fill tracking** — Actual executed price, size, fill rate, slippage
- **Shadow mode** — Simulate without placing real orders (optional)

**Why it matters:** Only strategies that prove themselves in FT should go live. LT gives you the same signals with real execution.

---

## 2. Key Bot Features

### 2.1 Strategy Configuration (Per Bot)

| Parameter | Description | Example |
|-----------|-------------|---------|
| **use_model** | Gate on ML score | `true` = require model_probability ≥ threshold |
| **model_threshold** | Min ML confidence (0–1) | 0.55 = 55%+ |
| **price_min / price_max** | Entry price band | 0.1–0.4 = contrarian (10–40¢) |
| **min_edge** | trader_win_rate − entry_price | 0.05 = 5% edge |
| **min_trader_resolved_count** | Min trader experience | 30, 50, 200 |
| **min_conviction** | trade_value / trader_avg_trade_size | 1.5 = 1.5× usual |
| **allocation_method** | Bet sizing | FIXED, KELLY, EDGE_SCALED, TIERED, CONFIDENCE, WHALE |
| **bet_size** | Fixed size per trade (USD) | 10, 25, 50 |
| **kelly_fraction** | Fraction of full Kelly | 0.25 = quarter Kelly |
| **market_categories** | Title keyword match | Politics, Sports, Crypto |
| **target_traders** | Specific wallets (niche strategies) | From trader_profile_stats |

### 2.2 Strategy Families

| Family | Count | Purpose |
|--------|-------|---------|
| **Original** | 6 | High Conviction, Model Balanced, Underdog Hunter, Favorite Grinder, Sharp Shooter, Model Only |
| **Thesis (T1–T5)** | 20+ | Factor isolation — single factors, price bands, categories, compound, anti-strategies |
| **ML Mix** | 10 | Model-gated variants: Sharp Shooter, Underdog, Favorites, High Conv, Edge, Midrange, Strict, Loose, Contrarian, Heavy Fav |

### 2.3 Allocation Methods

| Method | Description | Best For |
|--------|-------------|----------|
| **FIXED** | Same size every trade | Exploration, baseline |
| **KELLY** | Theoretically optimal; fraction (e.g. 0.25) reduces variance | Growth-focused |
| **EDGE_SCALED** | bet = base × (1 + edge × 5) | Edge-sensitive |
| **TIERED** | Discrete steps by confidence | Conservative |
| **CONVICTION** | Uses trader's conviction (bet size vs avg) | High-conviction plays |
| **ML_SCALED** | Scales with model probability | Model-driven |
| **CONFIDENCE** | 40% edge + 30% conviction + 30% WR | Diversified signal |
| **WHALE** | 35% ML + 30% conviction + 25% WR + 10% edge | High-conviction, model-backed |

---

## 3. How to Find the Best Bot for Your Goals

### 3.1 Use the Compare Strategies Tab

On the **Trading** page (`/trading`), switch to the **Compare** tab. Sort by:

- **P&L** — Total profit (absolute)
- **Model** — use_model (yes/no)
- **Model Min** — model_threshold (55%, 60%, etc.)
- **Price Range** — price_min–price_max (e.g. 0–0.5 = underdogs)
- **Min Edge** — Minimum edge filter
- **Allocation** — FIXED, KELLY, etc.
- **Bet Size** — Fixed bet amount
- **Min Trades** — min_trader_resolved_count
- **Min Conviction** — Conviction multiplier filter

**Workflow:**
1. Sort by P&L (desc) to see top performers
2. Compare config columns to understand *why* they differ
3. Click a strategy to open its detail page and see positions, trades, daily PnL

### 3.2 Match Strategy to Goal

| Your Goal | Recommended Strategy Type | Why |
|-----------|---------------------------|-----|
| **Maximum total profit** | MODEL_50, Underdog + Model | High volume, 2.5–3.5× baseline; underdogs drive PnL |
| **Smoother equity curve** | Favorites, Balanced | Higher win rate (70%+), fewer big swings |
| **Highest per-trade efficiency** | UNDERDOG_M50_E5 | +40%+ avg PnL/trade; fewer trades, higher quality |
| **Niche focus** | T3 (Politics, Crypto, Sports) | Top traders per niche; market_categories filter |
| **Pure ML signal** | FT_MODEL_ONLY | No trader filters; isolates model value |
| **Conviction plays** | Sharp Shooter, High Conv | min_conviction 1.5–2×; skin in the game |

### 3.3 Analysis Prompts (Alpha Agent)

Ask the Alpha Agent (in the **Alpha** tab):

- *"Which strategy has the best risk-adjusted return?"*
- *"Does the ML model add value?"* — Compare MODEL_ONLY vs no-model
- *"Does conviction filtering help?"* — Sharp Shooter vs Model Balanced
- *"Is Kelly sizing better than FIXED?"*
- *"Are underdogs or favorites more profitable?"*
- *"How many trades did each strategy skip and why?"*

---

## 4. How to Safely Manage Bots

### 4.1 Forward Test (FT) — Virtual, No Risk

- **No real money** — All FT trades are virtual
- **Pause/Resume** — `is_active` controls whether a strategy takes new trades
- **Sync diagnose** — On FT detail page, run "Diagnose" to see `skip_reasons_last_24h` (e.g. low_ml_score, price_out_of_range, insufficient_edge)
- **Cash clamp** — Sync blocks when cash ≤ 0; migration fixes negative balances

### 4.2 Live Trading (LT) — Risk Controls

| Control | Description | Where to Set |
|---------|-------------|--------------|
| **Pause** | Stop taking new trades; existing positions remain | Strategy detail page, Pause button |
| **Resume** | Restart after pause; resets circuit breaker if manual | Resume button |
| **Shadow mode** | Simulate without placing real orders | Create strategy or edit |
| **Max position size** | Cap per trade (USD) | Risk Settings panel |
| **Max total exposure** | Cap total open exposure (USD) | Risk Settings panel |
| **Daily budget** | Max spend per day | Risk Settings panel |
| **Max daily loss** | Circuit breaker: stop if daily loss ≥ limit | Risk Settings panel |
| **Circuit breaker %** | Stop if drawdown from peak ≥ limit | Risk Settings panel |
| **Slippage** | Max tolerance for limit price (default 3%) | Strategy config |
| **Order type** | FAK (immediate) or GTC (patient) | Strategy config |

### 4.3 Risk Presets (Quick Apply)

| Preset | Circuit Breaker | Daily Budget | Max Daily Loss | Max Position |
|--------|-----------------|--------------|----------------|--------------|
| **Conservative** | 10% | $50 | $25 | $10 |
| **Moderate** | 20% | $200 | $100 | $50 |
| **Aggressive** | 35% | No limit | No limit | No limit |

### 4.4 Circuit Breaker Behavior

When triggered:
- **circuit_breaker_active** = true
- Strategy **stops taking new trades**
- Existing positions remain (you can close manually)
- **Resume** clears the flag and resets daily_loss; use only when you're comfortable continuing

### 4.5 Cooldown

- **cooldown_hours** — After a loss, capital is "locked" for N hours before reuse
- Reduces revenge trading and over-concentration after losses

---

## 5. Looking at Other Trades

### 5.1 FT Strategy Detail Page (`/ft/[id]`)

| Tab | What You See |
|-----|--------------|
| **Positions** | Open positions — market, entry price, size, current price, unrealized PnL, trader, ML score, conviction |
| **Trades** | Resolved trades — WON/LOST, PnL, entry price, trader, model probability, edge |
| **Performance** | Daily PnL, cumulative PnL chart, category breakdown (by market type) |
| **Strategy Details** | Extended filters (market categories, target traders, conviction, etc.) |

**Sortable columns:** Order time, market, entry price, size, PnL, outcome, trader, model probability, conviction.

### 5.2 LT Strategy Detail Page (`/lt/[id]`)

| Tab | What You See |
|-----|--------------|
| **Positions** | Open LT positions — executed price, size, signal price, fill quality |
| **Trades** | Resolved LT trades — executed price, PnL, fill rate |
| **Risk Settings** | Circuit breaker, daily loss, position limits, presets, pause/resume |

**Stats:** Total trades, fill rate %, avg slippage %, attempts vs filled vs failed vs pending.

### 5.3 Trading Page — Unified View

- **Performance tab** — All FT + LT strategies in one sortable table
- **Filter** — All, FT only, LT only
- **Sort by** — PnL, PnL %, Win Rate, Trades, Open, Cash, Realized, Unrealized, Max Drawdown, Sharpe
- **Create LT** — Pick an FT wallet, set capital, create live strategy

### 5.4 Sync Diagnose (Why Isn't My Bot Taking Trades?)

On FT detail page, click **Diagnose**. Returns:

- **skip_reasons_last_24h** — e.g. `{ "low_ml_score": 45, "price_out_of_range": 12, "insufficient_edge": 8 }`
- **skipped_total_last_24h** — Total trades evaluated and skipped
- **conclusion** — Human-readable summary

**Common reasons:**
- `low_ml_score` — ML below threshold; tighten or try different strategy
- `price_out_of_range` — Entry price outside this strategy's band
- `insufficient_edge` — Trader WR − price &lt; min_edge
- `low_conviction` — Trade size &lt; min_conviction × trader avg
- `market_resolved` / `after_market_end` — Market already closed
- `duplicate` / `already_seen` — Already evaluated

---

## 6. Key Messaging Pillars

### For New Users

1. **"Test before you risk."**  
   Backtest → Forward Test → Live. No other copy-trading platform validates strategies across all three stages.

2. **"66+ strategies, one dashboard."**  
   Compare performance, configs, and risk side-by-side. Find what fits your goals.

3. **"You're in control."**  
   Pause, resume, circuit breakers, position limits, shadow mode. The bot executes; you set the guardrails.

### For Power Users

1. **"Factor isolation."**  
   Thesis strategies (T1–T5) isolate single factors—pure ML, pure conviction, pure edge—so you learn what drives alpha.

2. **"Alpha Agent learns with you."**  
   Chat with the AI strategist. It queries live data, proposes config changes, and tracks hypotheses.

3. **"Full audit trail."**  
   Every trade evaluated (taken or skipped) is recorded with skip reason. No black box.

### For Risk-Conscious Traders

1. **"Circuit breakers that work."**  
   Daily loss limit, drawdown %, position caps. When triggered, the bot stops—you decide when to resume.

2. **"Shadow mode for validation."**  
   Run LT in shadow mode: same logic, no real orders. Validate execution before going live.

3. **"Presets for every risk profile."**  
   Conservative, Moderate, Aggressive—one click to apply proven risk configs.

---

## 7. Call to Action

**For new users:** Start with Forward Testing. Pick 2–3 strategies from the Compare tab, watch them for a week, then create a Live strategy from the best performer—with Conservative risk preset.

**For experienced users:** Use the Alpha Agent to analyze the fleet, run sync diagnose on underperformers, and iterate on configs. Backtest new ideas before deploying.

**For risk managers:** Set circuit breaker %, max daily loss, and max position size. Use shadow mode for new strategies. Monitor the Risk Settings panel.

---

*Document generated from PolyCopy codebase. Technical details: FORWARD_TESTING_SYSTEM_EXPLAINER.md, FORWARD_TESTING_ANALYSIS_GUIDE.md, TRADING_SYSTEM_DOCUMENTATION.md, app/trading/page.tsx, app/ft/[id]/page.tsx, app/lt/[id]/page.tsx, lib/live-trading/risk-manager-v2.ts.*
