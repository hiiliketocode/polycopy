# Enable Leaked Password Protection - January 10, 2025

## Issue
Supabase Auth's leaked password protection feature is currently **disabled**. This feature checks user passwords against the HaveIBeenPwned.org database of compromised passwords to prevent users from using passwords that have been exposed in data breaches.

## Security Risk
Without this protection:
- Users can set passwords that have been leaked in previous data breaches
- These compromised passwords are much more vulnerable to credential stuffing attacks
- Attackers can use lists of known compromised passwords to gain unauthorized access

## Solution
Enable leaked password protection in Supabase Auth settings.

## How to Enable

### Via Supabase Dashboard (Recommended)

1. **Go to your Supabase project dashboard**
   - Navigate to https://app.supabase.com
   - Select your Polycopy project

2. **Navigate to Authentication Settings**
   - Click on "Authentication" in the left sidebar
   - Click on "Policies" or "Settings"

3. **Enable Leaked Password Protection**
   - Look for "Password Security" or "Leaked Password Protection" section
   - Toggle on "Enable leaked password protection"
   - This will check passwords against HaveIBeenPwned.org

4. **Save Changes**
   - Click "Save" to apply the changes

### What This Does

When enabled, Supabase will:
- Check new passwords against HaveIBeenPwned.org's database of 600+ million compromised passwords
- Reject passwords that have been found in data breaches
- Force users to choose a different, safer password
- This check happens in real-time during:
  - User registration
  - Password changes
  - Password resets

### User Experience Impact

**For new users:**
- If they try to use a compromised password, they'll get an error message
- They'll be prompted to choose a different password
- This protects them from using weak/leaked credentials

**For existing users:**
- Existing passwords are NOT retroactively checked
- Only enforced when users change their password
- Consider sending a notification encouraging users to update weak passwords

### Privacy & Performance

**Privacy:**
- Supabase uses k-Anonymity when checking passwords
- Only a hash prefix is sent to HaveIBeenPwned
- The actual password is never transmitted
- HaveIBeenPwned cannot determine what password was checked

**Performance:**
- Adds minimal latency (~100-200ms) to password operations
- API calls are cached for performance
- Does not impact login performance (only password creation/changes)

## Additional Password Security Settings

While in the Authentication settings, also verify:

### 1. **Minimum Password Length**
   - Recommended: **12 characters minimum**
   - Current industry best practice
   - Located in Password Security settings

### 2. **Password Strength Requirements**
   - Enable character requirements if desired:
     - Uppercase letters
     - Lowercase letters
     - Numbers
     - Special characters
   - Note: Length is more important than complexity

### 3. **Maximum Password Length**
   - Default: 72 characters (bcrypt limit)
   - This is appropriate, don't change unless needed

### 4. **Password Reuse Prevention**
   - Consider enabling password history
   - Prevents users from reusing recent passwords
   - Recommended: Remember last 5-10 passwords

## Testing

After enabling, test that it works:

### 1. **Test with a known leaked password:**
```typescript
// Try to sign up with a commonly leaked password
const { data, error } = await supabase.auth.signUp({
  email: 'test@example.com',
  password: 'password123' // This SHOULD be rejected
})

// Expected error:
// "Password has been found in a data breach. Please choose a different password."
```

### 2. **Test with a strong password:**
```typescript
const { data, error } = await supabase.auth.signUp({
  email: 'test@example.com',
  password: 'xK9!mP2#vL8@nQ5$wR7' // This should be accepted
})

// Should succeed
```

## Migration Path for Existing Users

If you want to encourage existing users to update potentially weak passwords:

### Option 1: Gentle Encouragement (Recommended)
1. Add a banner to the app for users with old passwords
2. "For your security, please update your password"
3. Link to password change page
4. Don't force, but encourage

### Option 2: Forced Password Change
1. Add a flag to profiles table: `force_password_reset`
2. Set it for users who haven't changed passwords in 6+ months
3. Redirect to password change page on login
4. More disruptive but more secure

### Sample Query to Identify Old Passwords:
```sql
-- Find users who haven't changed password in 6 months
SELECT 
  u.id,
  u.email,
  u.last_sign_in_at,
  u.created_at
FROM auth.users u
WHERE 
  u.created_at < NOW() - INTERVAL '6 months'
  -- And other criteria for identifying potentially weak passwords
ORDER BY u.created_at ASC;
```

## Verification

After enabling, verify it's working:

1. **Check Auth Settings:**
   - Go to Supabase Dashboard > Authentication > Policies
   - Verify "Leaked Password Protection" shows as "Enabled"

2. **Test with your app:**
   - Try creating a new account with password "password123"
   - Should be rejected with appropriate error message

3. **Monitor logs:**
   - Check Supabase logs for password validation errors
   - Ensure error messages are user-friendly

## Related Security Improvements

While improving password security, also consider:

1. **Enable 2FA/MFA** - Add two-factor authentication
2. **Rate limit login attempts** - Prevent brute force attacks
3. **Session management** - Set appropriate session timeouts
4. **Email verification** - Require email verification for new accounts
5. **Account lockout** - Lock accounts after failed login attempts

## Documentation Links

- [Supabase Password Security Guide](https://supabase.com/docs/guides/auth/password-security)
- [HaveIBeenPwned API Documentation](https://haveibeenpwned.com/API/v3)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

## Timeline

- **Priority:** HIGH
- **Effort:** 5 minutes (just toggle in dashboard)
- **Impact:** Significantly improves security
- **Should be done:** IMMEDIATELY

---

**Status:** ⚠️ PENDING - Requires manual action in Supabase Dashboard
