# Simple Trade History Schema - One Table Approach

## Philosophy: Keep It Simple

**Goal**: Get a clear picture of trader performance with minimal complexity.

**Key Insight**: 
- **BUY trades** → Can be resolved directly (did they bet on the winner?)
- **SELL trades** → Need to match to BUY trades to determine result
- **Resolutions** → Come from Gamma API (market-level, not trade-level)

## Recommended: Single Table with Calculated Results

### Table: `wallet_trade_history`

**All trade data + calculated results in one place**

```sql
CREATE TABLE IF NOT EXISTS public.wallet_trade_history (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_hash TEXT NOT NULL UNIQUE,  -- From Dome API (unique identifier)
  
  -- Trade Data (from Dome API)
  wallet_address TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  token_label TEXT,  -- "Yes" or "No" (the outcome they bet on)
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  price NUMERIC NOT NULL,
  shares_normalized NUMERIC NOT NULL,
  timestamp BIGINT NOT NULL,
  market_slug TEXT,
  market_title TEXT,
  tx_hash TEXT,
  taker TEXT,
  
  -- Market Resolution (from Gamma API - enriched)
  market_resolved BOOLEAN DEFAULT false,
  winning_outcome TEXT,  -- "Yes", "No", or actual outcome name
  market_resolved_at BIGINT,  -- When market resolved
  
  -- Position State (critical to avoid double-counting)
  position_closed_by TEXT,  -- 'sell', 'resolution', or NULL (still open)
  -- This tells us HOW the position was closed, so we don't count both SELL and resolution
  
  -- Calculated Results (computed during backfill)
  trade_result TEXT,  -- 'win', 'loss', 'pending', 'closed_profit', 'closed_loss'
  trade_pnl NUMERIC,  -- Calculated PnL for this trade
  
  -- SELL Trade Matching (handles partial fills)
  is_closing_position BOOLEAN DEFAULT false,  -- True if SELL closes any BUY position
  matched_buys JSONB,  -- Array of matched BUY trades: [{"order_hash": "...", "matched_size": 3.5, "matched_pnl": 0.15}, ...]
  -- This allows one SELL to match multiple BUYs (FIFO), and tracks partial matches
  
  -- For BUY trades that get partially/fully closed by SELL(s)
  closed_by_sells JSONB,  -- Array of SELL trades that closed this BUY: [{"order_hash": "...", "matched_size": 2.0}, ...]
  remaining_size NUMERIC,  -- How much of this BUY is still open (after partial SELLs)
  -- If remaining_size > 0, position can still be resolved later
  
  -- Metadata
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  sync_source TEXT DEFAULT 'dome_api',
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_wallet_trade_history_wallet ON wallet_trade_history(wallet_address);
CREATE INDEX idx_wallet_trade_history_timestamp ON wallet_trade_history(timestamp DESC);
CREATE INDEX idx_wallet_trade_history_condition ON wallet_trade_history(condition_id);
CREATE INDEX idx_wallet_trade_history_result ON wallet_trade_history(trade_result) WHERE trade_result IS NOT NULL;
CREATE INDEX idx_wallet_trade_history_composite ON wallet_trade_history(wallet_address, timestamp DESC);

-- Unique constraint
CREATE UNIQUE INDEX idx_wallet_trade_history_unique ON wallet_trade_history(order_hash);
```

## Critical: Avoiding Double-Counting

**The Problem**: A position can be closed in TWO ways:
1. **By SELL trade** (manual close) → Realized PnL = sell_price - buy_price
2. **By market resolution** (automatic close) → Realized PnL = resolution_price - buy_price

**We must NOT count both!**

**Solution**: Track `position_closed_by` field:
- If a BUY is closed by a SELL → Set `position_closed_by = 'sell'` on the BUY, calculate PnL from SELL
- If a BUY resolves without SELL → Set `position_closed_by = 'resolution'` on the BUY, calculate PnL from resolution
- If still open → `position_closed_by = NULL`

**For Performance Queries**: Only count positions once:
```sql
-- Count closed positions (avoid double-counting)
SELECT COUNT(DISTINCT 
  CASE 
    WHEN side = 'BUY' AND position_closed_by IS NOT NULL THEN order_hash
    WHEN side = 'SELL' AND is_closing_position = true THEN matched_buy_order_hash
  END
) as closed_positions
FROM wallet_trade_history
WHERE wallet_address = '0x...'
```

