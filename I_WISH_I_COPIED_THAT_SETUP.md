# i_wish_i_copied_that Table Setup Guide

## Overview

This guide helps you create the `i_wish_i_copied_that` table in BigQuery, which identifies top "Anomaly" winning trades from the last 7 days for a "Hall of Fame" feed.

## Personas Identified

1. **Whales**: Large capital ($50k+) on winners
2. **Snipers**: High ROI (5x+) on low-probability bets (price < 0.20)
3. **Clutch**: High-value bets ($1k+) placed in the final 10 minutes before market closed
4. **High ROI**: Winners with 2x+ ROI

## Prerequisites

1. BigQuery access to project: `gen-lang-client-0299056258`
2. Dataset: `polycopy_v1`
3. Required tables:
   - `markets` (with `condition_id`, `status`, `winning_label`, `end_time`, `completed_time`, `title`)
   - `trades` (or `trades_cleaned` if you have a cleaned version)
   - `trader_global_stats` (optional - for trader context)

## Step 1: Run Diagnostic Query

**IMPORTANT**: Run this first to identify any `condition_id` formatting issues!

```bash
# Run in BigQuery Console or via bq CLI
bq query --use_legacy_sql=false < diagnose-condition-id-format.sql
```

This will show you:
- Sample `condition_id` formats from both tables
- Whether joins will work (exact match vs case-insensitive)
- Missing `condition_id` values in either table
- Summary statistics

**If the diagnostic shows mismatches**, you may need to:
- Normalize `condition_id` values (remove prefixes, lowercase, trim whitespace)
- Check for NULL values
- Verify data quality

## Step 2: Verify Table Names

The query uses `trades` table by default. If you have a `trades_cleaned` table/view instead:

1. Open `create-i-wish-i-copied-that-table.sql`
2. Replace all instances of `trades` with `trades_cleaned`
3. Or create a view: `CREATE VIEW trades AS SELECT * FROM trades_cleaned`

## Step 3: Check Column Names

The query assumes:
- `trades` has: `shares_normalized` OR `shares` column
- `markets` has: `end_time` OR `completed_time` column

If your schema differs, update the query accordingly.

## Step 4: Create the Table

Run the main query:

```bash
# Run in BigQuery Console or via bq CLI
bq query --use_legacy_sql=false < create-i-wish-i-copied-that-table.sql
```

Or copy-paste into BigQuery Console SQL Editor.

## Step 5: Verify Results

Check that the table was created and has data:

```sql
SELECT 
  story_label,
  COUNT(*) as count,
  AVG(roi_pct) as avg_roi,
  AVG(invested_usd) as avg_invested,
  MAX(roi_pct) as max_roi
FROM `gen-lang-client-0299056258.polycopy_v1.i_wish_i_copied_that`
GROUP BY story_label
ORDER BY count DESC;
```

## Troubleshooting

### Issue: Zero Results

**Possible causes:**
1. `condition_id` mismatch between tables (run diagnostic query)
2. No markets closed in last 7 days
3. No winning trades matching criteria
4. Volume filter too restrictive ($100-$1M)

**Solutions:**
- Run `diagnose-condition-id-format.sql` to check joins
- Verify date range: `SELECT MAX(end_time) FROM markets`
- Check trade volume: `SELECT COUNT(*) FROM trades WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)`
- Temporarily adjust volume filter in query

### Issue: Column Not Found

**Error**: `Column shares_normalized not found`

**Solution**: The table might use `shares` instead. Update the query:
- Replace `shares_normalized` with `shares`
- Or add: `COALESCE(shares_normalized, shares) as shares`

### Issue: trader_global_stats Not Found

**Error**: `Table trader_global_stats not found`

**Solution**: This table is optional. The query uses `LEFT JOIN`, so it will still work but trader stats will be NULL. You can:
- Remove the join if you don't need trader stats
- Create the table if you want trader context
- Comment out the stats columns in the final SELECT

## Query Logic

1. **Filter Markets**: Only closed/resolved markets from last 7 days with `winning_label`
2. **Filter Trades**: BUY trades where `token_label` matches `winning_label`
3. **Calculate Metrics**: 
   - `invested_usd` = price × shares
   - `roi_pct` = ((1.0 - price) / price) × 100
   - `mins_before_close` = time difference to market close
4. **Filter Humans**: Aggregate trader volume per market, keep $100-$1M range
5. **Classify Personas**: Apply rules for Whale/Sniper/Clutch/High ROI
6. **Enrich**: Add trader stats (if available)

## Maintenance

The table should be refreshed periodically (daily recommended):

```sql
-- Re-run the CREATE OR REPLACE TABLE query daily
-- Or set up a scheduled query in BigQuery
```

## Example Output

| story_label | trade_id | wallet_address | roi_pct | invested_usd | mins_before_close |
|-------------|----------|----------------|---------|--------------|-------------------|
| Clutch      | abc123   | 0x123...       | 450.0   | 5000.0       | 8                 |
| Sniper      | def456   | 0x456...       | 600.0   | 500.0        | 120               |
| Whale       | ghi789   | 0x789...       | 200.0   | 75000.0      | 45                |

## Next Steps

After creating the table:
1. Set up a scheduled query to refresh daily
2. Create an API endpoint to query this table
3. Build a frontend feed component
4. Add filtering/sorting capabilities
