# Welcome Email System - Quick Setup Checklist

## ✅ What's Been Created

1. **Email Template**: `emails/WelcomeEmail.tsx`
   - Beautiful 5-step onboarding guide
   - Premium upgrade CTA
   - Links to FAQ and setup guide

2. **Database Migration**: `supabase/migrations/20260125_add_welcome_email_tracking.sql`
   - Adds `welcome_email_sent` and `welcome_email_sent_at` columns
   - Creates index for efficient querying

3. **API Endpoint**: `app/api/cron/send-welcome-emails/route.ts`
   - Sends emails to users who signed up 2+ hours ago
   - Processes up to 50 users per run
   - Marks emails as sent in database

4. **Cron Configuration**: `vercel.json`
   - Runs every hour at :00 minutes
   - Automatically authenticated by Vercel

5. **Documentation**: `docs/WELCOME_EMAIL_SYSTEM.md`
   - Complete setup and troubleshooting guide

6. **GitHub Actions Backup**: `.github/workflows/send-welcome-emails.yml`
   - Optional backup if Vercel cron fails

## 🚀 Setup Steps (Do These Next)

### Step 1: Run Database Migration

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Click **"New query"**
3. Copy and paste from: `supabase/migrations/20260125_add_welcome_email_tracking.sql`
4. Click **"Run"**
5. ✅ Should see success message

### Step 2: Deploy to Production

```bash
git add .
git commit -m "Add welcome email system for new user onboarding"
git push origin main
```

That's it! Vercel will automatically:
- Deploy the new code
- Register the cron job
- Start running it hourly

### Step 3: Verify It's Working (After 1 Hour)

Check Vercel logs:
1. Go to **Vercel Dashboard** → **Deployments** → Latest deployment
2. Click **"Functions"** tab
3. Find `/api/cron/send-welcome-emails`
4. Check logs for successful runs

Or check in Supabase:
```sql
SELECT email, welcome_email_sent, welcome_email_sent_at 
FROM profiles 
WHERE welcome_email_sent = TRUE
ORDER BY welcome_email_sent_at DESC;
```

## 📧 How It Works

1. **New user signs up** → Profile created with `welcome_email_sent = FALSE`
2. **2 hours pass** → User becomes eligible
3. **Cron runs (hourly)** → Finds eligible users
4. **Email sent** → Beautiful onboarding guide
5. **Database updated** → `welcome_email_sent = TRUE`

## 🧪 Testing

### Option 1: Create Test User and Fast-Forward Time

```sql
-- After creating a test account, run this:
UPDATE profiles 
SET created_at = NOW() - INTERVAL '3 hours'
WHERE email = 'your-test@email.com';
```

Then wait for the next hour (or manually trigger the endpoint).

### Option 2: Manually Trigger Endpoint (Requires CRON_SECRET)

```bash
curl -X POST https://polycopy.app/api/cron/send-welcome-emails \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## ⚠️ Important Notes

- **No CRON_SECRET required** for Vercel cron to work (it's automatic)
- **CRON_SECRET is optional** - only needed if you want to manually test the endpoint
- **Rate limits**: Processes max 50 users per hour (100ms delay between emails)
- **Free tier**: Resend.com includes 3,000 emails/month (plenty for most apps)
- **Duplicate prevention**: `welcome_email_sent` flag prevents sending twice

## 📊 What to Monitor

First 24 hours:
1. Check a few users received emails
2. Verify emails aren't going to spam
3. Check Resend dashboard for delivery rates
4. Look for any errors in Vercel logs

First week:
1. Monitor open rates in Resend
2. Check if users are following the steps
3. Adjust content if needed (no database changes required)

## 🎯 Expected Results

With this system, every new user will:
- ✅ Get a professional welcome email 2 hours after signup
- ✅ See clear steps to get started with Polycopy
- ✅ Learn about Premium features
- ✅ Feel guided and supported

## Need Help?

See full documentation: `docs/WELCOME_EMAIL_SYSTEM.md`
