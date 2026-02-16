# PolyCopy — Naming & Terminology Exercise

**Purpose:** Establish consistent, user-friendly naming across the product, codebase, UI, and marketing.  
**Created:** February 16, 2026  
**Decision deadline:** February 19, 2026  
**Status:** DRAFT — Requires cofounder review and selection

---

## How to Use This Document

1. Review each item and its candidate names
2. Score candidates on: Clarity (does a new user understand it?), Memorability, Consistency, Trademark-friendliness
3. Pick one winner per item
4. Once locked, update the **Terminology Map** at the bottom and propagate to code, UI, docs, and marketing

---

## 1. Product Name

| Candidate | Pros | Cons |
|-----------|------|------|
| **PolyCopy** (current) | Established, clear (Polymarket + copy trading), domain owned | Generic-sounding, doesn't convey AI/intelligence |
| **PolyCopy AI** | Adds AI positioning, same brand | Longer, "AI" suffix is overused |
| **CopyAlpha** | Conveys alpha-seeking + copy trading | Loses Polymarket association |
| **PolyEdge** | Conveys edge/advantage + Polymarket | "Copy" aspect lost |

**Recommendation:** Keep **PolyCopy** as the brand. Use "PolyCopy AI" in marketing taglines where appropriate (e.g., "PolyCopy — AI-Powered Copy Trading").

**Decision:** [ ]

---

## 2. Product Tiers

The three-tier product structure needs clear, distinct names.

### Tier 1: View Signals & Trade Feed

| Candidate | Description | Pros | Cons |
|-----------|-------------|------|------|
| **Signals** | Emphasizes intelligence | Clear, industry standard | Could imply "buy signals" (regulatory concern?) |
| **Scanner** | Emphasizes discovery | Active, suggests scanning market | Less common in crypto |
| **Intel** | Emphasizes intelligence | Feels premium, distinctive | Military connotation |
| **Radar** | Emphasizes detection | Visual metaphor, memorable | Already used by other products |
| **Feed** | Simple, describes the UI | Clear, no confusion | Generic, doesn't convey value |

### Tier 2: Follow Curated Strategies

| Candidate | Description | Pros | Cons |
|-----------|-------------|------|------|
| **Strategies** | Direct description | Clear, professional | Broad, not distinctive |
| **Playbooks** | Emphasizes a plan to follow | Memorable, suggests expertise | Not standard in trading |
| **Channels** | Like TV channels of trades | Familiar metaphor | Could confuse with chat channels |
| **Flows** | Emphasizes streams of trades | Modern, active | Vague |
| **Desks** | Trading desk metaphor | Professional, financial | Might sound complex |

### Tier 3: Automated Execution

| Candidate | Description | Pros | Cons |
|-----------|-------------|------|------|
| **Bots** | Direct, understood | Clear, standard in crypto | Negative connotation (spam bots) |
| **AutoCopy** | Describes the action | Very clear, no ambiguity | Less exciting |
| **Runners** | Suggests autonomous execution | Active, distinctive | Not standard |
| **Autopilot** | Suggests hands-off | Memorable, clear metaphor | Used by many products |
| **Engines** | Suggests power and automation | Professional, distinctive | Not user-friendly |
| **SmartCopy** | Combines intelligence + copying | Clear, positive | "Smart" prefix overused |

**Recommendation:**

| Tier | Recommended Name | Rationale |
|------|-----------------|-----------|
| Tier 1 | **Signals** | Clear, industry standard, conveys value |
| Tier 2 | **Strategies** | Direct, professional, pairs well with "follow a strategy" |
| Tier 3 | **AutoCopy** | Crystal clear what it does, no negative connotations |

**Decision:** [ ]

---

## 3. ML Score & Signal Names

Currently we have two overlapping scoring systems:

| Current Name | What It Does | Where Used |
|-------------|-------------|------------|
| **PolyScore** | BigQuery ML prediction (model probability + verdict) | Supabase function, internal |
| **PolySignal** | Composite score (Edge 50% + Conviction 25% + Skill 15% + Context 10%) | Trade cards, FIRE feed |

**The problem:** Two names for related concepts. Users see "PolySignal" on cards and "PolyScore" in docs. Confusing.

