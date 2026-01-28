# Top 5 Traders Real-Time Monitoring System

## Overview

A real-time monitoring system that watches the top 5 traders (by 30D realized PnL rank) and automatically captures their trades with enriched market data.

## What It Does

For each new trade detected from the top 5 traders:

1. **Captures Trade**: Inserts/updates trade in `trades` table
2. **Enriches Market Data**: For each trade's market (`condition_id`):
   - Fetches full market data from Dome API
   - Gets current prices (`outcome_prices`) from Price API
   - Generates ESPN URL (if applicable for sports markets)
   - Classifies market (`market_type`, `market_subtype`, `bet_structure`) using heuristics model
   - Updates `markets` table with all this data

## Files Created

- **`workers/worker-top5-traders.js`**: Main monitoring worker
- **`supabase/migrations/20260127_create_top5_trades_with_markets_view.sql`**: View joining trades + markets
- **`supabase/migrations/20260127_create_top5_trades_ml_view.sql`**: ML-ready view with timing calculations
- **`scripts/export-top5-ml-sample-now.js`**: CSV export script (used to generate `top5_ml_full.csv`)

## Top 5 Traders (30D Window)

1. `0x6a72f61820b26b1fe4d956e17b6dc2a1ea3033ee`
2. `0x0d3b10b8eac8b089c6e4a695e65d8e044167c46b`
3. `0xdb27bf2ac5d428a9c63dbc914611036855a6c56e`
4. `0xdc876e6873772d38716fda7f2452a78d426d7ab6`
5. `0x16b29c50f2439faf627209b2ac0c7bbddaa8a881`

## Usage

### Run the Worker

```bash
node workers/worker-top5-traders.js
```

The worker will:
- Poll every 5 seconds for new trades
- Refresh the top 5 list every hour
- Automatically enrich markets with prices, ESPN URLs, and classifications

### Export ML Dataset

```bash
# Full export (73,793 trades)
node scripts/export-top5-ml-sample-now.js --output=top5_ml_full.csv

# Sample export
node scripts/export-top5-ml-sample-now.js --output=top5_ml_sample.csv --limit=500
```

## Data Captured

### Trade Data
- All standard trade fields (wallet, timestamp, side, price, shares, etc.)
- Trade timing relative to game start and market close
- Trade timing category (pre-game, during-game, post-game, etc.)

### Market Data
- Full market metadata (title, slug, tags, etc.)
- Current outcome prices (`outcome_prices`)
- ESPN URL (for sports markets)
- Classifications:
  - `market_type` (Sports, Crypto, Politics, etc.)
  - `market_subtype` (NBA, Bitcoin, Election, etc.)
  - `bet_structure` (Prop, Yes/No, Over/Under, etc.)

## Notes

- Markets not found in Dome API are likely old/deleted markets (expected)
- The worker uses watermarks to only process new trades (efficient)
- Classifications use the `combined_heuristics_model.json` file
- ESPN URLs are generated for sports markets using sport detection logic
