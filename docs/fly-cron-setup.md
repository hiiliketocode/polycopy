# Fly.io Cron Job Setup for Public Trade Sync

**⚠️ DEPRECATED: This document is deprecated in favor of the new worker system.**

**See `workers/README.md` for the current implementation using always-on Fly.io workers.**

---

## Old Documentation (Deprecated)

This guide explains how to set up Fly.io to run the `/api/cron/sync-public-trades` endpoint on a schedule.

**Note**: The `/api/cron/sync-public-trades` endpoint is deprecated. Use the worker system instead.

## Prerequisites

1. **Install flyctl**:
   ```bash
   # macOS
   brew install flyctl
   
   # Or via install script
   curl -L https://fly.io/install.sh | sh
   ```

2. **Authenticate with Fly.io**:
   ```bash
   flyctl auth login
   ```

## Initial Setup

1. **Launch your app** (if not already deployed):
   ```bash
   flyctl launch
   ```
   - Skip database setup if you're using Supabase
   - Skip build settings if you want to use the fly.toml defaults
   - Select your preferred region

2. **Set environment variables**:
   ```bash
   # Required environment variables
   flyctl secrets set \
     NEXT_PUBLIC_SUPABASE_URL=your_supabase_url \
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
     CRON_SECRET=your_cron_secret
   ```
   
   Generate a secure CRON_SECRET:
   ```bash
   openssl rand -hex 32
   ```

3. **Deploy the app**:
   ```bash
   flyctl deploy
   ```

## Setting Up the Cron Job

Fly.io doesn't have built-in cron scheduling, so we'll use Fly Machines with a scheduled restart or an external scheduler. Here are two approaches:

### Option 1: Fly Machines with Cron (Recommended)

Create a dedicated machine that runs the cron job on a schedule using a cron scheduler inside the container.

1. **Create a cron script** (`scripts/fly-cron-runner.sh`):
   ```bash
   #!/bin/sh
   set -e
   
   APP_URL="https://${FLY_APP_NAME}.fly.dev"
   CRON_SECRET="${CRON_SECRET}"
   
   # Run every 5 minutes
   while true; do
     echo "$(date): Running sync-public-trades cron job..."
     curl -X GET \
       "${APP_URL}/api/cron/sync-public-trades?limit=50" \
       -H "Authorization: Bearer ${CRON_SECRET}" \
       -H "Content-Type: application/json" \
       || echo "Request failed"
     sleep 300  # 5 minutes
   done
   ```

2. **Create a Dockerfile for the cron machine** (optional, if you want a separate machine):
   ```dockerfile
   FROM alpine:latest
   RUN apk add --no-cache curl
   COPY scripts/fly-cron-runner.sh /runner.sh
   RUN chmod +x /runner.sh
   ENV FLY_APP_NAME=your-app-name
   CMD ["/runner.sh"]
   ```

3. **Create and start the cron machine**:
   ```bash
   flyctl machines create \
     --name cron-sync-public-trades \
     --region iad \
     --vm-size shared-cpu-1x \
     --vm-memory 256 \
     --env "FLY_APP_NAME=polycopy" \
     --env "CRON_SECRET=$(flyctl secrets list | grep CRON_SECRET | awk '{print $2}')" \
     --image alpine:latest \
     --entrypoint "/bin/sh" \
     --args "-c" \
     --args "apk add curl && while true; do curl -X GET \"https://polycopy.fly.dev/api/cron/sync-public-trades?limit=50\" -H \"Authorization: Bearer \${CRON_SECRET}\" || true; sleep 300; done"
   ```

### Option 2: External Cron Service (Simpler)

Use an external cron service like cron-job.org, EasyCron, or GitHub Actions to call your endpoint:

1. **Get your app URL**: `https://your-app-name.fly.dev`

2. **Set up the cron job** in your chosen service:
   - **URL**: `https://your-app-name.fly.dev/api/cron/sync-public-trades?limit=50`
   - **Method**: GET
   - **Headers**: `Authorization: Bearer YOUR_CRON_SECRET`
   - **Schedule**: Every 5 minutes (`*/5 * * * *`) or as needed

3. **Test the endpoint**:
   ```bash
   curl -X GET \
     "https://your-app-name.fly.dev/api/cron/sync-public-trades?limit=50" \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

### Option 3: GitHub Actions (Free, Recommended for Open Source)

Create `.github/workflows/sync-public-trades.yml`:

```yaml
name: Sync Public Trades

on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes
  workflow_dispatch:  # Allow manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Call sync endpoint
        run: |
          curl -X GET \
            "${{ secrets.APP_URL }}/api/cron/sync-public-trades?limit=50" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

Set GitHub secrets:
- `APP_URL`: `https://your-app-name.fly.dev`
- `CRON_SECRET`: Your cron secret

## Recommended Schedule

- **Frequency**: Every 5 minutes (`*/5 * * * *`)
- **Limit**: 50 traders per run (default)
- **Rationale**: Balances freshness with API rate limits and cost

## Monitoring

Check your Fly.io logs to monitor the cron job:
```bash
flyctl logs -a polycopy
```

You should see output like:
```
[sync-public-trades] 0x123...: 15 trades across 2 pages
[sync-public-trades] 0x456...: 8 trades across 1 page
```

## Troubleshooting

1. **401 Unauthorized**: Check that `CRON_SECRET` matches in both your app secrets and the cron request header
2. **Connection errors**: Ensure your Fly app is running and accessible
3. **Rate limiting**: The endpoint processes 50 traders with concurrency of 5. Adjust `limit` if needed.

## Cost Considerations

- Fly Machines: ~$0.0000044/second for shared-cpu-1x-256mb when running
- With auto-stop enabled, machines only consume resources when running
- External cron services may be free or low-cost alternatives

