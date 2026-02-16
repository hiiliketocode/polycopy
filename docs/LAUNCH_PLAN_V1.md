# PolyCopy v2 Launch Plan

**Target Launch Date:** Monday, March 2, 2026  
**Plan Created:** February 16, 2026  
**Working Days Available:** 10  
**Status:** DRAFT — Requires cofounder sign-off on key decisions

---

## Table of Contents

1. [Launch Vision & Goals](#1-launch-vision--goals)
2. [Key Decisions Required (DECIDE FIRST)](#2-key-decisions-required)
3. [Workstream Overview](#3-workstream-overview)
4. [Workstream 1: UI/UX Redesign](#4-workstream-1-uiux-redesign)
5. [Workstream 2: Signals & Intelligence Layer](#5-workstream-2-signals--intelligence-layer)
6. [Workstream 3: Strategy Feeds & Copy Trader Feeds](#6-workstream-3-strategy-feeds--copy-trader-feeds)
7. [Workstream 4: Copy Bots (Automated Execution)](#7-workstream-4-copy-bots-automated-execution)
8. [Workstream 5: Pricing & Monetization](#8-workstream-5-pricing--monetization)
9. [Workstream 6: Code, Database & Security](#9-workstream-6-code-database--security)
10. [Workstream 7: Testing & QA](#10-workstream-7-testing--qa)
11. [Workstream 8: Content & Documentation](#11-workstream-8-content--documentation)
12. [Workstream 9: Marketing Launch](#12-workstream-9-marketing-launch)
13. [Workstream 10: Marketing Automation & Bots](#13-workstream-10-marketing-automation--bots)
14. [Naming & Terminology Exercise](#14-naming--terminology-exercise)
15. [Two-Week Sprint Schedule](#15-two-week-sprint-schedule)
16. [Risk Register](#16-risk-register)
17. [Launch Day Checklist](#17-launch-day-checklist)
18. [Post-Launch (Week 1)](#18-post-launch-week-1)
19. [Appendix: Feature Maturity Audit](#19-appendix-feature-maturity-audit)

---

## 1. Launch Vision & Goals

### What We're Launching

PolyCopy v2 — a redesigned, full-stack AI copy-trading platform for Polymarket with three product tiers:

| Tier | Product | What It Does | User Action |
|------|---------|--------------|-------------|
| **Signals** | FIRE Feed + PolyScore | See ML-scored trades with P&L, conviction, niche stats | Read, decide, manual copy |
| **Strategies** | Copy Trader Feeds | Curated strategy feeds (ML-filtered trade streams) | Follow a strategy, copy recommended trades |
| **Bots** | Copy Bots | Automated execution of strategy trades | Set & forget, with risk controls |

### Launch Goals

1. **Product:** Ship redesigned UI with all three tiers functional and clearly differentiated
2. **Growth:** Drive signups through Product Hunt, Twitter, and content marketing
3. **Revenue:** Convert free users to paid via visible bot performance and strategy results
4. **Trust:** Demonstrate track record through transparent P&L, forward-test history, and (optionally) showcase wallets
5. **Brand:** Establish PolyCopy as the definitive AI copy-trading tool for prediction markets

### Success Metrics (30 Days Post-Launch)

| Metric | Target |
|--------|--------|
| New signups | 500+ |
| Premium conversions | 50+ |
| Active copy traders | 100+ |
| Bot users (auto-execution) | 25+ |
| Twitter followers gained | 1,000+ |
| Product Hunt upvotes | Top 5 of the day |

---

## 2. Key Decisions Required

> **These decisions gate multiple workstreams. Resolve by end of Day 2 (Feb 18).**

### Decision 1: Which Strategies Do We Offer at Launch?

**Context:** We have 66+ FT strategies. Users need a curated set, not a firehose.

**Recommendation:** Launch with 5–8 named strategies spanning risk profiles:

| Strategy | Based On | Risk | Target User |
|----------|----------|------|-------------|
| **[Name TBD] Conservative** | Heavy Favorites + ML 55% | Low | New users, risk-averse |
| **[Name TBD] Balanced** | Model Balanced (30–70¢, ML 50%) | Medium | Core users |
| **[Name TBD] Sharp** | Sharp Shooter (ML 55% + conviction 1.5×) | Medium | Data-driven traders |
| **[Name TBD] Underdog** | Underdog + ML 50% + edge 5% | High | High-risk / high-reward |
| **[Name TBD] Politics** | T3 Politics (niche traders) | Medium | Subject-matter focused |
| **[Name TBD] Sports** | T3 Sports (niche traders) | Medium | Sports bettors |
| **[Name TBD] AI Explorer** | Alpha Agent Explorer bot | Variable | Tech-forward users |
| **[Name TBD] AI Optimized** | Alpha Agent Conservative bot | Medium | Trust-the-AI users |

**Decision needed:**
- [ ] Which FT wallets map to each offered strategy?
- [ ] Do we allow custom strategies at launch or only curated?
- [ ] Minimum FT track record required before offering (e.g., 100+ trades, 2+ weeks)?

### Decision 2: Showcase Wallets — Yes or No?

**Context:** Creating 2–3 real Polymarket wallets that trade according to our top strategies would provide:
- Public, verifiable P&L on Polymarket leaderboard
- Marketing content ("Our AI Balanced strategy is up 47% this month")
- Proof that the system works with real money

**Recommendation:** YES — create 2–3 wallets, each running a different top strategy via LT.

**Decision needed:**
- [ ] How much capital per wallet? ($500? $1,000? $5,000?)
- [ ] Which strategies?
- [ ] Public or semi-public? (Polymarket profiles are public by default)
- [ ] Do we brand them? (e.g., "PolyCopy | Sharp" as the Polymarket username)

### Decision 3: Strategy Presentation — Feeds or Landing Pages or Both?

**Options:**

| Option | Description | Effort |
|--------|-------------|--------|
| **A: Feed only** | Strategies appear as filterable tabs/categories in the main feed | Low |
| **B: Feed + Cards** | Each strategy gets a card on `/bots` with performance summary, click to see feed | Medium |
| **C: Feed + Cards + Landing Pages** | Each strategy also gets a dedicated `/strategy/[slug]` page with full breakdown | High |

**Recommendation:** Option B for launch (Feed + Cards). Landing pages as fast-follow (Week 2 post-launch). SEO pages already exist at `/(seo)/` — we can template strategy pages from those.

**Decision needed:**
- [ ] Which option?
- [ ] Should strategies appear in the main feed (mixed) or only in their own tab?

### Decision 4: Pricing Model — Subscriptions vs. Spreads

**Context:** Current model is $20/month premium. Alternative: collect spreads via Dome on each trade (take a small % of each copy trade).

| Model | Pros | Cons |
|-------|------|------|
| **Monthly subscription** | Predictable revenue, simple | Barrier to entry, user pays even when not trading |
| **Spread-based (via Dome)** | Aligned with usage, lower barrier | Revenue depends on volume, Dome integration needed |
| **Hybrid** | Free tier with spread, Premium removes spread + adds bots | Best of both, more complex |

**Recommendation:** Hybrid — Free users pay spread on copy trades; Premium ($20/month) removes spread and unlocks bots + advanced features. Evaluate Dome integration complexity before committing.

**Decision needed:**
- [ ] Subscription, spread, or hybrid?
- [ ] If spread: what percentage? (0.5%? 1%? 2%?)
- [ ] Dome integration timeline — is it feasible in 2 weeks?
- [ ] What goes in Free vs. Premium? (See Section 8)

### Decision 5: What's in Each Tier?

**Proposed tier breakdown:**

| Feature | Free | Premium |
|---------|------|---------|
| FIRE Feed (view trades) | Yes | Yes |
| PolyScore / ML signals on cards | Limited (score only) | Full breakdown |
| Strategy feeds (view) | 2 strategies | All strategies |
| Copy individual trades (manual) | Yes (with spread?) | Yes (no spread?) |
| Copy Bots (auto-execution) | No | Yes |
| Risk controls (circuit breakers) | — | Yes |
| Alpha Agent chat | No | Yes |
| Portfolio analytics | Basic | Advanced |
| Number of followed traders | 5 | Unlimited |
| Slippage customization | Default only | Custom |

**Decision needed:**
- [ ] Approve or modify tier breakdown
- [ ] Is spread-on-free-tier a separate discussion from the above?

### Decision 6: Naming

> See separate document: `docs/NAMING_EXERCISE.md` (to be created)

**Items requiring names:**
- The overall product tiers (Signals / Strategies / Bots — or different names?)
- Each curated strategy
- The FIRE feed (keep "FIRE"? Rename?)
- PolyScore / PolySignal (keep? merge? rename?)
- The Copy Bot product
- The Alpha Agent (keep? rename?)
- Feature names for marketing (e.g., "SmartCopy", "AutoTrade", "SignalStack")

**Decision needed:**
- [ ] Schedule naming session (60 min, Day 1–2)
- [ ] Create `NAMING_EXERCISE.md` with candidates and vote

---

## 3. Workstream Overview

```
Week 1 (Feb 16–20)                    Week 2 (Feb 23–27)                    Launch (Mar 2)
─────────────────                      ─────────────────                      ─────────────
DECISIONS (D1–D6)─────┐
                      │
WS1: UI REDESIGN ─────┼── Design (3d) ──── Build (5d) ────── Polish (2d) ──── ✓
                      │
WS2: SIGNALS ─────────┼── Enrich cards ── P&L/niche/trades ── QA ──────────── ✓
                      │
WS3: STRATEGY FEEDS ──┼── Define strategies ── Build feeds ── Populate ────── ✓
                      │
WS4: COPY BOTS ───────┼── Test LT ── UI for bots ── Risk controls ── QA ──── ✓
                      │
WS5: PRICING ─────────┼── Decide model ── Implement gates ── Stripe/Dome ─── ✓
                      │
WS6: CODE/DB/SECURITY ┼── Audit ── Refactor ── Security review ───────────── ✓
                      │
WS7: TESTING ─────────┼── Plan ── Manual QA ── E2E scripts ── Load test ──── ✓
                      │
WS8: CONTENT ─────────┼── How-tos ── Strategy guides ── FAQ ──────────────── ✓
                      │
WS9: MARKETING ───────┼── Messaging ── Assets ── Schedule ── PH prep ─────── ✓
                      │
WS10: MKTG BOTS ─────┼── Twitter bot ── Content pipeline ── Schedule ─────── ✓
```

---

## 4. Workstream 1: UI/UX Redesign

### 4.1 Design Scope

The redesign covers the core user-facing surfaces. The existing "Industrial Block" design system (Space Grotesk, sharp corners, yellow/black/cream palette) is the foundation — this is an evolution, not a ground-up rebuild.

**Pages to redesign:**

| Page | Priority | Current State | Target State |
|------|----------|---------------|--------------|
| **Feed** (`/v2/feed`) | P0 | Trade cards with basic signals | Redesigned cards with full signal suite, strategy grouping, FIRE badge |
| **Trading Cards** | P0 | Shows ML score, verdict, price | Add P&L, niche P&L, conviction, # trades, strategy badge |
| **Bots/Strategies** (`/v2/bots`) | P0 | Bot cards with basic metrics | Strategy-centric cards with performance charts, risk level, track record |
| **Portfolio** (`/v2/portfolio`) | P1 | Basic P&L charts | Enhanced analytics, per-strategy breakdown, comparison |
| **Landing Page** (`/v2/landing`) | P1 | Hero + features | Updated for 3-tier product, social proof, showcase wallets |
| **Pricing** (`/(seo)/pricing`) | P1 | Free vs Premium | Updated for new tiers, spread info if applicable |
| **Trader Profile** (`/v2/trader/[wallet]`) | P2 | Basic stats | Enhanced with niche breakdown, performance regime |
| **Strategy Detail** (NEW) | P1 | Does not exist | `/strategy/[slug]` — strategy overview, live feed, performance, how-to |

### 4.2 Trading Card Redesign (P0)

The trade card is the atomic unit of the product. Every card must show:

**Header:**
- Trader name/avatar + wallet badge (verified/leaderboard)
- Market title + category badge (Politics, Sports, Crypto, etc.)
- Timestamp (relative: "2m ago")

**Signal Bar (NEW — the core launch feature):**
| Signal | Source | Display |
|--------|--------|---------|
| **ML Score** | PolyScore model probability | Circular gauge (0–100%) with color coding |
| **P&L** | `trader_profile_stats` → ROI in context | "+23.4% ROI" (green/red) |
| **Niche P&L** | `trader_profile_stats` → niche-specific ROI | "62% WR in NBA (47 trades)" |
| **Conviction** | trade_size / trader_avg_size | "2.3× conviction" with intensity indicator |
| **# Trades** | `trader_profile_stats` → resolved count | "147 trades" (sample size indicator) |
| **Verdict** | PolySignal | STRONG_BUY / BUY / HOLD / AVOID / TOXIC badge |

**Trade Details:**
- Side (BUY/SELL) + outcome token
- Entry price + current price + price delta
- Trade size (USD)
- Edge % (trader WR − entry price)

**Action Bar:**
- Copy button (one-click for Premium, modal for Free)
- Share button
- Expand for full breakdown (PolyScore details, Gemini analysis)

**FIRE Badge:**
- Flame icon on qualifying trades (PolySignal ≥ 60, BUY or STRONG_BUY)
- FIRE feed is a filtered view of the main feed (only FIRE-badged trades)

### 4.3 Feed Redesign (P0)

**Layout:**
- Tab bar: **All** | **FIRE** | **[Strategy Name 1]** | **[Strategy Name 2]** | ... 
- Each strategy tab shows only trades that qualify for that strategy
- Filter bar: Category, price range, time window, trader
- Sort: Newest, Highest signal, Largest size

**FIRE Feed Tab:**
- Shows trades qualifying across multiple signal dimensions (PolySignal ≥ 60)
- Each card shows which strategies the trade qualifies for (badge stack)
- Explanation tooltip: "This trade qualifies because: ML 72%, edge 12%, conviction 2.1×, trader 58% WR in Politics"

**Strategy Feed Tabs:**
- One tab per offered strategy (5–8 strategies from Decision 1)
- Shows trades that the corresponding FT wallet would take (or has taken)
- Performance banner at top: "This strategy is +34% ROI, 68% WR over 312 trades"
- CTA: "Auto-copy this strategy" → leads to bot setup

### 4.4 Bots Page Redesign (P0)

Each strategy card:
- Strategy name + risk badge (Conservative / Balanced / Aggressive)
- Sparkline chart (30-day equity curve from FT data)
- Key metrics: ROI %, Win Rate %, Total Trades, Avg PnL/Trade, Max Drawdown
- ML-powered badge (if `use_model = true`)
- Status indicator: Running / Paused / New
- CTA: "Start Bot" (Premium) or "View Feed" (Free)

### 4.5 Engineering Requirements

| Task | Estimate | Owner |
|------|----------|-------|
| Design mockups (Figma) for card, feed, bots page | 2 days | Design |
| Implement new TradeCard component with signal bar | 2 days | Frontend |
| Implement feed tabs with strategy filtering | 1.5 days | Frontend |
| API: endpoint to get trades-by-strategy (query ft_seen_trades) | 1 day | Backend |
| Bots page redesign with new strategy cards | 1.5 days | Frontend |
| Landing page update | 1 day | Frontend |
| Pricing page update | 0.5 days | Frontend |
| Strategy detail page (if Decision 3 = C) | 2 days | Full-stack |
| Responsive / mobile QA | 1 day | Frontend |
| **Total** | **~10.5 days** | — |

> Note: Many of these can be parallelized across 2 engineers.

---

## 5. Workstream 2: Signals & Intelligence Layer

### 5.1 What's Already Built

- PolyScore model (`poly_predictor_v11`) — scoring trades via BigQuery ML
- PolySignal — composite score (Edge 50% + Conviction 25% + Skill 15% + Context 10%)
- `trader_profile_stats` — per-niche, per-bracket stats
- FIRE feed endpoint (`/api/fire-feed/`) — returns BUY/STRONG_BUY trades
- Signal badge component (`PolySignal.tsx`)

### 5.2 What Needs to Ship

| Feature | Status | Work Needed | Priority |
|---------|--------|-------------|----------|
| ML score on every trade card | Partial — exists for FIRE feed | Ensure score is computed/cached for all feed trades, not just FIRE | P0 |
| P&L display per trade | Partial — ROI in trader_profile_stats | Surface ROI on card; ensure data freshness | P0 |
| Niche P&L on card | Data exists in trader_profile_stats | New UI component showing niche-specific WR + ROI + trade count | P0 |
| Conviction display | Computed in ft-sync | Ensure conviction is passed to frontend; design intensity indicator | P0 |
| # Trades by trader in context | Data exists | Query trader_profile_stats for resolved count; show on card | P0 |
| Verdict badge (STRONG_BUY etc.) | Built in PolySignal.tsx | Ensure it renders on all cards, not just expanded view | P0 |
| Score breakdown (expandable) | Built | Polish UI, ensure all 4 components render correctly | P1 |
| Performance regime indicator (HOT/COLD/STABLE) | Computed in ML pipeline | Add badge to trader section of card | P1 |
| Strategy qualification badges | New | Show which strategies this trade qualifies for | P1 |

### 5.3 Data Pipeline Work

| Task | Description | Estimate |
|------|-------------|----------|
| Ensure PolyScore is computed for all feed trades | Currently only FIRE feed computes it; extend to all trades or cache aggressively | 1 day |
| Pre-compute trader_profile_stats freshness | Stats may be stale; add last_updated check, flag if >24h old | 0.5 days |
| Add conviction to trade card API response | Ensure `conviction_multiplier` is returned from fire-feed and feed endpoints | 0.5 days |
| Cache ML scores in trades_public or ft_orders | Avoid re-querying BigQuery for every card render | 1 day |
| **Total** | | **3 days** |

---

## 6. Workstream 3: Strategy Feeds & Copy Trader Feeds

### 6.1 Strategy Definition

Each offered strategy needs:

1. **Underlying FT wallet(s)** — The forward-test wallet that defines the trading rules
2. **Name and description** — User-facing (see Naming Exercise)
3. **Risk classification** — Conservative / Balanced / Aggressive (based on historical drawdown)
4. **Performance data** — ROI, WR, total trades, equity curve, max drawdown, Sharpe
5. **Qualifying criteria summary** — Human-readable version of the FT wallet filters
6. **Category focus** (if any) — "Politics specialist" or "All markets"

### 6.2 How Strategy Feeds Work

```
User selects "Sharp Strategy" tab in feed
        │
        ▼
Frontend calls GET /api/strategy-feed/[strategy-id]
        │
        ▼
Backend queries ft_orders WHERE ft_wallet_id = [strategy's FT wallet]
  AND status = 'OPEN' (or recent 'WON'/'LOST' for history)
        │
        ▼
Enriches with: trader stats, ML score, conviction, market data
        │
        ▼
Returns trade cards filtered to this strategy's criteria
```

**For "manual feed" strategies (initially):**
- We can manually curate which FT wallets map to which offered strategy
- The feed is real — it shows actual FT trades that the strategy took
- Users see: "This strategy took this trade 3 minutes ago at $0.42"

**For fully automated strategies (later):**
- Same data, but with LT execution status: "This bot bought at $0.43 (0.2% slippage)"

### 6.3 Strategy Presentation in the Feed

**Option A: Tab-based (recommended for launch)**
```
[All Trades] [🔥 FIRE] [Sharp] [Balanced] [Underdog] [Politics] [AI Optimized]
```
- Each tab shows a filtered feed
- Performance summary banner at top of each strategy tab
- "Auto-copy this strategy" CTA

**Option B: Side-by-side (post-launch)**
- Split screen: strategy performance on left, trade feed on right
- Better for comparison but more complex UI

### 6.4 Strategies — Refinement Needed

**Current state:** 66+ FT strategies with varying performance. Some have 0% WR (likely misconfigured). Need to:

1. **Audit all 66 strategies** — Sort by PnL, WR, trade count. Identify top 8-10.
2. **Prune losers** — Pause strategies with <30% WR or <20 trades
3. **Rebalance** — Known issue: underdogs drive profit but favorites have higher WR. Ensure offered strategies cover both.
4. **Backtest validation** — Confirm offered strategies' FT results align with backtest expectations
5. **Minimum track record** — Only offer strategies with 100+ resolved trades

**Action items:**

| Task | Estimate | Owner |
|------|----------|-------|
| Strategy audit (analyze all 66, rank, select top 8) | 1 day | Data/Strategy |
| Create strategy metadata table (name, description, risk level, FT wallet mapping) | 0.5 days | Backend |
| Build strategy feed API endpoint | 1 day | Backend |
| Strategy tab UI in feed | 1 day | Frontend |
| Strategy performance banner component | 0.5 days | Frontend |
| Strategy card for bots page | 1 day | Frontend |
| **Total** | **5 days** | — |

---

## 7. Workstream 4: Copy Bots (Automated Execution)

### 7.1 Current State

- **FT system:** Mature. 66+ strategies, running 24/7, 2-min sync, ML scoring, full audit trail.
- **LT system:** Built but less battle-tested. Core executor works (executor-v2), risk management active, circuit breakers deployed. Real orders have been placed.
- **Risk controls:** Circuit breakers, daily budgets, position limits, drawdown limits, cooldown hours, shadow mode.
- **Known issues:**
  - Auto-redemption not fully implemented for all wallet types
  - Health monitoring needs completion
  - Trade aggregation for small positions (<$1) not implemented
  - Enhanced sell tracking planned but not shipped

### 7.2 What Needs to Ship for Launch

| Feature | Status | Work Needed | Priority |
|---------|--------|-------------|----------|
| Bot setup flow (pick strategy → set capital → set risk → activate) | Partial — exists in `/trading` page | Streamlined UX in new design, accessible from strategy cards | P0 |
| Bot dashboard (my bots, status, P&L, positions) | Partial — LT detail page exists | Unified view of all user bots with status indicators | P0 |
| Shadow mode toggle | Built | Ensure UI is clear, defaulting new bots to shadow for first N trades | P0 |
| Circuit breaker UI | Built | Polish, ensure resume flow is clear | P0 |
| Risk preset selection | Built (Conservative/Moderate/Aggressive) | Make prominent in bot setup flow | P0 |
| Real-time status updates | Partial — cron-based | Add live status: "Last trade: 2m ago, Waiting for signals" | P1 |
| Execution quality metrics | Partial — fill rate, slippage tracked | Surface in bot detail: avg slippage, fill rate, execution speed | P1 |
| Auto-redemption | Schema ready, partial impl | Ensure resolved positions auto-redeem (EOA wallets) | P1 |
| Small position aggregation | Planned | Buffer trades <$1 minimum until aggregatable | P2 |
| Stop-loss / take-profit | Schema supports, logic not built | Post-launch | P2 |

### 7.3 Bot UI Plan

**Bot Setup Flow (NEW):**
```
1. Choose Strategy → Card selector with performance preview
2. Set Capital → Starting balance, allocation to this bot
3. Risk Settings → Preset selector (Conservative/Moderate/Aggressive) + custom overrides
4. Review → Summary of strategy rules, capital, risk limits
5. Activate → Shadow mode first? Or straight to live?
```

**Bot Dashboard (Redesigned):**
```
My Bots
├── [Strategy Name] Bot
│   ├── Status: Running ● (green dot)
│   ├── P&L: +$47.23 (+12.3%)
│   ├── Win Rate: 68%
│   ├── Trades: 34 (12 open, 22 resolved)
│   ├── Risk: Moderate preset, circuit breaker OK
│   ├── Last trade: 4m ago — "NBA Finals: Lakers Yes @ 0.52"
│   └── [Pause] [Settings] [View Trades]
```

### 7.4 Showcase Wallets (If Decision 2 = YES)

| Task | Description | Estimate |
|------|-------------|----------|
| Create 2–3 Polymarket wallets (Turnkey) | New wallets via existing Turnkey integration | 0.5 days |
| Fund wallets | Transfer USDC to each wallet | 0.5 days |
| Create LT strategies linked to top FT wallets | Wire up using existing LT creation flow | 0.5 days |
| Monitor and document performance | Daily check-in, screenshot P&L for marketing | Ongoing |
| Brand wallets on Polymarket | Set display names if Polymarket allows | 0.5 days |
| **Total** | | **2 days** |

### 7.5 Testing Requirements (Critical)

Bots handle real money. Testing is non-negotiable.

| Test | Description | Estimate |
|------|-------------|----------|
| Shadow mode validation | Run each offered strategy in shadow for 48h, verify all trades match FT | 2 days (elapsed) |
| Circuit breaker testing | Trigger each risk rule, verify bot pauses correctly | 0.5 days |
| Order placement E2E | Place real orders on testnet or small amounts, verify fills | 1 day |
| Capital management | Verify starting balance → trade → P&L → balance updates correctly | 0.5 days |
| Concurrent bots | Run 3+ bots simultaneously, verify no interference | 0.5 days |
| Recovery testing | Kill worker mid-trade, verify state recovers | 0.5 days |
| **Total** | | **5 days** (some overlap with elapsed shadow testing) |

---

## 8. Workstream 5: Pricing & Monetization

### 8.1 Current State

- Stripe integration: Active, `$20/month` premium tier
- `profiles` table: `subscription_amount`, `subscription_status`, `stripe_subscription_id`
- Feature gating: `is_premium` flag, `resolveFeatureTier()` function
- Promo codes: Tracked separately

### 8.2 Proposed Tier Structure

| | **Free** | **Pro** ($X/month) | **Premium** ($X/month) |
|--|----------|-------------------|------------------------|
| **Feed access** | FIRE feed + 2 strategy feeds | All feeds | All feeds |
| **Signals** | Score only (no breakdown) | Full PolyScore breakdown | Full + Gemini analysis |
| **Manual copy** | Yes (with spread?) | Yes (reduced spread?) | Yes (no spread) |
| **Bots** | No | 1 bot (shadow first) | Unlimited bots |
| **Risk controls** | — | Basic presets | Full custom |
| **Alpha Agent** | No | No | Yes |
| **Followed traders** | 5 | 20 | Unlimited |
| **Portfolio analytics** | Basic | Advanced | Advanced + export |

> **Note:** Three tiers may be premature. Consider launching with Free + Premium only, then introducing Pro later. Decide in Decision 5.

### 8.3 Spread-Based Monetization (If Dome)

**How it would work:**
1. User clicks "Copy Trade" on a trade card
2. Order is routed through Dome (or our relay)
3. We add a spread (e.g., 1%) to the execution price
4. User pays slightly more than raw CLOB price
5. Premium users: no spread (or reduced spread)

**Engineering requirements:**
- [ ] Evaluate Dome API for spread injection
- [ ] Modify order placement flow to route through Dome when applicable
- [ ] Track spread revenue separately in database
- [ ] Display spread to user before confirmation ("Price: $0.52 + 1% spread = $0.525")
- [ ] Stripe integration unchanged for subscription tier

**Estimate:** 3–5 days (depends on Dome API complexity)

### 8.4 Action Items

| Task | Estimate | Owner |
|------|----------|-------|
| Decision meeting: pricing model | 1 hour | Cofounders |
| Evaluate Dome spread integration | 1 day | Backend |
| Update feature gating for new tiers | 1 day | Full-stack |
| Update Stripe products/prices if tiers change | 0.5 days | Backend |
| Update pricing page UI | 0.5 days | Frontend |
| **Total** | **3–4 days** | — |

---

## 9. Workstream 6: Code, Database & Security

### 9.1 Code Refactor & Cleanup

**Priorities:**

| Area | Issue | Action | Estimate |
|------|-------|--------|----------|
| V1 vs V2 components | Dual component sets (`polycopy/` and `polycopy-v2/`) | Remove V1 components, consolidate to V2 | 1 day |
| API route cleanup | Some redundant/deprecated routes | Audit routes, remove dead code | 0.5 days |
| Type safety | Some `any` types, inconsistent interfaces | Add strict types for trade, strategy, signal | 1 day |
| Error handling | Inconsistent error boundaries | Standardize error handling across API routes | 0.5 days |
| Environment variables | Scattered, some unused | Audit `.env`, remove unused, document required vars | 0.5 days |
| Dead code removal | Unused functions in `lib/` | Tree-shake, remove unused exports | 0.5 days |
| **Total** | | | **4 days** |

### 9.2 Database Refactor & Cleanup

| Area | Issue | Action | Estimate |
|------|-------|--------|----------|
| `ft_seen_trades` pruning | Table growing unbounded | Add pruning cron (delete >30 days) | 0.5 days |
| Strategy metadata table | No structured table for offered strategies | Create `strategies` table with name, slug, description, ft_wallet_id, risk_level, is_active | 0.5 days |
| Index audit | Some queries may be slow | Run EXPLAIN on key queries, add indexes | 0.5 days |
| Migration cleanup | 121+ migrations, some may conflict | Audit recent migrations, ensure clean state | 0.5 days |
| Unused tables | May have tables from deprecated features | Identify and mark for removal (don't drop pre-launch) | 0.5 days |
| **Total** | | | **2.5 days** |

### 9.3 Security Review

| Area | Check | Action | Priority |
|------|-------|--------|----------|
| **Authentication** | Magic link + Google OAuth | Verify session expiry, CSRF protection, token rotation | P0 |
| **API authorization** | Route-level auth checks | Audit all API routes for proper auth middleware | P0 |
| **Wallet credentials** | Encrypted via Turnkey | Verify encryption at rest, key rotation policy, access logging | P0 |
| **CLOB credentials** | Stored in `clob_credentials` | Verify encryption, ensure no plaintext in logs | P0 |
| **Cron endpoints** | Protected by `CRON_SECRET` | Verify all cron routes check bearer token | P0 |
| **Rate limiting** | Implemented for critical routes | Verify rate limits on order placement, login, API | P1 |
| **Input validation** | SQL injection, XSS | Audit user input handling in API routes | P1 |
| **Environment secrets** | `.env.local` | Verify not committed, no secrets in client bundle | P0 |
| **Supabase RLS** | Row-level security | Audit RLS policies on user-facing tables | P0 |
| **Dependency audit** | `npm audit` | Run audit, fix critical/high vulnerabilities | P1 |
| **Error messages** | No sensitive data in client errors | Verify API error responses don't leak internals | P1 |

**Estimate:** 2 days for audit + fixes

### 9.4 Total Workstream Estimate

| Sub-workstream | Estimate |
|----------------|----------|
| Code refactor | 4 days |
| Database cleanup | 2.5 days |
| Security review | 2 days |
| **Total** | **8.5 days** |

> These can be done in parallel with UI work by a separate engineer.

---

## 10. Workstream 7: Testing & QA

### 10.1 Testing Plan

**Manual QA Checklist:**

| Area | Test Cases | Priority |
|------|-----------|----------|
| **Feed** | Load feed, apply filters, switch tabs, scroll, trade card renders correctly | P0 |
| **Trade cards** | All signals display (ML, P&L, conviction, etc.), expand/collapse, copy button | P0 |
| **FIRE feed** | Only BUY/STRONG_BUY trades shown, badge renders | P0 |
| **Strategy feeds** | Correct trades per strategy, performance banner accurate | P0 |
| **Manual copy trade** | Place order, verify on Polymarket, check portfolio updates | P0 |
| **Bot creation** | Setup flow, shadow mode, risk presets, activation | P0 |
| **Bot execution** | Bot takes trades matching FT, correct amounts, slippage within limits | P0 |
| **Bot pause/resume** | Pause stops new trades, resume restarts, circuit breaker works | P0 |
| **Portfolio** | Positions update, P&L calculations correct, resolved trades show correctly | P0 |
| **Login/signup** | Magic link, Google OAuth, session persistence | P0 |
| **Premium gating** | Free users blocked from premium features, upgrade flow works | P0 |
| **Pricing page** | Correct tiers displayed, Stripe checkout works, subscription activates | P0 |
| **Mobile responsive** | All pages usable on iPhone/Android, no layout breaks | P1 |
| **Trader profiles** | Stats accurate, niche breakdown renders | P1 |
| **Settings** | Slippage, preferences save correctly | P1 |
| **Landing page** | All sections render, CTAs work, no broken images | P1 |

**Automated Tests:**

| Type | Scope | Estimate |
|------|-------|----------|
| Unit tests for PolySignal calculation | `lib/polysignal/calculate.ts` | 0.5 days |
| Unit tests for FT sync logic | `lib/ft-sync/shared-logic.ts` | 0.5 days |
| API integration tests (feed, strategy feed, order placement) | Key routes | 1 day |
| E2E: Login → Feed → Copy Trade → Portfolio | Critical path | 1 day |
| E2E: Bot Setup → Shadow → Activate → Pause | Bot path | 1 day |
| **Total** | | **4 days** |

### 10.2 Load Testing

- Simulate 50 concurrent users loading feed
- Simulate 10 concurrent bot executions
- Verify Supabase query performance under load
- Verify CLOB rate limits not exceeded

**Estimate:** 1 day

### 10.3 Testing Schedule

| Day | Focus |
|-----|-------|
| Feb 24 (Mon) | Manual QA — Feed, cards, signals |
| Feb 25 (Tue) | Manual QA — Bots, copy trades, portfolio |
| Feb 26 (Wed) | Automated tests + load testing |
| Feb 27 (Thu) | Bug fixes from QA |
| Feb 28 (Fri) | Final QA pass, regression testing |

---

## 11. Workstream 8: Content & Documentation

### 11.1 How-To Guides (Update/Create)

| Guide | Status | Action |
|-------|--------|--------|
| How to Copy Trade on Polymarket | Exists at `/(seo)/how-to-copy-trade-polymarket` | Update with new UI screenshots, strategy selection |
| How to Use PolyCopy Signals | New | Write: explain ML score, P&L, conviction, niche stats |
| How to Set Up a Copy Bot | New | Write: step-by-step bot setup, risk presets, shadow mode |
| How to Choose a Strategy | New | Write: compare strategies, risk profiles, when to use each |
| How to Read a Trade Card | New | Write: annotated card screenshot, what each signal means |
| Getting Started Guide | Exists | Update for new onboarding flow |
| FAQ | Exists at `/(seo)/faq` | Update with new features, pricing, bots |

**Estimate:** 3 days for all content

### 11.2 In-App Tooltips & Onboarding

| Feature | Description | Estimate |
|---------|-------------|----------|
| Tooltips on signal components | Hover/tap for explanation of ML score, conviction, etc. | 1 day |
| First-visit onboarding tour | 5-step tour: Feed → Signals → Strategy → Bots → Portfolio | 1.5 days |
| Empty state messages | "No trades yet" with explanation of how the feed works | 0.5 days |

### 11.3 Strategy Guides (Per Strategy)

For each offered strategy, create a brief (300–500 word) guide:
- What it does (plain English)
- Who it's for
- Historical performance
- Risk level and typical drawdown
- How to interpret its trades

**Estimate:** 0.5 days per strategy × 8 strategies = 4 days

> Can be parallelized with marketing content creation.

---

## 12. Workstream 9: Marketing Launch

### 12.1 Messaging Framework

**Primary message:** "Copy the best Polymarket traders — filtered by AI, executed automatically."

**Supporting messages:**

| Audience | Message | Channel |
|----------|---------|---------|
| **New to prediction markets** | "Make smarter bets. Our AI analyzes 50M+ trades to find the best copy opportunities." | Landing page, ads |
| **Active Polymarket traders** | "Stop guessing which trades to copy. ML signals show you the edge." | Twitter, communities |
| **Crypto/DeFi natives** | "Automated copy-trading bots for Polymarket with circuit breakers and risk controls." | Twitter, Discord |
| **Investors/partners** | "Institutional-grade ML pipeline + context-aware data + automated execution." | Direct outreach |

### 12.2 Launch Assets

| Asset | Description | Owner | Due |
|-------|-------------|-------|-----|
| Product Hunt page | Title, tagline, description, 6 screenshots, maker comment, first-day CTA | Marketing | Feb 27 |
| Landing page hero video/GIF | 30s screen recording showing feed → signal → copy flow | Marketing | Feb 27 |
| Twitter announcement thread | 10-tweet thread: problem → solution → features → proof → CTA | Marketing | Feb 28 |
| Blog post | "Introducing PolyCopy v2: AI Copy Trading for Polymarket" (1500 words) | Content | Feb 27 |
| Email to existing users | "PolyCopy v2 is here" — new features, updated UI, new bots | Marketing | Mar 2 |
| Strategy performance report | PDF/image: "Our top strategies — February 2026 results" | Data | Feb 28 |
| Social proof screenshots | Bot P&L screenshots, showcase wallet performance | Data | Feb 28 |
| Press/influencer outreach list | 20 crypto/prediction market influencers, journalists | Marketing | Feb 25 |
| Referral/invite mechanism | "Share PolyCopy, get 1 month free Premium" (if feasible) | Eng | Feb 28 |

### 12.3 Launch Schedule

| Date | Action |
|------|--------|
| Feb 25 | Finalize all copy, screenshots, video assets |
| Feb 26 | Product Hunt page drafted and reviewed |
| Feb 27 | Product Hunt page submitted (schedule for Mar 2) |
| Feb 28 | Twitter thread drafted, email drafted |
| Mar 1 | Final review of all launch materials |
| Mar 2 (LAUNCH) | Product Hunt goes live, Twitter thread posted, email sent |
| Mar 2 | Engage on Product Hunt all day (comments, updates) |
| Mar 2–3 | Influencer outreach, community posts |
| Mar 4–6 | Follow-up content: "Day 1 results", strategy deep-dives |

### 12.4 Channels

| Channel | Action | Content Type |
|---------|--------|-------------|
| **Product Hunt** | Launch page + day-of engagement | Product launch |
| **Twitter/X** | Launch thread + daily trading signals + bot results | Threads, screenshots, memes |
| **Reddit** | r/Polymarket, r/CryptoTrading, r/algotrading | Long-form post + engagement |
| **Discord** | Polymarket Discord, trading communities | Feature announcement |
| **Telegram** | Crypto trading groups | Short announcements |
| **Email** | Existing user base | Product update |
| **Blog/SEO** | polycopy.app blog | Long-form content |
| **YouTube** (stretch) | Demo video | Tutorial |

### 12.5 Go-to-Market Playbook

**Week 1 (Launch Week):**
1. **Day 0 (Mar 2):** Product Hunt + Twitter thread + email blast
2. **Day 1:** Engage PH, reply to all comments, share initial bot results
3. **Day 2:** Reddit posts, Discord outreach
4. **Day 3:** Influencer follow-ups, first "strategy spotlight" tweet
5. **Day 4:** Blog: "Why ML matters for copy trading" (thought leadership)
6. **Day 5:** Weekly strategy performance report (social proof)

**Week 2 (Sustain):**
1. Daily bot result screenshots on Twitter
2. Two strategy deep-dive blog posts
3. Community engagement (answer questions, demo requests)
4. A/B test pricing page copy
5. Retarget signups who didn't convert

---

## 13. Workstream 10: Marketing Automation & Bots

### 13.1 Twitter Bot

**Purpose:** Automatically tweet trading signals, bot results, and performance updates.

**Content types:**

| Type | Frequency | Example |
|------|-----------|---------|
| **Signal alerts** | 5–10/day | "🔥 FIRE signal: Top trader just bought NBA Finals: Lakers YES @ $0.42 — ML score 78%, 2.3× conviction. [link]" |
| **Bot results** | Daily | "📊 Our Sharp strategy today: 4 wins, 1 loss, +$23.40. 30-day ROI: +34%. [link]" |
| **Weekly roundup** | Weekly | "📈 This week on PolyCopy: Our bots made 47 trades, 71% win rate, +$142 total PnL. Top strategy: Balanced (+18% ROI)" |
| **Market commentary** | 2–3/week | "Polymarket Politics markets heating up. Our Politics strategy is 68% WR with +$89 this week." |
| **Social proof** | 3–5/week | Screenshots of winning trades, showcase wallet P&L |

**Engineering requirements:**

| Task | Description | Estimate |
|------|-------------|----------|
| Twitter API integration | OAuth, tweet posting, thread creation | 1 day |
| Signal alert pipeline | Hook into event bus → format signal → post tweet | 1.5 days |
| Daily results generator | Cron job: query bot performance → generate summary → post | 1 day |
| Content templates | 10+ tweet templates with variable insertion | 0.5 days |
| Rate limiting & scheduling | Queue tweets, respect Twitter limits, schedule for optimal times | 0.5 days |
| Manual override / approval queue | Dashboard to review/approve before posting (initially) | 1 day |
| **Total** | | **5.5 days** |

### 13.2 Other Marketing Automation

| Feature | Description | Priority | Estimate |
|---------|-------------|----------|----------|
| Email drip for new signups | Welcome → How-to → Strategy guide → Premium pitch (4 emails over 7 days) | P1 | 2 days |
| In-app notifications | "Your followed trader just made a FIRE trade" | P1 | 1.5 days |
| Referral tracking | Unique referral links, track conversions | P2 | 2 days |
| Discord bot (signals) | Post FIRE signals to Discord channel | P2 | 1 day |

---

## 14. Naming & Terminology Exercise

> **This section outlines the exercise. The full naming document should be created as `docs/NAMING_EXERCISE.md`.**

### 14.1 Items Requiring Names

| Item | Current Name | Notes |
|------|-------------|-------|
| The product | PolyCopy | Keep? |
| Product tier 1 (view signals) | "Signals"? "Intel"? "Scanner"? | What do users call this? |
| Product tier 2 (follow strategies) | "Strategies"? "Feeds"? "Playbooks"? | |
| Product tier 3 (auto-execute) | "Bots"? "AutoCopy"? "Runners"? | |
| ML score | PolyScore | Keep? Rename to something simpler? |
| Composite signal score | PolySignal | Confusing with PolyScore? Merge? |
| Trade recommendation | Verdict (STRONG_BUY etc.) | Keep terminology? |
| FIRE feed | FIRE Feed | What does FIRE stand for? Keep? |
| Individual strategies | FT wallet names (Sharp Shooter, etc.) | Need user-friendly names |
| Automated bot | Copy Bot / Live Trading | "Bot" has negative connotation? "AutoTrader"? |
| Alpha Agent | Alpha Agent | Keep for power users? Hide from casual users? |
| The act of copying | "Copy" / "Mirror" / "Follow" | Consistency needed |
| Premium tier | Premium | "Pro"? "Plus"? "Edge"? |
| Conviction metric | Conviction / conviction_multiplier | User-friendly label? "Bet strength"? "Trader confidence"? |
| Edge metric | Edge / edge_pct | "Statistical edge"? "Advantage"? |

### 14.2 Naming Principles

1. **Clarity over cleverness** — Users should understand what it does from the name
2. **Consistency** — Same concept = same word everywhere (code, UI, docs, marketing)
3. **No jargon** — Avoid ML/trading jargon in user-facing names
4. **Memorable** — Short, distinctive, easy to say out loud
5. **Trademark-friendly** — Check availability (domain, Twitter handle, PH)

### 14.3 Process

1. **Day 1:** Create `NAMING_EXERCISE.md` with all items and 3–5 candidates each
2. **Day 2:** Cofounder review, shortlist to 2 per item
3. **Day 3:** Final decision, update codebase terminology map
4. **Day 4–10:** Implement naming across UI, docs, marketing

---

## 15. Two-Week Sprint Schedule

### Week 1 (Feb 16–20): Foundation

| Day | Mon 16 | Tue 17 | Wed 18 | Thu 19 | Fri 20 |
|-----|--------|--------|--------|--------|--------|
| **Decisions** | Kickoff, review plan | D1-D6 decisions | Naming session | Lock decisions | — |
| **WS1: UI** | Design: card mockups | Design: feed, bots | Build: trade card | Build: trade card | Build: feed tabs |
| **WS2: Signals** | Audit signal data | Cache ML scores | Enrich card API | — | — |
| **WS3: Strategies** | Strategy audit (66→8) | Define metadata | Build feed API | Build feed API | Test feeds |
| **WS4: Bots** | Shadow test top 3 bots | Shadow testing | Bot setup flow design | — | — |
| **WS5: Pricing** | Evaluate Dome | Pricing decision | — | — | — |
| **WS6: Code** | Code audit | Start refactor | Refactor | DB cleanup | Security audit |
| **WS9: Marketing** | Draft messaging framework | Start PH page | Influencer list | — | — |
| **WS10: Mktg Bots** | Twitter API setup | — | — | — | — |

### Week 2 (Feb 23–27): Build & Polish

| Day | Mon 23 | Tue 24 | Wed 25 | Thu 26 | Fri 27 |
|-----|--------|--------|--------|--------|--------|
| **WS1: UI** | Build: bots page | Build: landing, pricing | Polish & responsive | Bug fixes | Final polish |
| **WS2: Signals** | Integration testing | QA signals display | Fix issues | — | — |
| **WS3: Strategies** | Strategy cards done | Performance banners | QA | — | — |
| **WS4: Bots** | Build bot setup flow | Build bot dashboard | Bot testing | Bot testing | Bot QA |
| **WS5: Pricing** | Implement tier gating | Stripe updates | QA | — | — |
| **WS6: Code** | Security fixes | Final cleanup | — | — | — |
| **WS7: Testing** | Manual QA: feed, cards | Manual QA: bots, portfolio | Automated + load tests | Bug fix day | Regression |
| **WS8: Content** | How-to guides | Strategy guides | FAQ updates | Tooltips | Final review |
| **WS9: Marketing** | Finalize assets | PH page submit | Twitter thread draft | Email draft | Final review |
| **WS10: Mktg Bots** | Signal pipeline | Daily results generator | Templates | Testing | Go/No-go |

### Weekend (Feb 28 – Mar 1): Pre-Launch

- Final bug fixes
- Staging deploy and full walkthrough
- Record demo video / GIF
- Load all marketing assets
- Team briefing: launch day roles

### Launch Day: Monday, March 2

- 00:01 UTC: Product Hunt goes live
- Morning: Twitter thread posted, email sent
- All day: Product Hunt engagement, monitor production, respond to feedback

---

## 16. Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Bot executes bad trade with real money** | High | Medium | Shadow mode default, circuit breakers, conservative risk presets, showcase wallets with small capital first |
| **Redesign not finished in time** | High | Medium | Prioritize P0 pages (feed, cards, bots). Ship with polished P0, defer P1/P2. |
| **ML scores slow/unavailable** | High | Low | Cache aggressively, fallback to PolySignal (no BigQuery), show "Score loading" state |
| **Polymarket API rate limits / downtime** | Medium | Medium | Circuit breakers already deployed, graceful degradation in UI |
| **Low FT strategy performance at launch** | High | Low | Only offer strategies with 100+ trades and positive P&L. Backtest validates FT. |
| **Security vulnerability discovered** | Critical | Low | Security audit in Week 1, dependency audit, RLS audit |
| **Dome integration not feasible in 2 weeks** | Medium | Medium | Fall back to subscription-only model; add spreads post-launch |
| **Naming disagreement delays launch** | Low | Medium | Timebox naming to 2 days; ship with working names, rebrand post-launch if needed |
| **Production instability during launch traffic** | High | Low | Load test in Week 2, Vercel auto-scaling, Supabase connection pooling |
| **Team bandwidth** | High | High | Prioritize ruthlessly. P0 only for launch. P1 in first 2 weeks post-launch. |

---

## 17. Launch Day Checklist

### Pre-Launch (Mar 1, night before)

- [ ] All P0 pages deployed to production
- [ ] Bot shadow testing completed with no critical issues
- [ ] Security audit items resolved
- [ ] Showcase wallets funded and running (if Decision 2 = YES)
- [ ] Product Hunt page approved and scheduled
- [ ] Twitter thread in drafts
- [ ] Email in Mailchimp/SendGrid, scheduled for launch morning
- [ ] Monitoring dashboards up (Vercel, Supabase, Fly.io worker)
- [ ] On-call rotation agreed (who handles incidents)

### Launch Morning (Mar 2)

- [ ] Verify production is stable (check all crons, worker, API health)
- [ ] Product Hunt goes live — post first maker comment
- [ ] Post Twitter thread
- [ ] Send email blast
- [ ] Monitor error rates, latency, signups in real-time
- [ ] Respond to every Product Hunt comment within 1 hour

### Launch Day Ongoing

- [ ] Monitor new user signups and conversion funnel
- [ ] Watch for bot execution issues (check LT orders, risk state)
- [ ] Post updates to Product Hunt ("First 100 signups!", performance screenshots)
- [ ] Share on Reddit, Discord, Telegram
- [ ] Fix any critical bugs immediately (have hotfix branch ready)

### End of Launch Day

- [ ] Publish "Day 1 results" tweet
- [ ] Review analytics: signups, conversions, page views, bounce rate
- [ ] Triage bugs from Day 1
- [ ] Plan Day 2 content

---

## 18. Post-Launch (Week 1)

| Day | Focus |
|-----|-------|
| Mar 3 | Bug fixes, user feedback triage, influencer follow-ups |
| Mar 4 | Strategy deep-dive blog post #1, community engagement |
| Mar 5 | Weekly strategy performance report (first one), A/B test pricing |
| Mar 6 | Strategy landing pages (if not launched), Discord bot setup |
| Mar 7 | Review metrics, plan Week 2 priorities |

**Post-launch feature pipeline (P1 items deferred from launch):**

| Feature | Priority | Target |
|---------|----------|--------|
| Strategy landing pages (`/strategy/[slug]`) | P1 | Week 1 post-launch |
| Enhanced portfolio analytics | P1 | Week 1 |
| Email drip campaign | P1 | Week 1 |
| Stop-loss / take-profit for bots | P2 | Week 2 |
| Referral program | P2 | Week 2 |
| Discord bot for signals | P2 | Week 2 |
| Auto-redemption for all wallet types | P2 | Week 2 |
| Connector abstraction (Kalshi etc.) | P3 | Month 2 |

---

## 19. Appendix: Feature Maturity Audit

### Current Feature Status (Pre-Launch)

| Feature | Implementation | Data Quality | UI | Docs | Launch Ready? |
|---------|---------------|--------------|-----|------|---------------|
| **FIRE Feed** | ✅ Complete | ✅ Good (PolySignal scoring) | ⚠️ Needs redesign | ✅ Documented | After UI update |
| **ML Scoring (PolyScore)** | ✅ Complete | ✅ Good (v11 model) | ⚠️ Only on FIRE cards | ✅ Documented | After card redesign |
| **Trader Profile Stats** | ✅ Complete | ✅ Good (per-niche) | ⚠️ Basic display | ✅ Documented | After card redesign |
| **Forward Testing (FT)** | ✅ Complete | ✅ 66+ strategies | ✅ Dashboard exists | ✅ Documented | Yes (internal) |
| **Live Trading (LT)** | ⚠️ Mostly complete | ⚠️ Limited real-money history | ⚠️ Basic dashboard | ⚠️ Partial docs | Needs testing |
| **Risk Management** | ✅ Complete | ✅ Circuit breakers work | ✅ UI exists | ✅ Documented | Yes |
| **Manual Copy Trade** | ✅ Complete | ✅ Good | ✅ Works | ⚠️ Needs how-to update | Yes |
| **Alpha Agent** | ✅ Complete | ⚠️ Limited run history | ✅ Command center | ✅ Documented | Yes (Premium) |
| **Trade Stream (WebSocket)** | ✅ Complete | ✅ <5s latency | N/A (backend) | ✅ Documented | Yes |
| **Pricing/Stripe** | ✅ Complete | ✅ Good | ⚠️ Needs tier update | ⚠️ Needs update | After pricing decision |
| **SEO Pages** | ✅ Complete | ✅ Good | ✅ Multiple pages | ⚠️ Some need updates | Yes |
| **Authentication** | ✅ Complete | ✅ Good | ✅ Works | ✅ Documented | Yes |
| **Portfolio** | ✅ Complete | ⚠️ P&L calculation updated | ⚠️ Needs redesign | ⚠️ Partial | After UI update |
| **Twitter Bot** | ❌ Not built | — | — | — | Needs building |
| **Strategy Feeds** | ❌ Not built (FT data exists) | ✅ Data exists | ❌ No UI | ❌ No docs | Needs building |
| **Bot Setup Flow** | ⚠️ Basic LT creation | ✅ Data exists | ⚠️ Not user-friendly | ⚠️ Partial | Needs redesign |
| **Spread/Dome Integration** | ❌ Not built | — | — | — | Depends on Decision 4 |
| **Email Campaigns** | ❌ Not built | — | — | — | Post-launch |
| **Referral System** | ❌ Not built | — | — | — | Post-launch |

### Gaps to Close Before Launch (Summary)

**Must-do (P0):**
1. Redesign trade cards with full signal suite
2. Redesign feed with strategy tabs and FIRE tab
3. Redesign bots page with strategy-centric cards
4. Build strategy feed API and UI
5. Extend ML score caching to all feed trades
6. Bot setup flow redesign
7. Security audit + critical fixes
8. Testing (manual QA + bot shadow testing)
9. Product Hunt page + launch assets

**Should-do (P1):**
1. Landing page update
2. Pricing page update
3. How-to guides
4. Twitter bot (at least manual tweet templates)
5. Showcase wallets
6. In-app tooltips
7. Strategy guides

**Nice-to-have (P2 — post-launch):**
1. Strategy landing pages
2. Dome spread integration
3. Email drip campaign
4. Discord bot
5. Referral program
6. Stop-loss / take-profit

---

## Summary of Key Timelines

| Milestone | Date | Owner |
|-----------|------|-------|
| Decisions D1–D6 locked | Feb 18 (Wed) | Cofounders |
| Naming exercise complete | Feb 19 (Thu) | Product + Marketing |
| Design mockups approved | Feb 19 (Thu) | Design |
| Strategy audit & selection done | Feb 18 (Wed) | Data/Strategy |
| Security audit complete | Feb 21 (Fri) | Engineering |
| Card + feed + bots page built | Feb 25 (Tue) | Frontend |
| Bot testing complete (shadow) | Feb 26 (Wed) | Engineering |
| All content/guides written | Feb 27 (Thu) | Content |
| Product Hunt page submitted | Feb 27 (Thu) | Marketing |
| QA complete | Feb 28 (Fri) | QA |
| Launch assets finalized | Mar 1 (Sun) | Marketing |
| **LAUNCH** | **Mar 2 (Mon)** | **All hands** |

---

*This is a living document. Update as decisions are made and work progresses. Track daily progress in standup.*
