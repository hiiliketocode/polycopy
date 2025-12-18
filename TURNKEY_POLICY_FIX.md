# Turnkey Policy Permission Fix

## Issue
```
Turnkey error 7: You don't have sufficient permissions to take this action.
Message: "No policies evaluated to outcome: Allow"
```

## Root Cause
The Turnkey user `d97fd7dc-c039-4441-a9f9-ef8c129c153d` (Import User) doesn't have a **policy** granting permission to execute `initImportPrivateKey`.

## Debug Output Confirmed
```
[TURNKEY-POLICY-DEBUG] organizationId: a26b6b83-e1fd-44da-8176-99bd9b3de580
[TURNKEY-POLICY-DEBUG] turnkeyUserId (in parameters): d97fd7dc-c039-4441-a9f9-ef8c129c153d
[TURNKEY-POLICY-DEBUG] Auth method: API_KEY_AUTH
```

All correct - just missing the policy!

## Solution: Create Turnkey Policy

### Option A: Via Turnkey Dashboard (Easiest)

1. **Go to Turnkey Dashboard**
   - Visit: https://app.turnkey.com
   - Navigate to your organization: `a26b6b83-e1fd-44da-8176-99bd9b3de580`

2. **Go to Policies Section**
   - Click **"Policies"** in the sidebar
   - Click **"Create Policy"** or **"New Policy"**

3. **Create Import Policy**
   ```
   Policy Name: Allow Import Private Key
   
   Effect: Allow
   
   Resources: 
   - User: d97fd7dc-c039-4441-a9f9-ef8c129c153d
   
   Actions:
   - ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY
   - ACTIVITY_TYPE_IMPORT_PRIVATE_KEY
   
   Condition: None (or "All requests")
   ```

4. **Save and Activate**
   - Click "Create" or "Save"
   - Ensure policy is **Active** (not disabled)

### Option B: Via Turnkey API

Use your API credentials to create the policy:

```bash
curl -X POST https://api.turnkey.com/public/v1/submit/create_policy \
  -H "Content-Type: application/json" \
  -H "X-Stamp-Webauthn: YOUR_API_STAMP" \
  -d '{
    "type": "ACTIVITY_TYPE_CREATE_POLICY",
    "timestampMs": "'$(date +%s000)'",
    "organizationId": "a26b6b83-e1fd-44da-8176-99bd9b3de580",
    "parameters": {
      "policyName": "Allow Import Private Key",
      "effect": "EFFECT_ALLOW",
      "consensus": "approvers.any(user, user.id == \"d97fd7dc-c039-4441-a9f9-ef8c129c153d\")",
      "condition": "activity.type == \"ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY\" || activity.type == \"ACTIVITY_TYPE_IMPORT_PRIVATE_KEY\""
    }
  }'
```

### Option C: Grant Broader Permissions (More Permissive)

If the Import User should have admin-like permissions for import operations:

```
Policy Name: Import User - Full Import Permissions

Effect: Allow

Resources:
- User: d97fd7dc-c039-4441-a9f9-ef8c129c153d

Actions:
- ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY
- ACTIVITY_TYPE_IMPORT_PRIVATE_KEY
- ACTIVITY_TYPE_CREATE_PRIVATE_KEYS (if needed)
- ACTIVITY_TYPE_LIST_PRIVATE_KEYS (if needed)

Condition: All requests
```

## What the Policy Does

Turnkey uses **policy-based access control**. Every action requires a policy that:
1. ✅ **Effect**: Allow (not Deny)
2. ✅ **Resources**: Applies to the user performing the action
3. ✅ **Actions**: Includes the specific activity type
4. ✅ **Condition**: Evaluates to true for the request

Without a matching policy, all requests are **denied by default**.

## Why This Happened

