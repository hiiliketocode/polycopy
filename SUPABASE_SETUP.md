# Supabase Database Setup for Polycopy

## Overview
This guide will help you set up the database tables and Row Level Security (RLS) policies for Polycopy.

## Steps

### 1. Create Database Tables

Run this SQL in your Supabase SQL Editor:

```sql
-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create follows table
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trader_wallet TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, trader_wallet)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_follows_user_id ON follows(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_trader_wallet ON follows(trader_wallet);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
```

### 2. Enable RLS and Add Policies

**EASIEST METHOD:** Open `RUN_THIS_IN_SUPABASE.sql` and copy the entire contents into your Supabase SQL Editor, then run it.

**OR** use the migration file at `supabase/migrations/002_fix_follows_policies.sql`

This will:
- Enable Row Level Security on the `follows` table
- Allow users to read/insert/delete their own follows
- Fix the query timeout issue

For the `profiles` table, run the SQL from `supabase-rls-policies.sql` file.

### 3. Verify Setup

Run this query to check your tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('profiles', 'follows');
```

Run this query to check RLS policies:

```sql
SELECT 
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('follows', 'profiles')
ORDER BY tablename, policyname;
```

### 4. Update Environment Variables

Make sure your `.env.local` file has the correct values:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

Get these from: Supabase Dashboard → Settings → API

## Common Issues

### "Query timeout" error
- This usually means RLS policies are not set up correctly
- Make sure you ran the SQL from step 2

### "Policy error" or "42501" error
- RLS is enabled but policies are missing
- Run the RLS policies SQL again

### "relation does not exist" error
- Tables haven't been created yet
- Run the SQL from step 1

## Testing

1. Sign in to your app
2. Open browser console (F12)
3. Look for these logs:
   - ✅ User found: [your email]
   - ✅ Profile ensured
   - 🔍 Checking follows for user: [your email]
   - ✅ User has no follows (if you haven't followed anyone yet)

If you see errors, check the console for details about what went wrong.

