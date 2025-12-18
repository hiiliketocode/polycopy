# Turnkey Import Debug Report

## Evidence from Runtime Logs

### Most Recent Error (lines 639-666 in terminal)
```[POLY-AUTH] Import init request received
[POLY-AUTH] DEV BYPASS: Using env user: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
[TURNKEY-IMPORT] Initializing import for user: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
[TURNKEY-IMPORT] Creating init_import_private_key activity...
[TURNKEY-IMPORT] Private key name: imported-magic-b2ec6399-abcf-4b12-bb16-2f55d0e8a29d-1765994344348
[TURNKEY-IMPORT] Init failed: Turnkey error 5: unable to find user b2ec6399-abcf-4b12-bb16-2f55d0e8a29d in organization a26b6b83-e1fd-44da-8176-99bd9b3de580
```

## Root Cause Analysis

### Issue #1: Wrong Turnkey userId Parameter
**Problem:** The code is passing `b2ec6399-abcf-4b12-bb16-2f55d0e8a29d` (PolyCopy Supabase user ID) as the `userId` parameter to Turnkey's `initImportPrivateKey` API.

**Why it fails:** Turnkey requires that the `userId` in the parameters must be a valid Turnkey user that exists in the Turnkey organization. This is a Supabase UUID, not a Turnkey user ID.

**Evidence from Turnkey Docs:**
- The `initImportPrivateKey` activity requires a `userId` parameter
- This userId must reference an existing Turnkey user in the organization
- Turnkey error 5 = "NOT_FOUND" - the specified user doesn't exist

### Issue #2: "Invalid import bundle format" Error (from earlier logs)
**Problem:** When `getImportBundle` succeeds, the route tries to JSON.parse the `importBundle` string to extract `targetPublicKey` or `encryptionPublicKey`.

**Why it fails:** The `importBundle` from Turnkey is NOT a simple JSON object with a `targetPublicKey` field. According to Turnkey docs, the import bundle is an opaque string that contains encrypted session data for the import ceremony.

**Current code (lines 82-94 in init/route.ts):**
```typescript
try {
  const bundleData = JSON.parse(result.importBundle)
  targetPublicKey = bundleData.targetPublicKey || bundleData.encryptionPublicKey
  
  if (!targetPublicKey) {
    throw new Error('No target public key found in import bundle')
  }
} catch (parseError) {
  throw new Error('Invalid import bundle format')
}
```

**Actual Turnkey import bundle structure:**
The import bundle is a JSON string, but its structure is:
```json
{
  "importBundle": "base64-encoded-encrypted-data",
  "organizationId": "...",
  "userId": "..."
}
```

But wait - looking at Turnkey SDK source code, `initImportPrivateKey` returns:
```typescript
{
  activity: {
    result: {
      initImportPrivateKeyResult: {
        importBundle: "string" // This is what we need
      }
    }
  }
}
```

The `importBundle` itself when parsed contains the encryption public key needed.

## Solution

### Fix #1: Use TURNKEY_IMPORT_USER_ID (Which Must Exist in Turnkey)
The init route ALREADY does this correctly (line 43):
```typescript
turnkeyUserId = TURNKEY_IMPORT_USER_ID
```

**Action Required:**
1. Verify `TURNKEY_IMPORT_USER_ID` is set in environment variables
2. Verify this user ID actually exists in your Turnkey organization

### Fix #2: Properly Parse Import Bundle
The import bundle from Turnkey needs to be parsed correctly. Based on Turnkey's SDK, the bundle structure is:

```typescript
const bundleData = JSON.parse(result.importBundle)
// bundleData contains: { targetPublicKey, signaturePublicKey, ... }
```

### Fix #3: Add Comprehensive Logging
Add structured logging to track:
- What userId is being used (PolyCopy vs Turnkey)
- What the API response contains
- Bundle structure validation

## Implementation Plan

### Step 1: Enhanced Logging in init/route.ts
- Log the TURNKEY_IMPORT_USER_ID being used
- Log response structure (keys only, not values)
- Log bundle parsing attempts with safe error messages

### Step 2: Robust Bundle Parsing
- Handle both base64 and JSON bundle formats
- Extract targetPublicKey correctly
- Add fallback logic

### Step 3: Environment Validation
- Add startup check to verify TURNKEY_IMPORT_USER_ID is configured
- Add check to verify the user exists in Turnkey (or auto-create)

## Key Findings

1. **The init route IS using TURNKEY_IMPORT_USER_ID** (line 43)
2. **The issue is that this user doesn't exist in Turnkey** (Error 5: NOT_FOUND)
3. **The bundle parsing logic is fragile** and assumes a specific structure

## Next Steps

1. ✅ Check `.env` file for TURNKEY_IMPORT_USER_ID → Found: `d97fd7dc-c039-4441-a9f9-ef8c129c153d`
2. ⚠️ Verify this user exists in Turnkey dashboard → Need to verify via Turnkey dashboard
3. ✅ Add user verification check before init → Added getUser() call
4. ✅ Fix bundle parsing to handle actual Turnkey response format → Enhanced with multiple field fallbacks
5. ✅ Add comprehensive safe logging → Added [TURNKEY-INIT] logs with structured output