## Result Calculation Logic

### For BUY Trades:
```sql
-- Check if position was closed by SELL or resolution
IF closed_by_sell_order_hash IS NOT NULL THEN
  -- Position was closed by SELL (PnL already calculated from SELL trade)
  position_closed_by = 'sell'
  trade_result = 'closed_by_sell'  -- Don't use resolution result
  trade_pnl = NULL  -- PnL is on the SELL trade, not the BUY
ELSE IF market_resolved = true THEN
  -- Position closed by resolution
  position_closed_by = 'resolution'
  trade_result = CASE
    WHEN token_label = winning_outcome THEN 'win'
    ELSE 'loss'
  END
  trade_pnl = CASE
    WHEN token_label = winning_outcome 
      THEN shares_normalized * (1.00 - price)  -- Win: shares * (1.00 - entry_price)
    ELSE shares_normalized * (0.00 - price)  -- Loss: shares * (0.00 - entry_price)
  END
ELSE
  -- Still open
  position_closed_by = NULL
  trade_result = 'pending'
  trade_pnl = NULL
END IF
```

### For SELL Trades (with Partial Fill Support):
```sql
IF is_closing_position = true AND matched_buys IS NOT NULL AND jsonb_array_length(matched_buys) > 0 THEN
  -- SELL closes one or more BUY positions (handles partial fills)
  -- matched_buys = [{"order_hash": "buy_123", "matched_size": 3.5, "matched_pnl": 0.15}, ...]
  
  -- Calculate total PnL from all matches
  total_matched_pnl = SUM(matched_buys[].matched_pnl)
  
  trade_result = CASE
    WHEN total_matched_pnl > 0 THEN 'closed_profit'
    WHEN total_matched_pnl < 0 THEN 'closed_loss'
    ELSE 'closed_even'
  END
  trade_pnl = total_matched_pnl
  
  -- Update each matched BUY trade:
  -- For each match in matched_buys:
  --   - Add this SELL to BUY's closed_by_sells array
  --   - Reduce BUY's remaining_size by matched_size
  --   - If remaining_size <= 0, set position_closed_by = 'sell'
  --   - If remaining_size > 0, keep position_closed_by = NULL (can still resolve)
  
ELSE
  -- Standalone short (no matching BUY)
  position_closed_by = CASE
    WHEN market_resolved = true THEN 'resolution'
    ELSE NULL
  END
  trade_result = CASE
    WHEN market_resolved = false THEN 'pending'
    WHEN token_label != winning_outcome THEN 'win'  -- Sold Yes, No wins = win
    ELSE 'loss'  -- Sold Yes, Yes wins = loss
  END
  trade_pnl = CASE
    WHEN market_resolved = true AND token_label != winning_outcome
      THEN shares_normalized * (price - 0.00)  -- Win: sold high, buy back at 0.00
    WHEN market_resolved = true AND token_label = winning_outcome
      THEN shares_normalized * (price - 1.00)  -- Loss: sold low, buy back at 1.00
    ELSE NULL
  END
END IF
```

