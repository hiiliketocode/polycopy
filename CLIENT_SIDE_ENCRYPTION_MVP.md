# Client-Side Encryption MVP Implementation

## Overview

Replaced the Turnkey iframe import flow with client-side encryption bundle import (Option A). The new implementation ensures that PolyCopy backend **never receives plaintext private keys**.

## Changes Made

### 1. Frontend Changes (`app/profile/connect-wallet/page.tsx`)

**Removed:**
- `@turnkey/iframe-stamper` integration
- `@turnkey/sdk-browser` direct usage
- Modal iframe UI with 200+ lines of code
- `startImportFlow()` function

**Added:**
- Simple password input field for Magic Link private key
- Client-side encryption using Turnkey's crypto library
- Three-step import process:
  1. Get import bundle from backend
  2. Encrypt private key client-side
  3. Send only encrypted bundle to backend
- Immediate plaintext key clearing from state and DOM

**Security Features:**
- Private key input uses `type="password"`
- Validates 64-character hex format before encryption
- Clears plaintext key from React state immediately after encryption
- Clears key on error as well
- No localStorage persistence

### 2. Library Changes (`lib/turnkey/import.ts`)

**Added Functions:**

#### `getImportBundle(userId: string)`
- Server-side function
- Calls Turnkey's `initImportPrivateKey` API
- Returns import bundle containing encryption public key
- Checks for existing wallet (idempotency)

#### `encryptPrivateKeyWithBundle(privateKeyHex: string, importBundle: string)`
- Client-side function (runs in browser)
- Uses `@turnkey/crypto` and `@turnkey/encoding`
- Extracts public key from import bundle
- Encrypts private key using HPKE (Hybrid Public Key Encryption)
- Returns encrypted bundle as hex string

#### `importEncryptedPrivateKey(userId: string, polymarketAccountAddress: string, encryptedBundle: string)`
- Server-side function
- Accepts **only** encrypted bundle (no plaintext)
- Calls Turnkey's `importPrivateKey` API with org API key auth
- Stores wallet reference in database
- Implements idempotency (checks for existing imports)

**Removed:**
- `initTurnkeyImport()` - replaced with `getImportBundle()`
- `completeTurnkeyImport()` - replaced with `importEncryptedPrivateKey()`

### 3. Backend API Changes

#### Updated: `app/api/turnkey/import/init/route.ts`
- Now calls `getImportBundle()` instead of `initTurnkeyImport()`
- Returns import bundle for client-side encryption
- No longer requires Turnkey user creation

#### New: `app/api/turnkey/import-private-key/route.ts`
- **POST** `/api/turnkey/import-private-key`
- Accepts: `{ polymarket_account_address, encryptedBundle }`
- **Security validations:**
  - Rejects requests containing `privateKey` field
  - Rejects requests containing raw 64-hex patterns
  - Does **not** log request bodies
  - Validates encrypted bundle format (must be > 100 chars)
- Calls `importEncryptedPrivateKey()`
- Returns: `{ ok: true, walletId, address, alreadyImported }`

#### Deprecated: `app/api/turnkey/import/complete/route.ts`
- Can be removed or kept for backwards compatibility
- No longer used by the new flow

### 4. Dependencies

**Already Installed:**
- `@turnkey/crypto`: ^2.8.7
- `@turnkey/encoding`: ^0.6.0

**No Longer Required:**
- `@turnkey/iframe-stamper` (can be removed)
- `@turnkey/sdk-browser` (used for iframe, can be removed)

## Security Acceptance Tests

### ✅ Test 1: Network Inspection
**How to test:**
1. Open browser DevTools → Network tab
2. Paste a private key and click "Import to Turnkey"
3. Find the POST request to `/api/turnkey/import-private-key`
4. Inspect request payload

**Expected Result:**
- Request contains `encryptedBundle` field (long hex string)
- Request does **not** contain any field with 64 hex characters
- Request does **not** contain field named `privateKey`

### ✅ Test 2: Server Logs
**How to test:**
1. Check server logs during import process
2. Search for private key patterns in logs

**Expected Result:**
- Logs show `[TURNKEY-IMPORT-API] Import request received`
- Logs do **not** contain request body data
- Logs do **not** contain 64-character hex strings (except encrypted bundle references)

### ✅ Test 3: UI Behavior
**How to test:**
1. Paste a private key in the input field
2. Click "Import to Turnkey"
3. Inspect React DevTools state
4. Check input field value

**Expected Result:**
- Input field is cleared immediately after import starts
- React state `privateKey` is empty string
- Key is cleared even if import fails

### ✅ Test 4: Encryption Validation
**How to test:**
1. Try to paste an invalid key format (not 64 hex chars)
2. Try to import without Polymarket address

**Expected Result:**
- Shows error before attempting encryption
- No network request is made
- Private key field is cleared

## Functional Acceptance Tests

