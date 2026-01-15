# Trade History Backfill Script - Implementation Plan

## Overview
Build a script to backfill trade history for wallets using the [Dome API Trade History endpoint](https://docs.domeapi.io/api-reference/endpoint/get-trade-history).

## API Endpoint Details

**Endpoint**: `GET /polymarket/orders`  
**Base URL**: `https://api.domeapi.io/v1`

### Key Parameters:
- `user` (string, required): Wallet address to filter orders
- `start_time` (integer): Unix timestamp in seconds (inclusive)
- `end_time` (integer): Unix timestamp in seconds (inclusive)
- `limit` (integer): 1-1000, default 100
- `offset` (integer): For pagination, default 0

### Response Structure:
```json
{
  "orders": [
    {
      "token_id": "...",
      "token_label": "Yes",  // OUTCOME: "Yes" or "No"
      "side": "BUY",         // "BUY" or "SELL"
      "market_slug": "...",
      "condition_id": "...",
      "shares": 4995000,     // Raw shares (integer)
      "shares_normalized": 4.995,  // Normalized shares (decimal)
      "price": 0.65,
      "tx_hash": "...",
      "title": "...",        // Market title
      "timestamp": 1757008834,  // Unix timestamp in seconds
      "order_hash": "...",   // Unique identifier
      "user": "0x...",       // Wallet address (maker)
      "taker": "0x..."      // Taker wallet address
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1250,
    "has_more": true
  }
}
```

### All Data Points Captured (14 fields):
✅ **Outcome**: `token_label` ("Yes" or "No") - The outcome the trader bet on  
✅ **Trade Direction**: `side` ("BUY" or "SELL")  
✅ **Market Info**: `market_slug`, `condition_id`, `title`  
✅ **Trade Size**: `shares` (raw), `shares_normalized` (decimal)  
✅ **Price**: `price`  
✅ **Timing**: `timestamp` (Unix seconds)  
✅ **Identifiers**: `order_hash` (unique), `token_id`, `tx_hash`  
✅ **Wallets**: `user` (maker), `taker`

### ✅ Market Resolution Status: Use Gamma API
**Resolution Data**: The `/polymarket/orders` endpoint does NOT include resolution status, BUT we can get it from **Gamma API** (already integrated in codebase).

**Gamma API Endpoint**: `https://gamma-api.polymarket.com/markets?condition_id={conditionId}`

**Gamma API Provides:**
- ✅ `resolved` (boolean) - Whether market is resolved
- ✅ `winningOutcome` or `resolutionSource` - The actual winning outcome
- ✅ `closed` (boolean) - Whether market is closed for new bets
- ✅ `outcomePrices` (array) - Current prices for each outcome
- ✅ `outcomes` (array) - Outcome names (e.g., ["Yes", "No"])

**Enrichment Strategy:**
1. **During Backfill**: For each unique `condition_id` in the batch:
   - Query Gamma API: `GET /gamma-api.polymarket.com/markets?condition_id={conditionId}`
   - Extract resolution data
   - Enrich all trades for that condition_id
   - Cache results to avoid duplicate API calls

2. **Batch Enrichment**: Use existing `/api/gamma/markets` proxy endpoint which supports batch queries:
   - `GET /api/gamma/markets?condition_ids=0x123,0x456,0x789`
   - More efficient than individual calls

3. **Resolution Detection Logic** (from existing code):
   - Method 1: `market.resolved === true` (explicit flag)
   - Method 2: `market.winningOutcome` or `market.resolutionSource` exists
   - Method 3: If `market.closed === true` AND prices show extreme values (one at 99.5%+, another at 0.5%-)

**Advantages of Gamma API:**
- ✅ Already integrated in codebase (`app/api/gamma/markets/route.ts`)
- ✅ No authentication required (public API)
- ✅ Supports batch queries via our proxy
- ✅ More reliable than Dome API for resolution data
- ✅ Provides actual outcome names (not just "Yes"/"No" for some markets)

**Trade Result Calculation Logic (using Gamma API data):**

**For BUY Trades:**
```javascript
if (!market.resolved || !market.winningOutcome) {
  trade_result = 'pending'
} else {
  const traderBet = token_label?.toUpperCase()  // "YES" or "NO"
  const actualWinner = market.winningOutcome?.toUpperCase()
  
  // BUY Yes when Yes wins = WIN
  // BUY Yes when No wins = LOSS
  const isWin = traderBet === actualWinner || 
                (traderBet === 'YES' && actualWinner.includes('YES')) ||
                (traderBet === 'NO' && actualWinner.includes('NO'))
  
  trade_result = isWin ? 'win' : 'loss'
}
```

**For SELL Trades (More Complex):**
SELL trades can be either:
1. **Closing a position** (selling shares you bought earlier)
2. **Opening a short** (selling first, buying back later)

**Option A: If SELL is closing a BUY position:**
- Need to find matching BUY trade(s) using FIFO (First In First Out)
- Calculate: `realized_pnl = (sell_price - buy_price) * quantity`
- `trade_result = realized_pnl > 0 ? 'win' : 'loss'`
- **Note**: This requires tracking position state across trades

**Option B: If SELL is a standalone short (no prior BUY):**
- Use resolution logic (inverted from BUY):
  ```javascript
  if (!market.resolved || !market.winningOutcome) {
    trade_result = 'pending'
  } else {
    const traderBet = token_label?.toUpperCase()  // What they sold
    const actualWinner = market.winningOutcome?.toUpperCase()
    
    // SELL Yes when No wins = WIN (sold high, can buy back low)
    // SELL Yes when Yes wins = LOSS (sold low, need to buy back high)
    const isWin = traderBet !== actualWinner && 
                  !(traderBet === 'YES' && actualWinner.includes('YES')) &&
                  !(traderBet === 'NO' && actualWinner.includes('NO'))
    
    trade_result = isWin ? 'win' : 'loss'
  }
  ```

**Recommended Approach:**
1. **Track Position State**: For each `condition_id + outcome` combination, track:
   - Net position size (sum of BUYs - sum of SELLs)
   - Average entry price
   - FIFO queue of BUY trades

2. **Process Trades Chronologically**: Sort by `timestamp` and process in order

3. **For Each SELL Trade**:
   - If net position > 0 (has open BUY positions):
     - Match against BUY trades using FIFO
     - Calculate realized PnL: `(sell_price - buy_price) * matched_quantity`
     - `trade_result = realized_pnl > 0 ? 'win' : 'loss'`
   - Else (net position <= 0, standalone short):
     - Use inverted resolution logic (SELL Yes + No wins = WIN)

4. **Store Position Context**: Add fields to track:
   - `is_closing_position` (boolean) - Whether this SELL closes a BUY
   - `matched_buy_trade_id` (TEXT) - Reference to the BUY trade it closes
   - `realized_pnl` (NUMERIC) - Calculated PnL if closing a position

**Set market status:**
```javascript
if (market.resolved === true) {
  market_status = 'resolved'
} else if (market.closed === true) {
  market_status = 'closed'
} else {
  market_status = 'open'
}
```

**Note**: This is simplified logic. Actual PnL calculation would need to account for:
- Entry price vs exit price (if sold before resolution)
- Position size
- Fees
- Partial fills
- Gamma API may return actual outcome names (not just "Yes"/"No") for some markets

---

## Implementation Plan

### Phase 1: Database Schema

#### Option A: Use Existing Table (if exists)
Check if `trader_trades_history` table exists from PRD. If not, create it.

#### Option B: Create New Table `wallet_trade_history`
```sql
CREATE TABLE IF NOT EXISTS public.wallet_trade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Trade Identification (from Dome API - all 14 fields captured)
  order_hash TEXT NOT NULL UNIQUE,  -- Primary unique identifier
  tx_hash TEXT,  -- Transaction hash
  token_id TEXT NOT NULL,
  token_label TEXT,  -- "Yes" or "No" - THIS IS THE OUTCOME
  
  -- Wallet & Market
  wallet_address TEXT NOT NULL,  -- Lowercase normalized (from 'user' field)
  condition_id TEXT,
  market_slug TEXT,
  market_title TEXT,  -- From 'title' field
  
  -- Trade Execution
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  shares BIGINT NOT NULL,  -- Raw shares (e.g., 4995000)
  shares_normalized NUMERIC NOT NULL,  -- Normalized (e.g., 4.995)
  price NUMERIC NOT NULL,
  timestamp BIGINT NOT NULL,  -- Unix timestamp in seconds
  
  -- Additional Data
  taker TEXT,  -- Taker wallet address
  user TEXT,  -- Original user field from API (kept for reference)
  
  -- Market Resolution (enriched from Gamma API)
  market_status TEXT,  -- "open", "closed", "resolved"
  winning_outcome TEXT,  -- The actual winning outcome ("Yes" or "No")
  market_resolved_at BIGINT,  -- Unix timestamp when market resolved
  trade_result TEXT,  -- "win", "loss", "pending" (calculated differently for BUY vs SELL)
  trade_pnl NUMERIC,  -- Calculated PnL if resolved or if SELL closes a position
  
  -- Position Tracking (for SELL trades)
  is_closing_position BOOLEAN,  -- True if SELL closes a prior BUY position
  matched_buy_order_hash TEXT,  -- Reference to BUY trade this SELL closes (FIFO matching)
  position_net_size NUMERIC,  -- Net position size after this trade (for tracking)
  realized_pnl NUMERIC,  -- Realized PnL if SELL closes a BUY: (sell_price - buy_price) * quantity
  
  -- Sync Metadata
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  sync_source TEXT DEFAULT 'dome_api',
  resolution_enriched_at TIMESTAMPTZ,  -- When resolution data was last updated
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_wallet_trade_history_wallet ON wallet_trade_history(wallet_address);
CREATE INDEX idx_wallet_trade_history_timestamp ON wallet_trade_history(timestamp DESC);
CREATE INDEX idx_wallet_trade_history_condition ON wallet_trade_history(condition_id);
CREATE INDEX idx_wallet_trade_history_market ON wallet_trade_history(market_slug);
CREATE INDEX idx_wallet_trade_history_composite ON wallet_trade_history(wallet_address, timestamp DESC);

-- Unique constraint
CREATE UNIQUE INDEX idx_wallet_trade_history_unique ON wallet_trade_history(order_hash);

-- RLS (if needed)
ALTER TABLE wallet_trade_history ENABLE ROW LEVEL SECURITY;
```

---

### Phase 2: Script Structure

#### File: `scripts/backfill-wallet-trade-history.js`

**Similar structure to `backfill-wallet-pnl.js`:**

1. **Configuration**
   - `BASE_URL = 'https://api.domeapi.io/v1'`
   - `SLEEP_MS = 250` (rate limiting)
   - `BATCH_SIZE = 100` (API limit per request)
   - `UPSERT_BATCH = 500` (database batch size)
   - `MAX_RETRIES = 3`
   - `HISTORICAL_BASELINE = Date.UTC(2023, 0, 1) / 1000` (Jan 1, 2023)

2. **Core Functions**

   **`fetchTradeHistory(wallet, startTime, endTime, offset = 0)`**
   - Calls `/polymarket/orders?user={wallet}&start_time={startTime}&end_time={endTime}&limit=100&offset={offset}`
   - Uses `Authorization: Bearer {DOME_API_KEY}` header
   - Handles pagination automatically
   - Returns: `{ orders: [], pagination: {} }`

   **`fetchAllTradeHistory(wallet, startTime, endTime)`**
   - Wrapper that handles pagination
   - Fetches all pages until `has_more: false`
   - Returns complete array of orders

   **`normalizeOrder(order, wallet)`**
   - Maps all 14 fields from Dome API response to database schema:
     - `order_hash` → order_hash (unique key)
     - `tx_hash` → tx_hash
     - `token_id` → token_id
     - `token_label` → token_label (OUTCOME: "Yes" or "No")
     - `side` → side ("BUY" or "SELL")
     - `shares` → shares (raw integer)
     - `shares_normalized` → shares_normalized (decimal)
     - `price` → price
     - `timestamp` → timestamp
     - `condition_id` → condition_id
     - `market_slug` → market_slug
     - `title` → market_title
     - `user` → user (original field) and wallet_address (normalized lowercase)
     - `taker` → taker
   - Normalizes wallet address to lowercase
   - Converts types appropriately (shares to BIGINT, price to NUMERIC)

   **`upsertOrders(orders)`**
   - Batch upsert to `wallet_trade_history`
   - Uses `order_hash` as unique key
   - Handles conflicts gracefully

   **`getLatestTimestamp(wallet)`**
   - Queries database for most recent `timestamp` for wallet
   - Returns timestamp or `HISTORICAL_BASELINE` if none exists
   - Used for incremental backfills

   **`enrichMarketResolution(conditionId)`**
   - Fetches market data from Gamma API: `https://gamma-api.polymarket.com/markets?condition_id={conditionId}`
   - Or uses existing proxy: `/api/gamma/markets?conditionId={conditionId}`
   - Returns: `{ resolved, winningOutcome, closed, outcomePrices, outcomes }`
   - Caches results to avoid duplicate API calls for same condition_id
   - Used to enrich trade history with resolution status

   **`enrichOrdersWithResolution(orders)`**
   - Groups orders by unique `condition_id` (not market_slug - more reliable)
   - Batch fetches resolution data using `/api/gamma/markets?condition_ids={ids}` (comma-separated)
   - For each order, calculates `trade_result` (win/loss/pending) by comparing:
     - `token_label` (what trader bet on, e.g., "Yes") vs `winningOutcome` (actual result)
   - Sets `market_status` based on `resolved` and `closed` flags
   - Returns enriched orders array

   **`trackPositionsAndMatchSells(orders)`**
   - Processes trades chronologically (sorted by timestamp)
   - For each `condition_id + token_label` combination, maintains:
     - `netPosition` (sum of BUYs - sum of SELLs)
     - `avgEntryPrice` (weighted average of BUY prices)
     - `buyQueue` (FIFO queue of BUY trades: [{order_hash, price, size, timestamp}])
   - For each SELL trade:
     - If `netPosition > 0` (has open BUY positions):
       - Match against `buyQueue` using FIFO
       - Calculate `realized_pnl = (sell_price - buy_price) * matched_quantity`
       - Set `is_closing_position = true`
       - Set `matched_buy_order_hash` to the BUY trade's order_hash
     - Else (standalone short):
       - Set `is_closing_position = false`
       - Will use resolution logic later
   - Returns enriched orders with position tracking fields

   **`backfillWallet(wallet)`**
   - Main function for single wallet
   - Gets latest timestamp (incremental) or uses baseline (full)
   - Fetches all trade history
   - Processes trades chronologically to track positions and match SELLs
   - Optionally enriches with market resolution data (can be done separately)
   - Upserts to database
   - Returns: `{ upserted, total, hadData }`

   **`loadActiveTraders()`**
   - Fetches top 500 traders by PnL (same as PnL script)
   - Returns array of wallet addresses

   **`main()`**
   - Loads traders
   - Processes each with delay
   - Logs progress
   - Handles errors gracefully

3. **Error Handling**
   - 404/Not Found: Skip wallet (no data available)
   - 429/Rate Limit: Retry with exponential backoff
   - 500/Server Error: Retry up to MAX_RETRIES
   - Network errors: Log and continue

4. **Rate Limiting**
   - 250ms delay between wallets
   - Respects API rate limits
   - Handles pagination efficiently (no delay between pages for same wallet)

---

### Phase 3: Incremental Backfill Strategy

**First Run (Full Backfill):**
- Start from `HISTORICAL_BASELINE` (Jan 1, 2023)
- Fetch all historical trades
- Store in database

**Subsequent Runs (Incremental):**
- Query `MAX(timestamp)` for each wallet
- Only fetch trades after that timestamp
- Much faster, avoids duplicates

**Watermark Tracking:**
- Optionally store `last_synced_timestamp` in `trader_sync_status` table
- Or query database directly each time (simpler)

---

### Phase 4: Script Features

1. **Command Line Arguments**
   ```bash
   node scripts/backfill-wallet-trade-history.js \
     --limit=500 \           # Number of traders to process
     --wallet=0x... \        # Process single wallet
     --full \                # Force full backfill (ignore existing data)
     --start-time=1640995200 # Custom start time
   ```

2. **Progress Logging**
   - `[1/500] 0xabc... -> upserted 1,250 orders`
   - `[2/500] 0xdef... -> upserted 0 orders (no new data)`
   - Summary at end: `Total: 500 wallets, 125,000 orders upserted`

3. **Resume Capability**
   - If script fails, can resume from where it left off
   - Uses database state to determine what's already synced

---

### Phase 5: Vercel Cron Integration

**API Route**: `/app/api/cron/backfill-wallet-trade-history/route.ts`

- Similar to PnL backfill cron
- Protected with `CRON_SECRET`
- Max duration: 5 minutes (may need adjustment)
- Runs daily at different time than PnL backfill (e.g., 3 AM UTC)

**Vercel Config** (`vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/cron/backfill-wallet-trade-history",
      "schedule": "0 3 * * *"
    }
  ]
}
```

---

### Phase 6: Performance Considerations

1. **Batch Processing**
   - Process 500 traders per run
   - Each trader: fetch all pages, then upsert
   - Avoids partial state

2. **Database Optimization**
   - Use batch upserts (500 rows at a time)
   - Indexes on wallet_address and timestamp
   - Unique constraint prevents duplicates

3. **API Efficiency**
   - Use maximum limit (1000) when possible
   - Fetch in reverse chronological order (newest first)
   - Stop early if we hit existing data (incremental mode)

4. **Time Estimates**
   - 500 traders × 2 API calls (avg) = 1,000 calls
   - 250ms delay = 250 seconds (4+ minutes) just for delays
   - May exceed Vercel 5-minute limit
   - **Solution**: Process in smaller batches or use Fly.io worker

---

### Phase 7: Data Validation

1. **Required Fields**
   - `order_hash` (unique identifier)
   - `wallet_address`
   - `timestamp`
   - `side`, `price`, `shares`

2. **Data Quality Checks**
   - Validate timestamp is reasonable (not future, not too old)
   - Validate price is positive
   - Validate shares is positive
   - Normalize side to uppercase

3. **Duplicate Prevention**
   - Unique constraint on `order_hash`
   - Skip if already exists (upsert handles this)

---

### Phase 8: Testing Strategy

1. **Single Wallet Test**
   ```bash
   node scripts/backfill-wallet-trade-history.js --wallet=0x7c3db723f1d4d8cb9c550095203b686cb11e5c6b
   ```

2. **Small Batch Test**
   ```bash
   node scripts/backfill-wallet-trade-history.js --limit=10
   ```

3. **Incremental Test**
   - Run once (full backfill)
   - Run again (should skip existing data)
   - Verify no duplicates

4. **Error Handling Test**
   - Test with invalid wallet
   - Test with wallet that has no trades
   - Test rate limiting behavior

---

### Phase 9: Monitoring & Alerts

1. **Logging**
   - Log each wallet processed
   - Log errors with wallet address
   - Log summary statistics

2. **Metrics to Track**
   - Total wallets processed
   - Total orders upserted
   - Wallets skipped (no data)
   - Errors encountered
   - Execution time

3. **Alerts** (Future)
   - Email/Slack if error rate > 10%
   - Alert if script takes > 10 minutes
   - Alert if no data fetched for > 24 hours

---

## Implementation Checklist

- [ ] Create database migration for `wallet_trade_history` table
- [ ] Create `scripts/backfill-wallet-trade-history.js`
- [ ] Implement `fetchTradeHistory()` with pagination
- [ ] Implement `normalizeOrder()` mapping
- [ ] Implement `upsertOrders()` batch upsert
- [ ] Implement `getLatestTimestamp()` for incremental backfills
- [ ] Implement `backfillWallet()` main logic
- [ ] Implement `loadActiveTraders()` (reuse from PnL script)
- [ ] Add error handling and retries
- [ ] Add command-line argument parsing
- [ ] Test with single wallet
- [ ] Test with small batch
- [ ] Test incremental backfill
- [ ] Create API route `/app/api/cron/backfill-wallet-trade-history/route.ts`
- [ ] Add cron job to `vercel.json`
- [ ] Document usage in README
- [ ] Deploy and monitor first run

---

## Estimated Timeline

- **Database Schema**: 30 minutes
- **Core Script**: 2-3 hours
- **Testing**: 1 hour
- **Cron Integration**: 30 minutes
- **Documentation**: 30 minutes
- **Total**: ~4-5 hours

---

## Notes

1. **API Limits**: Dome API may have rate limits. Monitor and adjust `SLEEP_MS` if needed.

2. **Data Volume**: Some traders may have thousands of trades. Consider:
   - Processing in time chunks (e.g., monthly)
   - Limiting historical depth (e.g., last 2 years)
   - Processing high-value traders first

3. **Storage Costs**: Each trade is ~200-300 bytes. 1M trades = ~200-300 MB. Monitor database size.

4. **Alternative Approach**: If Vercel timeout is an issue, consider:
   - Processing smaller batches (100 traders/day)
   - Using Fly.io worker for longer-running jobs
   - Splitting into multiple cron jobs by trader priority