### For BUY Trades (with Partial Close Support):
```sql
-- Check if fully or partially closed by SELL(s)
IF closed_by_sells IS NOT NULL AND jsonb_array_length(closed_by_sells) > 0 THEN
  -- Calculate total matched size from all SELLs
  total_matched_size = SUM(closed_by_sells[].matched_size)
  
  IF total_matched_size >= shares_normalized THEN
    -- Fully closed by SELL(s)
    position_closed_by = 'sell'
    remaining_size = 0
    trade_result = 'closed_by_sell'
    trade_pnl = NULL  -- PnL is on the SELL trade(s), not the BUY
  ELSE
    -- Partially closed by SELL(s), remainder can resolve
    remaining_size = shares_normalized - total_matched_size
    position_closed_by = NULL  -- Still open (partially)
    trade_result = 'partially_closed'
    trade_pnl = NULL  -- Partial PnL on SELLs, remainder on resolution
  END IF
  
ELSE IF market_resolved = true AND remaining_size IS NOT NULL AND remaining_size > 0 THEN
  -- Remaining position closed by resolution
  position_closed_by = 'resolution'
  trade_result = CASE
    WHEN token_label = winning_outcome THEN 'win'
    ELSE 'loss'
  END
  -- PnL only on remaining_size, not original shares_normalized
  trade_pnl = CASE
    WHEN token_label = winning_outcome 
      THEN remaining_size * (1.00 - price)  -- Win on remaining shares
    ELSE remaining_size * (0.00 - price)  -- Loss on remaining shares
  END
  
ELSE IF market_resolved = true AND (remaining_size IS NULL OR remaining_size = 0) THEN
  -- Fully closed by resolution (no SELLs)
  position_closed_by = 'resolution'
  trade_result = CASE
    WHEN token_label = winning_outcome THEN 'win'
    ELSE 'loss'
  END
  trade_pnl = CASE
    WHEN token_label = winning_outcome 
      THEN shares_normalized * (1.00 - price)
    ELSE shares_normalized * (0.00 - price)
  END
  
ELSE
  -- Still fully open
  position_closed_by = NULL
  remaining_size = shares_normalized
  trade_result = 'pending'
  trade_pnl = NULL
END IF
```

## Querying Performance Metrics

### Win Rate (Count Positions, Not Trades):
```sql
-- Count each position only once (whether closed by SELL or resolution)
SELECT 
  wallet_address,
  -- Count winning positions
  COUNT(DISTINCT 
    CASE 
      -- BUY closed by resolution (win)
      WHEN side = 'BUY' AND position_closed_by = 'resolution' AND trade_result = 'win' 
        THEN order_hash
      -- BUY closed by SELL (check SELL trade for profit)
      WHEN side = 'SELL' AND is_closing_position = true AND trade_result = 'closed_profit'
        THEN matched_buy_order_hash
      -- Standalone short resolved (win)
      WHEN side = 'SELL' AND position_closed_by = 'resolution' AND trade_result = 'win'
        THEN order_hash
    END
  ) as winning_positions,
  -- Count total closed positions
  COUNT(DISTINCT 
    CASE 
      WHEN side = 'BUY' AND position_closed_by IS NOT NULL THEN order_hash
      WHEN side = 'SELL' AND is_closing_position = true THEN matched_buy_order_hash
      WHEN side = 'SELL' AND position_closed_by = 'resolution' THEN order_hash
    END
  ) as total_closed_positions,
  -- Calculate win rate
  ROUND(100.0 * 
    COUNT(DISTINCT CASE 
      WHEN side = 'BUY' AND position_closed_by = 'resolution' AND trade_result = 'win' THEN order_hash
      WHEN side = 'SELL' AND is_closing_position = true AND trade_result = 'closed_profit' THEN matched_buy_order_hash
      WHEN side = 'SELL' AND position_closed_by = 'resolution' AND trade_result = 'win' THEN order_hash
    END)
    / NULLIF(COUNT(DISTINCT CASE 
      WHEN side = 'BUY' AND position_closed_by IS NOT NULL THEN order_hash
      WHEN side = 'SELL' AND is_closing_position = true THEN matched_buy_order_hash
      WHEN side = 'SELL' AND position_closed_by = 'resolution' THEN order_hash
    END), 0), 2) as win_rate
FROM wallet_trade_history
WHERE wallet_address = '0x...'
GROUP BY wallet_address;
```

### Total PnL (Handles Partial Fills):
```sql
-- Sum PnL from:
-- 1. SELL trades that close positions (have matched_buys with PnL)
-- 2. BUY trades with remaining_size resolved (PnL on remaining portion)
-- 3. Standalone shorts resolved
SELECT 
  wallet_address,
  SUM(COALESCE(trade_pnl, 0)) as total_pnl
FROM wallet_trade_history
WHERE wallet_address = '0x...'
  AND (
    -- SELL trades that close positions (PnL from matched_buys)
    (side = 'SELL' AND is_closing_position = true AND trade_pnl IS NOT NULL)
    -- BUY trades with remaining_size resolved (PnL on remaining portion only)
    OR (side = 'BUY' AND position_closed_by = 'resolution' AND remaining_size IS NOT NULL AND remaining_size > 0 AND trade_pnl IS NOT NULL)
    -- BUY trades fully resolved (no SELLs, full PnL)
    OR (side = 'BUY' AND position_closed_by = 'resolution' AND (remaining_size IS NULL OR remaining_size = 0) AND trade_pnl IS NOT NULL)
    -- Standalone shorts resolved
    OR (side = 'SELL' AND position_closed_by = 'resolution' AND trade_pnl IS NOT NULL)
  )
GROUP BY wallet_address;
```

