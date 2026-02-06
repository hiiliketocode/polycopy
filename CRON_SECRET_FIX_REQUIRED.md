# 🔐 Cron Secret Security Fix - Action Required

**Priority:** 🔴 CRITICAL  
**Status:** ⏳ REQUIRES USER ACTION  
**Risk Level:** HIGH (Authentication bypass if secret leaks)

---

## 🚨 THE PROBLEM

**Current Code:**
```typescript
// app/api/copied-trades/[id]/status/route.ts (line 81)
// app/api/admin/auto-copy/run/route.ts (similar pattern)

const authHeader = request.headers.get('authorization')
const isCronRequest = authHeader === `Bearer ${process.env.CRON_SECRET}`

if (isCronRequest) {
  // Bypasses ALL auth checks!
  // Accepts userId from query params without verification
}
```

**Risk:** If `CRON_SECRET` is leaked (Git history, logs, env vars, etc.), an attacker can:
- Access ANY user's trade data
- Modify trade statuses
- Execute admin operations  
- Bypass all authentication/authorization

---

## ✅ IMMEDIATE ACTIONS (Do This Now)

### **1. Rotate CRON_SECRET**

**Generate new secret:**
```bash
# Generate a strong 32-byte secret
openssl rand -hex 32
```

**Update environment variables:**

**For Fly.io:**
```bash
fly secrets set CRON_SECRET="YOUR_NEW_SECRET_HERE" -a polycopy
```

**For Vercel:**
```bash
# Via CLI
vercel env add CRON_SECRET production

# Or via dashboard: 
# https://vercel.com/your-project/settings/environment-variables
```

**Update GitHub Actions (if used for cron):**
```bash
# Add as repository secret:
# Settings → Secrets → Actions → New repository secret
# Name: CRON_SECRET
# Value: YOUR_NEW_SECRET_HERE
```

---

### **2. Update Cron Job Configuration**

Update your cron job to use the new secret:

**.github/workflows/sync-public-trades.yml** (if exists):
```yaml
- name: Trigger cron endpoint
  run: |
    curl -X POST https://polycopy.app/api/cron/check-notifications \
      -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

**Fly.io cron jobs:**
```toml
# fly.toml or fly.worker-*.toml
[experimental]
  auto_rollback = false

[[http_service.checks]]
  interval = "10s"
  timeout = "2s"
  grace_period = "5s"
  method = "GET"
  path = "/api/health"
  headers = { Authorization = "Bearer ${CRON_SECRET}" }
```

---

## 🔧 RECOMMENDED FIXES (After Rotation)

### **Option A: Add IP Allowlisting (Recommended)**

**1. Get your cron job IPs:**
```bash
# For Fly.io
fly ips list

# For GitHub Actions
# IPs change, use: https://api.github.com/meta (actions IP ranges)

# For Vercel Cron
# Contact Vercel support for IP ranges
```

**2. Add IP check to cron endpoints:**
```typescript
// lib/security/cron-auth.ts (create this file)
const ALLOWED_CRON_IPS = process.env.CRON_ALLOWED_IPS?.split(',') || []

export function verifyCronRequest(request: Request): boolean {
  const authHeader = request.headers.get('authorization')
  const isCronSecret = authHeader === `Bearer ${process.env.CRON_SECRET}`
  
  if (!isCronSecret) {
    return false
  }
  
  // Verify IP if allowlist is configured
  if (ALLOWED_CRON_IPS.length > 0) {
    const forwardedFor = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const clientIp = forwardedFor?.split(',')[0].trim() || realIp
    
    if (!clientIp || !ALLOWED_CRON_IPS.includes(clientIp)) {
      console.error('❌ Cron request from unauthorized IP:', clientIp)
      return false
    }
  }
  
  return true
}
```

**3. Use in endpoints:**
```typescript
import { verifyCronRequest } from '@/lib/security/cron-auth'

const isCronRequest = verifyCronRequest(request)
if (isCronRequest) {
  // Cron authenticated
} else {
  // Regular auth required
}
```

---

### **Option B: Use Signed JWTs (More Secure)**

**1. Generate JWT secret:**
```bash
openssl rand -hex 64
# Add as CRON_JWT_SECRET in env vars
```

**2. Create JWT signing utility:**
```typescript
// lib/security/cron-jwt.ts
import { SignJWT, jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.CRON_JWT_SECRET)

export async function createCronToken(payload: { action: string }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m') // Short expiry
    .sign(secret)
}