### Options

| Option | What Changes | Pros | Cons |
|--------|-------------|------|------|
| **A: Keep both, clarify** | PolyScore = raw ML probability, PolySignal = composite score | No code changes | Still confusing |
| **B: Merge into PolyScore** | Kill "PolySignal" name. PolyScore = the composite score users see. ML probability stays internal. | One name to learn | PolyScore is overloaded |
| **C: Merge into PolySignal** | Kill "PolyScore" name. PolySignal = everything. | One name, "signal" is clearer | PolyScore used in backend |
| **D: New unified name** | e.g., "EdgeScore" or "TradeScore" or "AlphaScore" | Fresh start, no confusion | Loses brand prefix |

**Candidates for unified name:**

| Candidate | Pros | Cons |
|-----------|------|------|
| **PolyScore** | Already used, "score" is clear | Sounds generic |
| **EdgeScore** | Conveys "edge" which is core value prop | Loses "Poly" brand |
| **AlphaScore** | Conveys alpha/outperformance | "Alpha" overused in crypto |
| **TradeScore** | Very clear — it's a score for a trade | Generic |
| **CopyScore** | Ties to copy trading | Limited |

**Recommendation:** Option C — Merge everything user-facing into **PolySignal**. Keep "PolyScore" as an internal/API name for the raw ML prediction. Users only ever see "PolySignal" with a score (0–100), verdict (STRONG_BUY etc.), and expandable breakdown.

**Decision:** [ ]

---

## 4. Trade Recommendations (Verdicts)

| Current | Alternative Options | Notes |
|---------|-------------------|-------|
| STRONG_BUY | Strong Signal, Top Pick, Fire | |
| BUY | Good Signal, Copy, Favorable | |
| HOLD | Neutral, Mixed, Watch | "Hold" implies you own it already |
| AVOID | Weak, Skip, Caution | |
| TOXIC | Do Not Copy, High Risk, Danger | "Toxic" is strong |

**Options:**

| System | Terms |
|--------|-------|
| **A: Trading style** (current) | STRONG_BUY, BUY, HOLD, AVOID, TOXIC |
| **B: Signal style** | STRONG, GOOD, NEUTRAL, WEAK, AVOID |
| **C: Copy style** | COPY NOW, COPY, WATCH, SKIP, AVOID |
| **D: Star rating** | ★★★★★, ★★★★, ★★★, ★★, ★ |
| **E: Emoji/icon** | 🔥🔥, 🔥, ⚡, ⚠️, 🚫 |

**Recommendation:** System C ("Copy style") for user-facing, mapped from the existing internal verdicts. Clearer call-to-action for a copy trading product.

| Internal | User-Facing | Icon |
|----------|------------|------|
| STRONG_BUY | **COPY NOW** | 🔥🔥 |
| BUY | **COPY** | 🔥 |
| HOLD | **WATCH** | 👁️ |
| AVOID | **SKIP** | ⚠️ |
| TOXIC | **AVOID** | 🚫 |

**Decision:** [ ]

---

## 5. FIRE Feed

| Candidate | Pros | Cons |
|-----------|------|------|
| **FIRE Feed** (current) | Memorable, flame emoji is visual | What does FIRE mean? Backronym needed? |
| **Hot Trades** | Self-explanatory | Less distinctive |
| **Top Signals** | Clear and professional | Generic |
| **Alpha Feed** | Conveys outperformance | Overused in crypto |
| **Edge Feed** | Ties to "edge" concept | Less exciting |

**If keeping FIRE, define the acronym:**
- **F**iltered **I**ntelligent **R**eal-time **E**dge
- **F**irst **I**n **R**eal **E**xecution
- **F**ast **I**nsight, **R**eal **E**dge

**Recommendation:** Keep **FIRE Feed** — it's memorable and the flame icon is strong visual branding. Define as "Filtered Intelligent Real-time Edge" in marketing/docs.

**Decision:** [ ]

---

## 6. Individual Strategy Names

Each offered strategy needs a user-friendly name. The name should convey the strategy's character.

