# Dual Auth Flow Implementation - In Progress

## Status: PARTIAL IMPLEMENTATION

This document tracks the implementation of dual auth flows for Polymarket L2 credentials.

### Completed ✅

1. **lib/turnkey/import.ts** - Updated with init and complete functions
2. **app/api/turnkey/import/init/route.ts** - Created
3. **app/api/turnkey/import/complete/route.ts** - Created

### In Progress 🔨

4. **app/api/polymarket/l2-credentials-wallet/route.ts** - Need to create
5. **lib/polymarket/clob.ts** - Need to update for wallet signatures
6. **app/api/polymarket/l2-credentials/route.ts** - Need to update for imports
7. **app/profile/connect-wallet/page.tsx** - Need to update UI

### Remaining 📋

- Test both flows end-to-end
- Verify secrets never exposed to browser
- Confirm validation works

## Implementation Note

The current Turnkey import flow creates a wallet activity. The actual iframe-based import where users paste their Magic Link private key may require:
1. Turnkey's official import SDK/iframe component
2. Different activity type (ACTIVITY_TYPE_IMPORT_WALLET or ACTIVITY_TYPE_IMPORT_PRIVATE_KEY)
3. Specific iframe URL format from Turnkey documentation

This should be verified against Turnkey's latest documentation for private key import flows.

## Next Steps

1. Create wallet-based L2 credentials endpoint
2. Update clob.ts to support external wallet signatures
3. Update UI with dual path selector
4. Move Turnkey tester to collapsed Dev Tools
5. Test end-to-end

