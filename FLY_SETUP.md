# Quick Start: Fly.io Setup for Public Trade Sync Cron

**⚠️ DEPRECATED: See `workers/README.md` for the current worker system implementation.**

This document described the old cron-based approach. The new system uses always-on workers.

---

## Old Documentation (Deprecated)

# Quick Start: Fly.io Setup for Public Trade Sync Cron

## Option 1: GitHub Actions (Recommended - Free & Simple)

1. **Set GitHub Secrets** (in your repo: Settings → Secrets and variables → Actions):
   - `APP_URL`: `https://your-app-name.fly.dev` (or Vercel URL)
   - `CRON_SECRET`: Generate with `openssl rand -hex 32`

2. **That's it!** The workflow (`.github/workflows/sync-public-trades.yml`) will run every 5 minutes automatically.

## Option 2: Fly.io Machines

1. **Install flyctl**:
   ```bash
   brew install flyctl
   flyctl auth login
   ```

2. **Launch your app**:
   ```bash
   flyctl launch
   # Follow prompts, skip database if using Supabase
   ```

3. **Set secrets**:
   ```bash
   flyctl secrets set \
     NEXT_PUBLIC_SUPABASE_URL=your_url \
     SUPABASE_SERVICE_ROLE_KEY=your_key \
     CRON_SECRET=$(openssl rand -hex 32)
   ```

4. **Deploy**:
   ```bash
   flyctl deploy
   ```

5. **Create cron machine**:
   ```bash
   export FLY_APP_NAME=$(flyctl status | grep "App Name" | awk '{print $3}')
   export CRON_SECRET=$(flyctl secrets list | grep CRON_SECRET | awk '{print $2}')
   ./scripts/setup-fly-cron.sh
   ```

## Option 3: External Cron Service

Use cron-job.org, EasyCron, or similar:
- **URL**: `https://your-app.fly.dev/api/cron/sync-public-trades?limit=50`
- **Method**: GET
- **Header**: `Authorization: Bearer YOUR_CRON_SECRET`
- **Schedule**: `*/5 * * * *` (every 5 minutes)

## Test the Endpoint

```bash
curl -X GET \
  "https://your-app.fly.dev/api/cron/sync-public-trades?limit=50" \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

Expected response:
```json
{
  "processed": 50,
  "requested": 50,
  "tradesUpserted": 123,
  "pagesFetched": 15,
  "failures": 0,
  "limit": 50
}
```

## Full Documentation

See `docs/fly-cron-setup.md` for detailed instructions.

