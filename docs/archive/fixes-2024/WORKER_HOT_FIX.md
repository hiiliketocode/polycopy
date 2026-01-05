# Hot Worker Fly.io Deployment Fix

## Problem Identified

The `polycopy-hot-worker` app was incorrectly configured:
- Using root `Dockerfile` with `CMD ["npm", "run", "start"]` (Next.js)
- Had `[http_service]` defined (wrong for a worker)
- No explicit `[build]` section pointing to worker Dockerfile
- Region was set to "lhr" instead of "iad"

## Solution Applied

### 1. Fixed `fly.worker-hot.toml`

**Changes:**
- ✅ Set `primary_region = "iad"`
- ✅ Added explicit `[build]` section pointing to `workers/Dockerfile`
- ✅ Added `dockerignore` to exclude unnecessary files
- ✅ Kept `[processes] app = "node workers/worker-hot.js"` (correct)
- ✅ No `[http_service]` section (correct for worker)
- ✅ Removed `PORT` env var (not needed)

### 2. Verified `workers/Dockerfile`

**Status:** ✅ Correct
- Uses `node:20-alpine`
- Installs production dependencies
- Copies entire codebase (needed for `lib/` access)
- CMD is `["node", "workers/worker-hot.js"]` (correct fallback)

## Deployment Command

```bash
flyctl deploy -c fly.worker-hot.toml -a polycopy-hot-worker
```

## Verification Checklist

### 1. Check App Status
```bash
flyctl status -a polycopy-hot-worker
```

**Expected output:**
- Status: `running` (not `suspended`)
- Region: `iad`
- Processes: `app` should be running
- No HTTP service listed

### 2. Check Logs
```bash
flyctl logs -a polycopy-hot-worker
```

**Expected output:**
```
🔥 Hot worker starting...
Supabase URL: https://...
[Cycle 1] Processing <N> hot wallets...
[Cycle 2] Processing <N> hot wallets...
...
```

**Success criteria:**
- ✅ Logs show "🔥 Hot worker starting..."
- ✅ Logs show "[Cycle X] Processing <N> hot wallets..."
- ✅ Logs continue advancing (not stuck in restart loop)
- ✅ No Next.js build output
- ✅ No "npm run start" messages

### 3. Verify Process
```bash
flyctl ssh console -a polycopy-hot-worker -C "ps aux"
```

**Expected:**
- Process: `node workers/worker-hot.js`
- NOT: `npm run start` or `next start`

### 4. Verify Config
```bash
flyctl config show -a polycopy-hot-worker
```

**Expected:**
- ✅ `"processes": { "app": "node workers/worker-hot.js" }` (top-level, not in http_service)
- ✅ NO `"http_service"` section
- ✅ `"primary_region": "iad"`

### 5. Test Persistence
After closing all terminals, wait 1-2 minutes and check logs again:
```bash
flyctl logs -a polycopy-hot-worker
```

**Expected:**
- Worker continues running
- Cycle numbers keep incrementing
- No restart loops

## Troubleshooting

### If logs show Next.js build:
- Verify `fly.worker-hot.toml` has `dockerfile = "workers/Dockerfile"` in `[build]`
- Redeploy: `flyctl deploy -c fly.worker-hot.toml -a polycopy-hot-worker`

### If logs show "npm run start":
- Verify `[processes]` is defined in `fly.worker-hot.toml`
- Check deployed config: `flyctl config show -a polycopy-hot-worker`
- Ensure no `http_service` exists

### If worker crashes:
- Check secrets: `flyctl secrets list -a polycopy-hot-worker`
- Required: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Check logs for specific error messages

### If app is suspended:
- Restart: `flyctl apps restart polycopy-hot-worker`
- Or deploy: `flyctl deploy -c fly.worker-hot.toml -a polycopy-hot-worker`

## Current Configuration Summary

**File:** `fly.worker-hot.toml`
- App: `polycopy-hot-worker`
- Region: `iad`
- Build: `workers/Dockerfile`
- Process: `node workers/worker-hot.js`
- No HTTP service
- Memory: 256MB
- CPU: 1 shared

**File:** `workers/Dockerfile`
- Base: `node:20-alpine`
- Dependencies: Production only
- CMD: `node workers/worker-hot.js`

