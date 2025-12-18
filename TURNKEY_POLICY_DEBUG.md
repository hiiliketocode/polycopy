# Turnkey Policy Debug Logging

## Purpose
Debug logging to identify which Turnkey user and API credentials are executing `initImportPrivateKey`.

## Added Logs

### 1. API Endpoint Level (`app/api/turnkey/import/init/route.ts`)

```
[TURNKEY-POLICY-DEBUG] ==================== API ENDPOINT DEBUG ====================
[TURNKEY-POLICY-DEBUG] PolyCopy user_id: <supabase-uuid>
[TURNKEY-POLICY-DEBUG] Turnkey userId to be sent: <turnkey-user-id>
[TURNKEY-POLICY-DEBUG] TURNKEY_IMPORT_USER_ID from env: <env-var-value>
[TURNKEY-POLICY-DEBUG] Auth type: API_KEY_AUTH (using org API key)
[TURNKEY-POLICY-DEBUG] ================================================================
```

**Shows:**
- Which PolyCopy user is making the request
- Which Turnkey userId will be sent to the API
- What value is in the environment variable
- That we're using API key authentication (not iframe stamper)

### 2. Import Function Level (`lib/turnkey/import.ts`)

```
[TURNKEY-POLICY-DEBUG] ==================== INIT IMPORT REQUEST ====================
[TURNKEY-POLICY-DEBUG] organizationId: <org-id>
[TURNKEY-POLICY-DEBUG] turnkeyUserId (in parameters): <user-id>
[TURNKEY-POLICY-DEBUG] Auth method: API_KEY_AUTH
[TURNKEY-POLICY-DEBUG] API public key (first 20 chars): 02cd609aed2646086f1d...
[TURNKEY-POLICY-DEBUG] ================================================================
[TURNKEY-IMPORT] Init activity status: ACTIVITY_STATUS_COMPLETED
[TURNKEY-POLICY-DEBUG] Response activity status: ACTIVITY_STATUS_COMPLETED
[TURNKEY-POLICY-DEBUG] Import bundle successfully obtained
```

**Shows:**
- The exact organizationId being sent to Turnkey
- The exact userId parameter being sent in the request
- Confirmation of API_KEY_AUTH (vs IFRAME_STAMPER)
- First 20 chars of the API public key (for identification without exposing full key)
- Response status from Turnkey

## Expected Output

When you test the import flow, you'll see logs like this:

```
[TURNKEY-IMPORT] Import init request received
[TURNKEY-IMPORT] Using TURNKEY_IMPORT_USER_ID: d97fd7dc-c039-4441-a9f9-ef8c129c153d
[TURNKEY-IMPORT] Authenticated PolyCopy user_id: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d

[TURNKEY-POLICY-DEBUG] ==================== API ENDPOINT DEBUG ====================
[TURNKEY-POLICY-DEBUG] PolyCopy user_id: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
[TURNKEY-POLICY-DEBUG] Turnkey userId to be sent: d97fd7dc-c039-4441-a9f9-ef8c129c153d
[TURNKEY-POLICY-DEBUG] TURNKEY_IMPORT_USER_ID from env: d97fd7dc-c039-4441-a9f9-ef8c129c153d
[TURNKEY-POLICY-DEBUG] Auth type: API_KEY_AUTH (using org API key)
[TURNKEY-POLICY-DEBUG] ================================================================

[TURNKEY-IMPORT] Getting import bundle
[TURNKEY-IMPORT] PolyCopy user_id: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
[TURNKEY-IMPORT] Turnkey userId: d97fd7dc-c039-4441-a9f9-ef8c129c153d

[TURNKEY-POLICY-DEBUG] ==================== INIT IMPORT REQUEST ====================
[TURNKEY-POLICY-DEBUG] organizationId: a26b6b83-e1fd-44da-8176-99bd9b3de580
[TURNKEY-POLICY-DEBUG] turnkeyUserId (in parameters): d97fd7dc-c039-4441-a9f9-ef8c129c153d
[TURNKEY-POLICY-DEBUG] Auth method: API_KEY_AUTH
[TURNKEY-POLICY-DEBUG] API public key (first 20 chars): 02cd609aed2646086f1d...
[TURNKEY-POLICY-DEBUG] ================================================================

[TURNKEY-IMPORT] Init activity status: ACTIVITY_STATUS_COMPLETED
[TURNKEY-POLICY-DEBUG] Response activity status: ACTIVITY_STATUS_COMPLETED
[TURNKEY-IMPORT] Import bundle obtained successfully
[TURNKEY-POLICY-DEBUG] Import bundle successfully obtained
[TURNKEY-IMPORT] Import bundle obtained - status: 200
```

## What to Look For

### ✅ Success Indicators
- `turnkeyUserId` matches `TURNKEY_IMPORT_USER_ID` from env
- `Auth method: API_KEY_AUTH` (using org credentials)
- `Response activity status: ACTIVITY_STATUS_COMPLETED`
- No "unable to find user" errors

### ❌ Problem Indicators
- `turnkeyUserId` is a Supabase UUID (wrong)
- `turnkeyUserId` doesn't match the env var
- Error: "unable to find user X in organization Y"
- Status other than `ACTIVITY_STATUS_COMPLETED`

## Authentication Types

### API_KEY_AUTH (Current Implementation)
- Uses organization API key and secret
- Authenticates as the organization
- Can act on behalf of any user in the org
- Used in our implementation via `getTurnkeyClient()`

### IFRAME_STAMPER (Not Used)
- Uses iframe with user authentication
- User signs in with passkey/authenticator
- Can only act as that specific authenticated user
- We removed this approach in favor of API_KEY_AUTH

## Security Notes

✅ **No secrets logged** - Only first 20 chars of public key (public anyway)  
✅ **Clear identification** - Shows exactly which user is performing the action  
✅ **Auth method visibility** - Confirms we're using org API key auth  
✅ **Request/response tracing** - Full visibility into the API call flow  

## Removing Debug Logs

When done debugging, search for `[TURNKEY-POLICY-DEBUG]` and remove those log statements:

```bash
grep -r "TURNKEY-POLICY-DEBUG" app/ lib/
```

## Files Modified

- ✅ `lib/turnkey/import.ts` - Added debug logs before Turnkey API call
- ✅ `app/api/turnkey/import/init/route.ts` - Added debug logs at endpoint level

## Related Documentation

- `TURNKEY_REAL_USER_FIX.md` - How we fixed the user ID issue
- `CLIENT_SIDE_ENCRYPTION_MVP.md` - Overall import architecture

