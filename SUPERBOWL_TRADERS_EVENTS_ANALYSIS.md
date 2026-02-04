# Super Bowl Traders Analysis via Events Table

## Key Findings

### Scale of Super Bowl Trading

- **303 Super Bowl Events** identified in the events table
- **440 Unique Traders** trading Super Bowl markets
- **Top Event**: `superbowl-champion-2025` with **212 traders** and **$159+ trillion** in volume
- **Most Active Event**: `super-bowl-champion-2026-731` with **206 traders** and **29.6M trades**

### Top 10 Super Bowl Traders (by Investment)

1. **0x63d4...a2f1** - $25.66M invested
   - 24 events, 258 markets, 1,161 positions
   - Super Bowl ROI: 2.06%
   - Super Bowl Win Rate: 92.96% (792 wins, 60 losses)
   - NFL PnL%: 0.06% (48,702 NFL trades)

2. **0x0d16...d24d** - $15.08M invested
   - 14 events, 92 markets
   - Super Bowl ROI: 0.55%
   - NFL PnL%: 0.59%

3. **0x53d2...0c3f** - $10.37M invested
   - 17 events, 121 markets
   - Super Bowl ROI: **16.65%** ⭐ (Best ROI in top 10)
   - NFL PnL%: 0.04%

4. **0x9703...69c2** - $10.02M invested
   - 6 events, 89 markets, 750 positions
   - Super Bowl ROI: 3.13%
   - Super Bowl Win Rate: 78.05% (384 wins, 108 losses)
   - NFL PnL%: 0.02%

5. **0x2fb0...abf8** - $9.77M invested
   - 1 event, 9 markets, 36 positions
   - Super Bowl ROI: 0.21%
   - Super Bowl Win Rate: **100%** (36 wins, 0 losses) ⭐
   - NFL PnL%: 0.94%

### Most Profitable Super Bowl Traders

**Top ROI Performers:**
- **0x4cc3...7552**: 30.37% ROI ($5.89M invested)
- **0x1638...339b**: 23.33% ROI ($4.05M invested)
- **0x53d2...0c3f**: 16.65% ROI ($10.37M invested)

**Worst Performers:**
- **0x727b...d1a2**: -38.99% ROI ($8.40M invested, 108 losses, 24 wins)
- **0x011f...1122**: -4.08% ROI ($5.96M invested)

### Event Categories

**Most Traded Event Types:**
1. **Super Bowl Champion** markets (2025, 2026)
2. **MVP** markets (Super Bowl LX MVP)
3. **Halftime Show** markets (songs, performers)
4. **Team Matchups** (exact outcomes, who will face who)
5. **Props** (Gatorade color, coin toss, first touchdown)
6. **Celebrity/Culture** (Taylor Swift, Trump, Bad Bunny)

### Key Insights

1. **Event-Based Analysis is More Comprehensive**
   - Found **440 traders** vs **9 traders** using tag-based search
   - Events table captures all Super Bowl-related markets more accurately

2. **Diversification Patterns**
   - Top traders trade across **6-42 different events**
   - Most traders focus on **1-2 events** (champion markets)
   - Diversified traders (20+ events) tend to have better win rates

3. **Investment Scale**
   - Top trader invested **$25.66M** across Super Bowl markets
   - Average top 20 trader: **~$7M** invested
   - Many traders with **$5M+** investments

4. **Performance Correlation**
   - NFL PnL% doesn't strongly correlate with Super Bowl ROI
   - Some traders with low NFL PnL% (0.02-0.06%) achieve high Super Bowl ROI (16-30%)
   - Super Bowl appears to be a separate skill set

5. **Win Rate Patterns**
   - Top performers: 78-100% win rates
   - Most traders: 50-80% win rates
   - Some traders with high investment but low win rates (18-20%)

### Most Active Events

1. **superbowl-champion-2025**: 212 traders, 18.5M trades, $159T+ volume
2. **super-bowl-champion-2026-731**: 206 traders, 29.6M trades, $146T+ volume
3. **nfl-kc-phi-2025-02-09**: 93 traders, 153K trades, $384B+ volume
4. **super-bowl-lx-mvp**: 23 traders, 83K trades, $4.67B+ volume
5. **who-will-perform-at-super-bowl-halftime-show**: 39 traders, 37K trades, $4.53B+ volume

### Trading Patterns

**Event Diversification:**
- **High Diversification** (20+ events): Better risk management, more consistent returns
- **Low Diversification** (1-2 events): Higher variance, some achieve 100% win rates

**Market Types:**
- **Champion Markets**: Highest volume, most traders
- **Props Markets**: Lower volume but higher engagement per trader
- **Culture Markets**: Growing category (Taylor Swift, Trump, Bad Bunny)

### Recommendations

1. **Focus on Event-Based Queries**: More accurate than tag-based searches
2. **Track Multi-Event Traders**: They show better risk management
3. **Monitor High ROI Traders**: Especially those with 20%+ ROI on large investments
4. **Analyze Event Categories**: Different event types attract different trader profiles

## Comparison: Events Table vs Tags Table

| Metric | Events Table | Tags Table |
|--------|-------------|------------|
| Traders Found | 440 | 9 |
| Events Identified | 303 | N/A |
| Coverage | Comprehensive | Limited |
| Accuracy | High (event_slug matching) | Medium (text search) |

**Conclusion**: Events table provides much more comprehensive and accurate Super Bowl trader identification.
