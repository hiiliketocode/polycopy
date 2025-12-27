# Fly.io Worker System

Long-running Node.js workers for polling Polymarket trades and positions.

## Architecture

### Hot Worker (`worker-hot.js`)
- **Purpose**: Polls actively followed traders in near real-time
- **Cadence**: 1-3 seconds between full cycles
- **Scope**: Traders in `follows` table or marked as `hot` in `wallet_poll_state`
- **Always-on**: Runs continuously on Fly.io

### Cold Worker (`worker-cold.js`)
- **Purpose**: Polls all other traders as a safety net
- **Cadence**: ~1 hour between cycles (with jitter)
- **Scope**: All active traders not in hot list
- **Locking**: Uses DB-based locking to prevent overlapping runs
- **Always-on**: Runs continuously on Fly.io

## What Gets Polled

### Trades
- Fetches from `https://data-api.polymarket.com/trades?user={wallet}`
- Upserts into `trades_public` table
- Uses `trade_id` unique constraint (latest wins on conflict)
- Tracks watermark: `last_trade_time_seen` in `wallet_poll_state`

### Positions
- Fetches from `https://data-api.polymarket.com/positions?user={wallet}`
- Current snapshot: `positions_current` table
- Closed positions: `positions_closed` table (classified by reason)
- Detects changes:
  - Position opened
  - Position size changed (partial close)
  - Position manually closed
  - Position closed due to market resolution
  - Position redeemed

## Prerequisites

1. **Supabase Migration**: Run migration `038_worker_polling_system.sql`
   ```sql
   -- Creates tables:
   -- - wallet_poll_state
   -- - positions_current
   -- - positions_closed
   -- - job_locks
   -- - acquire_job_lock() function
   ```

2. **Environment Variables** (set via `flyctl secrets set`):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJxxx...
   # Or use SUPABASE_URL instead of NEXT_PUBLIC_SUPABASE_URL
   ```

## Deployment

### 1. Initial Setup

```bash
# Install flyctl (if not installed)
brew install flyctl

# Authenticate
flyctl auth login

# Create hot worker app
flyctl launch --name polycopy-hot-worker --config fly.worker-hot.toml

# Create cold worker app
flyctl launch --name polycopy-cold-worker --config fly.worker-cold.toml
```

### 2. Set Secrets

```bash
# Set secrets for hot worker
flyctl secrets set \
  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=eyJxxx... \
  -a polycopy-hot-worker

# Set secrets for cold worker
flyctl secrets set \
  NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=eyJxxx... \
  -a polycopy-cold-worker
```

### 3. Deploy

```bash
# Deploy hot worker
flyctl deploy -c fly.worker-hot.toml -a polycopy-hot-worker

# Deploy cold worker
flyctl deploy -c fly.worker-cold.toml -a polycopy-cold-worker
```

## Monitoring

### View Logs

```bash
# Hot worker logs
flyctl logs -a polycopy-hot-worker

# Cold worker logs
flyctl logs -a polycopy-cold-worker

# Follow logs in real-time
flyctl logs -a polycopy-hot-worker --follow
```

### Check Status

```bash
# Hot worker status
flyctl status -a polycopy-hot-worker

# Cold worker status
flyctl status -a polycopy-cold-worker

# SSH into worker (for debugging)
flyctl ssh console -a polycopy-hot-worker
```

### Database Queries

```sql
-- Check wallet poll state (tier is derived from follows table, not stored)
SELECT * FROM wallet_poll_state ORDER BY updated_at DESC;

-- Check job locks
SELECT * FROM job_locks;

-- Check recent position changes
SELECT * FROM positions_closed ORDER BY closed_at DESC LIMIT 20;

-- Check current positions for a wallet
SELECT * FROM positions_current WHERE wallet_address = '0x...';
```

## Rate Limiting

- **Hot worker**: 10 req/sec, burst 20
- **Cold worker**: 5 req/sec, burst 10
- **Per-wallet cooldown**: Hot 1s, Cold 5s
- **Exponential backoff**: On 429, 5xx errors (max 3 retries)

## Locking (Cold Worker)

The cold worker uses DB-based locking to prevent overlapping runs:

- Lock name: `cold_poll`
- Lock duration: 65 minutes (longer than poll interval)
- Lock extended every 30 minutes during processing
- Lock released on completion or shutdown

If lock is held, the worker skips the cycle and retries next interval.

## Position Reconciliation

When positions change, the system:

1. Compares current snapshot with previous snapshot
2. For disappeared positions:
   - Checks if market is closed via CLOB API
   - Classifies as `market_closed` or `manual_close`
   - Records in `positions_closed`
3. For size changes:
   - Tracks in `positions_current` (no close record)
   - May indicate partial close or new trade

## Restart Safety

- Cursors persisted to `wallet_poll_state` after each wallet
- Trade watermarks prevent reprocessing old trades
- Idempotent upserts (trade_id unique, latest wins)
- Lock cleanup on graceful shutdown (SIGTERM/SIGINT)

## Troubleshooting

### Worker not processing wallets

1. Check logs: `flyctl logs -a polycopy-hot-worker`
2. Verify secrets: `flyctl secrets list -a polycopy-hot-worker`
3. Check Supabase connection: Verify URL and service role key
4. Check `wallet_poll_state` table for wallet entries

### Cold worker skipping cycles

- Check `job_locks` table - if lock is stuck, delete it:
  ```sql
  DELETE FROM job_locks WHERE job_name = 'cold_poll';
  ```

### Too many rate limit errors

- Reduce `requestsPerSecond` in shared/polling.js
- Increase `cooldownMs` for wallets
- Check Polymarket API status

### Positions not updating

1. Verify positions API is accessible from Fly.io region
2. Check `positions_current` table for recent `last_seen_at`
3. Review logs for position fetch errors

## File Structure

```
workers/
├── README.md              # This file
├── worker-hot.js          # Hot worker entrypoint
├── worker-cold.js         # Cold worker entrypoint
└── shared/
    └── polling.js         # Shared polling/reconciliation logic

fly.worker-hot.toml        # Fly.io config for hot worker
fly.worker-cold.toml       # Fly.io config for cold worker
Dockerfile                 # Docker image (optional, Fly uses buildpacks by default)
```

## Cost Estimates

- **Hot worker**: ~$3-5/month (shared-cpu-1x, 256MB, always-on)
- **Cold worker**: ~$3-5/month (shared-cpu-1x, 256MB, always-on)
- **Total**: ~$6-10/month for both workers

## Next Steps

1. Run migration `038_worker_polling_system.sql` in Supabase
2. Deploy workers to Fly.io
3. Monitor logs for first cycle
4. Verify `trades_public` and `positions_current` tables are updating
5. Mark old cron endpoints as deprecated (see main README)


