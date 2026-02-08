# Forward Testing & Copy Trading System — Full Explainer

**Last updated:** February 2026  
**Purpose:** Comprehensive documentation of the FT (Forward Testing) setup, strategy design, trade recommendation engine, auto copy, improvements made, and plans for building winning strategies.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Forward Testing Architecture](#2-forward-testing-architecture)
3. [Strategy Design](#3-strategy-design)
4. [Trade Recommendation Engine (PolyScore)](#4-trade-recommendation-engine-polyscore)
5. [Auto Copy Setup](#5-auto-copy-setup)
6. [Improvements We've Made](#6-improvements-weve-made)
7. [Current Findings & Win Rate Audit](#7-current-findings--win-rate-audit)
8. [Plans for Next Steps](#8-plans-for-next-steps)

---

## 1. System Overview

PolyCopy has two main value streams for helping users profit from prediction markets:

| Component | Purpose | Execution |
|-----------|---------|-----------|
| **Forward Testing (FT)** | Paper-trade strategies with virtual money to discover what works | Virtual — records trades in `ft_orders`, no real money |
| **Trade Recommendation (PolyScore)** | Show users which trades to copy and why | In-app display on trade cards; user decides |
| **Auto Copy** | Automatically execute real trades when followed traders trade | Real — places orders on Polymarket via user's connected wallet |

FT is the **lab**; PolyScore and Auto Copy are the **product**. FT validates strategy logic before we recommend or auto-execute.

---

## 2. Forward Testing Architecture

### 2.1 Data Flow

```
Polymarket Leaderboard (top traders by PNL/VOL)
        ↓
Polymarket Data API (recent BUY trades per trader)
        ↓
Sync (every 2 min) ──→ Filter by wallet strategy rules
        ↓
ft_orders (virtual positions) ←── Qualifying trades inserted
        ↓
Polymarket Gamma API (market resolution when closed)
        ↓
Resolve (every 10 min) ──→ WON/LOST, PnL computed
        ↓
ft_wallets stats updated (total_pnl, win_rate, etc.)
```

### 2.2 Key Tables

| Table | Purpose |
|-------|---------|
| **ft_wallets** | Strategy configs. One row per strategy (66+ active). Columns: `model_threshold`, `price_min`, `price_max`, `min_edge`, `use_model`, `allocation_method`, `min_conviction`, etc. |
| **ft_orders** | Virtual trades. Each row = one copied trade. Stores `entry_price`, `size`, `trader_address`, `model_probability`, `conviction`, `outcome` (OPEN/WON/LOST), `pnl`. |
| **ft_seen_trades** | Audit log. Every evaluated trade (taken or skipped) recorded with `skip_reason`. Prevents double-counting and enables analysis. |

### 2.3 Polling & Crons

| Trigger | Schedule | Action |
|---------|----------|--------|
| **FT page open** | Every 30s | POST /api/ft/sync, /api/ft/resolve, /api/ft/enrich-ml (when auto-sync on) |
| **Vercel cron ft-sync** | Every 2 min | Fetches new trades, filters, inserts into ft_orders |
| **Vercel cron ft-resolve** | Every 10 min | Checks Polymarket for resolved markets, updates WON/LOST + PnL, runs enrich-ml |
| **Manual buttons** | On click | Sync New Trades, Check Resolutions, Refresh |

### 2.4 PnL Sources

- **Open positions:** Real-time prices from `markets` + Polymarket API when viewing wallet.
- **Resolved positions:** PnL set by resolve cron when Polymarket reports market closed. Formula: BUY WON = `size * (1 - entry_price) / entry_price - size`; BUY LOST = `-size`.

---

## 3. Strategy Design

### 3.1 Strategy Types

We run three families of strategies in parallel:

| Family | Count | Purpose |
|--------|-------|---------|
| **Original** | 6 | High Conviction, Model Balanced, Underdog Hunter, Favorite Grinder, Sharp Shooter, Model Only |
| **Thesis (T1–T5)** | 20+ | Factor isolation — single factors (WR, edge, conviction, ML), price bands, categories, compound, anti-strategies |
| **ML Mix** | 10 | Model-gated variants: Sharp Shooter, Underdog, Favorites, High Conv, Edge, Midrange, Strict, Loose, Contrarian, Heavy Fav |

### 3.2 Core Filters (Per Strategy)

| Filter | Description | Example |
|--------|-------------|---------|
| `use_model` | Gate on ML score when true | `true` = require model_probability ≥ model_threshold |
| `model_threshold` | Min ML confidence (0–1) | 0.55 = 55%+ |
| `price_min` / `price_max` | Entry price band (0–1) | 0.1–0.4 = contrarian (10–40¢) |
| `min_edge` | trader_win_rate − entry_price | 0.05 = 5% edge |
| `min_trader_resolved_count` | Min trader experience | 30, 50, 200 |
| `min_conviction` | trade_value / trader_avg_trade_size | 1.5 = trader betting 1.5× usual |
| `allocation_method` | Bet sizing | FIXED, KELLY, EDGE_SCALED, TIERED |
| `target_trader` / `target_traders` | Specific traders (from extended filters) | Niche/category strategies |
| `market_categories` | Title keyword match | Politics, Sports, Crypto |

### 3.3 Thesis Architecture (Factor Isolation)

- **T1:** Single factor (baseline, pure WR, pure edge, pure conviction, pure ML, high experience)
- **T2:** Price bands (contrarian 10–40¢, midrange 25–75¢, favorites 60–90¢)
- **T3:** Market specialization (Politics, Crypto, etc.) — uses `target_traders` from niche leaderboards
- **T4:** Compound (ML + edge, ML + conviction, etc.)
- **T5:** Anti-strategies (max_trader_win_rate, max_edge) — test opposites to validate

### 3.4 ML Mix Strategies

All 10 use `use_model=true` and vary:

- **Sharp Shooter:** ML 55% + 1.5× conviction
- **Underdog:** ML 55% + 0–50¢, 5% edge
- **Favorites:** ML 55% + 60–90¢, 3% edge
- **High Conv:** ML 55% + 2× conviction
- **Edge:** ML 55% + 5% edge
- **Midrange:** ML 55% + 25–75¢
- **Strict:** ML 65% only
- **Loose:** ML 50% only
- **Contrarian:** ML 55% + 10–40¢
- **Heavy Fav:** ML 55% + 75–95¢

---

## 4. Trade Recommendation Engine (PolyScore)

### 4.1 What It Does

PolyScore powers the trade cards users see when browsing trades. It calls a BigQuery ML model (`poly_predictor_v11`) via the predict-trade pipeline to produce:

- **probability** — Model confidence (0–1)
- **edge_percent** — ROI potential
- **verdict** — STRONG_BUY, BUY, HOLD, AVOID
- **indicators** — Niche expert, momentum, conviction, etc.

### 4.2 Inputs

- **Original trade:** Trader wallet, condition_id, side, price, size, timestamp
- **Market context:** Current price, volume, tags, duration, etc.
- **User context:** Slippage preference

### 4.3 Integration Points

- **Trade cards:** PolyScore result shown as badge/verdict
- **FT sync:** `getPolyScore` called at insert time for `use_model` strategies; `model_probability` stored in `ft_orders`
- **enrich-ml cron:** Backfills missing `model_probability` for orders that failed at sync

---

## 5. Auto Copy Setup

### 5.1 How It Works

- User creates an **auto_copy_config**: follows a specific trader, sets allocation ($ per trade), optional filters
- **Cron** (daily 10:00 UTC): `POST /api/admin/auto-copy/run` — fetches followed trader's new trades, places real orders via user's CLOB client
- **Evomi proxy** required for Polymarket API
- Orders logged in `auto_copy_logs`

### 5.2 Differences from FT

| Aspect | FT | Auto Copy |
|--------|----|-----------|
| Money | Virtual | Real |
| Execution | Insert into ft_orders | Place order on Polymarket |
| Filtering | 66+ strategy rules | Config-level (trader + allocation) |
| ML/Polyscore | Used for use_model strategies | Not currently applied to filter auto-copy trades |

### 5.3 Auto Close

- When a followed trader closes a position, check-notifications cron can trigger an auto-close for the user's copied position (if `auto_close_on_trader_close` is enabled)

---

## 6. Improvements We've Made

### 6.1 Cron & Auth

- **Cron auth fix:** ft-sync and ft-resolve crons now call sync/resolve logic **directly** (no internal HTTP fetch), avoiding "Unauthorized" errors when Vercel triggers crons
- **FT sync cron added:** Every 2 min (was page-only)
- **FT resolve cron:** Every 10 min (unchanged)

### 6.2 Data Quality

- **ft_seen_trades wired:** Every evaluated trade (taken + skipped) recorded with `skip_reason`; counts derived from DB, no double-count on refresh
- **Model at sync:** `model_probability` computed at insert via getPolyScore; enrich-ml backfills failures
- **use_model fix:** Model strategies now gate on `model_probability` (ML score), not trader WR
- **Negative cash:** Migration + API clamp; sync blocks when cash ≤ 0

### 6.3 UI & UX

- **Compare Strategies tab:** Sortable config columns on /ft
- **Time columns:** Show minutes when &lt;1h (e.g. 45m, 1h 30m)
- **Column alignment:** Fixed headers, whitespace-nowrap
- **Trader column removed** from Performance tab
- **ML mix self-healing:** Wallets API auto-inserts 10 ML strategies if missing

### 6.4 Navigation

- Paper Trading removed from nav; FT added for admins
- Bottom nav: Paper → FT for admins

---

## 7. Current Findings & Win Rate Audit

### 7.1 Win Rate Audit (Feb 2026)

Script: `npx tsx scripts/audit-ft-win-rate.ts`

**Findings:**

- **No resolution bugs:** Label consistency correct; WON when token_label matches winning_label
- **Root cause of low WR (~20%):** Strategy composition — heavy underdog buying (0.21–0.40¢ bucket had ~3% WR)
- **Win rate by entry price:**
  - 0.21–0.40¢: ~3% WR (underdogs lose most of the time)
  - 0.61–0.80¢: ~80% WR (favorites win more)
- **By wallet:** T0_CONTROL ~52% WR; many thesis strategies 0% (T5_RANDOM, T1_EXPERIENCE, T2_*)

### 7.2 Implications

- Underdog-heavy strategies (contrarian, 10–40¢) are statistically losing
- Favorites (60–80¢) with high-WR traders perform well
- Need to rebalance: more favorites, fewer pure-underdog plays; or tighten underdog filters (e.g. ML + higher edge)

---

## 8. Plans for Next Steps

### 8.1 Forward Testing — Winning Strategies

| Priority | Action |
|----------|--------|
| **P0** | Shift price filters: raise `price_min` for underdog strategies or require ML + high edge (e.g. 10%+) for &lt;40¢ |
| **P0** | Add "favorites-first" strategy: 55–85¢, ML 55%+, 5% edge — test if it beats current mix |
| **P1** | Implement `trader_pool` — restrict to top_pnl, top_wr, high_volume per strategy |
| **P1** | Run audit script regularly; track WR by price bucket and wallet |
| **P2** | Prune/pause strategies with 0% WR and &lt;20 trades (likely misconfigured or bad fit) |
| **P2** | A/B test Kelly vs FIXED for same filters |

### 8.2 Trade Recommendation Engine (PolyScore)

| Priority | Action |
|----------|--------|
| **P0** | Validate model: compare FT_MODEL_ONLY vs no-model strategies; if model adds alpha, prioritize it in UI |
| **P1** | Surface FT win rate by verdict (STRONG_BUY, BUY, etc.) — backtest which verdicts actually win |
| **P1** | Add "FT-backed" badge: show when a trade would pass a winning FT strategy |
| **P2** | Retrain model with FT outcome data (use ft_orders WON/LOST as labels) |
| **P2** | Niche-specific models: Politics, Sports, Crypto — test if specialization improves accuracy |

### 8.3 Auto Copy

| Priority | Action |
|----------|--------|
| **P0** | Gate auto copy on PolyScore: only execute when model_probability ≥ threshold (e.g. 55%) |
| **P0** | Add price/edge filters to auto_copy_config — mirror winning FT strategy rules |
| **P1** | FT → Auto Copy pipeline: when a strategy proves winning in FT, offer "Apply to Auto Copy" |
| **P1** | Per-trader config: different allocation/filters per followed trader based on their niche |
| **P2** | Conviction filter: skip trades where trader is &lt;1× usual (low conviction) |

### 8.4 Infrastructure

| Priority | Action |
|----------|--------|
| **P1** | Trader pool wiring: use `trader_pool` from extended filters to narrow leaderboard |
| **P2** | ft_seen_trades pruning: delete rows &gt;30 days to control growth |
| **P2** | Dashboard: FT performance summary (best strategies, WR by bucket, model contribution) |

---

## Appendix: Key Files

| Path | Purpose |
|------|---------|
| `app/api/ft/sync/route.ts` | Main decision engine — filters trades, inserts ft_orders |
| `app/api/ft/resolve/route.ts` | Resolves OPEN → WON/LOST via Polymarket |
| `app/api/ft/enrich-ml/route.ts` | Backfills model_probability |
| `app/api/cron/ft-sync/route.ts` | Cron wrapper (calls sync directly) |
| `app/api/cron/ft-resolve/route.ts` | Cron wrapper (calls resolve + enrich-ml) |
| `lib/polyscore/get-polyscore.ts` | PolyScore client |
| `app/api/admin/auto-copy/run/route.ts` | Auto copy execution |
| `scripts/audit-ft-win-rate.ts` | Win rate diagnostic |
| `vercel.json` | Cron schedules |
