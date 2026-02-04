# Dome to BigQuery Pipeline Analysis

**Date:** February 4, 2026  
**Analysis Time:** 14:41 UTC

## Executive Summary

✅ **Pipeline Status:** ACTIVE and working  
⚠️ **Issue Found:** Traders table is NOT automatically updated with new wallets from trades

## Current Pipeline Flow

1. **Daily Sync Script** (`daily-sync-trades-markets.py`):
   - Gets wallets FROM `traders` table (BigQuery)
   - Gets wallets FROM Supabase user tables (profiles, turnkey_wallets, etc.)
   - Fetches new trades from Dome API for those wallets
   - Loads trades to BigQuery `trades` table
   - Updates checkpoint table

2. **Traders Table Sync** (`scripts/sync-traders-to-bigquery.py`):
   - Syncs wallets FROM Supabase `traders` table TO BigQuery `traders` table
   - Only runs manually or via separate cron job
   - Does NOT automatically discover new wallets from trades

## Current Statistics

### Trade Activity
- **Latest trade:** 2026-02-04 22:39:29 UTC (just now)
- **Trades today:** 460,719
- **Trades yesterday:** 423,736
- **Total trades:** 49,758,618
- **Unique wallets with trades:** 1,068

### Traders Table
- **Total wallets in traders table:** 1,092
- **Wallets with trades:** 1,068
- **Wallets in traders table without trades:** 24

### Daily Sync Status
- **Last sync:** 2026-02-04 22:41:09 UTC (0.0 hours ago)
- **Sync duration:** 347.1 seconds (~6 minutes)
- **Trades fetched:** 14,437
- **Markets fetched:** 13,574
- **Wallets processed:** 1,126

### Issue: Missing Wallets
⚠️ **3 wallets have trades today but are NOT in traders table:**
1. `0xefab18ab538127815d554d1d561266d4060be899` - 6 trades
2. `0x740a4f70c952c9063f0d3bd4193ad3a18af889e4` - 5 trades
3. `0xa54422a7eece2c1635e67ec73edfe1f516cf4adf` - 1 trade

## Root Cause

The `daily-sync-trades-markets.py` script:
- ✅ Fetches trades for wallets IN the traders table
- ✅ Loads those trades to BigQuery
- ❌ Does NOT discover new wallets from trades
- ❌ Does NOT add new wallets to traders table

**Result:** When a wallet has trades but isn't in the traders table, those trades are loaded, but the wallet is never added to the traders table. This means:
- Future syncs won't fetch new trades for these wallets (since they're not in the traders table)
- These wallets won't appear in trader leaderboards or stats

## Recommendations

### Option 1: Add wallet discovery to daily sync (RECOMMENDED)
Modify `daily-sync-trades-markets.py` to:
1. After loading trades, query for wallets in `trades` table not in `traders` table
2. Insert those wallets into `traders` table
3. This ensures all wallets with trades are tracked

### Option 2: Separate discovery job
Create a separate cron job that:
1. Runs daily after the sync
2. Finds wallets in `trades` table not in `traders` table
3. Adds them to `traders` table

### Option 3: Fix existing sync-traders script
Modify `scripts/sync-traders-to-bigquery.py` to:
1. Also check for wallets in `trades` table
2. Add any missing wallets to `traders` table
3. Run this script daily via cron

## Immediate Action Items

1. ✅ **Pipeline is working** - No immediate action needed
2. ⚠️ **Add missing wallets** - Add the 3 wallets found today to traders table
3. 🔧 **Implement fix** - Add wallet discovery to daily sync script
4. 📊 **Monitor** - Run `check-dome-pipeline.py` daily to catch issues early

## Files Created

- `check-dome-pipeline-status.sql` - SQL queries for manual analysis
- `check-dome-pipeline.py` - Python script for automated analysis
- `DOME_PIPELINE_ANALYSIS.md` - This document

## Next Steps

1. Review and approve the recommended fix
2. Implement wallet discovery in daily sync script
3. Test the fix with a dry run
4. Deploy the updated script
5. Monitor for 1 week to ensure it's working correctly
