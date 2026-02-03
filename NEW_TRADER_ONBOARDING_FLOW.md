# New Trader Onboarding Flow Analysis

## Overview
This document explains how new traders entering the top 1000 Polymarket leaderboard are added to PolyCopy and tracked throughout the app.

## Current Flow

### 1. Leaderboard Sync Cron (`/api/cron/sync-trader-leaderboard`)
**Schedule:** Daily at 1 AM UTC (configured in `vercel.json`)

**What it does:**
- Fetches top 1000 traders from Polymarket leaderboard (5 pages × 200 traders)
- Uses `timePeriod=all`, `orderBy=VOL`, `category=overall` by default
- Upserts traders into `traders` table with `is_active=true`
- Triggers PnL backfill for new wallets immediately (async, fire-and-forget)

**Key Code:**
```typescript
// app/api/cron/sync-trader-leaderboard/route.ts
// Lines 189-258
```

**Fields synced:**
- `wallet_address` (primary key)
- `display_name`
- `profile_image`
- `x_username`
- `verified_badge`
- `pnl`
- `volume`
- `roi` (calculated)
- `rank`
- `markets_traded`
- `total_trades`
- `win_rate`
- `last_seen_at`
- `follower_count` (from PolyCopy follows table)
- `is_active` (set to `true`)
- `updated_at`

### 2. PnL Backfill Trigger
**What it does:**
- When new wallets are detected, triggers `/api/cron/backfill-wallet-pnl?wallet=0x...`
- Runs asynchronously (doesn't block the sync)
- Backfills historical PnL data for the wallet

**Key Code:**
```typescript
// lib/backfill/trigger-wallet-pnl-backfill.ts
```

## How Different Parts of the App Handle Traders

### ✅ Feed Page (`/app/feed/page.tsx`)
**Status:** Works for ANY trader, even if not in `traders` table

**How it works:**
- Queries `follows` table to get followed trader wallets
- Fetches trades directly from Polymarket API: `https://data-api.polymarket.com/trades?user={wallet}`
- Does NOT query `traders` table
- Does NOT filter by `is_active`

**Implications:**
- ✅ New traders work immediately in feed if someone follows them
- ✅ No dependency on `traders` table for feed functionality

### ✅ Trader Profile Page (`/app/trader/[wallet]/page.tsx`)
**Status:** Works for ANY trader, even if not in `traders` table

**How it works:**
- Uses `/api/trader/[wallet]` endpoint
- Endpoint fetches directly from Polymarket leaderboard API
- Does NOT query `traders` table
- Falls back to trades API if not on leaderboard

**Implications:**
- ✅ New traders work immediately on their profile page
- ✅ No dependency on `traders` table for trader pages

### ✅ Discover Page (`/app/discover/page.tsx`)
**Status:** Works for ANY trader on Polymarket leaderboard

**How it works:**
- Fetches traders from `/api/polymarket/leaderboard` endpoint
- Endpoint calls Polymarket API directly
- Does NOT query `traders` table
- Shows traders from Polymarket leaderboard in real-time

**Implications:**
- ✅ New traders appear immediately on discover page
- ✅ No dependency on `traders` table for discover page

### ⚠️ Systems That DO Filter by `is_active=true`

These systems only process traders that are in the `traders` table with `is_active=true`:

1. **Sync Public Trades** (`/api/cron/sync-public-trades`)
   - Syncs public trades for active traders
   - Filters: `.eq('is_active', true)`

2. **Sync Traders** (`/api/cron/sync-traders`)
   - Syncs orders for active traders
   - Filters: `.eq('is_active', true)`

3. **Worker Cold** (`workers/worker-cold.js`)
   - Gets cold wallets (active traders not being followed)
   - Filters: `.eq('is_active', true)`

4. **Backfill Wallet Trades** (`scripts/backfill-wallet-trades.js`)
   - Backfills trades for active traders
   - Filters: `.eq('is_active', true)`

**Implications:**
- ⚠️ New traders won't be processed by these systems until the next cron run (1 AM UTC)
- ⚠️ This is acceptable since these are background sync jobs, not user-facing features

## Timeline for New Trader

### Scenario: Trader enters top 1000 at 3 PM UTC

1. **3 PM UTC:** Trader enters top 1000 on Polymarket
   - ✅ Appears on Discover page immediately (fetches from Polymarket API)
   - ✅ Trader profile page works immediately (fetches from Polymarket API)
   - ✅ Can be followed immediately
   - ✅ Feed works if followed (fetches from Polymarket API)
   - ❌ Not in `traders` table yet
   - ❌ Background sync jobs won't process them yet

2. **1 AM UTC (next day):** Leaderboard sync cron runs
   - ✅ Trader added to `traders` table with `is_active=true`
   - ✅ PnL backfill triggered (runs asynchronously)
   - ✅ Background sync jobs will process them going forward

3. **After PnL backfill completes:**
   - ✅ Historical PnL data available
   - ✅ All systems fully operational

## Potential Issues & Recommendations

### ✅ Current System is Robust
The current system is well-designed because:
1. **User-facing features work immediately** - Feed, trader pages, and discover page don't depend on `traders` table
2. **Background jobs catch up** - Sync jobs will process new traders on the next cron run
3. **PnL backfill is triggered** - New traders get historical data backfilled

### ⚠️ Potential Improvements

1. **More Frequent Sync (Optional)**
   - Current: Daily at 1 AM UTC
   - Could run every 6-12 hours if needed
   - Trade-off: More API calls vs faster onboarding

2. **Real-time Detection (Optional)**
   - Could add a webhook or polling mechanism to detect new top 1000 traders
   - Probably overkill for current needs

3. **Ensure Cron Reliability**
   - Monitor cron job success rate
   - Set up alerts if cron fails
   - Verify `CRON_SECRET` is set correctly

4. **Verify PnL Backfill Completes**
   - Monitor backfill success rate
   - Set up alerts for failed backfills
   - Consider retry mechanism for failed backfills

## Testing Checklist

To verify new trader onboarding works:

1. ✅ **Discover Page**
   - Check that new top 1000 traders appear on discover page
   - Should work immediately (no wait for cron)

2. ✅ **Trader Profile Page**
   - Navigate to `/trader/{new-wallet}`
   - Should show trader data from Polymarket API
   - Should work immediately

3. ✅ **Feed Page**
   - Follow a new trader
   - Check that their trades appear in feed
   - Should work immediately

4. ✅ **Traders Table**
   - After cron runs (1 AM UTC), verify trader is in `traders` table
   - Check `is_active=true`
   - Check all fields are populated

5. ✅ **Background Jobs**
   - After cron runs, verify sync jobs process the new trader
   - Check `sync-public-trades` processes them
   - Check `sync-traders` processes them

## Summary

**Good News:** The system is designed to work for new traders immediately in all user-facing features. The `traders` table is primarily used for:
- Background sync jobs
- Analytics and reporting
- Ensuring consistent data across the platform

**Key Takeaway:** New traders entering the top 1000 will:
- ✅ Work immediately in feed, trader pages, and discover page
- ✅ Be added to `traders` table within 24 hours (next cron run)
- ✅ Get PnL backfilled automatically
- ✅ Be processed by background sync jobs going forward

The system is working as designed! 🎉