**Note**: This correctly handles partial fills:
- SELL of 3 shares: PnL = +$0.30 (stored on SELL trade)
- SELL of 4 shares: PnL = +$0.60 (stored on SELL trade)  
- BUY remaining 3 shares: PnL = +$0.12 (stored on BUY trade, only for remaining_size)
- Total = $0.30 + $0.60 + $0.12 = $1.02 ✅

### Trade Count:
```sql
SELECT 
  wallet_address,
  COUNT(*) as total_trades,
  COUNT(*) FILTER (WHERE side = 'BUY') as buy_trades,
  COUNT(*) FILTER (WHERE side = 'SELL') as sell_trades
FROM wallet_trade_history
WHERE wallet_address = '0x...'
GROUP BY wallet_address;
```

## Advantages of Single Table

✅ **Simple Queries**: Everything in one place, no joins needed  
✅ **Fast Performance**: Single table scan with indexes  
✅ **Easy to Understand**: One source of truth  
✅ **Flexible**: Can add more fields later without schema changes  
✅ **Direct Results**: Results calculated once during backfill, stored for fast queries  

## Trade-Offs

⚠️ **SELL Matching Complexity**: Need to process trades chronologically to match SELLs to BUYs  
⚠️ **Data Redundancy**: Resolution data stored per trade (but markets can have many trades)  
✅ **Mitigation**: Resolution data is small, and we can batch enrich efficiently  

## Alternative: Two Tables (If You Want Separation)

If you prefer separation of concerns:

### Table 1: `wallet_trades` (Raw trade data)
- Just the trade data from Dome API
- No resolution, no results

### Table 2: `wallet_trade_results` (Calculated results)
- References `wallet_trades` via `order_hash`
- Stores resolution data and calculated results
- Can be updated independently

**But this adds complexity:**
- Need joins for every query
- More complex to keep in sync
- Harder to understand

**Recommendation**: Stick with single table unless you have a specific need for separation.

## Example: How It Prevents Double-Counting

**Scenario**: Trader buys "Yes" at $0.60, then sells at $0.80, then market resolves with "Yes" winning.

**What gets stored:**

| order_hash | side | price | position_closed_by | trade_result | trade_pnl | matched_buy_order_hash |
|------------|------|-------|-------------------|--------------|-----------|----------------------|
| buy_123 | BUY | 0.60 | **'sell'** | 'closed_by_sell' | NULL | NULL |
| sell_456 | SELL | 0.80 | NULL | 'closed_profit' | **+0.20** | buy_123 |

**Key Points:**
- BUY has `position_closed_by = 'sell'` → Don't use resolution result
- BUY has `trade_pnl = NULL` → PnL is on the SELL trade
- SELL has `trade_pnl = +0.20` → This is the realized PnL
- When market resolves, we DON'T update the BUY because it's already closed by SELL

**Result**: Position counted once (as closed by SELL with +$0.20 profit), not twice.

**If market resolved first (no SELL):**

| order_hash | side | price | position_closed_by | trade_result | trade_pnl |
|------------|------|-------|-------------------|--------------|-----------|
| buy_123 | BUY | 0.60 | **'resolution'** | 'win' | **+0.40** |

**Result**: Position counted once (as closed by resolution with +$0.40 profit).

This ensures each position is counted exactly once, whether closed by SELL or resolution.

## Example: Partial Fills

**Scenario**: Trader buys 10 shares at $0.60, sells 3 at $0.70, sells 4 at $0.75, then market resolves with remaining 3 shares.

**What gets stored:**

