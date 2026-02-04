# Production Table Issues Summary

## Critical Issues Found

### 1. Duplicates in Trades Table ⚠️
- **Total rows:** 81,241,557
- **Unique keys:** 80,521,190
- **Duplicates:** 720,367 (0.89%)
- **Issue:** Some trades have same wallet_address + tx_hash + order_hash but different timestamps/ids
- **Fix needed:** Deduplicate keeping latest record

### 2. Duplicates in Markets Table ⚠️
- **Total markets:** 996,551
- **Unique condition_ids:** 281,197
- **Duplicates:** 715,354 (71.8%!)
- **Issue:** Same condition_id appears multiple times
- **Fix needed:** Deduplicate keeping latest record per condition_id

### 3. Duplicates in Events Table ⚠️
- **Total events:** 611,150
- **Unique event_slugs:** 125,501
- **Duplicates:** 485,649 (79.5%!)
- **Issue:** Same event_slug appears multiple times
- **Fix needed:** Deduplicate keeping latest record per event_slug

### 4. Missing Semantic Categorization ❌ CRITICAL
- **market_type:** 0% populated (996,551 missing)
- **market_subtype:** 0% populated (996,551 missing)
- **bet_structure:** 0% populated (996,551 missing)
- **tags:** 31.5% populated (683,031 missing)
- **Issue:** Daily sync maps these fields from Dome API, but Dome doesn't provide them!
- **Fix needed:** Add automatic classification to daily sync script

### 5. Missing Markets
- **Missing condition_ids:** 1 condition_id
- **Affected trades:** 2,388 trades
- **Issue:** Minor - one condition_id in trades doesn't have market
- **Fix needed:** Fetch missing market from Dome API

## Root Causes

### Duplicates
1. **Trades:** MERGE may not be catching all duplicates if order_hash is NULL inconsistently
2. **Markets:** MERGE uses `last_updated DESC` but may have multiple records with same timestamp
3. **Events:** MERGE uses `created_at DESC` but may have multiple records

### Missing Classification
- **Daily sync** (`daily-sync-trades-markets.py`) maps `market_type`, `market_subtype`, `bet_structure` from Dome API
- **But Dome API doesn't provide these fields!** They're NULL
- **Classification scripts exist** (`classify-markets-bigquery.py`, `backfill-market-classifications.js`) but aren't integrated into daily sync
- **Need to:** Add classification step to daily sync after loading markets

## Fixes Needed

### 1. Fix Duplicates
- **Trades:** Improve MERGE deduplication logic
- **Markets:** Deduplicate keeping latest per condition_id
- **Events:** Deduplicate keeping latest per event_slug

### 2. Add Automatic Classification
- Integrate classification into daily sync
- Use existing classification functions
- Update markets after loading from Dome API

### 3. Fix Missing Markets
- Fetch missing condition_id from Dome API
- Add to markets table

## Next Steps

1. Create deduplication scripts for trades, markets, events
2. Add classification step to daily sync
3. Test fixes
4. Monitor for future duplicates
