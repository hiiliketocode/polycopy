# Market Classification Troubleshooting Guide

## Problem: Niche showing "other" instead of specific niches like "NBA"

## Diagnostic Steps

### 1. Run Diagnostic Script
```bash
node scripts/diagnose-market-classification.js
```

Or test with a specific market:
```bash
node scripts/diagnose-market-classification.js <conditionId>
```

### 2. Check Markets Table Structure

Run in Supabase SQL Editor:
```sql
-- Check if classification columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'markets'
  AND column_name IN ('market_type', 'market_subtype', 'bet_structure', 'tags')
ORDER BY column_name;
```

**If columns are missing**, run:
```sql
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS market_type TEXT,
  ADD COLUMN IF NOT EXISTS market_subtype TEXT,
  ADD COLUMN IF NOT EXISTS bet_structure TEXT;
```

### 3. Check Markets Have Tags

```sql
-- Check sample markets
SELECT 
  condition_id,
  title,
  tags,
  market_type,
  market_subtype,
  bet_structure
FROM markets
WHERE condition_id IS NOT NULL
LIMIT 10;
```

**If markets don't have tags:**
- Markets need to be fetched from CLOB API
- TradeCard component should call `/api/markets/ensure` automatically
- Check browser console for `[TradeCard] ✅ Market ensured` logs

### 4. Check semantic_mapping Table

```sql
-- Check if table exists and has data
SELECT COUNT(*) as total_mappings
FROM semantic_mapping;

-- Check sample mappings
SELECT 
  original_tag,
  clean_niche,
  type,
  specificity_score
FROM semantic_mapping
LIMIT 20;

-- Check for common tags
SELECT 
  original_tag,
  clean_niche,
  type
FROM semantic_mapping
WHERE original_tag IN ('nba', 'nfl', 'bitcoin', 'crypto', 'politics', 'election')
ORDER BY original_tag;
```

**If semantic_mapping is empty:**
- This is why classifications fail!
- Populate semantic_mapping table with tag-to-niche mappings
- Format: `original_tag` (lowercase), `clean_niche` (e.g., "NBA"), `type` (e.g., "SPORTS")

### 5. Check Tag Matching

The issue might be that tags from markets don't match `original_tag` in semantic_mapping:

```sql
-- Find markets with tags that don't match semantic_mapping
SELECT DISTINCT
  m.condition_id,
  m.title,
  jsonb_array_elements_text(m.tags) as tag
FROM markets m
WHERE m.tags IS NOT NULL
  AND jsonb_array_length(m.tags::jsonb) > 0
  AND NOT EXISTS (
    SELECT 1 FROM semantic_mapping sm
    WHERE LOWER(sm.original_tag) = LOWER(jsonb_array_elements_text(m.tags)::text)
  )
LIMIT 20;
```

### 6. Check Browser Console Logs

Look for these log messages:
- `[TradeCard] ✅ Market ensured:` - Market was added/updated
- `[PredictionStats] Looking up semantic_mapping for tags:` - Tags being queried
- `[PredictionStats] Semantic mapping query result:` - Query results
- `[PredictionStats] ✅ Selected niche from semantic_mapping:` - Success
- `[PredictionStats] ⚠️ No semantic_mapping matches found` - No matches (problem!)

### 7. Test Classification Flow

1. Open browser DevTools Console
2. Navigate to a trade card
3. Look for `[PredictionStats]` logs
4. Check:
   - Are tags being collected? (`tagsQueried`)
   - Are mappings found? (`mappingsFound`)
   - What tags are in the market? (`tagsFromDB`, `tagsFromProps`)

## Common Issues & Fixes

### Issue 1: semantic_mapping table is empty
**Fix:** Populate semantic_mapping with tag mappings:
```sql
INSERT INTO semantic_mapping (original_tag, clean_niche, type, specificity_score)
VALUES
  ('nba', 'NBA', 'SPORTS', 1),
  ('nfl', 'NFL', 'SPORTS', 1),
  ('bitcoin', 'BITCOIN', 'CRYPTO', 1),
  ('crypto', 'CRYPTO', 'CRYPTO', 2),
  ('politics', 'POLITICS', 'POLITICS', 1),
  ('election', 'ELECTION', 'POLITICS', 1);
```

### Issue 2: Markets don't have tags
**Fix:** Markets need to be fetched from CLOB API. TradeCard should do this automatically, but you can manually ensure:
```bash
curl "http://localhost:3000/api/markets/ensure?conditionId=<conditionId>"
```

### Issue 3: Tags don't match semantic_mapping
**Fix:** 
- Check tag format (should be lowercase)
- Check if tags in markets match `original_tag` in semantic_mapping
- Add missing mappings to semantic_mapping table

### Issue 4: Classification columns missing
**Fix:** Run migration:
```sql
ALTER TABLE public.markets
  ADD COLUMN IF NOT EXISTS market_type TEXT,
  ADD COLUMN IF NOT EXISTS market_subtype TEXT,
  ADD COLUMN IF NOT EXISTS bet_structure TEXT;
```

## Verification Checklist

- [ ] Markets table has `market_type`, `market_subtype`, `bet_structure` columns
- [ ] Markets have tags (check sample markets)
- [ ] semantic_mapping table exists and has data
- [ ] Tags from markets match `original_tag` in semantic_mapping
- [ ] TradeCard is calling `/api/markets/ensure` (check console logs)
- [ ] PredictionStats is querying semantic_mapping (check console logs)
- [ ] Browser console shows successful classification logs

## Quick Test

1. Find a market with known tags (e.g., NBA market)
2. Check if it has tags in database
3. Check if semantic_mapping has "nba" → "NBA" mapping
4. Check browser console when viewing that trade card
5. Verify niche shows "NBA" not "other"
