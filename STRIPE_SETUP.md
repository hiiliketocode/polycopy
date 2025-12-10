# Stripe Premium Subscription Setup Guide

This guide walks you through setting up the premium subscription feature for Polycopy.

## Overview

- **Free tier**: Discover traders, follow, manual copy tracking
- **Premium tier ($10/month)**: In-app trading, auto-tracked trades, notifications
- **Payment processor**: Stripe (source of truth for premium status)
- **Database**: Supabase (stores subscription metadata)

## Prerequisites

1. A Stripe account (sign up at https://stripe.com if you don't have one)
2. Access to your Supabase project dashboard
3. Access to your production environment variables

---

## Step 1: Database Migration

Run the migration to add premium columns to your users table:

### Option A: Via Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `supabase/migrations/009_add_premium_columns.sql`
4. Paste and run the SQL

### Option B: Via Supabase CLI
```bash
supabase db push
```

This will add:
- `stripe_customer_id` (TEXT) - Links user to Stripe customer
- `is_premium` (BOOLEAN) - Current premium status
- `premium_since` (TIMESTAMPTZ) - When user first subscribed

---

## Step 2: Create Stripe Product and Price

1. **Go to Stripe Dashboard**: https://dashboard.stripe.com

2. **Create a Product**:
   - Navigate to **Products** → **Add product**
   - Name: `Polycopy Pro` (or `Polycopy Premium`)
   - Description: `Premium subscription with in-app trading, auto-tracked trades, and notifications`

3. **Add Pricing**:
   - Click **Add pricing**
   - Price: `$10.00 USD`
   - Billing period: `Monthly`
   - Payment type: `Recurring`
   - Click **Save pricing**

4. **Copy the Price ID**:
   - After creating, you'll see a price ID like `price_1AbC2dEfGhIjKlMn`
   - **Save this for Step 4**

---

## Step 3: Set Up Stripe Webhook

Webhooks allow Stripe to notify your app about subscription events (payment success, cancellation, etc.)

### 3.1 Create Webhook Endpoint

1. Go to **Developers** → **Webhooks** in Stripe Dashboard
2. Click **Add endpoint**
3. **Endpoint URL**: 
   - Development: `https://your-dev-url.com/api/stripe/webhook`
   - Production: `https://polycopy.app/api/stripe/webhook`

4. **Events to listen for**:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`

5. Click **Add endpoint**

### 3.2 Get Webhook Signing Secret

After creating the endpoint:
1. Click on the webhook endpoint
2. Find **Signing secret** section
3. Click **Reveal** to see the secret (starts with `whsec_`)
4. **Save this for Step 4**

---

## Step 4: Environment Variables

Add these variables to your `.env.local` (development) and production environment:

```bash
# Stripe Keys (from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx  # Use sk_live_ in production
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx  # Use pk_live_ in production

# Stripe Webhook Secret (from Step 3.2)
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Stripe Price ID (from Step 2, step 4)
STRIPE_PRICE_ID=price_xxxxxxxxxxxxx

# Supabase Service Role Key (for webhook authentication)
# Get this from: Supabase Dashboard → Settings → API → service_role key
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxxxxxxxxxx

# These should already exist in your .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxxxxxxxxxx
```

### Where to Find Keys:

| Variable | Location |
|----------|----------|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API Keys → Secret key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API Keys → Publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → [Your endpoint] → Signing secret |
| `STRIPE_PRICE_ID` | Stripe Dashboard → Products → [Your product] → Price ID |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role |

---

## Step 5: Test the Integration

### 5.1 Local Testing with Stripe CLI (Optional)

To test webhooks locally:

```bash
# Install Stripe CLI
brew install stripe/stripe-brew/stripe

# Login to Stripe
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:3000/api/stripe/webhook

# This will give you a webhook signing secret (whsec_xxx)
# Use this in your .env.local as STRIPE_WEBHOOK_SECRET
```

### 5.2 Test Checkout Flow

1. Start your development server: `npm run dev`
2. Create a simple test button in your app (e.g., in `/app/profile/page.tsx`):

```tsx
'use client'
import { useUpgrade } from '@/hooks/useUpgrade'

export default function TestUpgrade() {
  const { upgrade, loading } = useUpgrade()
  
  return (
    <button onClick={upgrade} disabled={loading}>
      {loading ? 'Loading...' : 'Upgrade to Premium'}
    </button>
  )
}
```

3. Click the button
4. You should be redirected to Stripe Checkout
5. Use test card: `4242 4242 4242 4242` (any future date, any CVC)
6. Complete checkout
7. You should be redirected back to `/profile?upgrade=success`
8. Check your database - `is_premium` should now be `true`

### 5.3 Test Customer Portal

For premium users to manage their subscription:

```tsx
'use client'
import { useUpgrade } from '@/hooks/useUpgrade'

export default function ManageSubscription() {
  const { manageSubscription, loading } = useUpgrade()
  
  return (
    <button onClick={manageSubscription} disabled={loading}>
      {loading ? 'Loading...' : 'Manage Subscription'}
    </button>
  )
}
```

This lets users:
- Update payment method
- Cancel subscription
- View billing history

---

## Step 6: Production Deployment

### 6.1 Switch to Live Mode in Stripe

1. Toggle from **Test mode** to **Live mode** in Stripe Dashboard (top right)
2. Create a new product and price in Live mode (same as Step 2)
3. Create a new webhook in Live mode (same as Step 3)
4. Update your production environment variables with **live keys**:
   - `sk_live_xxxxx` instead of `sk_test_xxxxx`
   - `pk_live_xxxxx` instead of `pk_test_xxxxx`
   - New webhook secret from live webhook endpoint
   - New price ID from live product

### 6.2 Deploy to Production

1. Add environment variables to your hosting platform (Vercel, etc.)
2. Deploy your code
3. Test with real payment in live mode

---

## Usage in Your App

### Basic Upgrade Button

```tsx
'use client'
import { useUpgrade } from '@/hooks/useUpgrade'

export default function UpgradeButton() {
  const { upgrade, loading } = useUpgrade()
  
  return (
    <button 
      onClick={upgrade} 
      disabled={loading}
      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
    >
      {loading ? 'Loading...' : 'Upgrade to Premium - $10/month'}
    </button>
  )
}
```

### Checking Premium Status

```tsx
import { createClient } from '@/lib/supabase/server'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  const { data: profile } = await supabase
    .from('users')
    .select('is_premium, premium_since')
    .eq('id', user?.id)
    .single()
  
  if (profile?.is_premium) {
    return <div>You're a premium member! 🎉</div>
  }
  
  return <div>Upgrade to unlock premium features</div>
}
```

### Conditional Feature Access

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function PremiumFeaturePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }
  
  const { data: profile } = await supabase
    .from('users')
    .select('is_premium')
    .eq('id', user.id)
    .single()
  
  if (!profile?.is_premium) {
    redirect('/profile?upgrade=required')
  }
  
  return <div>Premium feature content here</div>
}
```

