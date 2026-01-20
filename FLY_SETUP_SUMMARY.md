# Fly.io Worker Setup - Summary & Next Steps

## ✅ What's Already Complete

### Code & Configuration
- ✅ **Worker Scripts**: 
  - `workers/worker-hot.js` - Hot worker (1-3 second polling)
  - `workers/worker-cold.js` - Cold worker (hourly polling)
  - `workers/shared/polling.js` - Shared polling/reconciliation logic

- ✅ **Fly.io Configurations**:
  - `fly.worker-hot.toml` - Configuration for hot worker app
  - `fly.worker-cold.toml` - Configuration for cold worker app
  - `workers/Dockerfile` - Docker image for workers

- ✅ **Database Schema**:
  - Migration `038_worker_polling_system.sql` creates:
    - `wallet_poll_state` - Tracks polling cursors per wallet
    - `positions_current` - Current position snapshots
    - `positions_closed` - Historical closed positions
    - `job_locks` - DB-based locking for cold worker
    - `acquire_job_lock()` function - Atomic lock acquisition

- ✅ **Documentation**:
  - `workers/README.md` - Complete architecture & usage docs
  - `workers/DEPLOYMENT_CHECKLIST.md` - Step-by-step deployment guide
  - `workers/NEXT_STEPS.md` - Post-migration guide

### System Design
- ✅ Hot workers poll `follows` table traders every 1-3 seconds
- ✅ Cold workers poll all other active traders hourly with DB locking
- ✅ Rate limiting, exponential backoff, and error handling implemented
- ✅ Position reconciliation logic (detects manual close, market closed, redeemed)
- ✅ Idempotent trade upserts and restart-safe cursors

---

## 🚧 What You Need to Complete

### 1. Verify Database Migration ✅ (You mentioned you ran it)