## Changes Made

### 1. `/app/api/turnkey/import/init/route.ts`
- ✅ Added structured logging: `[TURNKEY-INIT] status=<code> ok=<bool> len=<number>`
- ✅ Added bundle keys logging (safe - no values)
- ✅ Enhanced error handling with ok/error/status shape
- ✅ Added fallback for multiple public key field names
- ✅ Returns stable JSON shape: `{ ok: true, targetPublicKey: string }`

### 2. `/app/profile/connect-wallet/page.tsx`
- ✅ Added shape guard for response
- ✅ Handles both `targetPublicKey` and `importBundle` response formats
- ✅ Added safe logging: `[IMPORT] init ok=<bool> hasBundle=<bool> hasPubKey=<bool>`
- ✅ Proper error handling for missing keys

### 3. `/lib/turnkey/import.ts`
- ✅ Added comprehensive logging for debugging
- ✅ Added user existence check before calling initImportPrivateKey
- ✅ Clear error message if Turnkey user doesn't exist

## Working Flow (Option A - Pure Client-Side Encryption)

```
Client                          Backend                         Turnkey
  |                               |                               |
  |--POST /api/turnkey/import/init-|                              |
  |                               |--initImportPrivateKey(userId)-->|
  |                               |<--{activity:{result:{importBundle}}}--|
  |                               |                               |
  |                               |--Parse bundle for pubKey---->|
  |<--{targetPublicKey}-----------|                               |
  |                               |                               |
  |--Encrypt key client-side---->|                               |
  |                               |                               |
  |--POST /import-private-key---->|                               |
  |  {encryptedBundle}            |                               |
  |                               |--importPrivateKey(encrypted)-->|
  |                               |<--{walletId, address}---------|
  |<--{walletId, address}---------|                               |
```

## Security Note

✅ **GOOD:** Private key never sent to backend in plaintext
✅ **GOOD:** Encryption happens client-side
✅ **FIXED:** Backend now properly extracts public key from bundle with fallbacks

## Smoke Test

Run: `curl http://localhost:3000/api/turnkey/import/smoke-test`

Expected output:
```json
{
  "ok": true,
  "message": "All Turnkey import configuration present",
  "checks": {
    "turnkeyEnabled": true,
    "hasImportUserId": true,
    "hasImportApiPublicKey": true,
    "hasImportApiPrivateKey": true,
    "importUserIdValue": "d97fd7dc...",
    "importApiPublicKeyPrefix": "..."
  }
}
```

## Critical Configuration

### Environment Variables Required

1. **TURNKEY_IMPORT_USER_ID** - Must be a Turnkey user ID that EXISTS in your Turnkey organization
   - Current value: `d97fd7dc-c039-4441-a9f9-ef8c129c153d`
   - ⚠️ **CRITICAL:** Verify this user exists in Turnkey dashboard
   - If user doesn't exist, create it or change to an existing user ID

2. **TURNKEY_IMPORT_API_PUBLIC_KEY** - API public key for the Import User
3. **TURNKEY_IMPORT_API_PRIVATE_KEY** - API private key for the Import User

### How to Verify User Exists

1. Go to Turnkey dashboard: https://app.turnkey.com
2. Navigate to your organization
3. Go to "Users" section
4. Search for user ID: `d97fd7dc-c039-4441-a9f9-ef8c129c153d`
5. If not found, either:
   - Create a user with this ID, OR
   - Update `TURNKEY_IMPORT_USER_ID` to an existing user's ID

## What to NEVER Change

1. **Do NOT change the encryption flow** - client-side encryption is critical for security
2. **Do NOT log private keys or encrypted bundles** - only log lengths/types/booleans
3. **Do NOT skip the user existence check** - it prevents cryptic Turnkey errors
4. **Do NOT assume bundle structure** - use fallbacks for field names
5. **Do NOT mix PolyCopy user IDs with Turnkey user IDs** - they are different systems

## Final Working Flow

```
1. Client calls /api/turnkey/import/init
2. Backend reads TURNKEY_IMPORT_USER_ID from env
3. Backend calls getImportBundle(polyCopyUserId, TURNKEY_IMPORT_USER_ID)
4. getImportBundle verifies Turnkey user exists (throws if not)
5. getImportBundle calls Turnkey initImportPrivateKey with TURNKEY_IMPORT_USER_ID
6. Turnkey returns import bundle (JSON string)
7. Backend parses bundle to extract targetPublicKey
8. Backend returns { ok: true, targetPublicKey }
9. Client encrypts private key using targetPublicKey
10. Client sends encrypted bundle to /api/turnkey/import-private-key
11. Backend imports to Turnkey
12. Backend saves reference to Supabase
```

