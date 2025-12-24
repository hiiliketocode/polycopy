# RLS Security Fix - Quick Action Guide

## 🚨 CRITICAL: Apply Immediately

Supabase detected 4 tables exposed without Row Level Security (RLS). This is a **security vulnerability**.

## What's at Risk

1. **clob_credentials** 🔴 CRITICAL - Polymarket API keys/secrets
2. **turnkey_wallets** 🔴 CRITICAL - Wallet private data  
3. **trades_public** 🟡 HIGH - Public trade data
4. **metric_definitions** 🟡 MEDIUM - Reference data

## Quick Fix (5 minutes)

### Step 1: Open Supabase SQL Editor
Go to: https://supabase.com/dashboard/project/YOUR_PROJECT/sql

### Step 2: Run the Fix
Copy and paste the contents of `FIX_RLS_SECURITY_VULNERABILITIES.sql` into the SQL editor and click **Run**.

### Step 3: Verify
The script includes verification queries at the end. You should see:
- ✅ 4 policies for `clob_credentials`
- ✅ 4 policies for `turnkey_wallets`  
- ✅ 1 policy for `trades_public`
- ✅ 1 policy for `metric_definitions`
- ✅ All 4 tables show `rls_enabled = true`

## What This Does

### clob_credentials & turnkey_wallets
- ✅ Users can ONLY access their OWN credentials/wallets
- ✅ Prevents users from seeing other users' sensitive data
- ✅ Backend (using service role key) can still access all data when needed

### trades_public & metric_definitions  
- ✅ Anyone can READ (needed for public feed)
- ✅ Only backend can WRITE (using service role key)
- ✅ Prevents unauthorized modifications

## Important: Backend Code Review

Your backend should use **service role key** for operations that need to bypass RLS:

```typescript
// ✅ CORRECT - Backend operations
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Bypasses RLS
  { auth: { persistSession: false } }
)

// ❌ WRONG - Don't use anon key in backend for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // Respects RLS
)
```

## Testing After Apply

Run these tests in Supabase SQL Editor:

```sql
-- Test 1: Verify you can't see other users' credentials
-- (Should return 0 if no other users exist)
SELECT COUNT(*) FROM clob_credentials WHERE user_id != auth.uid();

-- Test 2: Verify public data is readable
SELECT COUNT(*) FROM trades_public;
SELECT COUNT(*) FROM metric_definitions;
```

## Files Created

1. **FIX_RLS_SECURITY_VULNERABILITIES.sql** - Run this now in Supabase
2. **supabase/migrations/035_fix_rls_security_vulnerabilities.sql** - For future reference/deployments
3. **RLS_SECURITY_FIX_README.md** - This file

## After Applying

1. ✅ Mark Supabase security email as resolved
2. ✅ Test your app to ensure everything still works
3. ✅ Commit the migration file to git
4. ✅ Deploy to production if you applied to staging first

## Verification

After running the fix, Supabase should no longer show these errors in the Database Linter.

## Need Help?

If you encounter issues:
1. Check that backend uses `SUPABASE_SERVICE_ROLE_KEY` for admin operations
2. Check that frontend uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` for user operations
3. Review the policies with: `SELECT * FROM pg_policies WHERE tablename = 'table_name';`

---

**⏰ Timeline:** Apply this fix **immediately** - credentials and wallets are exposed!

