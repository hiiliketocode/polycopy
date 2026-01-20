# Trade Execution Error Fix

## Date: January 4, 2026

## Issue Summary

When trying to execute a trade from the feed page on localhost with a premium account, users were receiving an error popup displaying "[object Object]" with no helpful information about what went wrong or how to fix it.

## Root Causes Identified

### 1. Error Display Bug
**Location:** `/app/trade-execute/page.tsx` (line 832)

**Problem:** The error handling code was directly passing `data?.error` to `setSubmitError()`, but when `data.error` was an object instead of a string, it would display as "[object Object]" instead of a meaningful message.

**Fix:** Added proper error extraction logic that:
- Checks if the error is a string or object
- Extracts meaningful messages from error objects
- Falls back to JSON.stringify for complex objects
- Maps common error types to user-friendly messages

### 2. Actual Backend Error - Encryption Key Mismatch
**Location:** Server logs / `/lib/polymarket/authed-client.ts`

**Error Message:** `error:1C800064:Provider routines::bad decrypt`

**Root Cause:** The `CLOB_ENCRYPTION_KEY` environment variable used to decrypt the stored Polymarket API credentials doesn't match the key that was used to encrypt them originally. This happens when:
- The encryption key was changed in environment variables
- The app was redeployed with a different key
- The user's credentials were encrypted with an old key

**Why This Matters:** Polymarket API credentials (API key, secret, passphrase) are encrypted before being stored in the database. When a trade is executed, these credentials must be decrypted to sign the order. If the decryption key doesn't match, the decryption fails with "bad decrypt" error.

### 3. Missing User Guidance
**Problem:** Even when errors displayed correctly, users weren't told what to do next.

**Fix:** Added comprehensive error guidance UI that:
- Shows clear error messages
- Provides step-by-step instructions based on error type
- Includes visual warning icons
- Has special handling for different error scenarios

## Changes Made

### File: `/app/trade-execute/page.tsx`

#### Change 1: Enhanced Error Extraction (lines ~825-865)
```typescript
if (!res.ok) {
  // Handle error - ensure it's a string, not an object
  let errorMessage = 'Trade execution failed'
  
  if (data?.error) {
    // If error is an object, try to extract a meaningful message
    if (typeof data.error === 'string') {
      errorMessage = data.error
    } else if (typeof data.error === 'object') {
      errorMessage = data.error.message || data.error.error || JSON.stringify(data.error)
    }
  } else if (data?.message) {
    errorMessage = data.message
  }
  
  // Add helpful context based on error type
  if (errorMessage.includes('bad decrypt') || errorMessage.includes('decrypt')) {
    errorMessage = 'API credentials are corrupted or invalid. Please reconnect your wallet in Profile settings and regenerate your Polymarket API credentials.'
  } else if (errorMessage.includes('No turnkey wallet') || errorMessage.includes('wallet not found')) {
    errorMessage = 'Trading wallet not connected. Please connect your wallet in your profile settings before executing trades.'
  } else if (errorMessage.includes('No Polymarket API credentials') || errorMessage.includes('L2 credentials')) {
    errorMessage = 'Polymarket credentials not set up. Please complete wallet setup in your profile to enable trading.'
  } else if (errorMessage.includes('Unauthorized')) {
    errorMessage = 'Session expired. Please log out and log back in to continue trading.'
  } else if (errorMessage.includes('balance') || errorMessage.includes('insufficient')) {
    errorMessage = 'Insufficient balance. Please add funds to your wallet or reduce the trade amount.'
  }
  
  setSubmitError(errorMessage)
  // ... rest of error handling
}
```

#### Change 2: Improved Network Error Handling (lines ~858-870)
```typescript
} catch (err: any) {
  let errorMessage = 'Network error - please check your connection and try again'
  
  if (err?.message) {
    if (typeof err.message === 'string') {
      errorMessage = err.message
    } else {
      errorMessage = JSON.stringify(err.message)
    }
  }
  
  setSubmitError(errorMessage)
}
```

#### Change 3: Enhanced Error Display UI (lines ~1387-1445)
Added a comprehensive error display component with:
- Warning icon
- Bold title
- Clear error message
- Contextual "What to do next" section with step-by-step instructions
- Special handling for decrypt errors
- Error codes and Ray IDs for debugging

## How to Fix for Users

### For the Decryption Error:

**Option 1: Reconnect Wallet (Recommended)**
1. Go to Profile page
2. Click "Disconnect Wallet" (if wallet is connected)
3. Click "Connect Wallet" and follow the setup wizard
4. This will regenerate new API credentials with the current encryption key
5. Try the trade again

**Option 2: Fix Environment Variable (For Admins)**
1. Locate the original `CLOB_ENCRYPTION_KEY` value
2. Update the environment variable to match the original key
3. Restart the application
4. Note: This is not recommended as it's better to use the current key and regenerate credentials

## Testing

To test the fix:

1. **Test Error Display:**
   - Try executing a trade (will fail with decrypt error)
   - Verify the error message displays properly (not "[object Object]")
   - Verify the "What to do next" instructions appear
   - Verify special decrypt error guidance shows

2. **Test Fix:**
   - Follow the instructions to disconnect/reconnect wallet
   - Complete the Polymarket setup
   - Try executing a trade again
   - Should work now with fresh credentials

## Prevention

To prevent this issue in the future:

1. **Never change `CLOB_ENCRYPTION_KEY` in production** without a migration plan
2. **Document the encryption key** securely for disaster recovery
3. **Consider adding a key rotation system** that can handle multiple key versions
4. **Add monitoring** for decryption failures
5. **Improve error messages** at the API level to catch this earlier

## Files Modified

- `/app/trade-execute/page.tsx` - Enhanced error handling and display

## Files to Review

- `/lib/polymarket/authed-client.ts` - Encryption/decryption logic
- `/lib/turnkey/config.ts` - Encryption key configuration
- `/app/api/polymarket/orders/place/route.ts` - Order placement API

## Additional Notes

The encryption key versioning system (v1, v2) exists in the codebase but may need to be leveraged better to handle key rotations gracefully. Consider adding a migration tool that can re-encrypt credentials with a new key when needed.

