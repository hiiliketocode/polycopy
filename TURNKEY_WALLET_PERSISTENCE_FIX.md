# Turnkey Wallet Persistence Fix

## Issue
- `turnkey_wallets` rows had empty `turnkey_private_key_id` and `polymarket_account_address`
- `unique(user_id)` constraint blocked multiple wallets per user
- Import flow wasn't properly storing all required fields

## Solution Implemented

### 1. Database Migration (`018_update_turnkey_wallets_constraints.sql`)

**Dropped:**
- `turnkey_wallets_user_id_key` unique constraint on `user_id`

**Added:**
- Unique index on `(user_id, polymarket_account_address, wallet_type)`
- Only applies WHERE `polymarket_account_address != ''`

**Benefits:**
- ✅ Users can have multiple wallets (different accounts or types)
- ✅ Same wallet can't be imported twice (idempotent)
- ✅ Future-proof for different wallet types

### 2. Updated Import Function (`lib/turnkey/import.ts`)

#### Changed Idempotency Check
**Before:**
```typescript
.eq('user_id', userId)
.eq('wallet_type', 'imported_magic')
// Blocked any second wallet import
```

**After:**
```typescript
.eq('user_id', userId)
.eq('polymarket_account_address', polymarketAccountAddress)
.eq('wallet_type', 'imported_magic')
// Only blocks duplicate of same account
```

#### Changed INSERT to UPSERT
**Before:**
```typescript
.insert({...})
// Failed on duplicate, required race condition handling
```

**After:**
```typescript
.upsert(
  {
    user_id: userId,
    polymarket_account_address: polymarketAccountAddress,
    wallet_type: 'imported_magic',
    turnkey_wallet_id: privateKeyId,
    turnkey_sub_org_id: 'N/A',
    turnkey_private_key_id: privateKeyId,
    eoa_address: primaryAddress,
  },
  {
    onConflict: 'user_id,polymarket_account_address,wallet_type',
    ignoreDuplicates: false,
  }
)
// Updates existing row on conflict, ensures all fields populated
```

#### Enhanced Logging
```typescript
console.log('[TURNKEY-IMPORT] Polymarket account address:', polymarketAccountAddress)
console.log('[TURNKEY-IMPORT] EOA Address:', primaryAddress)
console.log('[TURNKEY-IMPORT] Database row ID:', upsertedData?.id)
```

### 3. Private Key Naming
**Updated format:**
```typescript
`imported-magic-${userId}-${polymarketAccountAddress.slice(0, 8)}-${Date.now()}`
```

Includes account address prefix to make debugging easier.

## Files Modified

1. ✅ `supabase/migrations/018_update_turnkey_wallets_constraints.sql` - New migration
2. ✅ `lib/turnkey/import.ts` - Updated import logic:
   - Line ~185: Changed idempotency check to include `polymarket_account_address`
   - Line ~204: Updated private key naming to include account prefix
   - Line ~248: Changed INSERT to UPSERT with proper conflict resolution

## Database Schema

### Before
```sql
turnkey_wallets (
  ...
  UNIQUE(user_id)  -- Blocked multiple wallets ❌
)
```

### After
```sql
turnkey_wallets (
  ...
  -- No user_id unique constraint ✅
)

-- New unique index
CREATE UNIQUE INDEX turnkey_wallets_user_account_type_unique
  ON turnkey_wallets(user_id, polymarket_account_address, wallet_type)
  WHERE polymarket_account_address != '';
```

## Acceptance Tests

### Test 1: Non-Empty Fields
**After import, database row contains:**
- ✅ `polymarket_account_address` = user input from Stage 3
- ✅ `turnkey_private_key_id` = returned from Turnkey import
- ✅ `eoa_address` = derived EOA address
- ✅ `wallet_type` = 'imported_magic'

**How to verify:**
```sql
SELECT 
  user_id,
  polymarket_account_address,
  turnkey_private_key_id,
  eoa_address,
  wallet_type
FROM turnkey_wallets
WHERE wallet_type = 'imported_magic'
ORDER BY created_at DESC
LIMIT 1;
```

**Expected:** All fields non-empty except `turnkey_sub_org_id` (which is 'N/A')

### Test 2: Private Key ID Usable
**The stored `turnkey_private_key_id` must:**
- ✅ Match the ID returned by Turnkey
- ✅ Be usable for signing operations
- ✅ Reference the correct imported private key

**How to verify:**
```typescript
// Should work with stored privateKeyId
await turnkeyClient.signRawPayload({
  privateKeyId: stored_turnkey_private_key_id,
  payload: '...',
})
```

### Test 3: Multiple Wallets Per User
**User can create:**
- ✅ Multiple wallets with different `polymarket_account_address`
- ✅ Multiple wallets with different `wallet_type` (future)
- ❌ Cannot create duplicate of same `(user_id, polymarket_account_address, wallet_type)`

**How to test:**
1. Import wallet for account A → Success
2. Import different wallet for account B → Success ✅
3. Re-import same wallet for account A → Returns existing (idempotent) ✅
4. Try to manually insert duplicate → Blocked by unique index ✅

## Migration Instructions

### Development
```bash
# Run migration locally
supabase migration up
```

### Production
```bash
# Apply via Supabase dashboard or CLI
supabase db push
```

**Note:** Migration is safe to run - uses `IF EXISTS` and `IF NOT EXISTS` clauses.

## Rollback Plan

If issues arise, rollback migration:

```sql
-- Restore old constraint
ALTER TABLE turnkey_wallets 
  ADD CONSTRAINT turnkey_wallets_user_id_key UNIQUE (user_id);

-- Drop new index
DROP INDEX IF EXISTS turnkey_wallets_user_account_type_unique;
```

**Warning:** Rollback will fail if users already have multiple wallets.

## Benefits

### Immediate
- ✅ All fields properly populated in database
- ✅ Idempotent imports work correctly
- ✅ UPSERT prevents race conditions

### Future-Proof
- ✅ Users can import multiple Polymarket accounts
- ✅ Support for different wallet types (Turnkey-managed, imported, etc.)
- ✅ Clear unique constraint based on business logic

## Next Steps

1. ✅ Run migration in development
2. ✅ Test import flow
3. ✅ Verify database row has all fields populated
4. ✅ Test re-import (should be idempotent)
5. Deploy to production

## Related Documentation

- Database schema: `supabase/migrations/015_create_turnkey_tables.sql`
- Import flow: `CLIENT_SIDE_ENCRYPTION_MVP.md`
- Import user setup: `IMPORT_USER_CREDENTIALS_SETUP.md`

