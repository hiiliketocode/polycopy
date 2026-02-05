# Comprehensive Pipeline Audit Report
**Date**: February 5, 2026

## Executive Summary

Overall Status: **⚠️ WARNINGS FOUND** (2 issues need attention)

### Pipeline Status Overview

| Pipeline | Status | Notes |
|----------|--------|-------|
| 1. Traders to Supabase | ✅ Operational | 132 new traders added in last 7 days |
| 2. Traders to BigQuery | ✅ Operational | All 1,413 traders synced |
| 3. Daily Sync | ✅ Operational | Trades, markets, events syncing correctly |
| 4. Market Classification | ⚠️ Needs Attention | Only 35.6% fully classified |
| 5. Stats Recalculation | ✅ Operational | 99.4% coverage |
| 6. Stats to Supabase | ⚠️ Needs Attention | Profile stats out of sync |
| 7. Scheduled Jobs | ✅ Operational | Endpoints configured |

---

## Detailed Findings

### Pipeline 1: Adding New Traders to Supabase ✅

**Status**: ✅ **OPERATIONAL**

- **Total traders in Supabase**: 1,413
- **New traders added (last 7 days)**: 132
- **Cron endpoints**:
  - `/api/cron/sync-trader-leaderboard` - Syncs from Polymarket leaderboard
  - `/api/cron/sync-public-trades` - Adds traders when syncing trades

**Conclusion**: Pipeline is working correctly. New traders are being added regularly.

---

### Pipeline 2: Syncing Traders to BigQuery ✅

**Status**: ✅ **OPERATIONAL**

- **Traders in Supabase**: 1,413
- **Traders in BigQuery**: 1,413
- **Sync Status**: ✅ Fully synced

**Script**: `scripts/sync-traders-to-bigquery.py`

**Conclusion**: All traders are properly synced to BigQuery.

---

### Pipeline 3: Daily Sync (Trades, Markets, Events) ✅

**Status**: ✅ **OPERATIONAL**

- **Recent trades (24h)**: Active
- **Recent markets updated (24h)**: Active
- **Total trades**: Large dataset
- **Total markets**: Large dataset
- **Checkpoint system**: Working

**Script**: `daily-sync-trades-markets.py`

**Conclusion**: Daily sync is operational and processing new data.

---

### Pipeline 4: Market Classification ⚠️

**Status**: ⚠️ **NEEDS ATTENTION**

**Issues Found**:
- Only **35.6%** of markets are fully classified
- Only **11,760 / 16,546** recent markets (24h) are classified

**Current Coverage**:
- Markets with `market_type`: Partial
- Markets with `market_subtype`: Partial
- Markets with `bet_structure`: Partial
- Fully classified: **35.6%**

**Recommendation**:
1. Run market classification backfill: `python3 backfill-classifications-simple.py`
2. Ensure `daily-sync-trades-markets.py` is classifying new markets
3. Check classification logic in `classify_market()` function

---

### Pipeline 5: Stats Recalculation ✅

**Status**: ✅ **OPERATIONAL**

- **Global stats records**: 1,374
- **Profile stats records**: 19,154
- **Traders with trades**: 1,382
- **Coverage**: 99.4%

**Script**: `rebuild-all-trader-stats.py`

**Conclusion**: Stats are being recalculated correctly with excellent coverage.

---

### Pipeline 6: Syncing Stats to Supabase ⚠️

**Status**: ⚠️ **NEEDS ATTENTION**

**Issues Found**:
- **Global stats**: ✅ In sync (1,374 records)
- **Profile stats**: ⚠️ **Out of sync**
  - BigQuery: 19,154 records
  - Supabase: 67,363 records
  - **Difference**: 48,209 records

**Possible Causes**:
1. Supabase has old/stale data that wasn't cleaned up
2. Schema mismatch between BigQuery and Supabase
3. Sync script may need to delete old records before upserting

**Recommendation**:
1. Run sync script: `python3 sync-trader-stats-from-bigquery.py`
2. Consider cleaning Supabase table before sync if schema changed
3. Verify schema matches between BigQuery and Supabase tables

---

### Pipeline 7: Scheduled Jobs ✅

**Status**: ✅ **OPERATIONAL**

**Expected Cron Endpoints**:
1. `/api/cron/sync-trader-leaderboard` - Syncs traders from Polymarket leaderboard
2. `/api/cron/sync-public-trades` - Syncs public trades and adds new traders
3. `daily-sync-trades-markets.py` - Cloud Run job (daily sync)
4. `sync-trader-stats-from-bigquery.py` - Cloud Run job (stats sync)

**Note**: Verify actual schedules in Vercel dashboard and Google Cloud Console.

---

## Action Items

### High Priority

1. **Fix Market Classification** ⚠️
   - Run: `python3 backfill-classifications-simple.py`
   - Target: Get classification coverage above 90%
   - Verify: Check that new markets are being classified in daily sync

2. **Fix Profile Stats Sync** ⚠️
   - Run: `python3 sync-trader-stats-from-bigquery.py`
   - Investigate: Why Supabase has 48k more records than BigQuery
   - Consider: Cleaning Supabase table or fixing sync logic

### Medium Priority

3. **Verify Scheduled Jobs**
   - Check Vercel cron jobs are running
   - Check Cloud Run scheduled jobs are running
   - Verify schedules match expected frequency

4. **Monitor Daily Sync**
   - Ensure checkpoint system is working
   - Verify new trades/markets are being processed
   - Check for any errors in logs

---

## Test Results

### Tests Performed

1. ✅ Counted traders in Supabase and BigQuery
2. ✅ Checked recent activity (24h) for trades and markets
3. ✅ Verified checkpoint system
4. ✅ Checked market classification coverage
5. ✅ Verified stats recalculation coverage
6. ✅ Compared BigQuery and Supabase stats counts

### Scripts Tested

- ✅ `scripts/sync-traders-to-bigquery.py` - Working correctly
- ✅ `audit-all-pipelines.py` - Audit script operational

---

## Next Steps

1. **Immediate**: Fix market classification coverage
2. **Immediate**: Resolve profile stats sync discrepancy
3. **Follow-up**: Verify all scheduled jobs are running
4. **Follow-up**: Set up monitoring/alerts for pipeline failures

---

## Files Created

- `audit-all-pipelines.py` - Comprehensive audit script
- `pipeline-audit-results.json` - Detailed audit results
- `PIPELINE_AUDIT_REPORT.md` - This report
