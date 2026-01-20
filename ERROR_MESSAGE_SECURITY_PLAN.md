# 🔒 Error Message Security Fix - Critical #2

**Status:** IN PROGRESS  
**Date:** January 10, 2026  
**Priority:** 🔴 CRITICAL

---

## 🎯 **VULNERABILITY**

**Threat #38:** Error Messages Expose System Details

**Current Risk:** 🔴 HIGH
- Stack traces returned to client
- `error.message` exposed (contains file paths, SQL, versions)
- Database error codes exposed
- System internals revealed to attackers

**Attack Scenario:**
```
1. Attacker triggers errors intentionally (malformed input, etc.)
2. Receives detailed error messages:
   - "Error: ENOENT: no such file or directory, open '/var/app/config/secret.json'"
   - "PostgreSQL error: column 'api_key' does not exist"
   - "Turnkey API failed: Invalid signature at /usr/src/app/lib/turnkey/sign.ts:42"
3. Learns file structure, table schemas, library versions
4. Uses info for targeted attacks
```

---

## ✅ **SOLUTION IMPLEMENTED**

### Created: `lib/http/error-response.ts`

**Secure Error Response Utility** with:
- ✅ Generic messages only in production
- ✅ Detailed logging server-side with auto-redaction
- ✅ No stack traces to client
- ✅ No `error.message` exposure
- ✅ Safe error categories
- ✅ Helpful dev info (dev mode only)

### Key Features:

1. **Generic Messages** (Safe for Users):
```typescript
// BEFORE (DANGEROUS):
return NextResponse.json({ error: error.message }, { status: 500 })
// Client sees: "Error: column api_key does not exist at pg/index.js:1234"

// AFTER (SAFE):
return internalError('Database query failed', error)
// Production client sees: "An internal error occurred. Please try again later."
// Server logs: Full details with context, auto-redacted
```

2. **Shorthand Functions**:
```typescript
badRequest()           // 400 - Invalid input
unauthorized()         // 401 - Login required
forbidden()            // 403 - No permission
notFound()             // 404 - Resource not found
internalError()        // 500 - Generic server error
externalApiError()     // 502 - Polymarket/Turnkey/etc. failed
serviceUnavailable()   // 503 - Service down
```

3. **Server-Side Logging** (Automatic):
```typescript
// All details logged securely:
logError('api_error_500', {
  category: 'internal_error',
  status: 500,
  error_name: 'PostgresError',
  error_message: 'column api_key does not exist',
  // API keys auto-redacted by logger!
})
```

---

## 📊 **VULNERABLE ENDPOINTS FOUND**

### High Risk (Expose `error.message`): 30 instances
1. `app/api/wallet/import/route.ts` - Exposes wallet import errors
2. `app/api/stripe/cancel-subscription/route.ts` - Exposes Stripe errors
3. `app/api/polymarket/open-positions/route.ts` - Exposes Polymarket errors
4. `app/api/espn/scores/route.ts` - Exposes ESPN API errors
5. `app/api/wallet/disconnect/route.ts` - Exposes wallet errors
6. `app/api/polymarket/l2-credentials/route.ts` - Exposes credential errors
7. `app/api/polymarket/trader-stats/route.ts` - Exposes trader stat errors
8. `app/api/turnkey/wallet/create/route.ts` - Exposes Turnkey errors
9. `app/api/turnkey/polymarket/validate-account/route.ts` - Exposes validation errors
10. `app/api/portfolio/trades/route.ts` - Exposes portfolio errors
11. `app/api/polymarket/trades-blockchain/[wallet]/route.ts` - Exposes blockchain errors
12. `app/api/polymarket/lookup-user/route.ts` - Exposes user lookup errors
13. `app/api/debug/follows/route.ts` - Exposes follow system errors
14. `app/api/notification-preferences/route.ts` - Exposes notification errors (2 instances)
15. `app/api/admin/trader-details/route.ts` - Exposes admin errors
16. `app/api/turnkey/polymarket/usdc-balance/route.ts` - Exposes balance errors
17. `app/api/trade-lookup/route.ts` - Exposes database query errors
18. `app/api/feed/route.ts` - Exposes feed errors

