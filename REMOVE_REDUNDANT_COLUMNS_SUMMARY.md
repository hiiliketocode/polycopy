# Remove Redundant Classification Columns

## Summary

The Supabase `markets` table has redundant classification columns that need to be removed:
- `final_type` - redundant with `market_type`
- `final_subtype` - redundant with `market_subtype`

## Columns to Keep

Based on application code analysis, these columns are actively used:
- ✅ `market_type` - Used throughout the app
- ✅ `market_subtype` - Used throughout the app (often referred to as 'niche')
- ✅ `final_niche` - Explicitly used by `trader_profile_stats` table (alias for `market_subtype`)
- ✅ `bet_structure` - Used throughout the app

## Verification

A Python script confirmed that `final_type` and `final_subtype` have **0 markets with values**, confirming they are unused.

## Migration

The migration file has been created:
- `supabase/migrations/20260204_remove_redundant_classification_columns.sql`

## Next Steps

1. **Run the migration** in Supabase:
   - Option A: Apply via Supabase CLI: `supabase migration up`
   - Option B: Run the SQL directly in Supabase SQL Editor

2. **Verify removal**:
   ```sql
   SELECT column_name
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'markets'
     AND column_name IN ('final_type', 'final_subtype');
   ```
   Expected: No rows returned

3. **Continue backfilling** missing classifications:
   - The improved `backfill-supabase-markets-classifications.py` script processes in batches
   - It handles large datasets efficiently by processing 1000 markets at a time

## Backfill Status

The backfill script (`backfill-supabase-markets-classifications.py`) has been improved to:
- Process markets in batches of 1000 to avoid timeouts
- Handle large IN clauses by splitting into chunks of 1000
- Update Supabase in smaller batches of 100 to avoid statement timeouts
- Progress reporting every 500 updates

Run the backfill script to complete classification backfill:
```bash
python3 backfill-supabase-markets-classifications.py
```
