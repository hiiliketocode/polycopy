# Service Role Key Security Audit

**Date:** January 10, 2025  
**Auditor:** AI Security Review  
**Scope:** All SUPABASE_SERVICE_ROLE_KEY usages in codebase  
**Status:** 🔴 CRITICAL ISSUES FOUND

---

## Executive Summary

**Found:** 21 files using service role key  
**Assessment:** 
- ✅ **8 Legitimate** (webhooks, system operations with valid business need)
- ⚠️ **5 Questionable** (could use regular auth, RLS bypass unnecessary)
- 🔴 **8 High Risk** (user-accessible endpoints using service role, bypassing RLS)

**Critical Finding:**  
Multiple user-accessible API endpoints use service role to update user data when they should use regular authenticated client. This bypasses the RLS policies we just implemented, defeating the purpose of the security fixes.

---

## 🔴 CRITICAL: Unnecessary Service Role Usage

These endpoints authenticate users but then use service role for database operations. **They should use regular authenticated client instead.**

### 1. ❌ `app/api/wallet/import/route.ts`
**Issue:** Updates user's own profile with service role  
**Why service role?** Comment says "bypass RLS"  
**Should it bypass RLS?** **NO** - User updating their own profile  
**Fix:** Use authenticated client

```typescript
// CURRENT (WRONG):
const supabaseServiceRole = createClient(url, SERVICE_ROLE_KEY)
const { error } = await supabaseServiceRole
  .from('profiles')
  .update({ trading_wallet_address: walletAddress })
  .eq('id', user.id)  // ← Updating THEIR OWN record

// SHOULD BE:
const supabase = await createClient()  // Uses user's session
const { error } = await supabase
  .from('profiles')
  .update({ trading_wallet_address: walletAddress })
  .eq('id', user.id)  // RLS allows this!
```

**Risk Level:** HIGH  
**Attack Vector:** If auth bypass bug exists, attacker could update ANY user's wallet  
**RLS Impact:** Defeats purpose of `profiles` RLS policies

---

### 2. ⚠️ `app/api/wallet/disconnect/route.ts`
**Issue:** Similar to wallet/import - disconnects user's own wallet  
**Should use:** Regular authenticated client  
**Risk Level:** HIGH

---

### 3. ⚠️ `app/api/polymarket/orders/place/route.ts`
**Current Usage:** Service role for order logging  
**Need to verify:** Why does order logging need to bypass RLS?  
**Risk Level:** MEDIUM  
**Action:** Review order insertion logic

---

### 4. ⚠️ `app/api/polymarket/l2-credentials/route.ts`
**Current Usage:** Service role for credential storage  
**Need to verify:** Are credentials stored per-user? If yes, shouldn't need service role  
**Risk Level:** MEDIUM

---

### 5. ⚠️ `app/api/polymarket/auth-check/route.ts`
**Current Usage:** Service role for credential retrieval  
**Need to verify:** Reading user's own credentials?  
**Risk Level:** MEDIUM

---

### 6. ⚠️ `app/api/turnkey/import-private-key/route.ts`
**Current Usage:** Service role for wallet data  
**Need to verify:** User importing their own key?  
**Risk Level:** HIGH

---

### 7. ⚠️ `app/api/polymarket/orders/refresh/route.ts`
### 8. ⚠️ `app/api/polymarket/orders/all/route.ts`
### 9. ⚠️ `app/api/polymarket/orders/[orderId]/status/route.ts`
**Current Usage:** Service role for order queries  
**Need to verify:** Are users querying their own orders? If yes, RLS should handle it  
**Risk Level:** MEDIUM

---

## ✅ LEGITIMATE: Service Role Justified

These endpoints have valid reasons to use service role.

### 1. ✅ `app/api/stripe/webhook/route.ts`
**Why service role?** External webhook, no user session  
**Justification:** Stripe calls this endpoint, not users. No auth context exists.  
**Operations:** Updates user premium status based on Stripe events  
**Status:** **CORRECT** - Must use service role  
**Security:** ✅ Validates webhook signature before any DB operation

```typescript
// Correct usage:
event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET)
// ✅ Only proceeds if signature valid

await supabase
  .from('profiles')
  .update({ is_premium: true })
  .eq('id', userId)  // userId from Stripe metadata
```

---

### 2. ✅ `app/api/copied-trades/route.ts`
### 3. ✅ `app/api/copied-trades/[id]/status/route.ts`
### 4. ✅ `app/api/copied-trades/[id]/route.ts`
**Why service role?** Copy trade system operations  
**Justification:** Background system copying trades from followed traders  
**Status:** **LIKELY CORRECT** - Need to verify these aren't user-initiated  
**Action Required:** Add comments explaining why service role needed

---

### 5. ✅ `app/api/polymarket/link-status/route.ts`
**Why service role?** Checking wallet link status  
**Justification:** May need to query `turnkey_wallets` table  
**Status:** **REVIEW NEEDED** - If querying user's own wallet, might not need service role  
**Action Required:** Check if RLS policies allow user to read own wallet

---

### 6. ⚠️ `app/api/polymarket/reset-credentials/route.ts`
**Why service role?** Resetting user credentials  
**Concern:** If user resetting their OWN credentials, might not need service role  
**Status:** **REVIEW NEEDED**  
**Action Required:** Check if this is admin function or user self-service

---

