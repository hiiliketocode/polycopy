# Turnkey Import Init - userId Parameter Fix

## Issue
Turnkey API was returning error:
```
Turnkey error 3: invalid request body: missing field `userId`
```

## Root Cause
The `initImportPrivateKey` API call was missing the required `userId` parameter in the request body:

**Before:**
```typescript
parameters: {},  // ❌ Empty - missing userId
```

**After:**
```typescript
parameters: {
  userId: turnkeyUserId,  // ✅ Required parameter
},
```

## Changes Made

### 1. `lib/turnkey/import.ts`

#### Updated `getImportBundle()` function signature:
```typescript
export async function getImportBundle(
  polyCopyUserId: string,      // PolyCopy Supabase user ID
  turnkeyUserId: string         // Turnkey user ID (passed to API)
): Promise<{
  importBundle: string
  organizationId: string
}>
```

#### Added userId parameter to Turnkey API call:
```typescript
const initResult = await client.turnkeyClient.initImportPrivateKey({
  type: 'ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY',
  timestampMs: String(Date.now()),
  organizationId: client.config.organizationId,
  parameters: {
    userId: turnkeyUserId,  // ✅ Now provided
  },
})
```

#### Added logging:
```typescript
console.log('[TURNKEY-IMPORT] PolyCopy user_id:', polyCopyUserId)
console.log('[TURNKEY-IMPORT] Turnkey userId:', turnkeyUserId)
console.log('[TURNKEY-IMPORT] Init activity status:', initResult.activity.status)
```

### 2. `app/api/turnkey/import/init/route.ts`

#### Added dev bypass environment variables:
```typescript
const TURNKEY_DEV_ALLOW_UNAUTH = process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true'
const TURNKEY_DEV_BYPASS_USER_ID = process.env.TURNKEY_DEV_BYPASS_USER_ID
```

#### Implemented userId resolution with priority:

**Priority 1: Dev Bypass (for local testing)**
```typescript
if (TURNKEY_DEV_ALLOW_UNAUTH && TURNKEY_DEV_BYPASS_USER_ID) {
  polyCopyUserId = TURNKEY_DEV_BYPASS_USER_ID
  turnkeyUserId = TURNKEY_DEV_BYPASS_USER_ID
  console.log('[TURNKEY-IMPORT] DEV BYPASS: Using env user_id:', polyCopyUserId)
  console.log('[TURNKEY-IMPORT] DEV BYPASS: Using env turnkeyUserId:', turnkeyUserId)
}
```

**Priority 2: Authenticated User (production)**
```typescript
else {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  polyCopyUserId = user.id
  turnkeyUserId = polyCopyUserId  // 1:1 mapping for MVP
}
```

#### Added success logging:
```typescript
console.log('[TURNKEY-IMPORT] Import bundle obtained - status: 200')
```

### 3. Frontend (`app/profile/connect-wallet/page.tsx`)

**No changes required** ✅

The frontend already sends authenticated requests:
```typescript
const bundleRes = await fetch('/api/turnkey/import/init', {
  method: 'POST',
  credentials: 'include',  // ✅ Sends auth cookie
})
```

The backend extracts the user ID from the Supabase auth token, so no request body is needed.

## User ID Mapping Strategy

For MVP, we use a **1:1 mapping** between PolyCopy and Turnkey:
- **PolyCopy user_id** (Supabase UUID) → **Turnkey userId** (same UUID)

This simplifies the architecture and avoids needing a separate user mapping table.

## Environment Variables

### Development
```env
TURNKEY_DEV_ALLOW_UNAUTH=true
TURNKEY_DEV_BYPASS_USER_ID=b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
```

### Production
```env
# Dev bypass should NOT be set in production
# TURNKEY_DEV_ALLOW_UNAUTH=false (or omit)
```

## Security Notes

✅ **No private keys logged** - Only user IDs and status codes  
✅ **No sensitive data in request body** - Import bundle contains only public encryption key  
✅ **Authenticated requests** - User must be logged in (unless dev bypass)  
✅ **Idempotency checks** - Prevents duplicate imports  