| FT Basis | Risk | Current Internal Name | Candidate Names |
|----------|------|----------------------|-----------------|
| Heavy Favorites + ML | Low | FT_FAVORITES_ML_MIX | **Steady**, Safe Bet, Blue Chip, Foundation, Anchor |
| Model Balanced (30-70¢, ML 50%) | Medium | FT_MODEL_BALANCED | **Balanced**, All-Rounder, Core, Compass, Navigator |
| Sharp Shooter (ML 55% + conviction) | Medium | FT_SHARP_SHOOTER_ML_MIX | **Sharp**, Precision, Sniper, Marksman, Focused |
| Underdog + ML + edge | High | FT_UNDERDOG_ML_MIX | **Maverick**, Longshot, Contrarian, Dark Horse, Wildcard |
| T3 Politics (niche traders) | Medium | FT_T3_POLITICS | **Capitol**, Beltway, Ballot, Political Edge, The Hill |
| T3 Sports (niche traders) | Medium | FT_T3_SPORTS | **Arena**, Game Day, Sideline, Playmaker, Stadium |
| Alpha Agent Explorer | Variable | ALPHA_EXPLORER | **Pioneer**, Explorer, Frontier, Pathfinder, Scout |
| Alpha Agent Conservative | Medium | ALPHA_CONSERVATIVE | **Sentinel**, Guardian, Vanguard, Fortress, Shield |

**Naming convention:** Single word, evocative, easy to remember. Users say "I'm running the Maverick strategy" or "Switch me to Sharp."

**Recommendation:** Use the **bold** candidates above as defaults. Review in naming session.

**Decision:** [ ]

---

## 7. Copy Bot Product Name

| Candidate | Pros | Cons |
|-----------|------|------|
| **Copy Bots** | Clear, descriptive | "Bot" connotation |
| **AutoCopy** | Action-oriented, clear | Not exciting |
| **SmartCopy** | Implies intelligence | "Smart" overused |
| **CopyPilot** | Autopilot metaphor | Similar to other products |
| **TradeRunner** | Active, technical | Not clearly about copying |
| **MirrorTrade** | Clear metaphor | Used by other platforms |
| **AutoTrader** | Well-known concept | Possibly trademarked |

**Recommendation:** **AutoCopy** — crystal clear, action-oriented, pairs well with manual "Copy" button. "Start your AutoCopy" vs "Set up a Copy Bot."

**Decision:** [ ]

---

## 8. Alpha Agent

| Candidate | Pros | Cons |
|-----------|------|------|
| **Alpha Agent** (current) | Distinctive, "alpha" resonates with traders | Sounds complex for new users |
| **AI Strategist** | Self-explanatory | Generic |
| **PolyBrain** | Memorable, implies intelligence | Silly? |
| **The Optimizer** | Describes function | Doesn't capture exploration |
| **AlphaAI** | Shorter, modern | "AI" suffix fatigue |

**Recommendation:** Keep **Alpha Agent** for the premium feature. It's distinctive and resonates with the target audience (traders who want alpha). For marketing, use "Alpha Agent — our AI trading strategist."

**Decision:** [ ]

---

## 9. The Act of Copying

We need consistent verbs across the product.

| Context | Current Usage | Recommended |
|---------|-------------|-------------|
| Manually copying a single trade | "Copy" / "Copy Trade" | **Copy** ("Copy this trade") |
| Following a strategy (viewing its feed) | "Follow" / no consistent term | **Follow** ("Follow the Sharp strategy") |
| Auto-executing via bot | "Live Trading" / "LT" / "Bot" | **AutoCopy** ("AutoCopy the Sharp strategy") |
| Unfollowing/stopping | "Pause" / "Stop" | **Pause** (for bots), **Unfollow** (for strategies) |

**Recommendation:** Three verbs for three tiers:
- **Copy** = manual, single trade
- **Follow** = subscribe to a strategy feed
- **AutoCopy** = automated execution

**Decision:** [ ]

---

## 10. Subscription Tier Name

| Candidate | Pros | Cons |
|-----------|------|------|
| **Premium** (current) | Standard, understood | Overused |
| **Pro** | Short, professional | Overused |
| **Plus** | Positive, simple | Doesn't convey much |
| **Edge** | Ties to "edge" value prop, unique | Could be confused with browser |
| **Alpha** | Ties to alpha-seeking, premium feel | Already used for Alpha Agent |
| **Unlimited** | Describes what you get | Only makes sense if there are limits |

