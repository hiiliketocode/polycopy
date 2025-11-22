# 🚀 Quick Fix for "Query Timeout" Issue

Your app is stuck on "Loading your feed..." because of missing RLS policies. Here's the 2-minute fix:

## Step 1: Go to Supabase Dashboard

1. Open https://supabase.com/dashboard
2. Select your Polycopy project
3. Click **SQL Editor** in the left sidebar

## Step 2: Run the SQL

### EASIEST: Run Both at Once ⭐
1. Click **New Query**
2. Open the file `RUN_BOTH_POLICIES.sql` in this project
3. Copy ALL the SQL (Cmd+A, Cmd+C)
4. Paste it into the Supabase SQL Editor
5. Click **Run** (or press Cmd+Enter / Ctrl+Enter)

### OR: Run Separately

**First, fix the follows table:**
1. Click **New Query**
2. Open the file `RUN_THIS_IN_SUPABASE.sql` in this project
3. Copy ALL the SQL, paste, and run

**Then, fix the profiles table:**
1. Click **New Query**
2. Open the file `RUN_THIS_FOR_PROFILES.sql` in this project
3. Copy ALL the SQL, paste, and run

## Step 3: Verify It Worked

You should see a table with **6 policies total**:

**For follows table (3 policies):**
- `Users can delete their own follows` | DELETE
- `Users can insert their own follows` | INSERT
- `Users can read their own follows` | SELECT

**For profiles table (3 policies):**
- `Users can insert their own profile` | INSERT
- `Users can update their own profile` | UPDATE
- `Users can view all profiles` | SELECT

## Step 4: Refresh Your App

1. Go back to your Polycopy app (localhost:3000)
2. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
3. Open browser console (F12)

You should now see:
```
✅ User found: your@email.com
🔍 Checking follows for user: your@email.com
📊 Follows query result: { follows: [], count: 0 }
ℹ️ User has no follows
✅ Follow check complete
```

## ✅ Done!

Your app should now show "Your feed is empty" with a button to find traders instead of hanging on the loading screen.

---

## Still Having Issues?

Check the browser console (F12) for error messages. Common issues:

- **"relation does not exist"** = You need to create the `follows` table first
  → See `SUPABASE_SETUP.md` Step 1

- **"policy already exists"** = You already ran this migration (safe to ignore!)

- **Still timing out** = Check that you copied ALL the SQL and it ran without errors

