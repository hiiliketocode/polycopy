# Duplicates and Classification Report

## Executive Summary

**Date:** February 4, 2026  
**Status:** ⚠️ Issues Found - Action Required

### Critical Issues:
1. **720K duplicates** in trades table (0.89%)
2. **715K duplicates** in markets table (71.8%!)
3. **485K duplicates** in events table (79.5%!)
4. **0% semantic categorization** - all markets missing market_type, market_subtype, bet_structure

## Detailed Findings

### 1. Trades Table Duplicates ⚠️

**Current State:**
- Total rows: 81,241,557
- Unique keys: 80,521,190
- Duplicates: 720,367 (0.89%)

**Root Cause:**
- MERGE deduplication may not be catching all cases
- Some trades have same `wallet_address + tx_hash + order_hash` but different timestamps
- Order_hash may be NULL inconsistently

**Sample Duplicates:**
- Wallet `0xc613e670...` with tx `0x995e0b1e530752...` has 97 duplicates
- Wallet `0x6d3c5bd1...` with tx `0x3ae2c7b0ce62bc...` has 87 duplicates

**Fix:**
- Deduplicate keeping latest record (ORDER BY timestamp DESC, id DESC)
- Script created: `fix-production-duplicates.py`

### 2. Markets Table Duplicates ⚠️ CRITICAL

**Current State:**
- Total markets: 996,551
- Unique condition_ids: 281,197
- Duplicates: 715,354 (71.8%!)

**Root Cause:**
- MERGE uses `last_updated DESC` but temp table doesn't have this column
- Multiple records for same condition_id with same timestamp
- Daily sync may be inserting duplicates instead of updating

**Sample Duplicates:**
- Condition ID `0x6e30310a2d645c...` has 12 entries
- Condition ID `0xf1705a34b7850e...` has 12 entries

**Fix:**
- Deduplicate keeping latest record per condition_id
- Fix MERGE query in daily sync to properly deduplicate
- Script created: `fix-production-duplicates.py`

### 3. Events Table Duplicates ⚠️ CRITICAL

**Current State:**
- Total events: 611,150
- Unique event_slugs: 125,501
- Duplicates: 485,649 (79.5%!)

**Root Cause:**
- MERGE may not be working correctly
- Multiple records for same event_slug

**Fix:**
- Deduplicate keeping latest record per event_slug
- Script created: `fix-production-duplicates.py`

### 4. Semantic Categorization ❌ CRITICAL

**Current State:**
- `market_type`: 0% populated (996,551 missing)
- `market_subtype`: 0% populated (996,551 missing)
- `bet_structure`: 0% populated (996,551 missing)
- `tags`: 31.5% populated (683,031 missing)

**Root Cause:**
- Daily sync (`daily-sync-trades-markets.py`) maps these fields from Dome API
- **But Dome API doesn't provide these fields!** They're always NULL
- Classification scripts exist but aren't integrated into daily sync
- Classification happens in Supabase (`app/api/markets/ensure/route.ts`) but not in BigQuery

**Classification Scripts Available:**
- `classify-markets-bigquery.py` - Classifies markets in BigQuery
- `backfill-market-classifications.js` - Backfills classifications in Supabase
- `scripts/gemini-classify-markets.js` - Uses Gemini for classification

**Fix Needed:**
1. Add classification step to daily sync after loading markets
2. Use existing classification functions to infer:
   - `market_type` from tags (Sports, Crypto, Politics, etc.)
   - `market_subtype` from tags (NBA, Bitcoin, Election, etc.)
   - `bet_structure` from title (Prop, Yes/No, Over/Under, etc.)

### 5. Missing Markets

**Current State:**
- Missing condition_ids: 1 condition_id
- Affected trades: 2,388 trades
- Condition_id: Empty string (NULL)

**Fix:**
- Fetch missing market from Dome API
- Add to markets table

## Condition IDs Coverage

**Trades vs Markets:**
- ✅ 99.99% coverage - only 1 condition_id missing
- ✅ All other condition_ids have corresponding markets

## Recommendations

### Immediate Actions:

1. **Fix Duplicates** (High Priority)
   - Run `fix-production-duplicates.py` to deduplicate all tables
   - Creates backups before changes
   - Requires manual confirmation

2. **Add Classification to Daily Sync** (High Priority)
   - Integrate classification into `daily-sync-trades-markets.py`
   - Add classification step after loading markets
   - Use existing classification functions

3. **Fix MERGE Queries** (High Priority)
   - Fix markets MERGE to properly deduplicate
   - Ensure temp tables have `last_updated` column
   - Test deduplication logic

4. **Fetch Missing Market** (Low Priority)
   - Fetch missing condition_id from Dome API
   - Add to markets table

### Long-term Improvements:

1. **Prevent Future Duplicates**
   - Improve MERGE deduplication logic
   - Add unique constraints where possible
   - Monitor for duplicates daily

2. **Automate Classification**
   - Run classification automatically in daily sync
   - Update existing markets with missing classification
   - Backfill historical markets

3. **Monitoring**
   - Add duplicate detection to `check-dome-pipeline.py`
   - Alert on duplicate threshold
   - Track classification coverage

## Files Created

- `check-production-duplicates-and-markets.py` - Comprehensive check script
- `fix-production-duplicates.py` - Deduplication script
- `PRODUCTION_ISSUES_SUMMARY.md` - Issues summary
- `DUPLICATES_AND_CLASSIFICATION_REPORT.md` - This document

## Next Steps

1. ✅ **Review findings** - Understand issues
2. ⏳ **Fix duplicates** - Run deduplication script
3. ⏳ **Add classification** - Integrate into daily sync
4. ⏳ **Test fixes** - Verify no new duplicates
5. ⏳ **Monitor** - Track duplicate rates and classification coverage
