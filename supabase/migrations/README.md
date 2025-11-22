# Supabase Migrations

This folder contains database migration files for Polycopy.

## How to Run Migrations

### Option 1: Supabase Dashboard (Easiest)

1. Go to your Supabase project: https://supabase.com/dashboard
2. Navigate to **SQL Editor** in the sidebar
3. Click **New Query**
4. Copy the entire contents of the migration file (e.g., `002_fix_follows_policies.sql`)
5. Paste into the SQL editor
6. Click **Run** or press Cmd+Enter (Mac) / Ctrl+Enter (Windows)
7. Check the results to confirm success

### Option 2: Supabase CLI

If you have the Supabase CLI installed:

```bash
# Navigate to project root
cd /path/to/polycopy

# Run migrations
supabase db push
```

## Migration Files

- **002_fix_follows_policies.sql** - Fixes RLS policies on the `follows` table to allow users to read/insert/delete their own follows

## Troubleshooting

### "relation does not exist" error
The table hasn't been created yet. Make sure you run the table creation SQL first.

### "policy already exists" error
The migration has already been run. This is safe to ignore, or you can use the `DROP POLICY IF EXISTS` statements at the top of the migration.

### Query timeout or hanging
This usually indicates an RLS issue. The migration should fix this!

## After Running Migration

1. Refresh your Polycopy app
2. Open browser console (F12)
3. Look for these success logs:
   ```
   ✅ User found: your@email.com
   🔍 Checking follows for user: your@email.com
   📊 Follows query result: { follows: [], count: 0 }
   ✅ User has no follows
   ```

If you see these logs without errors, the migration worked! 🎉

