# Paper Trading Framework

A simulation framework to test trading strategies with virtual capital before risking real money.

## Overview

The paper trading framework simulates 4 different auto-trading strategies, each starting with $1,000 and running for 4 days (or until the money runs out).

**Live UI**: Visit `/paper-trading` to run simulations and view results.

## Configuration

- **Initial Capital**: $1,000 per strategy (configurable)
- **Duration**: 4 days (configurable: 1, 7, 14, 30 days)
- **Slippage**: 4% applied on entry
- **Cooldown**: 3 hours after a trade resolves before capital is available again

## The 4 Strategies

### 1. Pure Value Score
**Trades ALL bet types** (spreads, totals, moneylines, etc.)  
**Entry Criteria**: Value Score ≥ 65 (COPY or STRONG COPY verdict), AI Edge ≥ 0%  
**Position Sizing**: Fixed $50 per trade (min $10, max $100)

Simple and straightforward - if the AI value score indicates a good trade, enter. Best for testing the raw predictive power of the value scoring system.

### 2. Weighted Value Score
**Trades ALL bet types**  
**Entry Criteria**: Weighted composite score ≥ 60  
**Position Sizing**: 5% of bankroll per trade (min $10, max $100)

Sophisticated multi-factor approach combining:
- Value Score (30%)
- Polyscore (20%)
- Trader Win Rate (20%)
- Conviction (15%)
- AI Edge (15%)

### 3. Singles Only V1 (Conservative)
**Only moneylines & winner picks** (no spreads/totals)  
**Entry Criteria**: Value Score ≥ 55, Polyscore ≥ 50  
**Position Sizing**: Fixed $40 per trade (min $10, max $80)

Conservative singles approach. Avoids spreads and over/unders which require predicting not just WHO wins but by HOW MUCH. Focuses on straight-up winner picks.

### 4. Singles Only V2 (Aggressive)
**Only moneylines & winner picks**  
**Entry Criteria**: Value Score ≥ 70, Trader Win Rate ≥ 55%, AI Edge ≥ 3%  
**Position Sizing**: Kelly criterion (20% fraction, min $20, max $150)

Aggressive singles strategy with dynamic position sizing - bets MORE when edge is higher. Higher conviction requirements but potentially higher returns.

## Why "Singles Only" for Some Strategies?

Spreads and Over/Unders are filtered from Singles strategies because:
- **Spreads**: Require predicting not just who wins, but by how much (harder)
- **Totals (O/U)**: Require predicting combined scores (more variables)
- **Moneylines/Winners**: Simply predict WHO wins (simpler signal)

The first two strategies (Pure Value, Weighted) trade EVERYTHING to test if the AI can predict spreads/totals too.

## Two Testing Modes

### Controlled Mode (Default)
**All 4 strategies use IDENTICAL position sizing** (e.g., $50 per trade).

**Why?** Isolates ENTRY CRITERIA performance. If Singles V2 outperforms Pure Value in controlled mode, we know it's because Singles V2 picks better trades, not because of Kelly sizing.

**Use for:** Comparing which strategy has the best entry signals.

### Full Mode
**Each strategy uses its designed position sizing** (Fixed, % Bankroll, or Kelly).

**Why?** Tests the complete system as it would run in production. Kelly sizing may amplify gains (or losses) compared to fixed sizing.

**Use for:** Real-world performance comparison including position sizing effects.

## Position Sizing by Strategy

### In Full Mode:

| Strategy | Min Bet | Max Bet | Sizing Method |
|----------|---------|---------|---------------|
| Pure Value Score | $10 | $100 | Fixed $50 |
| Weighted Value | $10 | $100 | 5% of bankroll |
| Singles V1 | $10 | $80 | Fixed $40 |
| Singles V2 | $20 | $150 | Kelly (20%) |

### In Controlled Mode:
All strategies use the same fixed bet (default $50, configurable).

### Kelly Criterion (Singles V2 in Full Mode)
Kelly sizing bets MORE when edge is higher:
- 3% edge → small bet (~5% of bankroll)
- 10% edge → larger bet (~15% of bankroll)
- Uses conservative 20% Kelly fraction (not full Kelly)

### Whale Trades
When a whale bets $50,000 on a market, we DON'T try to match their size:
- Treat it as a **signal** just like any other trade
- Position size determined by OUR strategy rules
- A $50K whale bet and a $500 bet provide the same signal quality

## Risk Management

### Concentration Limits
- **Max 20 concurrent open positions** - diversifies risk
- **Max 1 position per market** - no doubling down on same market
- **Max 4 days** - simulation stops to force evaluation

### Capital States
1. **Available**: Ready to trade immediately
2. **Locked**: In open positions (waiting for resolution)
3. **Cooldown**: Resolved but waiting 3 hours before available

