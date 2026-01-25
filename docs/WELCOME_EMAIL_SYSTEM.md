# Welcome Email System

Sends onboarding emails to new users 2 hours after they sign up.

## Overview

- **Email Template**: `emails/WelcomeEmail.tsx`
- **Trigger**: 2 hours after account creation
- **Frequency**: Runs hourly via GitHub Actions
- **Content**: 5-step getting started guide + Premium upgrade CTA

## Components

### 1. Email Template (`emails/WelcomeEmail.tsx`)

Beautiful React email with:
- Numbered step-by-step onboarding guide
  1. Follow traders on Discover
  2. Check your Feed
  3. Find a trade you like
  4. Click "Copy" to open Polymarket
  5. Track your copy trades in Profile
- Premium upgrade section highlighting faster trading
- Links to FAQ and Setup Guide

### 2. Database Tracking

Migration: `supabase/migrations/20260125_add_welcome_email_tracking.sql`

New columns in `profiles` table:
- `welcome_email_sent` (BOOLEAN): Whether email was sent
- `welcome_email_sent_at` (TIMESTAMPTZ): When it was sent

Index for efficient querying:
```sql
CREATE INDEX idx_profiles_welcome_email_pending 
ON profiles (created_at, welcome_email_sent) 
WHERE welcome_email_sent = FALSE;
```

### 3. API Endpoint

**Endpoint**: `POST /api/cron/send-welcome-emails`

**Authentication**: Requires `Authorization: Bearer {CRON_SECRET}` header

**Logic**:
1. Finds users who:
   - Signed up ≥2 hours ago
   - Haven't received welcome email
   - Have valid email address
2. Sends email to each user (max 50 per run)
3. Marks as sent in database
4. Returns summary with success/error counts

### 4. Scheduled Task

**Vercel Cron**: Configured in `vercel.json`

- **Schedule**: Every hour at :00 (cron: `0 * * * *`)
- **Endpoint**: `/api/cron/send-welcome-emails`
- **Authentication**: Vercel automatically authenticates cron requests
- **Manual trigger**: Can also be called manually with `CRON_SECRET` header

**GitHub Actions Backup**: `.github/workflows/send-welcome-emails.yml` (optional)
- Calls the same API endpoint
- Useful if Vercel cron has issues

## Setup Instructions

### 1. Run Database Migration

```bash
# Via Supabase Dashboard (Recommended):
```

1. Go to your Supabase Dashboard → SQL Editor
2. Click "New query"
3. Paste the contents of `supabase/migrations/20260125_add_welcome_email_tracking.sql`
4. Click "Run" (or Cmd+Enter)
5. Verify success message

### 2. Deploy to Vercel

The cron job is already configured in `vercel.json` and will automatically start working once deployed:

```bash
git add .
git commit -m "Add welcome email system"
git push origin main
```

Vercel will automatically:
- Deploy the new API endpoint
- Register the hourly cron job
- Start running it every hour

### 3. Optional: Set CRON_SECRET for Manual Testing

If you want to manually trigger the endpoint (for testing), set a `CRON_SECRET`:

**Generate secret:**
```bash
openssl rand -base64 32
```

**Add to Vercel:**
1. Vercel Dashboard → Project Settings → Environment Variables
2. Add `CRON_SECRET` with your generated value
3. Apply to Production, Preview, Development

**Add to GitHub (if using GitHub Actions backup):**
1. GitHub repo → Settings → Secrets and variables → Actions
2. New repository secret: `CRON_SECRET`
3. Use the same value as Vercel

## Testing

### Test the Email Template

You can preview the email in development:

```bash
npm run dev
# Navigate to /api/test-welcome-email (if you create a test endpoint)
```

### Test the API Endpoint Manually

```bash
curl -X POST https://polycopy.app/api/cron/send-welcome-emails \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "message": "Welcome emails processed",
  "processed": 5,
  "success": 5,
  "errors": 0
}
```

### Test GitHub Actions Workflow

1. Go to GitHub → Actions tab
2. Click "Send Welcome Emails" workflow
3. Click "Run workflow" button
4. Select branch (main)
5. Click "Run workflow"

Check the logs to see the result.

### Create a Test User

To test the full flow:

1. Create a test account on your site
2. Update the `created_at` to be 2+ hours ago:
   ```sql
   UPDATE profiles 
   SET created_at = NOW() - INTERVAL '3 hours'
   WHERE email = 'test@example.com';
   ```
3. Wait for next hourly run OR manually trigger the workflow
4. Check email inbox

## Monitoring

### Check Email Status

