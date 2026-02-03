# Subscription Tracking Implementation - Deployment Steps

## What We Built

We've implemented subscription tracking to accurately calculate MRR and distinguish between paying customers and promo code users.

### Database Changes
- Added 4 new columns to `profiles` table:
  - `stripe_subscription_id` - Stripe subscription ID (sub_xxx)
  - `subscription_amount` - Monthly charge in dollars (e.g., 0 for promo, 20 for regular)
  - `subscription_status` - Subscription status (active, trialing, canceled, etc.)
  - `subscription_currency` - Currency code (default: usd)

### Webhook Updates
- `checkout.session.completed` - Stores subscription details when user completes payment
- `customer.subscription.updated` - Updates subscription details on changes
- `customer.subscription.deleted` - Clears subscription data on cancellation

### Admin Dashboard Updates
- **MRR** - Now calculates actual revenue from `subscription_amount` (not premiumCount × $20)
- **Promo Users** - Shows count of premium users with $0 subscription

## Deployment Steps

### Step 1: Run the Database Migration

In Supabase SQL Editor, run:

```sql
-- Run this migration
\i supabase/migrations/20260203_add_subscription_tracking.sql
```

Or manually copy/paste the migration file contents into the SQL editor.

### Step 2: Backfill Existing User Data

This populates subscription data for your current 22 paying customers.

```bash
cd /Users/bradmichelson/Documents/Cursor/Polycopy/polycopy
source .env.local
node scripts/backfill-subscription-data.js
```

Expected output:
```
✅ Successfully updated: 22
⚠️  Skipped (no active subscription): 0
❌ Errors: 0

💰 CALCULATED MRR
Total MRR: $440.00/month
Paying users: 22
Promo users: 0
```

### Step 3: Verify

1. Check Supabase `profiles` table - `subscription_amount` should be populated
2. Deploy to production (already pushed to main)
3. Wait 2 minutes for deployment
4. Refresh admin dashboard at `/admin/users`

Expected dashboard:
- **Premium Subscribers**: 22
- **MRR**: $440.00 (actual revenue)
- **Promo Users**: 0 (will increase when promo codes are used)

## How It Works Going Forward

### New Premium User (Paying $20/month)
1. User completes Stripe checkout
2. Webhook receives `checkout.session.completed` with `payment_status: 'paid'`
3. Database updated:
   - `is_premium: true`
   - `subscription_amount: 20.00`
   - `subscription_status: 'active'`
4. Dashboard shows:
   - Premium Subscribers: +1
   - MRR: +$20

### New Premium User (Promo Code - Free Month)
1. User completes Stripe checkout with promo code
2. Webhook receives `checkout.session.completed` with `payment_status: 'paid'`
3. Database updated:
   - `is_premium: true`
   - `subscription_amount: 0.00` (promo reduces charge to $0)
   - `subscription_status: 'trialing'` or `'active'`
4. Dashboard shows:
   - Premium Subscribers: +1
   - Promo Users: +1
   - MRR: +$0 (no revenue yet)

### Promo User Converts to Paying
1. Free month expires, Stripe charges $20
2. Webhook receives `customer.subscription.updated`
3. Database updated:
   - `subscription_amount: 20.00` (updated from $0)
   - `subscription_status: 'active'`
4. Dashboard shows:
   - Promo Users: -1
   - MRR: +$20

## Troubleshooting

If MRR shows $0 after backfill:
```sql
-- Check if data was populated
SELECT email, subscription_amount, subscription_status
FROM profiles
WHERE is_premium = true AND is_admin = false;
```

If any users have `NULL` subscription_amount:
- Re-run the backfill script
- Or manually check their Stripe subscription and update

## Future Enhancements

When you add more subscription tiers:
- No code changes needed! 
- Webhook automatically tracks the correct amount
- MRR will reflect actual pricing automatically

## Questions?

- MRR = Sum of all `subscription_amount` for premium (non-admin) users
- Promo Users = Count of premium users with `subscription_amount = 0`
- Premium Subscribers = Total premium (non-admin) users (paying + promo)