### What Happens When Capital Runs Low?
- Trades that would exceed available cash are sized down
- If available < min position size ($10), that trade is skipped
- Simulation continues until ALL capital is gone (available + locked + cooldown = 0)

## Data Source

### Primary: `trades` Table
Contains all trades from tracked wallets with:
- Wallet address, timestamp, side (BUY/SELL)
- Price, shares, condition_id, market info
- Joined with `markets` table for resolution data

### Fallback: `top5_trades_with_markets` View
If the main table fails, falls back to trades from top 5 traders only. This is more limited but stable.

### Trade Filtering
- Only **BUY** trades are processed (we're copying longs)
- Trades within the date range
- Maximum 3,000 trades per simulation

## Usage

### Backtest vs Live Modes

### Backtest Mode
Processes historical trades from the database to simulate what would have happened.

**Pros:**
- Fast (processes days in seconds)
- Reproducible results
- Can test with more data

**Cons:**
- Uses simulated value scores (no historical PolyScore data)
- Resolution timing is estimated

### Live Mode
Processes real-time trades from the fire-feed as they happen.

**Pros:**
- Uses actual PolyScore API responses
- Accurate market resolution timing
- True test of the system

**Cons:**
- Takes 4 days to complete
- Requires continuous running
- Results depend on market activity during test period

## UI Dashboard

Visit `/paper-trading` to:
- Toggle between **Backtest** and **Live** modes
- Switch between **Controlled** and **Full** sizing modes
- Set bet size (in controlled mode)
- Run simulations with custom duration and capital
- View rankings of all 4 strategies
- See capital breakdown (available/locked/cooldown)
- Browse trade history with P&L per trade
- Compare strategy performance with charts

### Backtest API

```bash
# Run backtest with controlled sizing (default)
curl "http://localhost:3000/api/paper-trading"

# Run with full sizing mode
curl "http://localhost:3000/api/paper-trading?sizing=full"

# Controlled mode with custom bet size
curl "http://localhost:3000/api/paper-trading?sizing=controlled&betSize=75"

# Custom parameters
curl "http://localhost:3000/api/paper-trading?days=7&capital=2000&sizing=controlled&betSize=50"

# Text format for terminal
curl "http://localhost:3000/api/paper-trading?format=text"
```

**Query Parameters**:
- `sizing`: `controlled` (default) or `full`
- `betSize`: Fixed bet size in controlled mode (default: 50)
- `days`: Duration in days (default: 4)
- `capital`: Initial capital per strategy (default: 1000)
- `slippage`: Slippage percentage as decimal (default: 0.04 = 4%)
- `cooldown`: Hours until capital is available after resolution (default: 3)
- `start`: Start date (ISO format)
- `end`: End date (ISO format)
- `format`: `json` (default) or `text`
- `strategies`: Comma-separated list or `all`

### Live API

```bash
# Create a new live simulation
curl -X POST "http://localhost:3000/api/paper-trading/live" \
  -H "Content-Type: application/json" \
  -d '{"action": "create", "sizingMode": "controlled", "betSize": 50}'

# Get status of a simulation
curl "http://localhost:3000/api/paper-trading/live?id=live-12345&action=status"

# Get full details including trades
curl "http://localhost:3000/api/paper-trading/live?id=live-12345&action=full"

# Process a trade signal
curl -X POST "http://localhost:3000/api/paper-trading/live" \
  -H "Content-Type: application/json" \
  -d '{"action": "trade", "simulationId": "live-12345", "trade": {...}, "polyScoreData": {...}}'

# Resolve a market
curl -X POST "http://localhost:3000/api/paper-trading/live" \
  -H "Content-Type: application/json" \
  -d '{"action": "resolve", "simulationId": "live-12345", "conditionId": "0x...", "winningOutcome": "YES"}'

# End simulation and get final results
curl -X POST "http://localhost:3000/api/paper-trading/live" \
  -H "Content-Type: application/json" \
  -d '{"action": "end", "simulationId": "live-12345"}'

# List all active simulations
curl "http://localhost:3000/api/paper-trading/live?action=list"
```

### Command Line Script

```bash
# Run with defaults
npx ts-node scripts/run-paper-trading-backtest.ts

# Custom parameters
npx ts-node scripts/run-paper-trading-backtest.ts --days=7 --capital=2000 --verbose

# Available flags
# --days=N      Duration in days (default: 4)
# --capital=N   Starting capital (default: 1000)
# --slippage=N  Slippage as decimal (default: 0.04)
# --cooldown=N  Cooldown hours (default: 3)
# --verbose     Show detailed logs
```

## Response Format

```json
{
  "success": true,
  "config": {
    "durationDays": 4,
    "initialCapital": 1000,
    "slippagePct": 0.04,
    "cooldownHours": 3
  },
  "rankings": [
    {
      "rank": 1,
      "strategy": "WEIGHTED_VALUE_SCORE",
      "strategyName": "Weighted Value Score",
      "finalValue": 1087.50,
      "totalPnL": 87.50,
      "roi": 8.75,
      "winRate": 62.5,
      "totalTrades": 16,
      "maxDrawdown": 5.2
    }
  ],
  "portfolios": {
    "WEIGHTED_VALUE_SCORE": {
      "capital": {
        "initial": 1000,
        "available": 887.50,
        "locked": 100.00,
        "cooldown": 100.00,
        "total": 1087.50
      },
      "performance": {
        "totalPnL": 87.50,
        "roi": 8.75,
        "winRate": 62.5,
        "totalTrades": 16,
        "winningTrades": 10,
        "losingTrades": 6
      }
    }
  }
}
```

## Key Concepts

### Capital States

1. **Available**: Ready to trade
2. **Locked**: In open positions
3. **Cooldown**: Waiting for 3-hour cooldown after resolution

### Trade Lifecycle

1. Signal received from fire feed
2. Strategy evaluates entry criteria
3. Position size calculated
4. Slippage applied (4%)
5. Trade entered, capital locked
6. Market resolves (WIN/LOSS)
7. P&L calculated
8. Capital enters 3-hour cooldown
9. Capital returns to available

### Metrics Tracked

- Total P&L ($ and %)
- Win Rate
- Average Win/Loss
- Profit Factor
- Max Drawdown
- Sharpe Ratio (approximation)

## File Structure

```
lib/paper-trading/
├── index.ts        # Main exports
├── types.ts        # TypeScript interfaces
├── strategies.ts   # Strategy configs & logic
├── portfolio.ts    # Portfolio management
└── simulation.ts   # Simulation engine

app/api/paper-trading/
└── route.ts        # API endpoint

scripts/
└── run-paper-trading-backtest.ts  # CLI script
```

## Extending

### Adding a New Strategy

1. Add the type to `StrategyType` in `types.ts`
2. Add configuration to `STRATEGY_CONFIGS` in `strategies.ts`
3. Strategy will automatically be available for simulation

### Custom Position Sizing

Three sizing methods available:
- `FIXED_USD`: Fixed dollar amount per trade
- `PERCENT_BANKROLL`: Percentage of available capital
- `KELLY`: Kelly criterion with configurable fraction

## Known Issues & Limitations

### 1. Simulated Value Scores
**Problem**: We don't have historical PolyScore data, so backtests use simulated scores based on price and trade size.

**Impact**: Results may not reflect actual PolyScore performance.

**Future Fix**: Store PolyScore calls to build historical dataset.

### 2. Resolution Timing
**Problem**: We simulate resolution as 2 hours after entry.

**Impact**: Doesn't reflect actual market resolution times (could be minutes or days).

**Future Fix**: Track actual resolution timestamps from markets table.

### 3. Limited Historical Data
**Problem**: The `trades` table may only have recent data or limited wallets.

**Impact**: Backtests over longer periods may have sparse data.

**Future Fix**: Expand trade ingestion to more wallets.

### 4. No Early Exit
**Problem**: Currently positions are held to resolution only.

**Impact**: Can't test stop-loss or profit-taking strategies.

**Future Fix**: Add exit condition logic based on price movement.

### 5. Slippage Model
**Problem**: Fixed 4% slippage regardless of order size or liquidity.

**Impact**: Large positions may experience more slippage in reality.

**Future Fix**: Dynamic slippage based on order book depth.

### 6. No Live Mode
**Problem**: Currently backtest only, no real-time paper trading.

**Impact**: Can't test strategies on live incoming trades.

**Future Fix**: Add WebSocket connection to fire-feed for live simulation.

## Future Improvements

1. **Live Paper Trading Mode**: Process incoming trades from fire-feed in real-time
2. **Historical PolyScore Storage**: Save every PolyScore call to build training data
3. **Exit Strategies**: Add stop-loss, take-profit, and time-based exits
4. **Multi-Market Correlation**: Avoid correlated positions (e.g., same event, different prop)
5. **Trader Reputation Weighting**: Weight signals by trader's historical accuracy
6. **Dynamic Slippage**: Base slippage on market liquidity
7. **Alerts/Notifications**: Get notified when paper trades hit certain P&L thresholds

## Notes

- Simulated value scores are used for backtesting (real PolyScore data would be better)
- Resolution times are estimated as 2 hours after entry for simulation
- Results will vary based on available historical data
- Market resolution data depends on having resolved markets in the database
