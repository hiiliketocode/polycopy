# Top 50 Traders ML Dataset Setup

## Overview

Complete pipeline to set up a ML-ready dataset for the top 50 traders (by 30D realized PnL rank).

## What It Does

1. **Creates Table**: Creates `top50_traders_trades` table structure
2. **Populates Existing Trades**: Copies all existing trades from `trades` table for top 50 traders
3. **Backfills New Trades**: Fetches any new trades for top 50 traders from Dome API
4. **Backfills Markets**: Ensures all markets have complete data including outcome prices
5. **Exports CSV**: Generates ML-ready CSV with trades + markets + timing calculations

## Quick Start

### Option 1: Run Everything (Recommended)

```bash
node scripts/setup-top50-traders-ml-dataset.js
```

This runs all steps in sequence. You may need to manually run the SQL migration if DDL execution fails.

### Option 2: Run Steps Individually

```bash
# Step 1: Create table (run SQL migration manually in Supabase)
# Open: supabase/migrations/20260127_create_top50_traders_trades.sql
# Copy and paste into Supabase SQL editor

# Step 2: Populate existing trades from main trades table
node scripts/populate-top50-traders-trades.js

# Step 3: Backfill any new trades
node scripts/backfill-top50-traders-trades.js

# Step 4: Backfill outcome prices for markets
node scripts/backfill-top50-markets-outcome-prices.js

# Step 5: Export to CSV
node scripts/export-top50-ml-csv.js --output=top50_ml_full.csv
```

## Files Created

- **`scripts/populate-top50-traders-trades.js`**: Copies existing trades from main table
- **`scripts/backfill-top50-traders-trades.js`**: Backfills new trades for top 50 traders
- **`scripts/backfill-top50-markets-outcome-prices.js`**: Backfills outcome prices for markets
- **`scripts/export-top50-ml-csv.js`**: Exports ML-ready CSV
- **`scripts/setup-top50-traders-ml-dataset.js`**: Master orchestration script
- **`supabase/migrations/20260127_create_top50_traders_trades.sql`**: Creates the table

## CSV Export

The exported CSV includes:
- All trade columns from `trades` table
- All market columns from `markets` table (prefixed with `market_`)
- Timing calculations:
  - `seconds_before_game_start`
  - `seconds_before_market_end`
  - `trade_timing_category`

### Export Options

```bash
# Full export
node scripts/export-top50-ml-csv.js --output=top50_ml_full.csv

# Sample export (first 1000 rows)
node scripts/export-top50-ml-csv.js --output=top50_ml_sample.csv --limit=1000
```

## Notes

- The table creation step may require manual execution in Supabase SQL editor
- Outcome prices are backfilled from multiple sources (raw_dome, Dome API, Price API)
- The pipeline handles rate limiting and retries automatically
- All scripts use the 30D window for ranking traders
