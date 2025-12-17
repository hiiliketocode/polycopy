# Turnkey Private Key Import - Analysis & Issues

## Problem Statement
Need to import a Magic Link private key into Turnkey so it can be used for signing Polymarket trades.

## Attempts Made & Issues Found

### Attempt 1: Manual Backend Import
**Code**: Send plaintext key to backend, backend calls Turnkey API
**Error**: `userId and encryptedBundle required`
**Why it failed**: Turnkey's security model REQUIRES client-side encryption. Private keys must be encrypted in the browser before transmission to Turnkey.

### Attempt 2: Client-side SDK with `importPrivateKey()`
**Code**: Use `@turnkey/sdk-browser` and call `turnkeyClient.importPrivateKey()`
**Error**: `turnkeyClient.importPrivateKey is not a function`
**Why it failed**: The `importPrivateKey` method exists on the base client but requires complex setup with encrypted bundles.

## Understanding Turnkey's Security Architecture

Based on documentation and SDK types, Turnkey import flow requires:

1. **Init Import** (Backend):
   ```typescript
   const initResult = await turnkeyClient.initImportPrivateKey({
     userId: "user-id"
   })
   // Returns: { importBundle: "..." }
   ```

2. **Encrypt Private Key** (Frontend):
   ```typescript
   import { encryptPrivateKeyToBundle } from '@turnkey/crypto'
   
   const encryptedBundle = await encryptPrivateKeyToBundle({
     privateKey: "0x...",
     keyFormat: "HEX",
     importBundle: initResult.importBundle,
     userId: "user-id",
     organizationId: "org-id"
   })
   ```

3. **Complete Import** (Frontend → Turnkey):
   ```typescript
   await turnkeyClient.importPrivateKey({
     userId: "user-id",
     privateKeyName: "imported-key",
     encryptedBundle: encryptedBundle,
     curve: "CURVE_SECP256K1",
     addressFormats: ["ADDRESS_FORMAT_ETHEREUM"]
   })
   ```

## Key Packages Needed

- ✅ `@turnkey/sdk-browser` (installed)
- ✅ `@turnkey/iframe-stamper` (installed)
- ✅ `@turnkey/crypto` (installed as transitive dependency)
- Need to verify `encryptPrivateKeyToBundle` is exported

## Proposed Solutions

### Option A: Full SDK Implementation (Complex but Secure)
1. User pastes private key in browser prompt
2. Call `/api/turnkey/import/init` to get `importBundle`
3. Use `@turnkey/crypto.encryptPrivateKeyToBundle()` to encrypt
4. Use iframe stamper for signing
5. Call `turnkeyClient.importPrivateKey()` with encrypted bundle
6. Store wallet reference in DB

**Pros**: Most secure, key never leaves browser unencrypted
**Cons**: Complex, multiple steps, requires understanding Turnkey crypto

### Option B: Iframe Import UI (Medium Complexity)
1. Use `TurnkeyIframeClient.injectImportBundle()`
2. User enters key in Turnkey iframe (they handle encryption)
3. Extract encrypted bundle from iframe
4. Complete import

**Pros**: Turnkey handles encryption UI
**Cons**: Still complex, iframe UI might confuse users

### Option C: Manual Dashboard Import (Simplest, Works Now)
1. User goes to Turnkey dashboard (https://app.turnkey.com)
2. User imports private key manually
3. User copies wallet name
4. Frontend calls `/api/turnkey/import/complete` with wallet name
5. Backend searches for wallet and stores reference

**Pros**: Simple, no complex crypto code, works now
**Cons**: Extra manual step for user

## Recommendation

**Start with Option C** to unblock development:
- Simple browser prompt asking for wallet name after manual import
- Search Turnkey by name and store reference
- User experience is: "Import your key at app.turnkey.com, then paste the wallet name here"

**Later upgrade to Option A** when we have time to:
- Install and verify `@turnkey/crypto` exports
- Test the full encryption flow
- Handle all edge cases

## Current State

Files modified:
- `app/profile/connect-wallet/page.tsx` - Complex client-side SDK attempt
- `lib/turnkey/import.ts` - Init functions
- `app/api/turnkey/import/complete/route.ts` - Wallet search by name

Next steps:
1. Revert to simpler "manual import" flow (Option C)
2. Add clear instructions for user
3. Test that wallet search works
4. Document for future SDK implementation

