# Environment Variables Setup Guide

## Critical: CLOB Encryption Keys

The `CLOB_ENCRYPTION_KEY` variables are used to encrypt Polymarket API credentials before storing them in the database. **If these keys change, all existing encrypted credentials become invalid.**

### Key Versions

The system supports multiple key versions for smooth rotation:
- `CLOB_ENCRYPTION_KEY` - Current/default key
- `CLOB_ENCRYPTION_KEY_V1` - First versioned key
- `CLOB_ENCRYPTION_KEY_V2` - Second versioned key

### For Production/Staging

**Never change these keys** unless you have a migration plan. If you must rotate keys:

1. Set the new key as `CLOB_ENCRYPTION_KEY_V2` (or next version)
2. Keep old keys (`V1`, `CLOB_ENCRYPTION_KEY`) active
3. Update code to use new key for new credentials
4. Plan a migration for existing users

### For Local Development

**Option A: Use Production Keys (Preferred for testing)**
1. Get the encryption keys from your production environment:
   ```bash
   flyctl secrets list
   ```
2. Add them to your local `.env` file
3. This allows you to use production database data locally

**Option B: Use Local Database (Preferred for development)**
1. Set up a local Supabase instance
2. Use your own `CLOB_ENCRYPTION_KEY` value
3. Connect your wallet fresh - credentials will be encrypted with your key
4. Never mix production data with local keys

### Common Issue: "bad decrypt" Error

If you see this error, it means:
- Your database has credentials encrypted with Key X
- Your environment is trying to decrypt with Key Y
- **They don't match!**

**Fix:**
1. Reconnect your wallet (generates new credentials with current key)
2. Or get the correct encryption key from production/staging

### Example .env Configuration

```bash
# Use strong random keys in production
# Generate with: openssl rand -hex 32
CLOB_ENCRYPTION_KEY=your-production-key-here
CLOB_ENCRYPTION_KEY_V1=your-v1-key-here
CLOB_ENCRYPTION_KEY_V2=your-v2-key-here

# Development only (never use in production)
# CLOB_ENCRYPTION_KEY=dev-key-change-in-production
```

### Security Best Practices

1. **Never commit encryption keys to git**
2. **Use different keys for each environment** (dev, staging, prod)
3. **Store keys securely** (password manager, secrets manager)
4. **Document key rotation procedures**
5. **Use key versioning for smooth transitions**

### Key Rotation Procedure (When Needed)

1. Generate new key: `openssl rand -hex 32`
2. Add as `CLOB_ENCRYPTION_KEY_V2` (or next version)
3. Update `lib/polymarket/authed-client.ts` to prefer new key
4. Deploy with both old and new keys active
5. Notify users to reconnect wallets
6. After 90 days, remove old key

### Troubleshooting

**Problem:** "bad decrypt" error
**Solution:** Either get the correct key or reconnect wallet

**Problem:** Some users work, others don't
**Solution:** Different users' credentials are encrypted with different key versions - ensure all key versions are in your environment

**Problem:** Fresh setup but getting decrypt errors
**Solution:** Your database has old data - either clear it or get the original encryption keys

## Environment Variables Template

See `.env.example` for a complete list of required environment variables.

For production deployment on Fly.io:
```bash
flyctl secrets set CLOB_ENCRYPTION_KEY="your-key-here"
flyctl secrets set CLOB_ENCRYPTION_KEY_V1="your-v1-key-here"
```