**Recommendation:** **Pro** for the standard paid tier. If we add a higher tier later, use **Edge** for the top tier (Pro → Edge → Enterprise).

**Decision:** [ ]

---

## 11. Key Metrics (User-Facing Labels)

| Internal Term | Current UI Label | Recommended Label | Tooltip |
|---------------|-----------------|-------------------|---------|
| `conviction_multiplier` | "Conviction" | **Bet Strength** | "How much more than usual this trader bet — 2.3× means 2.3 times their average bet size" |
| `edge_pct` | "Edge" | **Edge** | "The trader's historical win rate minus the entry price — positive means they've earned this price historically" |
| `model_probability` | "ML Score" | **AI Confidence** | "Our AI model's prediction of whether this trade will win (0–100%)" |
| `niche_win_rate` | "Niche WR" | **Category Win Rate** | "The trader's win rate specifically in this market type (e.g., NBA, Politics)" |
| `total_pnl` | "P&L" | **Profit** (or **Return**) | "Total profit or loss" |
| `roi_pct` | "ROI" | **ROI** | "Return on investment — total profit divided by total capital invested" |
| `performance_regime` | "Regime" | **Form** | "The trader's recent form — Hot (on a winning streak), Cold (losing streak), or Stable" |
| `resolved_count` | "Trades" | **Track Record** | "Number of resolved trades in this context — higher means more reliable data" |

**Decision:** [ ]

---

## Terminology Map (Complete When Decisions Made)

> Fill in the "Final" column after the naming session. This becomes the source of truth for code, UI, docs, and marketing.

| Concept | Internal (Code) | User-Facing (UI) | Marketing | Final |
|---------|----------------|-------------------|-----------|-------|
| The product | polycopy | PolyCopy | PolyCopy | |
| View signals tier | signals | ? | ? | |
| Follow strategies tier | strategies | ? | ? | |
| Automated execution tier | autocopy / lt | ? | ? | |
| ML score (composite) | polysignal | ? | ? | |
| ML score (raw model) | polyscore | (hidden) | — | |
| STRONG_BUY verdict | STRONG_BUY | ? | ? | |
| BUY verdict | BUY | ? | ? | |
| HOLD verdict | HOLD | ? | ? | |
| AVOID verdict | AVOID | ? | ? | |
| TOXIC verdict | TOXIC | ? | ? | |
| Curated feed | fire_feed | ? | ? | |
| Strategy: Favorites | ft_favorites_ml_mix | ? | ? | |
| Strategy: Balanced | ft_model_balanced | ? | ? | |
| Strategy: Sharp | ft_sharp_shooter | ? | ? | |
| Strategy: Underdog | ft_underdog_ml_mix | ? | ? | |
| Strategy: Politics | ft_t3_politics | ? | ? | |
| Strategy: Sports | ft_t3_sports | ? | ? | |
| Strategy: AI Explorer | alpha_explorer | ? | ? | |
| Strategy: AI Conservative | alpha_conservative | ? | ? | |
| Bot product | lt_strategy / copy_bot | ? | ? | |
| AI strategist | alpha_agent | ? | ? | |
| Copy a trade (verb) | copy | ? | ? | |
| Follow a strategy (verb) | follow | ? | ? | |
| Auto-execute (verb) | autocopy / execute | ? | ? | |
| Paid tier | premium | ? | ? | |
| Conviction metric | conviction_multiplier | ? | ? | |
| Edge metric | edge_pct | ? | ? | |
| ML confidence | model_probability | ? | ? | |
| Form/streak | performance_regime | ? | ? | |

---

## Next Steps

1. **Feb 17 (Tue):** Cofounders review this document
2. **Feb 18 (Wed):** 60-minute naming session — make final selections
3. **Feb 19 (Thu):** Complete Terminology Map, circulate to team
4. **Feb 20–Mar 2:** Implement naming across codebase, UI, docs, marketing

---

*This document should be treated as the single source of truth for all product naming. Once locked, any name changes go through the same review process.*
