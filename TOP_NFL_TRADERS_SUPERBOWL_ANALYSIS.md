# Top 20 NFL Traders - Super Bowl Trading Analysis

## Overview

This analysis identifies the top 20 traders by NFL PnL% and examines their trading positions for markets tagged with "superbowl".

## Files Created

1. **`analyze-top-nfl-traders-superbowl.sql`** - BigQuery SQL query for the analysis
2. **`analyze-top-nfl-traders-superbowl.py`** - Python script to run the analysis and generate a formatted report

## How to Run

### Option 1: Run Python Script (Recommended)

```bash
python3 analyze-top-nfl-traders-superbowl.py
```

The script will:
- Connect to BigQuery
- Find top 20 NFL traders by PnL%
- Identify all Super Bowl markets
- Analyze their positions and PnL
- Generate a formatted report

### Option 2: Run SQL Query Directly

You can run the SQL query directly in BigQuery Console:

1. Open BigQuery Console
2. Copy the contents of `analyze-top-nfl-traders-superbowl.sql`
3. Paste and run in the query editor

## What the Analysis Shows

### Trader Summary
For each of the top 20 NFL traders, the analysis provides:

- **NFL Performance Metrics:**
  - NFL PnL% (their overall NFL trading performance)
  - NFL Win Rate
  - NFL Trade Count

- **Super Bowl Trading Metrics:**
  - Number of Super Bowl markets traded
  - Total Super Bowl positions
  - Total invested in Super Bowl markets
  - Realized PnL from Super Bowl trades
  - Open position value
  - Super Bowl ROI%
  - Super Bowl Win Rate
  - Winning/Losing/Open position counts
  - Average, best, and worst position PnL

### Position Details
For each trader, detailed breakdown of:
- Market titles
- Outcomes traded (Yes/No)
- Position status (Open/Resolved/Closed)
- Net position size
- Total cost
- Realized PnL
- Average entry price
- Trade counts (buys vs sells)

## Query Logic

1. **Top NFL Traders**: Queries `trader_profile_stats` table filtered by `final_niche = 'NFL'`, ordered by `roi_pct` DESC, limited to top 20 with minimum 5 trades.

2. **Super Bowl Markets**: Finds markets where:
   - Tags JSON array contains "superbowl" (case-insensitive)
   - OR title contains "superbowl" or "super bowl"

3. **Position Calculation**: 
   - Aggregates BUY and SELL trades per market/outcome
   - Calculates net position size (BUYs - SELLs)
   - Calculates cost basis from BUY trades
   - Calculates realized PnL for resolved markets

4. **PnL Calculation**:
   - For resolved markets: Compares token_label to winning_label
   - Win: PnL = (1.0 - entry_price) * position_size
   - Loss: PnL = (0.0 - entry_price) * position_size

## Database Schema

- **trader_profile_stats**: Contains trader performance by niche (NFL, NBA, etc.)
- **markets**: Contains market metadata including tags
- **trades**: Contains individual trade records

## Example Output

```
TOP 20 NFL TRADERS - SUPER BOWL TRADING ANALYSIS
================================================================================

Rank   Wallet Address                                    NFL PnL%     SB Markets   SB ROI%       SB Win Rate   Total Invested
--------------------------------------------------------------------------------
1      0x1234...5678                                      45.23%       3            12.50%       66.67%        $15,234.56
2      0xabcd...efgh                                      38.91%       2            8.33%        50.00%        $8,901.23
...

DETAILED STATISTICS
================================================================================

1. 0x1234...5678 (0x1234567890abcdef...)
   NFL Performance:
     • NFL PnL%: 45.23%
     • NFL Win Rate: 62.50%
     • NFL Trade Count: 127
   Super Bowl Performance:
     • Markets Traded: 3
     • Total Positions: 5
     • Total Invested: $15,234.56
     • Realized PnL: $1,904.32
     • Super Bowl ROI%: 12.50%
     • Super Bowl Win Rate: 66.67%
     ...
```

## Notes

- The analysis uses FIFO (First In, First Out) logic for matching SELL trades to BUY trades
- Open positions are included but don't contribute to realized PnL
- Only resolved markets contribute to realized PnL calculations
- Minimum 5 NFL trades required to be included in top 20

## Troubleshooting

If you encounter errors:

1. **BigQuery Authentication**: Ensure you have Google Cloud credentials configured
   ```bash
   gcloud auth application-default login
   ```

2. **Missing Dependencies**: Install required Python packages
   ```bash
   pip install google-cloud-bigquery python-dotenv
   ```

3. **Query Errors**: Check that the BigQuery tables exist and have the expected schema

4. **No Results**: Verify that:
   - There are traders with NFL stats
   - There are markets tagged with "superbowl"
   - There are trades connecting these traders to Super Bowl markets