The "Import User" was created, but no policy was attached to grant it permissions. Think of it like:
- ✅ User account created (exists in Turnkey)
- ❌ No permissions assigned (can't do anything)

## Testing After Fix

After creating the policy:

1. **Wait 5-10 seconds** for policy to propagate
2. **Retry the import** in your app
3. **Check logs** for success:

```
[TURNKEY-POLICY-DEBUG] organizationId: a26b6b83-e1fd-44da-8176-99bd9b3de580
[TURNKEY-POLICY-DEBUG] turnkeyUserId (in parameters): d97fd7dc-c039-4441-a9f9-ef8c129c153d
[TURNKEY-IMPORT] Init activity status: ACTIVITY_STATUS_COMPLETED ✅
[TURNKEY-POLICY-DEBUG] Import bundle successfully obtained ✅
```

## Common Policy Patterns

### Minimal (Just Import)
```
Actions:
- ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY
- ACTIVITY_TYPE_IMPORT_PRIVATE_KEY
```

### Standard (Import + Basic Key Management)
```
Actions:
- ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY
- ACTIVITY_TYPE_IMPORT_PRIVATE_KEY
- ACTIVITY_TYPE_LIST_PRIVATE_KEYS
- ACTIVITY_TYPE_GET_PRIVATE_KEY
```

### Full (Import + Sign)
```
Actions:
- ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY
- ACTIVITY_TYPE_IMPORT_PRIVATE_KEY
- ACTIVITY_TYPE_LIST_PRIVATE_KEYS
- ACTIVITY_TYPE_GET_PRIVATE_KEY
- ACTIVITY_TYPE_SIGN_RAW_PAYLOAD
- ACTIVITY_TYPE_SIGN_TRANSACTION
```

## Troubleshooting

### Policy Not Working After Creation

1. **Check policy is Active** (not disabled)
2. **Verify user ID matches exactly**: `d97fd7dc-c039-4441-a9f9-ef8c129c153d`
3. **Wait 10 seconds** for policy cache to refresh
4. **Check condition syntax** if using custom conditions

### Still Getting Permission Errors

1. **List all policies** in dashboard
2. **Check for deny policies** that might override
3. **Verify organization ID** matches: `a26b6b83-e1fd-44da-8176-99bd9b3de580`
4. **Check API key permissions** - the API key itself must have permission to act on behalf of users

### Alternative: Use API Key Directly

If you have trouble with user policies, you can use the API key itself to import:

1. Create a policy for the **API key** (not the user)
2. Update code to not specify userId in initImportPrivateKey
3. This is less granular but simpler for MVP

## Expected Success Output

After policy is added:

```
[TURNKEY-IMPORT] Import init request received
[TURNKEY-IMPORT] Using TURNKEY_IMPORT_USER_ID: d97fd7dc-c039-4441-a9f9-ef8c129c153d

[TURNKEY-POLICY-DEBUG] ==================== API ENDPOINT DEBUG ====================
[TURNKEY-POLICY-DEBUG] PolyCopy user_id: b2ec6399-abcf-4b12-bb16-2f55d0e8a29d
[TURNKEY-POLICY-DEBUG] Turnkey userId to be sent: d97fd7dc-c039-4441-a9f9-ef8c129c153d
[TURNKEY-POLICY-DEBUG] Auth type: API_KEY_AUTH
[TURNKEY-POLICY-DEBUG] ================================================================

[TURNKEY-POLICY-DEBUG] ==================== INIT IMPORT REQUEST ====================
[TURNKEY-POLICY-DEBUG] organizationId: a26b6b83-e1fd-44da-8176-99bd9b3de580
[TURNKEY-POLICY-DEBUG] turnkeyUserId (in parameters): d97fd7dc-c039-4441-a9f9-ef8c129c153d
[TURNKEY-POLICY-DEBUG] Auth method: API_KEY_AUTH
[TURNKEY-POLICY-DEBUG] ================================================================

[TURNKEY-IMPORT] Init activity status: ACTIVITY_STATUS_COMPLETED ✅
[TURNKEY-POLICY-DEBUG] Response activity status: ACTIVITY_STATUS_COMPLETED ✅
[TURNKEY-POLICY-DEBUG] Import bundle successfully obtained ✅
[TURNKEY-IMPORT] Import bundle obtained - status: 200 ✅
```

## References

- Turnkey Policies Quickstart: https://docs.turnkey.com/concepts/policies/quickstart
- Turnkey Policy Engine: https://docs.turnkey.com/concepts/policies/overview
- Activity Types Reference: https://docs.turnkey.com/api-reference/activities
- Policy Examples: https://docs.turnkey.com/concepts/policies/examples

## Next Steps

1. ✅ Go to Turnkey dashboard
2. ✅ Create policy for user `d97fd7dc-c039-4441-a9f9-ef8c129c153d`
3. ✅ Grant `ACTIVITY_TYPE_INIT_IMPORT_PRIVATE_KEY` permission
4. ✅ Grant `ACTIVITY_TYPE_IMPORT_PRIVATE_KEY` permission
5. ✅ Save and activate policy
6. ✅ Wait 10 seconds
7. ✅ Retry import in your app
8. ✅ Verify success in logs

## Status

- ✅ Code is correct
- ✅ User ID is correct
- ✅ Organization ID is correct
- ✅ API credentials are configured
- ❌ **Missing: Turnkey policy granting permissions**

Once the policy is added, everything will work! 🎯