---

## Troubleshooting

### Webhook not firing?
- Check that the webhook URL is correct
- Verify the signing secret in your environment variables
- Check webhook logs in Stripe Dashboard → Developers → Webhooks → [endpoint] → Logs

### User not marked as premium after payment?
- Check webhook logs for errors
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set correctly
- Check Supabase logs for any database errors
- Ensure the `users` table has the new columns

### "No subscription found" error in portal?
- User must have completed checkout at least once
- Check if `stripe_customer_id` exists in database for that user

### Test mode vs Live mode confusion?
- Always check which mode you're in (toggle in top-right of Stripe Dashboard)
- Test mode uses `sk_test_` and `pk_test_` keys
- Live mode uses `sk_live_` and `pk_live_` keys
- They have separate products, prices, and webhooks

---

## Security Notes

1. **Never expose secret keys**: Only `STRIPE_PUBLISHABLE_KEY` should be in client-side code
2. **Webhook signature verification**: Always verify webhook signatures (already implemented)
3. **Service role key**: Only use in webhook handler, never in client-side code
4. **Always trust Stripe**: Never manually set `is_premium` - let webhooks handle it

---

## Next Steps

After setup is complete:
1. Add upgrade CTAs throughout your app
2. Gate premium features behind `is_premium` checks
3. Show premium status badge on user profiles
4. Add subscription management in user settings
5. Monitor webhook logs and failed payments in Stripe Dashboard

---

## Support

- **Stripe Documentation**: https://stripe.com/docs
- **Stripe Support**: https://support.stripe.com
- **Webhook Testing**: Use Stripe CLI for local development
- **Test Cards**: https://stripe.com/docs/testing

---

## API Routes Reference

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/stripe/checkout` | POST | Create checkout session |
| `/api/stripe/webhook` | POST | Handle Stripe webhook events |
| `/api/stripe/portal` | POST | Create customer portal session |

All routes are automatically available after deployment.
