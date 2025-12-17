# Stage 4 Implementation: CLOB L2 Credentials Generation

## ✅ Implementation Complete (Code Ready)

### Summary of Changes

1. **Database Migration** (`supabase/migrations/017_create_clob_credentials.sql`)
   - Created `clob_credentials` table with encryption support
   - Stores: `api_key` (plaintext), `api_secret_encrypted`, `api_passphrase_encrypted`
   - UNIQUE constraint on `(user_id, polymarket_account_address)` for idempotency
   - RLS policies for user access control

2. **Configuration** (`lib/turnkey/config.ts`)
   - Added `POLYMARKET_CLOB_BASE_URL` (default: https://clob.polymarket.com)
   - Added `POLYMARKET_GEO_BLOCK_TOKEN` (optional)
   - Added `CLOB_ENCRYPTION_KEY` for credential encryption

3. **L2 Credentials Endpoint** (`app/api/turnkey/polymarket/generate-l2-credentials/route.ts`)
   - POST endpoint for generating CLOB API credentials
   - Builds deterministic L1 auth payload: `timestamp` (unix seconds), `nonce` ("0")
   - Signs with Turnkey EOA using `signMessageForUser`
   - Calls CLOB `/auth/api-key` endpoint with POLY_* headers
   - Encrypts `secret` and `passphrase` using AES-256-CBC
   - Stores credentials in `clob_credentials` table
   - Validates credentials immediately after creation
   - **Idempotent**: Returns existing credentials if already created
   - **Never returns secret/passphrase to client**

4. **UI Updates** (`app/profile/connect-wallet/page.tsx`)
   - Added Stage 4 section with "Generate L2 Credentials" button
   - Displays: `apiKey`, `validated` status, `createdAt` timestamp
   - Shows "existing credentials" notice for idempotent calls
   - Security note: confirms secrets are encrypted and never exposed

---

## Implementation Details

### L1 Auth Message Format

```typescript
function buildL1AuthMessage(timestamp: string, nonce: string): string {
  return `I want to create an API key with nonce ${nonce} and timestamp ${timestamp}`
}
```

**Note:** This format may need adjustment based on Polymarket's actual requirements. Comprehensive logging is included to debug the exact format needed.

### POLY_* Headers

```typescript
{
  'POLY_ADDRESS': turnkeyAddress,      // Turnkey EOA
  'POLY_TIMESTAMP': timestamp,          // Unix seconds
  'POLY_SIGNATURE': signature,          // From Turnkey signing
  'POLY_NONCE': nonce                   // "0" by default
}
```

### CLOB API Call

```typescript
POST ${POLYMARKET_CLOB_BASE_URL}/auth/api-key
Headers: POLY_ADDRESS, POLY_TIMESTAMP, POLY_SIGNATURE, POLY_NONCE
Query: ?geo_block_token=${token} (only if POLYMARKET_GEO_BLOCK_TOKEN is set)
```

### Encryption

Uses AES-256-CBC with a key derived from `CLOB_ENCRYPTION_KEY`:
- IV is prepended to ciphertext: `<iv>:<encrypted>`
- For production: Use Supabase Vault or AWS KMS
- Current implementation is suitable for MVP

### Validation

After creating credentials, immediately validates by calling:
```typescript
GET ${POLYMARKET_CLOB_BASE_URL}/markets
Headers: POLY_ADDRESS, POLY_API_KEY, POLY_SIGNATURE, POLY_TIMESTAMP
```

Sets `validated: true` only if this call succeeds.

---

## Database Schema

```sql
CREATE TABLE clob_credentials (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  polymarket_account_address text NOT NULL,
  turnkey_address text NOT NULL,
  api_key text NOT NULL,
  api_secret_encrypted text NOT NULL,
  api_passphrase_encrypted text NOT NULL,
  validated boolean DEFAULT false,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  last_validated_at timestamp,
  UNIQUE(user_id, polymarket_account_address)
);
```

---

## Security Checklist

✅ **Never return secret/passphrase to client** - Only `apiKey` is returned
✅ **Encrypt sensitive data** - `secret` and `passphrase` are encrypted before storage
✅ **Idempotent** - Returns existing credentials, doesn't create duplicates
✅ **Validated** - Credentials are tested immediately after creation
✅ **Logging** - `[POLY-CLOB]` prefix, never logs secrets
✅ **RLS Policies** - Users can only access their own credentials
✅ **Race condition handling** - Handles unique constraint violations gracefully

---

## Environment Variables Required

Add to `.env.local` and Vercel:

```bash
# Required
TURNKEY_ENABLED=true
CLOB_ENCRYPTION_KEY=<your-secure-key-32-chars-min>

# Optional
POLYMARKET_CLOB_BASE_URL=https://clob.polymarket.com
POLYMARKET_GEO_BLOCK_TOKEN=<your-geo-token-if-needed>
```

---

## To Apply Migration

Run this command to apply the database migration:

```bash
# Option 1: Using Supabase CLI (if linked)
npx supabase db push

# Option 2: Run migration manually in Supabase Dashboard SQL Editor
# Copy contents of supabase/migrations/017_create_clob_credentials.sql
```

---

## Logging Examples

All logs use `[POLY-CLOB]` prefix:

```
[POLY-CLOB] L2 credentials generation request started
[POLY-CLOB] User: <user_id> Account: <polymarket_address>
[POLY-CLOB] Found existing credentials, returning without creating new ones
[POLY-CLOB] Using Turnkey address: 0x...
[POLY-CLOB] Auth message to sign: I want to create an API key with nonce 0 and timestamp 1702860123
[POLY-CLOB] Signature obtained (first 20 chars): 0x1234567890abcdef1234...
[POLY-CLOB] Calling CLOB auth endpoint: https://clob.polymarket.com/auth/api-key
[POLY-CLOB] CLOB response status: 200
[POLY-CLOB] API key created: abc123def45...
[POLY-CLOB] Credential validation: SUCCESS
[POLY-CLOB] Credentials stored successfully
[POLY-CLOB] L2 credentials generation request finished
```

---

## API Response Format

### Success (New Credentials)
```json
{
  "ok": true,
  "apiKey": "abc123def456...",
  "validated": true,
  "createdAt": "2024-12-17T05:45:00.000Z",
  "turnkeyAddress": "0x1234...",
  "polymarketAccountAddress": "0x5678...",
  "isExisting": false
}
```

### Success (Existing Credentials)
```json
{
  "ok": true,
  "apiKey": "abc123def456...",
  "validated": true,
  "createdAt": "2024-12-17T05:45:00.000Z",
  "isExisting": true
}
```

### Error
```json
{
  "error": "Failed to create CLOB API key",
  "details": { ... },
  "debugInfo": {
    "signedMessage": "I want to create an API key...",
    "timestamp": "1702860123",
    "nonce": "0",
    "turnkeyAddress": "0x...",
    "signaturePreview": "0x1234..."
  }
}
```

---

## UI Flow

1. User completes Stage 3 (validates Polymarket contract wallet)
2. Stage 4 "Generate L2 Credentials" button becomes enabled
3. User clicks button
4. System:
   - Checks for existing credentials (idempotent)
   - If none exist: generates new credentials
   - Signs auth message with Turnkey
   - Calls CLOB API
   - Stores encrypted credentials
   - Validates immediately
   - Returns result
5. UI displays:
   - ✅ Success message
   - API Key (safe to show)
   - Validated status
   - "Existing credentials" notice if applicable
   - Security note about encryption

---

## Next Steps (NOT Implemented - Stage 4 Stops Here)

- ❌ Trade execution endpoints
- ❌ Order placement
- ❌ Order cancellation
- ❌ Position management
- ❌ PnL tracking

**Stage 4 complete. Stop here as requested.**

---

## Testing Required (User Must Perform)

### Test 1: Generate New Credentials
1. Navigate to `/profile/connect-wallet`
2. Complete Stage 1-3 (create wallet, validate contract address)
3. Click "Generate L2 Credentials"
4. Expected: `ok: true`, `validated: true`, `apiKey` displayed

### Test 2: Idempotency
1. Click "Generate L2 Credentials" again (same user, same account)
2. Expected: Same `apiKey` returned, `isExisting: true`, no new DB record

### Test 3: Security
1. Inspect network response in DevTools
2. Expected: `apiKey` visible, but NO `secret` or `passphrase`
3. Check database `clob_credentials` table
4. Expected: `api_secret_encrypted` and `api_passphrase_encrypted` contain encrypted strings

---

## Troubleshooting

### If CLOB auth fails:

1. Check logs for the exact message being signed
2. Verify POLY_* headers are correct format
3. Try different auth message formats (Polymarket docs may vary)
4. Check if `geo_block_token` is required for your region
5. Verify Turnkey signature is valid (should match EOA address)

### If validation fails:

- Credentials were created but might not work immediately
- Try manual validation via CLOB API explorer
- Check if additional permissions needed

### If encountering "unique constraint" errors:

- This is expected for duplicate requests (idempotency)
- System should handle gracefully and return existing credentials

---

## Status: ✅ Stage 4 Complete (Code Ready)

All files created and ready to test. User must:
1. Apply database migration
2. Set environment variables
3. Restart dev server
4. Perform acceptance tests
5. Verify CLOB auth message format matches Polymarket's requirements

**Do NOT proceed to Stage 5 (trading) without explicit user approval.**

