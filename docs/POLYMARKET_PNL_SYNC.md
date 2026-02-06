# Polymarket P&L Sync Implementation

## Overview

This implementation ensures that Polycopy's P&L calculations match Polymarket's official numbers by syncing closed position data from Polymarket's Data API.

## Key Principle

**Only sync P&L for trades that users have explicitly tracked in Polycopy.**

- ✅ DO: Sync Polymarket's P&L for orders already in the `orders` table
- ❌ DON'T: Import users' entire Polymarket trading history

This respects that most users have pre-existing Polymarket activity that they don't want tracked in Polycopy.

## How It Works

### 1. Data Flow

```
Polymarket Data API (closed-positions)
    ↓
Match with existing Polycopy orders
    ↓
Update orders with official realizedPnl
    ↓
Portfolio Stats API uses Polymarket P&L when available
```

### 2. Matching Logic

For each user:
1. Fetch all closed positions from `https://data-api.polymarket.com/closed-positions?user={wallet}`
2. Get all orders from Polycopy's `orders` table where `copy_user_id = {user_id}`
3. Match positions to orders by `market_id` + `outcome`
4. Update matched orders with:
   - `polymarket_realized_pnl`: Official P&L (includes fees)
   - `polymarket_avg_price`: Average entry price
   - `polymarket_total_bought`: Total shares bought
   - `polymarket_synced_at`: Sync timestamp

### 3. P&L Calculation Priority

The portfolio stats API (`app/api/portfolio/stats/route.ts`) now:
1. **Prefers** Polymarket's `realizedPnl` when available
2. **Falls back** to FIFO calculation for positions without Polymarket data
3. Combines both for total P&L

## Files Modified

### Database Schema
- `supabase/migrations/20260206_add_polymarket_pnl_columns.sql`
  - Adds columns to `orders` table

### Core Logic
- `app/api/portfolio/stats/route.ts`
  - Updated to use Polymarket P&L when available

### Sync Infrastructure
- `app/api/cron/sync-polymarket-pnl/route.ts`
  - API endpoint for automated syncing
  - Called by Vercel cron
  
- `scripts/sync-all-users-polymarket-pnl.ts`
  - Manual script for testing/one-time syncs

### Configuration
- `vercel.json`
  - Cron schedule: Every 6 hours
  - Path: `/api/cron/sync-polymarket-pnl`

## Setup Instructions

### 1. Add Environment Variable

```bash
# Generate a secure random string
openssl rand -base64 32

# Add to Vercel Environment Variables
CRON_SECRET=your-generated-secret
```

### 2. Deploy

```bash
git add .
git commit -m "Add Polymarket P&L sync"
git push origin main
```

Vercel will automatically set up the cron job based on `vercel.json`.

### 3. Manual Sync (Optional)

To sync all users immediately:

```bash
npx tsx scripts/sync-all-users-polymarket-pnl.ts
```

Or trigger via API:

```bash
curl -X POST https://polycopy.com/api/cron/sync-polymarket-pnl \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Special Case: Importing Missing Positions

For users whose wallets were created specifically for Polycopy (like the test user), you may want to import all their Polymarket positions.

Use `scripts/import-missing-positions.ts` for this:

```bash
# Edit USER_ID in the script
npx tsx scripts/import-missing-positions.ts
```

This is a manual, per-user operation and should NOT be run for all users.

## Monitoring

### Check Sync Status

```sql
-- Count orders with Polymarket P&L
SELECT 
  COUNT(*) FILTER (WHERE polymarket_realized_pnl IS NOT NULL) as with_pnl,
  COUNT(*) FILTER (WHERE polymarket_realized_pnl IS NULL) as without_pnl,
  COUNT(*) as total
FROM orders
WHERE copy_user_id IS NOT NULL;

-- Total Polymarket P&L
SELECT 
  SUM(polymarket_realized_pnl) as total_polymarket_pnl,
  COUNT(*) as order_count
FROM orders
WHERE polymarket_realized_pnl IS NOT NULL;
```

### Cron Logs

Check Vercel deployment logs for cron execution:
- Dashboard → Deployments → [Latest] → Functions → `/api/cron/sync-polymarket-pnl`

## Troubleshooting

### Sync Not Running

1. Check `vercel.json` is deployed
2. Verify `CRON_SECRET` is set in Vercel
3. Check cron logs in Vercel dashboard

### P&L Mismatch

1. Run manual sync: `npx tsx scripts/sync-all-users-polymarket-pnl.ts`
2. Clear portfolio cache: `npx tsx scripts/clear-prod-cache.ts`
3. Check for orders missing `polymarket_realized_pnl`

### Rate Limiting

Polymarket's Data API may rate limit. The sync script includes:
- 200ms delay between requests
- 5-second timeout per request
- Batch processing for multiple users

## Future Improvements

1. **Incremental Sync**: Only fetch positions updated since last sync
2. **User-Specific Sync**: Allow users to trigger sync from UI
3. **Sync Status UI**: Show last sync time in portfolio
4. **Webhook Integration**: Real-time updates when positions close

## Security Considerations

- API endpoint protected by `CRON_SECRET`
- Only syncs for users with connected wallets
- Only updates existing orders (doesn't create new ones)
- Rate limiting to respect Polymarket API