```sql
-- Users who received welcome email
SELECT email, user_name, welcome_email_sent_at 
FROM profiles 
WHERE welcome_email_sent = TRUE
ORDER BY welcome_email_sent_at DESC
LIMIT 20;

-- Users pending welcome email
SELECT email, user_name, created_at,
       AGE(NOW(), created_at) as account_age
FROM profiles 
WHERE welcome_email_sent = FALSE
  AND created_at < NOW() - INTERVAL '2 hours'
ORDER BY created_at DESC;

-- Email send rate
SELECT 
  DATE_TRUNC('day', welcome_email_sent_at) as day,
  COUNT(*) as emails_sent
FROM profiles
WHERE welcome_email_sent = TRUE
  AND welcome_email_sent_at IS NOT NULL
GROUP BY day
ORDER BY day DESC;
```

### Check GitHub Actions Logs

1. Go to GitHub → Actions tab
2. Click on a workflow run
3. View logs for success/failure details

### Resend.com Dashboard

Check email delivery status:
1. Go to [Resend.com dashboard](https://resend.com)
2. View sent emails, opens, clicks
3. Check for bounces or spam reports

## Troubleshooting

### Emails not sending

**Check 1**: Verify CRON_SECRET is set
```bash
# In Vercel
vercel env ls

# Check GitHub secret exists
# Go to repo Settings → Secrets
```

**Check 2**: Check API endpoint works
```bash
# Test API directly
curl -X POST https://polycopy.app/api/cron/send-welcome-emails \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

**Check 3**: Check database
```sql
-- Are there users eligible for emails?
SELECT COUNT(*) 
FROM profiles 
WHERE welcome_email_sent = FALSE
  AND created_at < NOW() - INTERVAL '2 hours'
  AND email IS NOT NULL;
```

**Check 4**: Check Resend API key
- Verify `RESEND_API_KEY` is set in environment
- Check Resend dashboard for any API errors

### GitHub Actions not running

**Check 1**: Workflow file syntax
- Ensure `.github/workflows/send-welcome-emails.yml` is valid YAML
- Check for indentation errors

**Check 2**: Actions enabled
- Go to repo Settings → Actions → General
- Ensure "Allow all actions and reusable workflows" is selected

**Check 3**: Check workflow runs
- Go to Actions tab
- Look for failed runs
- Check error messages in logs

### Users report not receiving email

1. **Check spam folder**: Ask user to check spam
2. **Check email validity**: Verify email in `profiles` table
3. **Check send status**: 
   ```sql
   SELECT * FROM profiles WHERE email = 'user@example.com';
   ```
4. **Check Resend logs**: Search for email in Resend dashboard
5. **Resend manually**: Update `welcome_email_sent = FALSE` and wait for next cron run

## Configuration

### Change Delay Time

Edit `app/api/cron/send-welcome-emails/route.ts`:

```typescript
// Change from 2 hours to desired delay
const HOURS_DELAY = 2  // Change this value
```

### Change Frequency

Edit `.github/workflows/send-welcome-emails.yml`:

```yaml
schedule:
  - cron: '0 * * * *'  # Every hour
  # - cron: '*/30 * * * *'  # Every 30 minutes
  # - cron: '0 */2 * * *'  # Every 2 hours
```

### Batch Size

Edit `app/api/cron/send-welcome-emails/route.ts`:

```typescript
.limit(50)  // Change to process more/fewer users per run
```

## Email Content Updates

To update the email content, edit `emails/WelcomeEmail.tsx`:

1. Make changes to text, styling, or structure
2. Test locally if possible
3. Commit and deploy
4. New emails will use updated template immediately

No database changes needed for content updates.

## Cost Estimates

- **Resend.com**: Free tier includes 3,000 emails/month
- **GitHub Actions**: Free for public repos, 2,000 minutes/month for private
- **Hourly cron**: ~1 minute/month = minimal cost

Total: **$0/month** for most use cases

## Files Modified/Created

```
emails/
├── WelcomeEmail.tsx                          # NEW: Email template
└── index.ts                                  # MODIFIED: Export new template

app/api/cron/
└── send-welcome-emails/
    └── route.ts                              # NEW: API endpoint

.github/workflows/
└── send-welcome-emails.yml                   # NEW: Hourly cron job

supabase/migrations/
└── 20260125_add_welcome_email_tracking.sql   # NEW: Database migration

workers/
├── welcome-email-worker.js                   # NEW: Standalone worker (optional)
└── README.md                                 # UPDATED: Document new worker

fly.worker-welcome-email.toml                 # NEW: Fly.io config (if using Fly)
```

## Next Steps

1. ✅ Run database migration
2. ✅ Set `CRON_SECRET` in GitHub and Vercel
3. ✅ Deploy to production
4. ✅ Manually trigger workflow to test
5. ✅ Create test user to verify email
6. ✅ Monitor first few runs
7. ✅ Check email deliverability in Resend
8. 📊 Track open rates and engagement

## Support

Questions or issues? Check:
- API logs in Vercel dashboard
- GitHub Actions logs
- Resend.com delivery logs
- Supabase database queries above
