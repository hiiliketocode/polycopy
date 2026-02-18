# Migrate Off Dome API

## Problem

Dome API costs $50/month. All data it provides can be sourced for free from the Gamma API (market metadata), Polymarket Data API (wallet P&L/metrics), and ESPN API (game start times for sports markets).

## Scope of Dome Usage

There are **4 active Dome API consumers** in the codebase:

- **app/api/polymarket/price/route.ts** -- `GET /polymarket/markets?condition_id=...` -- Fetches market metadata to cache in `markets` table when a market is not yet in the DB
- **lib/alpha-agent/dome-tool.ts** -- `GET /polymarket/markets?condition_id=...` -- Market lookup for the alpha agent (`domeGetMarkets`). Note: `domeSearchMarkets` and `domeGetPrice` already use the free Gamma API
- **scripts/backfill/backfill-wallet-pnl.js** (called by app/api/cron/backfill-wallet-pnl/route.ts) -- `GET /polymarket/wallet/pnl/{wallet}` and `GET /polymarket/wallet?eoa=...` -- Daily P&L backfill and trader metrics (volume, total_trades, markets_traded)
- **supabase/functions/predict-trade/index.ts** -- `GET /polymarket/markets?condition_id=...` -- Fetches market metadata for ML prediction context

## Migration Strategy

### Step 1: Create `fetchGammaMarketsByConditionIds` + `mapGammaMarketToRow`

Replace the core Dome functions in `lib/markets/dome.ts` with Gamma equivalents. The Gamma API endpoint `GET https://gamma-api.polymarket.com/markets?condition_id={id}` returns nearly identical data.

**Field mapping (Dome -> Gamma):**

- `condition_id` -> `conditionId`
- `title` -> `question`
- `market_slug` -> `slug`
- `event_slug` -> fetch from event via `events?slug=...`
- `start_time` -> `startDate` (market creation, not game start)
- `end_time` -> `endDate`
- `close_time` -> `closedTime`
- `completed_time` -> `closedTime` (when resolved)
- `tags` -> from event: `events[0].tags`
- `volume_1_week` -> `volume1wk`
- `volume_1_month` -> `volume1mo`
- `volume_1_year` -> `volume1yr`
- `volume_total` -> `volume`
- `image` -> `image`
- `description` -> `description`
- `negative_risk_id` -> derive from `negRisk` flag
- `side_a`, `side_b` -> `outcomes` (parse JSON string)
- `winning_side` -> derive from resolved outcome prices
- `status` -> derive from `closed`, `active`, `resolvedBy`
- `game_start_time` -> **NOT available from Gamma** (see Step 2)
- `raw_dome` -> store as `raw_gamma` instead (or keep column name, just store Gamma data)

Keep `pickMarketStartTime` and `pickMarketEndTime` unchanged -- they read from the DB, not from Dome directly.

### Step 2: game_start_time from ESPN

The existing ESPN integration in `lib/espn/scores.ts` already:

- Parses team names from market titles (`extractTeamNames`)
- Matches markets to ESPN games (`findMatchingGame`)
- Returns `startTime` in the ESPN response

**Approach:** When a new market is fetched via Gamma and has sports tags, also call `getESPNScoresForTrades` (or a lighter variant) to resolve `game_start_time`. Store it in the `markets` table as before.

**Fallback chain for `game_start_time`:**

1. ESPN API `startTime` (primary, most accurate)
2. Existing value already in `markets` table (for previously cached markets)
3. `null` (for non-sports markets, which don't need it)

**Key usage of `game_start_time`:**

- `lib/ft-sync/shared-logic.ts` -- `trade_live_only` filter (checks if game has started)
- `app/api/ft/sync/route.ts` and `app/api/ft/sync-trade/route.ts` -- same filter
- Feed pages -- sports event display and ESPN matching

All of these read `game_start_time` from the `markets` table, so they are unaffected as long as we populate it correctly.

### Step 3: Replace wallet P&L cron job

`scripts/backfill/backfill-wallet-pnl.js` uses two Dome endpoints:

1. **`/polymarket/wallet/pnl/{wallet}`** -- daily cumulative P&L series. Replace with Polymarket's free `/data/closed-positions` API (same approach as the v3 trader profile endpoint in `app/api/v3/trader/[wallet]/profile/route.ts`). The `computeDailyPnl` function already derives daily realized P&L from closed positions.
2. **`/polymarket/wallet?eoa=...&with_metrics=true`** -- volume, total_trades, markets_traded. Replace with Polymarket's free `/data/leaderboard` API (e.g., `GET https://data-api.polymarket.com/leaderboard?window=all&limit=1&address={wallet}`), which provides volume, P&L, and trade count.

**Note:** The `wallet_realized_pnl_daily` table is still used by portfolio pages and the "yesterday's winners" section on discover pages. The cron job must keep populating it, just with a different data source.

### Step 4: Update alpha-agent dome-tool

In `lib/alpha-agent/dome-tool.ts`:

- Replace `domeGetMarkets` to call Gamma instead of Dome (same endpoint pattern, different URL)
- `domeSearchMarkets` and `domeGetPrice` already use Gamma -- no changes needed
- Rename functions/file for clarity (optional)

### Step 5: Update predict-trade edge function

In `supabase/functions/predict-trade/index.ts`:

- Replace `fetchMarketFromDome` with a Gamma API call
- Replace `mapDomeMarketToRow` with the Gamma mapping
- Note: This is a Supabase Edge Function (Deno runtime), so the code change is isolated

### Step 6: Clean up

- Remove `DOME_API_KEY` and `DOME_BASE_URL` from environment variables (Vercel, Supabase, local `.env`)
- Cancel Dome subscription
- Optionally rename `raw_dome` column to `raw_gamma` in the `markets` table (low priority, can be done later)

## Risk Assessment

- **Low risk:** Market metadata (Steps 1, 4, 5) -- Gamma provides all the same fields except `game_start_time`, which is handled separately
- **Low risk:** `game_start_time` (Step 2) -- ESPN integration already exists and works; we're just using it more proactively
- **Medium risk:** Wallet P&L cron (Step 3) -- Requires rewriting the backfill script with a different data source. Should be tested thoroughly with a few wallets before deploying
- **No risk to existing data:** All current `game_start_time` values remain in the `markets` table. Migration only affects how NEW markets are populated

## Recommended Order

Steps 1 and 2 should be done together (market data + game_start_time). Step 3 (wallet P&L cron) is independent and can be done in parallel or after. Steps 4 and 5 are small and can be done alongside Step 1. Step 6 (cleanup) comes last after everything is verified.
