# Trader Stats Auto-Sync Setup

## Overview

This setup automatically updates two Supabase tables from BigQuery after each incremental sync:
- **`trader_global_stats`** - Global stats per wallet (win rate, ROI, trade counts, bet sizes)
- **`trader_profile_stats`** - Profile-specific stats (by niche, bet structure, price bracket)

## Tables Schema

### trader_global_stats
- `wallet_address` (TEXT, PRIMARY KEY)
- `global_win_rate` (NUMERIC) - Overall win rate
- `global_roi_pct` (NUMERIC) - Overall ROI percentage
- `total_lifetime_trades` (INTEGER) - Total number of trades
- `avg_bet_size_usdc` (NUMERIC) - Average bet size in USDC
- `stddev_bet_size_usdc` (NUMERIC) - Standard deviation of bet sizes
- `recent_win_rate` (NUMERIC) - Win rate in last 30 days
- `last_updated` (TIMESTAMPTZ)

### trader_profile_stats
- `id` (UUID, PRIMARY KEY)
- `wallet_address` (TEXT)
- `final_niche` (TEXT) - Market niche (NBA, NFL, POLITICS, CRYPTO, etc.)
- `bet_structure` (TEXT) - Bet structure type
- `price_bracket` (TEXT) - LOW, MID, or HIGH
- `win_rate` (NUMERIC) - Win rate for this profile
- `roi_pct` (NUMERIC) - ROI percentage for this profile
- `trade_count` (INTEGER) - Number of trades in this profile (min 5)
- `last_updated` (TIMESTAMPTZ)
- UNIQUE constraint on (wallet_address, final_niche, bet_structure, price_bracket)

## Setup Steps

### Step 1: Create Tables in Supabase

Run the SQL migration to create the tables:

```sql
-- Run create-trader-stats-tables.sql in Supabase SQL Editor
```

Or manually create via Supabase Dashboard:
1. Go to SQL Editor
2. Run the contents of `create-trader-stats-tables.sql`

### Step 2: Deploy Stats Sync Job

The stats sync job is already deployed! Run:

```bash
./setup-auto-stats-sync.sh
```

This will:
- ✅ Deploy `sync-trader-stats-from-bigquery` Cloud Run Job
- ✅ Create Cloud Scheduler to run 5 minutes after incremental sync
- ✅ Configure environment variables

### Step 3: Verify Setup

Check that everything is configured:

```bash
# Check Cloud Run Job
gcloud run jobs describe sync-trader-stats-from-bigquery \
    --region=us-central1 \
    --project=gen-lang-client-0299056258

# Check Cloud Scheduler
gcloud scheduler jobs describe sync-trader-stats-after-incremental \
    --location=us-central1 \
    --project=gen-lang-client-0299056258
```

## How It Works

### Option 1: Separate Job (Recommended)
- **Scheduler**: Runs at :05 and :35 past each hour (5 minutes after incremental sync)
- **Job**: `sync-trader-stats-from-bigquery`
- **Process**: 
  1. Gets all wallets from traders table
  2. Calculates stats from BigQuery trades
  3. Updates Supabase tables

### Option 2: Inline Sync (Backup)
- **Integrated**: Into `daily-sync-trades-markets.py`
- **Runs**: After trades are loaded to BigQuery
- **Process**: Same as Option 1, but runs inline

## What Gets Calculated

### Global Stats (per wallet):
- **Win Rate**: % of resolved BUY trades that won (token_label matches winning_label)
- **ROI %**: Average ROI from resolved trades: `(exit_price - entry_price) / entry_price * 100`
- **Total Trades**: Count of all BUY trades
- **Avg Bet Size**: Average of `price * shares_normalized` for all BUY trades
- **StdDev Bet Size**: Standard deviation of bet sizes
- **Recent Win Rate**: Win rate for trades in last 30 days

### Profile Stats (per wallet + niche + structure + price_bracket):
- **Win Rate**: Win rate for trades matching this profile
- **ROI %**: Average ROI for trades matching this profile
- **Trade Count**: Number of trades matching this profile (minimum 5 required)

## Schedule

- **Incremental Sync**: Every 30 minutes (`*/30 * * * *`)
- **Stats Sync**: 5 minutes after (`5,35 * * * *`)

Timeline:
- :00 - Incremental sync starts
- :05 - Stats sync starts (for :00 sync)
- :30 - Incremental sync starts
- :35 - Stats sync starts (for :30 sync)

## Monitoring

### Check Stats Sync Logs

```bash
gcloud logging read \
    "resource.type=cloud_run_job AND resource.labels.job_name=sync-trader-stats-from-bigquery" \
    --limit=50 \
    --project=gen-lang-client-0299056258
```

### Check Supabase Tables

```sql
-- Check global stats
SELECT * FROM trader_global_stats 
ORDER BY last_updated DESC 
LIMIT 10;

-- Check profile stats
SELECT * FROM trader_profile_stats 
WHERE wallet_address = '0x...'
ORDER BY trade_count DESC;
```

### Verify Stats Are Updating

```sql
-- Check when stats were last updated
SELECT 
  MAX(last_updated) as last_global_update,
  COUNT(*) as total_wallets
FROM trader_global_stats;

SELECT 
  MAX(last_updated) as last_profile_update,
  COUNT(*) as total_profiles
FROM trader_profile_stats;
```

## Manual Execution

To run stats sync manually:

```bash
gcloud run jobs execute sync-trader-stats-from-bigquery \
    --region=us-central1 \
    --project=gen-lang-client-0299056258
```

## Troubleshooting

### Tables Don't Exist

Run the SQL migration:
```bash
# In Supabase SQL Editor, run:
cat create-trader-stats-tables.sql
```

### Stats Not Updating

1. Check logs for errors
2. Verify Supabase credentials are set
3. Check BigQuery permissions
4. Verify tables exist in Supabase

### Performance Issues

- Stats sync processes all wallets from traders table
- If timeout, increase timeout in deployment script
- Or limit to wallets with recent trades only

## Next Steps

After setup:
1. ✅ Tables created in Supabase
2. ✅ Stats sync job deployed
3. ✅ Scheduler configured
4. ✅ Stats will update automatically after each incremental sync

The stats will be available for the `predict-trade` function to use!
