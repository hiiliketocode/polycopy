# Turnkey Real User ID Fix

## Issue
```
Turnkey error 5: unable to find user <supabase_uuid> in organization <org_id>
```

## Root Cause
We incorrectly assumed `turnkeyUserId == supabase user_id`. That is **false**.

Turnkey requires a **real userId that exists in the Turnkey organization**. You cannot use arbitrary UUIDs or Supabase user IDs as Turnkey user IDs.

## Solution
Use a dedicated Turnkey user for import operations via environment variable.

## Changes Made

### 1. `lib/turnkey/config.ts`

Added new environment variable:
```typescript
// Turnkey import user ID - must be a real Turnkey user in your org
export const TURNKEY_IMPORT_USER_ID = process.env.TURNKEY_IMPORT_USER_ID
```

### 2. `app/api/turnkey/import/init/route.ts`

**Removed:** Supabase UUID → Turnkey userId mapping (incorrect)

**Added:** Real Turnkey user from environment:

```typescript
// Resolve Turnkey userId - must be a real Turnkey user in the org
if (!TURNKEY_IMPORT_USER_ID) {
  console.error('[TURNKEY-IMPORT] TURNKEY_IMPORT_USER_ID not set')
  return NextResponse.json(
    { 
      error: 'Server configuration error: TURNKEY_IMPORT_USER_ID must be set...'
    },
    { status: 500 }
  )
}

turnkeyUserId = TURNKEY_IMPORT_USER_ID
console.log('[TURNKEY-IMPORT] Using TURNKEY_IMPORT_USER_ID:', turnkeyUserId)
```

**Separated concerns:**
- `polyCopyUserId` - Supabase user (for database operations)
- `turnkeyUserId` - Real Turnkey user (for Turnkey API calls)

## Environment Setup

### Step 1: Find Your Turnkey User ID

#### Option A: Check Turnkey Dashboard
1. Go to https://app.turnkey.com
2. Navigate to your organization
3. Go to **Users** section
4. Find or create a user named "Import User" or similar
5. Copy the **User ID** (format: UUID)

#### Option B: Create a New User via API
```bash
curl -X POST https://api.turnkey.com/public/v1/submit/create_users \
  -H "Content-Type: application/json" \
  -H "X-Stamp: YOUR_API_STAMP" \
  -d '{
    "organizationId": "YOUR_ORG_ID",
    "parameters": {
      "users": [{
        "userName": "Import User",
        "apiKeys": [],
        "authenticators": []
      }]
    }
  }'
```

### Step 2: Set Environment Variable

#### Development (`.env.local`)
```env
# Turnkey import user (get from Turnkey dashboard)
TURNKEY_IMPORT_USER_ID=12345678-1234-1234-1234-123456789abc

# Optional: Dev bypass for testing without auth
TURNKEY_DEV_ALLOW_UNAUTH=true
TURNKEY_DEV_BYPASS_USER_ID=b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
```

#### Production (Vercel/Environment)
```bash
# Set in Vercel dashboard or via CLI
vercel env add TURNKEY_IMPORT_USER_ID production

# Or via CLI
export TURNKEY_IMPORT_USER_ID=12345678-1234-1234-1234-123456789abc
```

### Step 3: Restart Server
```bash
# Kill and restart dev server to load new env vars
npm run dev
```

## Architecture

### Before (Incorrect) ❌
```
PolyCopy User (Supabase UUID)
          ↓
     turnkeyUserId = supabaseUserId  ❌ WRONG
          ↓
   Turnkey API: "User not found"
```

### After (Correct) ✅
```
PolyCopy User (Supabase UUID) → Database operations
                    +
Turnkey Import User (from env) → Turnkey API calls
          ↓
   Turnkey API: ✅ Success
```

## User ID Resolution Logic

```typescript
// 1. Turnkey userId (for Turnkey API)
turnkeyUserId = TURNKEY_IMPORT_USER_ID  // From env (required)

// 2. PolyCopy userId (for database)
if (DEV_BYPASS) {
  polyCopyUserId = TURNKEY_DEV_BYPASS_USER_ID  // Dev testing
} else {
  polyCopyUserId = auth.user.id  // Real user from Supabase auth
}
```

## Security Notes

✅ **Single Import User** - All imports use one Turnkey user (shared across PolyCopy users)  
✅ **No User Confusion** - Separate IDs for PolyCopy users and Turnkey operations  
✅ **No Auth Bypass in Prod** - Real authentication required (dev bypass for local only)  
✅ **Clear Errors** - If `TURNKEY_IMPORT_USER_ID` not set, returns clear error message  

