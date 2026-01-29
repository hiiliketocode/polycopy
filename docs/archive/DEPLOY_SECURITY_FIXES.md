# 🔒 Security Fixes - Quick Deployment Guide

**Branch:** `unified-orders`  
**Date:** January 10, 2025  
**Priority:** CRITICAL - Deploy ASAP

---

## 📋 What Was Fixed

All 13 security issues identified by Supabase's database linter have been addressed:

✅ **6 tables** - RLS enabled  
✅ **5 functions** - Search paths secured  
✅ **1 policy** - Payment history validation added  
⚠️ **1 config** - Leaked password protection (requires manual action)

---

## 🚀 Quick Deploy (5 minutes)

### Step 1: Deploy SQL Migrations

**Option A - Supabase Dashboard (Recommended for first time):**
```
1. Go to https://app.supabase.com → Your Project → SQL Editor
2. Run these migrations in order:
   a. supabase/migrations/20250110_enable_rls_on_system_tables.sql
   b. supabase/migrations/20250110_fix_function_search_paths.sql
   c. supabase/migrations/20250110_fix_payment_history_rls.sql
3. Verify each completes successfully
```

**Option B - Supabase CLI:**
```bash
supabase db push
```

### Step 2: Enable Leaked Password Protection

**⚠️ REQUIRES MANUAL ACTION - Cannot be done via SQL**

```
1. Go to Supabase Dashboard → Authentication → Policies
2. Find "Leaked Password Protection"
3. Toggle it ON
4. Save changes
```

Takes 30 seconds. See `docs/ENABLE_LEAKED_PASSWORD_PROTECTION.md` for details.

### Step 3: Verify Everything Works

**Check RLS is enabled:**
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
  'wallet_backfills', 'wallet_poll_state', 
  'positions_current', 'positions_closed',
  'job_locks', 'copy_trade_migration_failures'
);
```
All should show `rowsecurity = true`

**Test password protection:**
- Try registering with "password123" → Should FAIL
- Try registering with "xK9!mP2#vL8@nQ5$wR7" → Should SUCCEED

---

## 📁 Files Created

### SQL Migrations (3 files)
- `supabase/migrations/20250110_enable_rls_on_system_tables.sql` (7.8 KB)
- `supabase/migrations/20250110_fix_function_search_paths.sql` (6.3 KB)  
- `supabase/migrations/20250110_fix_payment_history_rls.sql` (3.0 KB)

### Documentation (3 files)
- `docs/RLS_SECURITY_FIX.md` - RLS fixes explained
- `docs/ENABLE_LEAKED_PASSWORD_PROTECTION.md` - Password protection guide
- `docs/SECURITY_FIXES_SUMMARY.md` - Complete overview

---

## ⚠️ Important Notes

1. **Migrations are safe to run**
   - All checks for table/function existence before altering
   - Will skip if tables don't exist yet
   - No data loss risk

2. **Worker impact**
   - Workers will continue to work (use service role)
   - No downtime required
   - Test in dev environment first if concerned

3. **User impact**  
   - Existing users: No impact
   - New users: Better security (can't use leaked passwords)
   - Payment history: Now properly validated

4. **Rollback**
   - If issues occur, policies can be dropped/recreated
   - Payment history old policy: `WITH CHECK (true)`
   - Functions: Can be set back to no search_path

---

## 🧪 Testing Checklist

After deployment, verify:

- [ ] RLS enabled on all 6 system tables
- [ ] Functions have search_path set
- [ ] Payment history validates required fields
- [ ] Leaked password protection enabled and working
- [ ] Workers still functioning (check logs)
- [ ] Users can still log in/sign up
- [ ] No new errors in Supabase logs

---

## 🆘 Troubleshooting

**Migration fails with "table does not exist":**
→ This is normal! Migration will skip that table and continue.

**Function not found error:**
→ Also normal! Function might not exist in your DB yet.

**Workers stop working:**
→ Check service role key is set correctly in worker env vars.

**Can't enable leaked password protection:**
→ Must be done in dashboard, not SQL. See docs/ENABLE_LEAKED_PASSWORD_PROTECTION.md

---

## 📞 Need Help?

1. Check the detailed docs in `docs/` folder
2. Review Supabase logs for specific errors
3. Test in development environment first
4. Check that all environment variables are set

---

## ✅ Success Criteria

You'll know it worked when:
- ✅ All 13 linter errors/warnings are resolved
- ✅ Supabase security score improves
- ✅ No new errors in application logs
- ✅ Workers continue operating normally
- ✅ Users can't use "password123" anymore

---

**Time to Deploy:** ~5 minutes  
**Risk Level:** Low (migrations are defensive)  
**Recommended:** Deploy to production immediately

🔐 **These fixes close critical security gaps. Deploy ASAP!**