### ✅ Test 5: Successful Import
**How to test:**
1. Get private key from https://reveal.magic.link/polymarket
2. Enter Polymarket wallet address in Stage 3
3. Paste private key
4. Click "Import to Turnkey"

**Expected Result:**
- Import completes successfully
- Returns `walletId` and `address`
- Shows success message with wallet details
- Address matches the imported private key

### ✅ Test 6: Idempotency
**How to test:**
1. Import a private key (first time)
2. Try to import again (without refreshing)
3. Refresh page and try to import same key again

**Expected Result:**
- First import: Returns `alreadyImported: false`
- Second attempt (same session): Shows error "You have already imported a wallet"
- Third attempt (after refresh): Returns `alreadyImported: true` with same wallet details
- No duplicate wallet entries created

### ✅ Test 7: Error Handling
**How to test:**
1. Try import without Polymarket address
2. Try import with invalid key format
3. Try import with valid format but wrong key

**Expected Result:**
- Shows appropriate error messages
- Private key is cleared from input
- No partial data stored in database

## Security Guarantees

1. **Client-Side Encryption**: Private key is encrypted in the browser using Turnkey's official crypto library before transmission
2. **No Plaintext Storage**: Private key never stored in localStorage, sessionStorage, or any persistent storage
3. **Immediate Clearing**: Plaintext key cleared from React state and DOM immediately after encryption
4. **Backend Validation**: Backend rejects any request containing raw private key patterns
5. **No Logging**: Request bodies are never logged on the server
6. **Encrypted Transit**: Only encrypted bundle sent over network
7. **Org API Key Auth**: Backend uses organization API key to import to Turnkey (no user-level auth required)

## Flow Diagram

```
┌─────────────┐
│   User      │
└──────┬──────┘
       │ 1. Paste private key
       ↓
┌─────────────────────────┐
│  Frontend (Browser)     │
│  - Validate key format  │
│  - Request import bundle│
└──────┬──────────────────┘
       │ POST /api/turnkey/import/init
       ↓
┌─────────────────────────┐
│  Backend                │
│  - Call Turnkey API     │
│  - Get import bundle    │
└──────┬──────────────────┘
       │ Return { importBundle }
       ↓
┌─────────────────────────┐
│  Frontend (Browser)     │
│  - Extract public key   │
│  - Encrypt private key  │
│  - Clear plaintext      │
└──────┬──────────────────┘
       │ POST /api/turnkey/import-private-key
       │ { encryptedBundle }
       ↓
┌─────────────────────────┐
│  Backend                │
│  - Validate (no raw key)│
│  - Import to Turnkey    │
│  - Store wallet ref     │
└──────┬──────────────────┘
       │ Return { walletId, address }
       ↓
┌─────────────────────────┐
│  Frontend (Browser)     │
│  - Show success         │
│  - Display wallet info  │
└─────────────────────────┘
```

## Files Modified

1. ✅ `app/profile/connect-wallet/page.tsx` - UI and import flow
2. ✅ `lib/turnkey/import.ts` - Encryption and import logic
3. ✅ `app/api/turnkey/import/init/route.ts` - Get import bundle
4. ✅ `app/api/turnkey/import-private-key/route.ts` - Import encrypted bundle
5. ✅ `package.json` - Dependencies already present

## Files That Can Be Removed (Optional)

- `app/api/turnkey/import/complete/route.ts` - No longer used
- Consider removing `@turnkey/iframe-stamper` dependency if not used elsewhere
- Consider removing `@turnkey/sdk-browser` dependency if not used elsewhere

## Testing Commands

```bash
# Start development server
npm run dev

# Navigate to test page
# http://localhost:3000/profile/connect-wallet

# Check server logs
tail -f .next/server-logs.txt

# Monitor network traffic
# Open DevTools → Network tab → filter by "import"
```

## Deployment Notes

1. Ensure `TURNKEY_ENABLED=true` in production
2. Ensure `NEXT_PUBLIC_TURNKEY_ORGANIZATION_ID` is set
3. Ensure Turnkey org API key is configured
4. Test import flow in staging before production
5. Monitor logs for security alerts (raw key patterns)

## Rollback Plan

If issues arise:
1. Revert to previous commit
2. Or temporarily disable by setting `TURNKEY_UI_ENABLED=false`
3. Old iframe flow code is removed, so would need full rollback

## Next Steps (Future Enhancements)

1. Add rate limiting on import endpoints
2. Add import attempt logging (without sensitive data)
3. Add email notification on successful import
4. Add ability to delete/replace imported wallet
5. Add import from other wallet providers (MetaMask, etc.)
6. Add multi-wallet support per user

## Support

For questions or issues:
- Check Turnkey documentation: https://docs.turnkey.com
- Review Turnkey crypto library: https://github.com/tkhq/sdk/tree/main/packages/crypto
- Check server logs for detailed error messages

