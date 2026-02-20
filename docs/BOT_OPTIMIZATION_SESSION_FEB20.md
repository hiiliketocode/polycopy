# Bot Program Optimization - February 20, 2026

## Executive Summary

Comprehensive audit and optimization of 96 forward testing bots. Diagnosed systemic issues, extracted key learnings, fixed infrastructure bugs, paused underperformers, created 26 new bots, and deployed universal sell detection.

**Before:** 96 bots, ~13% profitable, -$19,501 realized PnL, no sell capability, broken Kelly sizing on 16 bots, Alpha Agent strategy-whiplashing daily.

**After:** 99 active bots (22 paused, 26 new), systematic issues fixed, sells enabled universally, Alpha Agent locked for 7 days on proven strategies, 5 high-conviction Cursor Alpha strategies deployed.

---

## 1. Infrastructure Fixes

### 1.1 Reconciliation Pagination Bug (CRITICAL)
The hourly reconciliation in ft/resolve queried all orders per wallet without pagination. Supabase's ~1000 row limit silently truncated stats for high-volume wallets (T0_CONTROL had 411k orders but showed 49k). Fixed with paginated fetch.

### 1.2 Kelly Bet Size Cap (16 bots)
Every Kelly bot with max_bet >= $15 was losing. Every Kelly bot with max_bet <= $12 was profitable. 100% correlation. Capped all 16 to max_bet=$10, kelly=0.25.

### 1.3 Universal Copy-Trader Sells
All FT and LT bots were buy-and-hold-until-resolution. Now when a copied trader sells, we sell proportionally. FT records SOLD outcome with exit_price. LT executes real SELL on Polymarket. Applied universally to all bots.

---

## 2. Key Learnings