| order_hash | side | shares | price | remaining_size | position_closed_by | matched_buys / closed_by_sells | trade_pnl |
|------------|------|--------|-------|----------------|-------------------|--------------------------------|-----------|
| buy_123 | BUY | 10.0 | 0.60 | **3.0** | **'resolution'** | `[{"order_hash": "sell_456", "matched_size": 3.0}, {"order_hash": "sell_789", "matched_size": 4.0}]` | **+0.12** (on remaining 3) |
| sell_456 | SELL | 3.0 | 0.70 | NULL | NULL | `[{"order_hash": "buy_123", "matched_size": 3.0, "matched_pnl": 0.30}]` | **+0.30** |
| sell_789 | SELL | 4.0 | 0.75 | NULL | NULL | `[{"order_hash": "buy_123", "matched_size": 4.0, "matched_pnl": 0.60}]` | **+0.60** |

**Key Points:**
- BUY has `remaining_size = 3.0` (10 - 3 - 4 = 3)
- BUY has `closed_by_sells` showing both SELLs that partially closed it
- Each SELL has `matched_buys` showing which BUY and how much
- SELLs have PnL for their portion: +$0.30 and +$0.60
- BUY has PnL only for remaining portion: +$0.12 (3 shares × $0.40 profit)
- Total PnL = $0.30 + $0.60 + $0.12 = **$1.02** ✅

**When counting positions:**
- Count the BUY once (it's the position)
- Sum PnL from: SELL trades (for closed portions) + BUY trade (for resolved portion)
- Never double-count

**Result**: One position, properly split between SELLs and resolution, all PnL accounted for.

## FIFO Matching Algorithm (for Partial Fills)

**Process trades chronologically (sorted by timestamp):**

```javascript
// Track position state per condition_id + token_label
const positions = new Map()  // key: condition_id + token_label

for (const trade of sortedTrades) {
  const key = `${trade.condition_id}-${trade.token_label}`
  let position = positions.get(key) || {
    buyQueue: [],  // FIFO queue: [{order_hash, price, size, timestamp}]
    netSize: 0
  }
  
  if (trade.side === 'BUY') {
    // Add to buy queue
    position.buyQueue.push({
      order_hash: trade.order_hash,
      price: trade.price,
      size: trade.shares_normalized,
      timestamp: trade.timestamp
    })
    position.netSize += trade.shares_normalized
    trade.remaining_size = trade.shares_normalized
    trade.closed_by_sells = []
    
  } else if (trade.side === 'SELL') {
    let remainingSellSize = trade.shares_normalized
    const matchedBuys = []
    
    // Match against buy queue (FIFO)
    while (remainingSellSize > 0 && position.buyQueue.length > 0) {
      const buy = position.buyQueue[0]
      const matchSize = Math.min(remainingSellSize, buy.size)
      const matchedPnl = (trade.price - buy.price) * matchSize
      
      matchedBuys.push({
        order_hash: buy.order_hash,
        matched_size: matchSize,
        matched_pnl: matchedPnl
      })
      
      // Update BUY trade
      buy.size -= matchSize
      buy.remaining_size -= matchSize
      buy.closed_by_sells.push({
        order_hash: trade.order_hash,
        matched_size: matchSize
      })
      
      // If BUY fully closed, remove from queue
      if (buy.size <= 0.00001) {
        position.buyQueue.shift()
        buy.position_closed_by = 'sell'
      }
      
      remainingSellSize -= matchSize
    }
    
    if (matchedBuys.length > 0) {
      trade.is_closing_position = true
      trade.matched_buys = matchedBuys
      trade.trade_pnl = matchedBuys.reduce((sum, m) => sum + m.matched_pnl, 0)
      position.netSize -= trade.shares_normalized
    } else {
      // Standalone short
      trade.is_closing_position = false
      position.netSize -= trade.shares_normalized
    }
  }
  
  positions.set(key, position)
}

// After all trades processed, check remaining positions for resolution
for (const [key, position] of positions) {
  for (const buy of position.buyQueue) {
    if (buy.remaining_size > 0 && marketResolved) {
      // Calculate PnL on remaining_size only
      buy.trade_pnl = calculateResolutionPnl(buy, winningOutcome)
      buy.position_closed_by = 'resolution'
    }
  }
}
```

This ensures:
- ✅ Multiple SELLs can partially close one BUY
- ✅ One SELL can partially close multiple BUYs (FIFO)
- ✅ Remaining position after partial SELLs gets resolved correctly
- ✅ No double-counting of PnL