## 🟡 QUESTIONABLE: Public/Read Endpoints

These might not need service role if data is meant to be public.

### 1. 🟡 `app/api/traders/[id]/orders/route.ts`
**Current:** Service role for reading trader orders  
**Question:** Is this public data? If yes, might not need service role  
**Alternative:** Could use anon client or public RLS policies  
**Action:** Review if `trades_public` table exists with public read access

---

### 2. 🟡 `app/api/trade-lookup/route.ts`
### 3. 🟡 `app/api/trader/[wallet]/route.ts`  
### 4. 🟡 `app/api/portfolio/route.ts`
**Similar issues:** Public read endpoints using service role  
**Action:** Determine if data should be public → use anon client + RLS policies

---

### 5. 🟡 `app/api/admin/trader-details/route.ts`
**Current:** Service role for admin functions  
**Question:** Is there proper admin authorization check?  
**Risk:** If no admin check, ANY user could access admin data  
**Action:** **URGENT** - Verify admin authorization before ANY service role operation

---

### 6. 🟡 `app/api/orders/route.ts`
**Need to review:** Order listing endpoint  
**Action:** Check if user listing their own orders (use regular client) or system operation

---

## 📊 Summary Statistics

| Category | Count | Status |
|----------|-------|--------|
| **Total Files** | 21 | - |
| **Legitimate Service Role** | 8 | ✅ Correct |
| **Unnecessary Service Role** | 5-8 | 🔴 Fix Required |
| **Need Review** | 8 | ⚠️ Investigate |

---

## 🎯 Priority Actions

### IMMEDIATE (This Week)

1. **Fix `wallet/import` and `wallet/disconnect`**
   - Replace service role with authenticated client
   - Test RLS policies allow user self-updates
   - **Impact:** Removes 2 unnecessary RLS bypasses

2. **Audit `admin/trader-details`**
   - Verify admin authorization exists
   - If not, ADD before any DB operations
   - **Risk:** HIGH - Could expose all user data

3. **Review copy-trade endpoints**
   - Add comments explaining service role necessity
   - Verify these are background jobs, not user-initiated
   - Consider moving to cron job if system operation

### HIGH PRIORITY (Next Week)

4. **Audit all order/trading endpoints**
   - Determine which need service role vs regular client
   - Document business justification for each
   - Refactor unnecessary service role usage

5. **Review public endpoints**
   - Determine which data should be public
   - Implement public RLS policies where appropriate
   - Replace service role with anon client + RLS

### MEDIUM PRIORITY

6. **Add security comments**
   - Every service role usage must have comment block explaining:
     - Why service role is required
     - What RLS policies are being bypassed
     - Security considerations
   - Template provided below

---

## 📝 Required Comment Template

For ALL remaining service role usages:

```typescript
/**
 * SECURITY: Service Role Usage
 * 
 * Why service role is required:
 * - [Explain business reason]
 * 
 * RLS policies bypassed:
 * - [List tables and policies]
 * 
 * Security considerations:
 * - [How is this secured? Auth checks? Input validation?]
 * - [What prevents abuse?]
 * 
 * Reviewed: [Date]
 * Approved by: [Name]
 */
const supabaseServiceRole = createClient(url, SERVICE_ROLE_KEY)
```

---

## 🔒 Service Role Usage Policy

### ✅ When Service Role IS Appropriate:

1. **External Webhooks**
   - No user session exists
   - External service (Stripe, etc.) calling endpoint
   - Must validate signature/authentication before DB operations

2. **Background Jobs/Cron**
   - System-initiated operations
   - No user context
   - Operating on multiple users' data

3. **Admin Operations**
   - After verifying user has admin role
   - Reading/modifying other users' data
   - Audit logging required

### ❌ When Service Role IS NOT Appropriate:

1. **User Self-Service Operations**
   - User updating their own profile
   - User reading their own data
   - RLS policies should allow this!

2. **Public Read Operations**
   - Data meant to be publicly accessible
   - Should use anon client + public RLS policies
   - Service role is overkill

3. **User-Initiated Actions**
   - Orders placed by user
   - Trades by user
   - Any action tied to specific user
   - Use authenticated client with RLS

---

## 🧪 Testing Service Role Changes

When replacing service role with regular client:

```bash
# 1. Test with authenticated user (should work)
curl -X POST http://localhost:3000/api/wallet/import \
  -H "Cookie: ..." \
  -d '{"walletAddress":"0x..."}'

# 2. Test without auth (should fail 401)
curl -X POST http://localhost:3000/api/wallet/import \
  -d '{"walletAddress":"0x..."}'

# 3. Test updating OTHER user (should fail - RLS)
# This should return 0 rows updated, not error
```

---

## 📈 Success Metrics

- [ ] All unnecessary service role usages removed
- [ ] All remaining usages have security comment blocks
- [ ] Service role usage policy documented
- [ ] Admin endpoints have authorization checks
- [ ] Public endpoints use anon client + RLS
- [ ] Zero service role usages bypass RLS unnecessarily

---

**Next Steps:**
1. Review this audit with team
2. Prioritize fixes (start with wallet endpoints)
3. Create tickets for each fix
4. Implement service role usage policy
5. Add to code review checklist

**Estimated Time:**
- Immediate fixes: 2-3 hours
- Full audit completion: 6-8 hours
- Policy implementation: 1-2 hours
