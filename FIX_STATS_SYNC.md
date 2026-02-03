# Fix Stats Sync Issues

## Problem
Supabase PostgREST schema cache is stale - tables exist but PostgREST can't see the columns.

## Solution

### Option 1: Refresh Schema Cache (Easiest)
1. Go to Supabase Dashboard → SQL Editor
2. Run: `NOTIFY pgrst, 'reload schema';`
3. Wait 1-2 minutes
4. Test again: `./test-stats-sync.sh`

### Option 2: Recreate Tables (If Option 1 doesn't work)
1. Go to Supabase Dashboard → SQL Editor
2. Run the SQL from `verify-and-fix-stats-tables.sql`
3. This will:
   - Drop and recreate tables with correct schema
   - Refresh PostgREST cache
   - Verify tables are accessible

### Option 3: Wait (Automatic refresh)
- PostgREST refreshes schema cache automatically every few minutes
- Wait 5-10 minutes and test again

## After Fixing

Once the schema cache is refreshed, test again:

```bash
./test-stats-sync.sh
```

You should see:
- ✅ No "Could not find column" errors
- ✅ Stats being updated successfully
- ✅ Tables populated with data

## Verify Tables Are Working

Run in Supabase SQL Editor:
```sql
SELECT COUNT(*) FROM trader_global_stats;
SELECT COUNT(*) FROM trader_profile_stats;
SELECT * FROM trader_global_stats ORDER BY last_updated DESC LIMIT 5;
```
