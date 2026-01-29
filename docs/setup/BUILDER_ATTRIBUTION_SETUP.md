# Polymarket Builder Attribution Setup

## Overview
This guide explains how to configure Polymarket builder attribution so all orders placed through Polycopy are properly credited to your builder account.

## Current Status
✅ Code implementation: **COMPLETE**  
⏳ Environment configuration: **PENDING** (needs credentials)

## What You Need

You need **3 credentials** from your Polymarket Builder Profile:
1. **Builder API Key**
2. **Builder Secret** 
3. **Builder Passphrase**

---

## Step 1: Get Your Builder Credentials

1. Go to: **https://polymarket.com/settings?tab=builder**
2. Navigate to the "Builder Keys" or "Builder API Keys" section
3. Click **"+ Create New"** to generate new credentials
4. Save the three values:
   - `key` (Builder API Key)
   - `secret` (Builder Secret)
   - `passphrase` (Builder Passphrase)

⚠️ **IMPORTANT**: Store these securely - the `secret` and `passphrase` are sensitive!

---

## Step 2: Add to Local Environment

Add to your `.env.local` file:

```bash
# Polymarket Builder Attribution Credentials
# Get these from: https://polymarket.com/settings?tab=builder
POLYMARKET_BUILDER_API_KEY="your_builder_api_key"
POLYMARKET_BUILDER_SECRET="your_builder_secret"
POLYMARKET_BUILDER_PASSPHRASE="your_builder_passphrase"
```

---

## Step 3: Add to Vercel Environment

1. Go to: **https://vercel.com/[your-team]/polycopy/settings/environment-variables**
2. Add three new environment variables:
   - Name: `POLYMARKET_BUILDER_API_KEY`, Value: `[your key]`
   - Name: `POLYMARKET_BUILDER_SECRET`, Value: `[your secret]`
   - Name: `POLYMARKET_BUILDER_PASSPHRASE`, Value: `[your passphrase]`
3. Make sure to select **all environments** (Production, Preview, Development)

---

## Step 4: Redeploy

After adding the environment variables to Vercel:

```bash
git commit --allow-empty -m "Trigger redeployment for builder credentials"
git push origin main
```

Or trigger a redeploy from the Vercel dashboard.

---

## Verification

Once deployed with credentials, you'll see in your server logs:

```
[CLOB] ✅ Builder attribution configured - orders will be attributed to Polycopy
```

Without credentials, you'll see:

```
[CLOB] Builder credentials not configured - orders will not be attributed
```

---

## How It Works

The implementation uses Polymarket's official `BuilderConfig` class with **local signing** (since all orders are placed server-side):

```typescript
const builderConfig = new BuilderConfig({
  localBuilderCreds: {
    key: process.env.POLYMARKET_BUILDER_API_KEY,
    secret: process.env.POLYMARKET_BUILDER_SECRET,
    passphrase: process.env.POLYMARKET_BUILDER_PASSPHRASE
  }
})

const client = new ClobClient(
  host, chainId, signer, creds, signatureType, funder,
  undefined, undefined,
  builderConfig  // ← This enables attribution!
)
```

The SDK automatically adds these headers to all order requests:
- `POLY_BUILDER_API_KEY`
- `POLY_BUILDER_SIGNATURE` (HMAC-SHA256)
- `POLY_BUILDER_TIMESTAMP`
- `POLY_BUILDER_PASSPHRASE`

---

## References

- [Polymarket Builder Attribution Docs](https://docs.polymarket.com/developers/builders/order-attribution)
- [Builder Profile Settings](https://polymarket.com/settings?tab=builder)
- [Code Examples](https://docs.polymarket.com/developers/builders/examples)

---

## Troubleshooting

**Problem**: Orders still not showing in builder profile  
**Solution**: Check Vercel deployment logs for the "Builder attribution configured" message. If missing, verify env vars are set correctly.

**Problem**: Getting authentication errors  
**Solution**: Verify your credentials are correct by regenerating them from the builder profile page.

**Problem**: Can't find builder settings  
**Solution**: Make sure you've signed up for the Polymarket Builders Program at polymarket.com