Run these SQL queries in Supabase SQL Editor (copy WITHOUT the ``` markers):

**Check Tables:**
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('wallet_poll_state', 'positions_current', 'positions_closed', 'job_locks');
```

**Check Function:**
```sql
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'acquire_job_lock';
```

**Clean SQL (copy these directly):**

Check Tables:
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('wallet_poll_state', 'positions_current', 'positions_closed', 'job_locks');

Check Function:
SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'acquire_job_lock';

### 2. Install Fly CLI (if not already installed)

```bash
brew install flyctl
# Or update if installed: brew upgrade flyctl
```

### 3. Authenticate with Fly.io

```bash
flyctl auth login
```

### 4. Create Hot Worker App

```bash
cd /Users/rawdonmessenger/PolyCopy

# Create the app (use --no-deploy to create without deploying first)
flyctl launch --name polycopy-hot-worker --config fly.worker-hot.toml --no-deploy

# If app already exists, skip the launch step
```

### 5. Create Cold Worker App

```bash
# Create the app
flyctl launch --name polycopy-cold-worker --config fly.worker-cold.toml --no-deploy

# If app already exists, skip the launch step
```

### 6. Set Environment Variables (Secrets)

**Get your Supabase credentials:**
- Go to Supabase Dashboard → Settings → API
- Copy: Project URL (e.g., `https://xxx.supabase.co`)
- Copy: `service_role` key (⚠️ Keep secret! This bypasses RLS)

**Set secrets for Hot Worker:**
```bash
flyctl secrets set \
  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=eyJxxx... \
  -a polycopy-hot-worker
```

**Set secrets for Cold Worker:**
```bash
flyctl secrets set \
  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=eyJxxx... \
  -a polycopy-cold-worker
```

**Note**: You can use `SUPABASE_URL` instead of `NEXT_PUBLIC_SUPABASE_URL` if preferred (both are supported).

### 7. Deploy Workers

**Deploy Hot Worker:**
```bash
flyctl deploy -c fly.worker-hot.toml -a polycopy-hot-worker
```

**Deploy Cold Worker:**
```bash
flyctl deploy -c fly.worker-cold.toml -a polycopy-cold-worker
```

### 8. Verify Deployment

**Check Status:**
```bash
flyctl status -a polycopy-hot-worker
flyctl status -a polycopy-cold-worker
```

**View Logs:**
```bash
# Hot worker logs
flyctl logs -a polycopy-hot-worker --follow

# Cold worker logs
flyctl logs -a polycopy-cold-worker --follow
```

**Look for successful startup messages:**
- ✅ `🔥 Hot worker starting...`
- ✅ `❄️  Cold worker starting...`
- ✅ `[Cycle 1] Processing X hot wallets...`
- ✅ `[Cycle 1] Acquired lock, processing cold wallets...`

### 9. Verify Database Updates

**Check that data is flowing:**
```sql
-- Check wallet poll state is being updated
SELECT * FROM wallet_poll_state ORDER BY updated_at DESC LIMIT 10;

-- Check trades are being inserted
SELECT COUNT(*) FROM trades_public WHERE last_seen_at > NOW() - INTERVAL '5 minutes';

-- Check positions are being tracked
SELECT COUNT(*) FROM positions_current;

-- Check job locks (should see cold_poll lock when cold worker is running)
SELECT * FROM job_locks;
```

---

## 📋 Quick Deployment Commands (Copy-Paste)

Assuming you're authenticated and have Supabase credentials ready:

```bash
# 1. Create apps (if they don't exist)
flyctl launch --name polycopy-hot-worker --config fly.worker-hot.toml --no-deploy
flyctl launch --name polycopy-cold-worker --config fly.worker-cold.toml --no-deploy

# 2. Set secrets (replace with your actual values)
flyctl secrets set \
  NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY \
  -a polycopy-hot-worker

flyctl secrets set \
  NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY \
  -a polycopy-cold-worker

# 3. Deploy
flyctl deploy -c fly.worker-hot.toml -a polycopy-hot-worker
flyctl deploy -c fly.worker-cold.toml -a polycopy-cold-worker

# 4. Monitor
flyctl logs -a polycopy-hot-worker --follow
flyctl logs -a polycopy-cold-worker --follow
```

---

## 💰 Cost Estimate

- **Hot Worker**: ~$3-5/month (shared-cpu-1x, 256MB, always-on)
- **Cold Worker**: ~$3-5/month (shared-cpu-1x, 256MB, always-on)
- **Total**: ~$6-10/month for both workers

---

## 🐛 Troubleshooting

### Worker Not Starting
- Check logs: `flyctl logs -a polycopy-hot-worker`
- Verify secrets: `flyctl secrets list -a polycopy-hot-worker`
- Check Supabase URL and service role key are correct

### No Wallets Being Processed
- **Hot worker**: Verify `follows` table has active entries
  ```sql
  SELECT COUNT(*) FROM follows WHERE active = true;
  ```
- **Cold worker**: Verify `traders` table has active entries
  ```sql
  SELECT COUNT(*) FROM traders WHERE is_active = true;
  ```

### Lock Issues (Cold Worker)
If cold worker keeps skipping cycles:
```sql
-- Check if lock is stuck
SELECT * FROM job_locks WHERE job_name = 'cold_poll';

-- If stuck, manually release:
DELETE FROM job_locks WHERE job_name = 'cold_poll';
```

---

## 📚 Additional Resources

- **Full Documentation**: See `workers/README.md`
- **Deployment Guide**: See `workers/DEPLOYMENT_CHECKLIST.md`
- **Architecture Details**: See `workers/README.md` (Architecture section)

---

## ✅ Success Criteria

After deployment, you should see:

1. ✅ Workers start without errors
2. ✅ Hot worker processes wallets from `follows` table every 1-3 seconds
3. ✅ Cold worker acquires lock and processes wallets hourly
4. ✅ `wallet_poll_state` table being updated with `last_position_check_at`
5. ✅ `trades_public` table receiving new trades
6. ✅ `positions_current` table tracking current positions
7. ✅ No duplicate cold worker runs (lock working correctly)