## Testing

### ✅ Acceptance Test 1: No Missing userId Error
**Before:** `Turnkey error 3: invalid request body: missing field 'userId'`  
**After:** Import init succeeds with 200 response

**How to test:**
1. Navigate to `/profile/connect-wallet`
2. Enter Polymarket address in Stage 3
3. Paste Magic Link private key
4. Click "Import to Turnkey"
5. **Expected:** No userId error, import proceeds to encryption step

### ✅ Acceptance Test 2: Server Responds with 200
**Expected response:**
```json
{
  "importBundle": "eyJ...(base64url)",
  "organizationId": "..."
}
```

**How to test:**
1. Open DevTools Network tab
2. Trigger import as above
3. Find POST to `/api/turnkey/import/init`
4. **Expected:** Status 200 with importBundle in response

### ✅ Acceptance Test 3: No Private Key Sent
**Expected behavior:**
- Import init request has NO private key in body
- Only after getting import bundle does client encrypt the private key
- Only encrypted bundle is sent to `/api/turnkey/import-private-key`

**How to test:**
1. Open DevTools Network tab
2. Trigger import flow
3. Inspect `/api/turnkey/import/init` request body
4. **Expected:** Empty body or just `{}`
5. Inspect `/api/turnkey/import-private-key` request body
6. **Expected:** Only `{ polymarket_account_address, encryptedBundle }`

## Server Logs Example

### Successful Import Init
```
[TURNKEY-IMPORT] Import init request received
[TURNKEY-IMPORT] Authenticated user_id: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
[TURNKEY-IMPORT] Using turnkeyUserId: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
[TURNKEY-IMPORT] Getting import bundle
[TURNKEY-IMPORT] PolyCopy user_id: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
[TURNKEY-IMPORT] Turnkey userId: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
[TURNKEY-IMPORT] Init activity status: ACTIVITY_STATUS_COMPLETED
[TURNKEY-IMPORT] Import bundle obtained successfully
[TURNKEY-IMPORT] Import bundle obtained - status: 200
```

### Dev Bypass Mode
```
[TURNKEY-IMPORT] Import init request received
[TURNKEY-IMPORT] DEV BYPASS: Using env user_id: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
[TURNKEY-IMPORT] DEV BYPASS: Using env turnkeyUserId: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
[TURNKEY-IMPORT] Getting import bundle
...
```

## Error Handling

### Already Imported
```
Error: You have already imported a wallet. Cannot import another one.
```
**Cause:** User already has `wallet_type='imported_magic'` in database  
**Action:** Show friendly message or provide "replace wallet" option

### Unauthorized
```
Error: Unauthorized - please log in
```
**Cause:** No auth token and dev bypass not enabled  
**Action:** Redirect to login page

### Turnkey API Error
```
Error: Failed to get import bundle: [Turnkey error details]
```
**Cause:** Turnkey service issue or invalid credentials  
**Action:** Check Turnkey org credentials and API key

## Rollback

If issues arise, revert to previous commit:
```bash
git revert HEAD
```

Or temporarily disable import:
```env
TURNKEY_UI_ENABLED=false
```

## Next Steps

1. ✅ Test import flow end-to-end in development
2. ✅ Verify no userId errors
3. ✅ Test with dev bypass enabled
4. ✅ Test with real authentication
5. Deploy to staging
6. Monitor server logs for any Turnkey API errors
7. Test in production with real Magic Link keys

## Related Files

- ✅ `lib/turnkey/import.ts` - Core import logic
- ✅ `app/api/turnkey/import/init/route.ts` - Init endpoint
- `app/api/turnkey/import-private-key/route.ts` - Import endpoint (unchanged)
- `app/profile/connect-wallet/page.tsx` - Frontend UI (unchanged)

## References

- Turnkey API Docs: https://docs.turnkey.com/api
- Turnkey Import Flow: https://docs.turnkey.com/embedded-wallets/import
- Previous Implementation: `CLIENT_SIDE_ENCRYPTION_MVP.md`