### Winning Formula
- **CONVICTION allocation** (top 3 bots all use it)
- **ML 55%+** filter (ML bots 3x more likely profitable)
- **No crypto** (crypto = -$13,917 across all bots)
- **Price specialization** (don't trade 0-100c; pick a lane)
- **Max bet <= $10-12** for Kelly (above $15 = disaster)
- **Selectivity wins** (profitable bots: 8 trades/day; losers: 18.5/day)

### Config Pattern: Profitable vs Losing
| Config | Profitable Avg | Losing Avg |
|--------|---------------|------------|
| Entry price | 0.516 | 0.391 |
| ML probability | 0.609 | 0.510 |
| Conviction | 3.105 | 2.010 |
| Trades/day | 8.0 | 18.5 |
| Uses ML | 60% | 20% |

### Factor Sweet Spots
- **Trader WR 55-60%**: $3,798 PnL, 78.8% actual WR
- **Entry 60-80c (favorites)**: $1,363 PnL, 82.7% WR
- **ML 65-70%**: $196 PnL, 78% WR
- **Conviction 5x+**: 41.9% WR, best per-trade

### Why Specific Bots Failed
- **Sharp Shooter (-$3,106)**: model_threshold=null (broken ML) + Kelly 40% + $15-75 bets
- **High Conviction (-$1,093)**: No conviction filter despite name. T4_CONTR_CONV (+$8,649) is the correct implementation
- **Underdog Hunter (-$1,063)**: model_threshold=null, price 0-1 (not underdogs). ML version (+$800) fixes everything
- **Model Only (+$7,235 realized)**: Profitable but skewed by lucky crypto micro-price wins (top trade = $1,219 from 2c Bitcoin bet)

---

## 3. Bots Paused (22)

- 6 anti-strategies (T5) - thesis validated
- 2 controls (T1_Baseline, T0_Control) - enough data, T0 consuming 411k rows
- 2 misconfigured originals (High Conviction, Underdog Hunter)
- 2 Kelly-destroyed (S_Whale, S_Kelly_Agg)
- 5 zero-trade T3 niches (MLB, NBA, NFL, Soccer, Weather)
- 4 zero-trade Sharpshooter V2
- 1 inactive trader (TRADER_SPARKLY)

View with "Show Paused" toggle on trading page.

---

## 4. New Bots Created (26)

### Conviction Family (5)
- FT_CONV_2X: 2x conviction, CONVICTION alloc, $5-25
- FT_CONV_4X: 4x conviction, CONVICTION alloc, $8-35
- FT_CONV_5X: 5x conviction, CONVICTION alloc, $10-50
- FT_CONV_2X_ML55: 2x conv + ML 55%, $5-25
- FT_CONV_4X_ML55: 4x conv + ML 55%, $8-35

### Underdog Hunter Variants (4)
- FT_UH_ML60: ML raised to 60%
- FT_UH_ML55_CONV2: ML 55% + 2x conviction + CONVICTION alloc
- FT_UH_ML55_NO_CRYPTO: ML 55% excluding crypto
- FT_UH_FIXED: ML 55% FIXED $5 (A/B vs Kelly)

### Top-Trader Rotation (6)
Daily and 7-day top PnL traders, rotated at 3am UTC. Variants test ML/no-ML, CONVICTION/KELLY/FIXED.

### Cursor Alpha (5) - High Conviction Picks
1. **Whale Whisperer**: 3x conviction + ML 55% + no crypto, $8-35
2. **Favorites Scalper**: ML favorites 60-85c aggressive $5-20
3. **Contrarian Sniper**: ML + 2x conviction underdogs, $8-30
4. **Trader Stalker**: WBS+FEATHER+WEFLYHIGH ML-gated, $5-20
5. **Sweet Spot Hunter**: WR 55-60% + 5x conv + favorites, $10-40

---

## 5. Allocation Adjustments (10 bots)

Increased sizing on profitable bots:
- ML High Conviction: FIXED $1.20 -> CONVICTION $2-12
- ML Underdog: Kelly $0.50-8 -> Kelly $2-15
- TRADER_WBS: flat $8 -> CONVICTION $8-20
- TRADER_FEATHER: flat $8 -> CONVICTION $8-15
- ML Favorites/Heavy Favorites: Kelly -> CONVICTION $1-10
- T2 Mid-Range Profile: Kelly $0.50-8 -> $1-12
- ML Contrarian: $0.50-12 -> $2-15

---

## 6. Alpha Agent Fixes

### Problem
Strategy whiplash: ALPHA_CONSERVATIVE pivoted 5 times in 4 days between favorites and underdogs. ALPHA_EXPLORER tried 4 paradigms in 4 days. 86% crypto exposure on Explorer.

### Fixes
- 7-day minimum cooldown between config changes
- Max 3 parameters per decision
- Cron: daily -> weekly (Mondays)
- All alpha bots exclude crypto

### Reset (Locked Until Feb 27)
- CONSERVATIVE: ML favorites 55-85c (mirrors FT_ML_CTX_FAVORITES)
- OPTIMIZER: ML underdogs <50c (mirrors FT_ML_UNDERDOG)
- EXPLORER: Conviction 2x 10-70c (mirrors T4_CONTR_CONV)

---

## 7. UI Improvements

- **Show/Hide Paused**: Toggle to show/hide paused bots on Performance and Compare tabs
- **Charts Tab**: Line charts comparing daily metrics across bots (PnL, WR, Trades, Avg PnL)

---

## 8. What to Watch (Feb 20-27)

### Monitor
- [ ] Cursor Alpha bots: Whale Whisperer and Contrarian Sniper are highest conviction
- [ ] Kelly-capped bots: improved PnL trajectory?
- [ ] Alpha Agent: staying locked, performing like their mirrors?
- [ ] Sell detection: how many SOLD outcomes, profitable or not?
- [ ] Allocation increases: maintaining PnL/trade at higher sizes?
- [ ] Top-trader rotation: improving after initial losses?

### Red Flags
- Any bot losing >$500/day
- Sell detection creating large unexpected losses
- ML-gated bots 0 trades for 2+ days (ML scoring down)
- Alpha Agent changing before Feb 27

### Next Steps
1. Feb 27: Review Alpha Agent. Keep weekly cadence if locked configs outperform.
2. Build take-profit/scalping FT strategies (separate feature).
3. Re-run audit: npx tsx scripts/bot-program-audit.ts
4. If Cursor Alpha bots win, create LT (live) mirrors.

---

## 9. Tools

| Tool | Command |
|------|---------|
| Bot Audit | npx tsx scripts/bot-program-audit.ts |
| Charts | /trading?tab=charts |
| Daily Stats API | GET /api/ft/daily-stats?wallets=W1,W2 |

---

*Generated Feb 20, 2026. Re-run audit Feb 27.*
