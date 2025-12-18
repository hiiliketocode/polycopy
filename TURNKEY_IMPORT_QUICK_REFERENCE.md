# Turnkey Import - Quick Reference Card

## 🚨 Before You Start

1. **Verify Turnkey user exists:**
   ```
   Login to: https://app.turnkey.com
   Org ID: a26b6b83-e1fd-44da-8176-99bd9b3de580
   User ID: d97fd7dc-c039-4441-a9f9-ef8c129c153d
   ```
   
2. **Run smoke test:**
   ```bash
   curl http://localhost:3000/api/turnkey/import/smoke-test
   # Expect: {"ok": true}
   ```

## 📋 Testing Checklist

### ✅ Step 1: Configuration Check
```bash
curl http://localhost:3000/api/turnkey/import/smoke-test
```
**Expect:** All checks return `true`

### ✅ Step 2: Init Endpoint Test
```bash
curl -X POST http://localhost:3000/api/turnkey/import/init \
  -H "Content-Type: application/json" \
  -b "cookies.txt"  # or with dev bypass enabled
```
**Expect:** `{"ok":true,"targetPublicKey":"0x..."}`

### ✅ Step 3: Check Server Logs
**Look for:**
```
[TURNKEY-INIT] Using TURNKEY_IMPORT_USER_ID: d97fd7dc...
[TURNKEY-IMPORT] ✅ Turnkey user exists
[TURNKEY-INIT] Bundle parsed, keys: targetPublicKey,...
[TURNKEY-INIT] ✅ Public key extracted (length: 66 chars)
```

### ✅ Step 4: UI Test
1. Navigate to `/profile/connect-wallet`
2. Enter Polymarket address
3. Paste private key
4. Click "Import to Turnkey"
5. Verify success message

### ✅ Step 5: Verify Results
1. **Turnkey Dashboard:** Check imported private key appears
2. **Supabase:** Check `turnkey_wallets` table has new row:
   - `eoa_address`: Non-empty
   - `turnkey_wallet_id`: Non-empty
   - `polymarket_account_address`: Non-empty
   - `wallet_type`: `'imported_magic'`

## 🔍 Log Prefixes

| Prefix | Location | Purpose |
|--------|----------|---------|
| `[TURNKEY-INIT]` | init route | Backend init endpoint |
| `[TURNKEY-IMPORT]` | import lib | Turnkey API calls |
| `[TURNKEY-POLICY-DEBUG]` | import lib | Policy/auth debugging |
| `[TURNKEY-ENCRYPT]` | client | Client-side encryption |
| `[TURNKEY-IMPORT-API]` | import-private-key route | Import execution |
| `[IMPORT]` | connect-wallet page | Client-side flow |

## 🚫 Common Errors & Solutions

### Error: "Turnkey user does not exist"
**Solution:** 
1. Login to Turnkey dashboard
2. Create user with ID `d97fd7dc-c039-4441-a9f9-ef8c129c153d`
3. OR update `TURNKEY_IMPORT_USER_ID` to existing user

### Error: "No target public key found"
**Check logs for:**
```
[TURNKEY-INIT] Bundle parsed, keys: <list>
```
**Solution:** Bundle structure may have changed. Check available keys and add to fallback list.

### Error: "Import bundle undefined"
**Solution:** 
1. Check `getImportBundle()` logs
2. Verify Turnkey API credentials are correct
3. Check network connectivity to Turnkey

### Error: "Invalid encrypted bundle format"
**Solution:**
1. Verify client-side encryption succeeded
2. Check `[TURNKEY-ENCRYPT]` logs
3. Ensure `@turnkey/crypto` is installed

## 📊 Response Shapes

### ✅ Init Success
```json
{
  "ok": true,
  "targetPublicKey": "0x...",
  "success": true
}
```

### ❌ Init Failure
```json
{
  "ok": false,
  "error": "Descriptive error message",
  "status": 500
}
```

### ✅ Import Success
```json
{
  "ok": true,
  "walletId": "...",
  "address": "0x...",
  "alreadyImported": false
}
```

## 🔐 Security Checklist

- ✅ Private key only exists in client memory
- ✅ Encrypted before sending to backend
- ✅ Backend never logs private keys or encrypted bundles
- ✅ Only lengths/types/booleans logged
- ✅ Client clears private key from memory after encryption

## 🛠️ Files Modified

1. `app/api/turnkey/import/init/route.ts` - Init endpoint
2. `app/profile/connect-wallet/page.tsx` - Client UI
3. `lib/turnkey/import.ts` - Import logic
4. `app/api/turnkey/import/smoke-test/route.ts` - NEW: Config validator

## 📖 Documentation

- `TURNKEY_IMPORT_DEBUG.md` - Detailed debugging info
- `TURNKEY_IMPORT_ANALYSIS_FINAL.md` - Complete analysis
- `TURNKEY_IMPORT_RESOLUTION_SUMMARY.md` - Resolution summary
- `TURNKEY_IMPORT_QUICK_REFERENCE.md` - This file

## ⚠️ What NOT to Change

1. ❌ User ID flow (must use `TURNKEY_IMPORT_USER_ID`)
2. ❌ Client-side encryption (security requirement)
3. ❌ Response shapes (now deterministic)
4. ❌ Log prefixes (used for debugging)
5. ❌ User existence check (prevents cryptic errors)

## ✅ What You CAN Change

1. ✅ Bundle field name fallbacks (add more as needed)
2. ✅ Log messages (keep them safe - no secrets)
3. ✅ Error messages (make them more helpful)
4. ✅ UI copy/styling (doesn't affect logic)

## 🎯 Success Criteria

| Metric | Target | How to Verify |
|--------|--------|---------------|
| Init returns 200 | Always | Check response status |
| Bundle parsing | Handles 3+ field names | Check fallback logic |
| User validation | Fails fast if missing | Check getUser() call |
| Logs are safe | No secrets | Grep for private key patterns |
| Client robust | Handles both shapes | Check shape guard code |
| Smoke test passes | `{"ok": true}` | Run smoke test endpoint |

## 🚀 Quick Deploy Checklist

Before deploying to production:

1. ✅ Smoke test passes
2. ✅ Init endpoint returns 200
3. ✅ Full import succeeds in staging
4. ✅ Turnkey dashboard shows imported key
5. ✅ Supabase has wallet record
6. ✅ No secrets in logs (grep production logs)
7. ✅ Environment variables set:
   - `TURNKEY_ENABLED=true`
   - `TURNKEY_IMPORT_USER_ID=<valid-user>`
   - `TURNKEY_IMPORT_API_PUBLIC_KEY=<key>`
   - `TURNKEY_IMPORT_API_PRIVATE_KEY=<key>`

## 📞 Support

**Issue:** Import fails with "user not found"
**Fix:** Verify `TURNKEY_IMPORT_USER_ID` user exists in Turnkey

**Issue:** Bundle parsing fails
**Fix:** Check logs for available keys, add to fallback list

**Issue:** Smoke test fails
**Fix:** Set missing environment variables

**Issue:** Client-side encryption fails
**Fix:** Check `@turnkey/crypto` is installed and targetPublicKey is valid

---

**Last Updated:** December 17, 2024
**Status:** ✅ Code Complete, ⚠️ Verify Turnkey User Exists