export async function verifyCronToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, secret)
    return true
  } catch {
    return false
  }
}
```

**3. Generate tokens in cron jobs:**
```bash
# In your cron job script
TOKEN=$(node -e "require('./lib/security/cron-jwt').createCronToken({ action: 'sync_trades' }).then(console.log)")
curl -H "Authorization: Bearer $TOKEN" https://polycopy.app/api/cron/...
```

---

### **Option C: Verify Ownership Even for Cron (Already Done!)**

**Current Implementation (after our fixes):**
```typescript
// ✅ Already implemented in copied-trades/[id]/status/route.ts
.from('orders_copy_enriched')
.select(selectFields)
.eq('copy_user_id', userId)  // Ownership check in query
.eq('copied_trade_id', id)

// Even if cron secret is valid, query only returns data 
// if the userId actually owns this trade
```

**Why This Helps:**
- Even with cron secret, attacker can't access arbitrary users' data
- Database enforces ownership via `.eq('copy_user_id', userId)`
- Defense in depth: secret + ownership check

---

## 📋 IMPLEMENTATION CHECKLIST

### **Immediate (Today):**
- [ ] Generate new CRON_SECRET
- [ ] Update Fly.io env vars
- [ ] Update Vercel env vars
- [ ] Update GitHub Actions secrets (if used)
- [ ] Test cron jobs still work
- [ ] Monitor logs for auth failures

### **This Week:**
- [ ] Implement IP allowlisting (Option A)
- [ ] Add logging for all cron requests
- [ ] Set up alerts for unauthorized cron attempts
- [ ] Document cron security procedures

### **This Month:**
- [ ] Consider JWT tokens (Option B)
- [ ] Add rate limiting for cron endpoints
- [ ] Regular cron secret rotation policy
- [ ] Security audit of other cron endpoints

---

## 🧪 TESTING

### **Test Secret Rotation:**
```bash
# 1. Test with OLD secret (should fail after rotation)
curl -H "Authorization: Bearer OLD_SECRET" \
  https://polycopy.app/api/copied-trades/123/status?userId=abc

# Expected: 401 Unauthorized

# 2. Test with NEW secret (should work)
curl -H "Authorization: Bearer NEW_SECRET" \
  https://polycopy.app/api/copied-trades/123/status?userId=abc

# Expected: 200 OK (if userId owns trade)

# 3. Test regular auth still works
curl -H "Authorization: Bearer USER_JWT_TOKEN" \
  https://polycopy.app/api/copied-trades/123/status?userId=abc

# Expected: 200 OK
```

---

## 📊 RISK ASSESSMENT

### **Before Fix:**
- **Likelihood:** HIGH (secrets can leak)  
- **Impact:** CRITICAL (full auth bypass)  
- **Risk Score:** 9/10

### **After Secret Rotation:**
- **Likelihood:** LOW (new secret not leaked yet)  
- **Impact:** CRITICAL (still bypass if leaked)  
- **Risk Score:** 5/10

### **After IP Allowlist:**
- **Likelihood:** VERY LOW (IP + secret required)  
- **Impact:** MEDIUM (still data access if both leaked)  
- **Risk Score:** 2/10

### **After JWT + IP + Ownership:**
- **Likelihood:** VERY LOW  
- **Impact:** LOW (limited scope with ownership checks)  
- **Risk Score:** 1/10

---

## 🎯 RECOMMENDED APPROACH

**Phase 1 (Today):**
1. ✅ Rotate CRON_SECRET immediately
2. ✅ Verify ownership checks in place (already done!)
3. ✅ Test cron jobs work with new secret

**Phase 2 (This Week):**
4. Add IP allowlisting for cron endpoints
5. Add comprehensive logging
6. Set up monitoring/alerts

**Phase 3 (This Month):**
7. Implement JWT-based cron auth
8. Regular rotation policy (quarterly)
9. Penetration testing

---

## 💬 NEED HELP?

**If you need assistance:**
1. I can help implement IP allowlisting
2. I can set up JWT authentication
3. I can create monitoring/alerting

**Just say:**
- "Help me add IP allowlisting for cron"
- "Let's implement JWT authentication"
- "Set up cron monitoring"

---

**Status:** Awaiting user action (cron secret rotation) 🔄

---

*Document created: January 11, 2026*  
*Priority: CRITICAL*  
*Owner: User (requires env var access)*