### Medium Risk (Partial exposure): 56 files with try/catch blocks
- Most have proper error handling, but may expose details on edge cases

---

## 🚀 **IMPLEMENTATION PLAN**

### Phase 1: High-Risk Endpoints (30 files) ✅ IN PROGRESS
Replace all `error.message` returns with secure error responses

**Pattern:**
```typescript
// BEFORE:
catch (error) {
  return NextResponse.json(
    { error: error.message || 'Failed' },
    { status: 500 }
  )
}

// AFTER:
import { internalError } from '@/lib/http/error-response'

catch (error) {
  return internalError('Operation description', error)
}
```

### Phase 2: Verify No Stack Traces
- Test in development mode
- Ensure dev_info only appears in dev
- Verify production mode returns generic messages only

### Phase 3: Update Documentation
- Add examples to README
- Document error handling best practices
- Update API documentation with error responses

---

## 📝 **BENEFITS**

### Security Improvements:
- ✅ **No system internals exposed** - Attackers learn nothing
- ✅ **No file paths revealed** - Directory structure hidden
- ✅ **No database schema info** - Table/column names hidden
- ✅ **No library versions** - Can't target known vulnerabilities
- ✅ **Detailed server logs** - Still have debugging info

### User Experience:
- ✅ **Clear error messages** - Users understand what went wrong
- ✅ **Actionable feedback** - "Please log in" instead of "JWT expired"
- ✅ **Professional** - No scary stack traces

### Developer Experience:
- ✅ **Easy to use** - Simple shorthand functions
- ✅ **Rich dev mode** - Full debugging info in development
- ✅ **Consistent** - Same pattern everywhere
- ✅ **Auto-logging** - Don't forget to log errors

---

## 🔍 **TESTING CHECKLIST**

### Production Mode:
- [ ] Error responses contain ONLY generic messages
- [ ] No `error.message` in responses
- [ ] No stack traces in responses
- [ ] No file paths in responses
- [ ] No database details in responses

### Development Mode:
- [ ] `dev_info` object included for debugging
- [ ] Stack traces available in dev_info
- [ ] Error messages helpful for development

### Server Logs:
- [ ] All errors logged with context
- [ ] Sensitive data auto-redacted
- [ ] Error tracking codes present
- [ ] Enough detail for debugging

---

## 📈 **IMPACT**

### Before Fix:
- **Risk Level:** 🔴 HIGH
- **Info Leakage:** Severe (file paths, schemas, versions)
- **Attack Surface:** Large (every error reveals internals)
- **Security Score:** 67/100

### After Fix:
- **Risk Level:** 🟢 LOW
- **Info Leakage:** None (generic messages only)
- **Attack Surface:** Minimal (errors reveal nothing)
- **Security Score:** ~75/100 (+8 points)

---

## ✨ **EXAMPLE: Before vs After**

### Scenario: User triggers database error

**BEFORE (Dangerous):**
```json
{
  "error": "column \"api_key\" does not exist",
  "details": "Error: column \"api_key\" does not exist\n    at Parser.parseErrorMessage (/app/node_modules/pg-protocol/dist/parser.js:287:98)"
}
```
☠️ Attacker learns:
- Table has an `api_key` column reference bug
- Using PostgreSQL
- Using pg-protocol library
- Can try SQL injection targeting api_key

**AFTER (Safe):**
```json
{
  "error": "A database error occurred. Please try again."
}
```
✅ Attacker learns: Nothing useful

**Server Log (Not sent to client):**
```
[ERROR] api_error_500 {
  category: 'database_error',
  status: 500,
  error_name: 'PostgresError',
  error_message: 'column "api_key" does not exist',
  operation: 'fetch_credentials',
  timestamp: '2026-01-10T...'
}
```
✅ Developer has full context for debugging

---

## 🎯 **NEXT STEPS**

1. ✅ Create `lib/http/error-response.ts` - DONE
2. 🔄 Fix 30 high-risk endpoints - IN PROGRESS
3. ⏳ Test in development
4. ⏳ Test in production (canary)
5. ⏳ Document error handling guide
6. ⏳ Commit and deploy

---

*Security is not about hiding problems - it's about not revealing solutions to attackers.*