## Testing

### ✅ Test 1: Import Init Succeeds
**Setup:**
```env
TURNKEY_IMPORT_USER_ID=<real-turnkey-user-id>
```

**Test:**
1. Navigate to `/profile/connect-wallet`
2. Paste Polymarket address
3. Paste Magic Link private key
4. Click "Import to Turnkey"

**Expected:**
- ✅ No "unable to find user" error
- ✅ Returns 200 with import bundle
- ✅ Proceeds to encryption step

### ✅ Test 2: Missing Env Var
**Setup:**
```env
# TURNKEY_IMPORT_USER_ID not set
```

**Test:**
1. Try to import

**Expected:**
```json
{
  "error": "Server configuration error: TURNKEY_IMPORT_USER_ID must be set to a valid Turnkey user ID..."
}
```

### ✅ Test 3: Complete Import Flow
**Setup:**
```env
TURNKEY_IMPORT_USER_ID=<real-turnkey-user-id>
```

**Test:**
1. Complete full import flow
2. Check database

**Expected:**
- ✅ Import succeeds
- ✅ Database stores PolyCopy user_id (Supabase UUID)
- ✅ Turnkey stores private key under import user
- ✅ Multiple PolyCopy users can import (all use same Turnkey user)

## Server Logs

### Success
```
[TURNKEY-IMPORT] Import init request received
[TURNKEY-IMPORT] Using TURNKEY_IMPORT_USER_ID: 12345678-1234-1234-1234-123456789abc
[TURNKEY-IMPORT] Authenticated PolyCopy user_id: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
[TURNKEY-IMPORT] Getting import bundle
[TURNKEY-IMPORT] PolyCopy user_id: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
[TURNKEY-IMPORT] Turnkey userId: 12345678-1234-1234-1234-123456789abc
[TURNKEY-IMPORT] Init activity status: ACTIVITY_STATUS_COMPLETED
[TURNKEY-IMPORT] Import bundle obtained - status: 200
```

### Missing Config
```
[TURNKEY-IMPORT] Import init request received
[TURNKEY-IMPORT] TURNKEY_IMPORT_USER_ID not set
ERROR: Server configuration error
```

## FAQ

### Q: Can I use a different Turnkey user for each PolyCopy user?
**A:** Not necessary for MVP. Using a single "Import User" simplifies the architecture. The imported private keys are still securely isolated within Turnkey.

### Q: Where do I find my Turnkey user ID?
**A:** Turnkey Dashboard → Organization → Users → Select user → Copy User ID

### Q: What if I don't have a Turnkey user yet?
**A:** Create one in the Turnkey dashboard or via API. Give it a descriptive name like "Import User" or "PolyCopy Import Service User".

### Q: Can the import user be the same as my org admin?
**A:** Yes, but it's better security practice to use a dedicated service user with minimal permissions.

### Q: What happens to old imports with wrong user IDs?
**A:** They failed with "user not found" errors. After this fix, new imports will succeed with the real Turnkey user.

## Deployment Checklist

- [ ] Get Turnkey user ID from dashboard or create new user
- [ ] Set `TURNKEY_IMPORT_USER_ID` in `.env.local` (dev)
- [ ] Set `TURNKEY_IMPORT_USER_ID` in Vercel environment (production)
- [ ] Restart dev server to load new env var
- [ ] Test import flow end-to-end
- [ ] Verify no "user not found" errors
- [ ] Deploy to staging
- [ ] Test in staging with real Magic Link keys
- [ ] Deploy to production

## Related Files

- ✅ `lib/turnkey/config.ts` - Added `TURNKEY_IMPORT_USER_ID` export
- ✅ `app/api/turnkey/import/init/route.ts` - Uses real Turnkey user
- `lib/turnkey/import.ts` - No changes (accepts both user IDs)
- `app/profile/connect-wallet/page.tsx` - No changes (frontend)

## Rollback

If issues arise:
```bash
git revert HEAD
```

Or temporarily disable import:
```env
TURNKEY_UI_ENABLED=false
```

## References

- Turnkey Users API: https://docs.turnkey.com/api/users
- Turnkey Organizations: https://docs.turnkey.com/getting-started/organizations
- Previous Fix: `TURNKEY_USERID_FIX.md` (now superseded)

