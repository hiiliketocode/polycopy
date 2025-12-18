# Import User Credentials Setup - COMPLETE

## What Was Fixed

We were using the **wrong API credentials** for import operations. The system was trying to use generic org credentials, but Turnkey policies are tied to specific API keys.

## Solution Implemented

### 1. Added Import User API Credentials to `.env.local`

```env
# Import user identity (Turnkey user UUID)
TURNKEY_IMPORT_USER_ID=d97fd7dc-c039-4441-a9f9-ef8c129c153d

# Import user API keypair (used by backend for import endpoints)
TURNKEY_IMPORT_API_PUBLIC_KEY=02b9123ef7ea9a513bbd9f3d80758e2d8e226034829336dd0476b3abb7363f5c88
TURNKEY_IMPORT_API_PRIVATE_KEY=273d4e731776c46b667f8ab75b88da9b8983ab09571c84574d46fca1bce2963b
```

### 2. Updated Code to Use Import User Credentials

**File: `lib/turnkey/config.ts`**
- Exported `TURNKEY_IMPORT_API_PUBLIC_KEY`
- Exported `TURNKEY_IMPORT_API_PRIVATE_KEY`

**File: `lib/turnkey/import.ts`**
- Created `getImportTurnkeyClient()` function
- Uses Import User's API credentials specifically for import operations
- Updated `getImportBundle()` to use Import User client
- Updated `importEncryptedPrivateKey()` to use Import User client
- Enhanced debug logging to confirm correct API key is being used

### 3. Architecture

```
Before (Wrong):
  Import Operations → Generic Org API Key (02cd609aed...)
                   ↓
            Policy doesn't match ❌

After (Correct):
  Import Operations → Import User API Key (02b9123ef...)
                   ↓
            Policy matches ✅
```

## Key Insights

1. **Turnkey policies are tied to API keys**, not just users
2. The Import User (`d97fd7dc-c039-4441-a9f9-ef8c129c153d`) has their own API key
3. That API key (`02b9123ef...`) must be used for import operations
4. Policies grant permissions to the **API key performing the action**

## Debug Output Will Show

When you test the import now, you'll see:

```
[TURNKEY-IMPORT] Using Import User API credentials
[TURNKEY-POLICY-DEBUG] Auth method: API_KEY_AUTH (Import User credentials)
[TURNKEY-POLICY-DEBUG] API public key (first 20 chars): 02b9123ef7ea9a513bbd...
[TURNKEY-POLICY-DEBUG] Import User API key: ✅ CORRECT
[TURNKEY-IMPORT] Init activity status: ACTIVITY_STATUS_COMPLETED ✅
```

## Environment Variables Summary

### Org-Level (existing, for other operations)
```env
TURNKEY_API_PUBLIC_KEY=02cd609aed...  # Generic org API key
TURNKEY_API_PRIVATE_KEY=706fb4d1ac...
TURNKEY_ORGANIZATION_ID=a26b6b83-e1fd-44da-8176-99bd9b3de580
```

### Import-Specific (new, for import operations)
```env
TURNKEY_IMPORT_USER_ID=d97fd7dc-c039-4441-a9f9-ef8c129c153d
TURNKEY_IMPORT_API_PUBLIC_KEY=02b9123ef7ea...  # Import User's API key
TURNKEY_IMPORT_API_PRIVATE_KEY=273d4e731776...
```

## Testing

1. ✅ Server restarted with new credentials
2. ✅ Code updated to use Import User API key
3. ✅ Debug logging enhanced
4. 🧪 Ready to test!

### Test Steps
1. Go to http://localhost:3000/profile/connect-wallet
2. Paste Polymarket address (Stage 3)
3. Paste Magic Link private key
4. Click "Import to Turnkey"

### Expected Success
```
✅ No permission errors
✅ Init activity status: ACTIVITY_STATUS_COMPLETED
✅ Import bundle obtained
✅ Client encrypts private key
✅ Import succeeds
```

## Why This Works

The Turnkey policy you created grants permissions to the **Import User's API key**. By switching to use that specific API key, the policy now applies and allows the import operations.

## Files Modified

- ✅ `.env.local` - Added Import User credentials
- ✅ `lib/turnkey/config.ts` - Exported Import User API key vars
- ✅ `lib/turnkey/import.ts` - Created Import User client, updated all import functions
- ✅ Server restarted

## Status

- ✅ Configuration complete
- ✅ Code updated
- ✅ Server running
- 🎯 Ready for testing!

## Next Steps

Test the import flow - it should work now with the correct API credentials! 🚀

