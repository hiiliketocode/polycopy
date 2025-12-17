# Turnkey Dev Bypass Setup

Quick setup to test Turnkey without auth issues.

## Step 1: Get Your User ID

Visit this URL in your browser:
```
http://localhost:3000/api/turnkey/get-user-id?email=donraw@gmail.com
```

**Expected Response:**
```json
{
  "userId": "abc-123-def-456-ghi",
  "email": "donraw@gmail.com",
  "note": "Add this to .env as TURNKEY_DEV_BYPASS_USER_ID"
}
```

Copy the `userId` value.

## Step 2: Add to Environment Variables

Add these to your `.env` file (backend):

```bash
# Enable dev bypass mode
TURNKEY_DEV_ALLOW_UNAUTH=true
TURNKEY_DEV_BYPASS_USER_ID=abc-123-def-456-ghi  # Your user ID from Step 1

# Make sure these are still set
TURNKEY_ENABLED=true
TURNKEY_API_PUBLIC_KEY=your_key
TURNKEY_API_PRIVATE_KEY=your_key
TURNKEY_ORGANIZATION_ID=your_org_id
SUPABASE_SERVICE_ROLE_KEY=your_key
```

## Step 3: Restart Dev Server

```bash
# Stop the server (Ctrl+C)
# Then restart:
npm run dev
```

## Step 4: Test

Navigate to:
```
http://localhost:3000/profile/connect-wallet
```

Now the endpoints will work even without proper auth! The server will use the user ID from the environment variable.

## What This Does

- **DEV MODE ONLY**: Bypasses Supabase authentication
- If you're logged in, uses your session (normal behavior)
- If not logged in, uses `TURNKEY_DEV_BYPASS_USER_ID`
- Logs will show: `[Turnkey] DEV BYPASS: Using env user: abc-123...`

## ⚠️ Important

**NEVER use this in production!** This is only for local development and testing.

Remove these lines before deploying:
```bash
TURNKEY_DEV_ALLOW_UNAUTH=true
TURNKEY_DEV_BYPASS_USER_ID=...
```

## Testing the Endpoints

### Create Wallet
```bash
curl -X POST http://localhost:3000/api/turnkey/wallet/create
```

### Sign Message
```bash
curl -X POST http://localhost:3000/api/turnkey/sign-test \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello from Turnkey!"}'
```

Both should now work without authentication!


