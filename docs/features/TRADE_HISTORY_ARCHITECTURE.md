# Trade History Architecture: Trades vs Positions

## The Core Question

**What do we need to query?**
1. ✅ **Individual trade history** - "Show me all trades for this trader"
2. ✅ **Performance metrics** - "What's the win rate? Total PnL?"
3. ✅ **Open positions** - "What positions are still open?"
4. ✅ **Position details** - "Show me this position's trades"

## Option 1: Trades Table Only (Current Plan)

### Schema
- `wallet_trade_history` - All individual trades (BUY + SELL)

### Pros
- ✅ Single source of truth
- ✅ Complete audit trail
- ✅ Can reconstruct positions from trades
- ✅ Simple to maintain
- ✅ No sync issues

### Cons
- ❌ Complex queries for performance metrics (need to process chronologically)
- ❌ Slow win rate calculations (need to match SELLs to BUYs every time)
- ❌ Need to recalculate positions on every query
- ❌ Hard to query "open positions" efficiently

### Query Complexity
```sql
-- Win rate: Need to process all trades chronologically, match SELLs to BUYs, track positions
-- This is complex and slow for large datasets
```

---

## Option 2: Positions Table Only

### Schema
- `wallet_positions` - Aggregated positions (one row per position)

### Pros
- ✅ Fast performance queries
- ✅ Easy win rate calculation
- ✅ Simple open positions query
- ✅ Direct PnL access

### Cons
- ❌ Lose individual trade history
- ❌ Can't show "all trades" timeline
- ❌ Hard to audit (where did this position come from?)
- ❌ Partial fills become complex (need to track in JSONB)

### Query Complexity
```sql
-- Win rate: Simple!
SELECT COUNT(*) FILTER (WHERE realized_pnl > 0) / COUNT(*) 
FROM wallet_positions WHERE wallet_address = '0x...'
```

---

## Option 3: Both Tables (Recommended) ⭐

### Schema

#### Table 1: `wallet_trade_history` (Source of Truth)
- All individual trades (BUY + SELL)
- Raw data from Dome API
- Complete audit trail
- Used for: Trade history timeline, individual trade details

#### Table 2: `wallet_positions` (Derived/Aggregated)
- One row per position (condition_id + token_label)
- Calculated from trades during backfill
- Used for: Performance metrics, open positions, win rate

### Relationship
- Positions are **calculated from trades** during backfill
- Positions table is a **materialized view** of trades
- Can be recalculated from trades if needed (data integrity)

### Pros
- ✅ **Fast performance queries** - Direct position access
- ✅ **Complete trade history** - All individual trades preserved
- ✅ **Best of both worlds** - Fast metrics + detailed history
- ✅ **Data integrity** - Can recalculate positions from trades
- ✅ **Flexible** - Can query either level of detail

### Cons
- ⚠️ **Two tables to maintain** - But positions are derived, so sync is straightforward
- ⚠️ **More storage** - But positions are small (one per market+outcome)

### Architecture

```
┌─────────────────────┐
│ Dome API            │
│ (Trade History)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Backfill Script     │
│ 1. Fetch trades     │
│ 2. Process FIFO     │
│ 3. Calculate pos.    │
└──────────┬──────────┘
           │
           ├─────────────────┐
           ▼                 ▼
┌─────────────────────┐  ┌─────────────────────┐
│ wallet_trade_       │  │ wallet_positions    │
│ history             │  │                     │
│ (Individual trades) │  │ (Aggregated)        │
└─────────────────────┘  └─────────────────────┘
           │                       │
           │                       │
           └───────────┬───────────┘
                       ▼
              ┌─────────────────┐
              │ API Queries     │
              │ - Trade history │
              │ - Performance  │
              └─────────────────┘
```

---

## Recommended: Option 3 (Both Tables)

### Table 1: `wallet_trade_history`
```sql
CREATE TABLE wallet_trade_history (
  -- Trade identification
  id UUID PRIMARY KEY,
  order_hash TEXT UNIQUE NOT NULL,
  
  -- Trade data (from Dome API)
  wallet_address TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  token_label TEXT,  -- "Yes" or "No"
  side TEXT NOT NULL,  -- "BUY" or "SELL"
  price NUMERIC NOT NULL,
  shares_normalized NUMERIC NOT NULL,
  timestamp BIGINT NOT NULL,
  market_slug TEXT,
  market_title TEXT,
  
  -- Position tracking (for matching)
  position_key TEXT,  -- "condition_id-token_label" (for grouping)
  matched_buys JSONB,  -- For SELLs: which BUYs matched
  closed_by_sells JSONB,  -- For BUYs: which SELLs closed it
  remaining_size NUMERIC,  -- For BUYs: how much still open
  
  -- Resolution (from Gamma API)
  market_resolved BOOLEAN DEFAULT false,
  winning_outcome TEXT,
  market_resolved_at BIGINT,
  
  -- Trade-level result (for individual trade queries)
  trade_result TEXT,  -- 'win', 'loss', 'pending', etc.
  trade_pnl NUMERIC,  -- PnL for this specific trade
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Table 2: `wallet_positions`
```sql
CREATE TABLE wallet_positions (
  id UUID PRIMARY KEY,
  
  -- Position identification
  wallet_address TEXT NOT NULL,
  condition_id TEXT NOT NULL,
  token_label TEXT NOT NULL,
  position_key TEXT NOT NULL UNIQUE,  -- "condition_id-token_label"
  
  -- Position state
  status TEXT NOT NULL,  -- 'open', 'closed_by_sell', 'closed_by_resolution'
  net_size NUMERIC NOT NULL,  -- Current position size (can be negative for shorts)
  
  -- Entry (from BUY trades)
  total_buy_shares NUMERIC NOT NULL DEFAULT 0,
  total_buy_cost NUMERIC NOT NULL DEFAULT 0,
  avg_entry_price NUMERIC,  -- total_buy_cost / total_buy_shares
  
  -- Exit (from SELL trades or resolution)
  total_sell_shares NUMERIC NOT NULL DEFAULT 0,
  total_sell_proceeds NUMERIC NOT NULL DEFAULT 0,
  
  -- PnL
  realized_pnl NUMERIC,  -- From SELL trades (FIFO matched)
  resolution_pnl NUMERIC,  -- From market resolution (on remaining_size)
  total_pnl NUMERIC,  -- realized_pnl + resolution_pnl
  
  -- Resolution
  market_resolved BOOLEAN DEFAULT false,
  winning_outcome TEXT,
  market_resolved_at BIGINT,
  
  -- Timestamps
  first_trade_at BIGINT,  -- Earliest trade timestamp
  last_trade_at BIGINT,  -- Latest trade timestamp
  closed_at BIGINT,  -- When position closed (sell or resolution)
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_wallet_positions_key ON wallet_positions(position_key);
CREATE INDEX idx_wallet_positions_wallet ON wallet_positions(wallet_address);
CREATE INDEX idx_wallet_positions_status ON wallet_positions(status) WHERE status = 'open';
```

### Backfill Process

```javascript
// 1. Fetch all trades for wallet
const trades = await fetchAllTradeHistory(wallet)

// 2. Process trades chronologically to build positions
const positions = new Map()  // key: position_key

for (const trade of trades.sort((a, b) => a.timestamp - b.timestamp)) {
  const positionKey = `${trade.condition_id}-${trade.token_label}`
  let position = positions.get(positionKey) || createNewPosition(trade)
  
  if (trade.side === 'BUY') {
    position.total_buy_shares += trade.shares_normalized
    position.total_buy_cost += trade.price * trade.shares_normalized
    position.net_size += trade.shares_normalized
  } else {
    // Match SELL to BUYs using FIFO
    matchSellToBuys(trade, position)
    position.total_sell_shares += trade.shares_normalized
    position.total_sell_proceeds += trade.price * trade.shares_normalized
    position.net_size -= trade.shares_normalized
  }
  
  positions.set(positionKey, position)
}

// 3. Calculate final PnL for each position
for (const position of positions.values()) {
  if (position.net_size > 0 && marketResolved) {
    position.resolution_pnl = calculateResolutionPnl(position)
  }
  position.total_pnl = position.realized_pnl + position.resolution_pnl
}

// 4. Upsert both tables
await upsertTrades(trades)  // Individual trades
await upsertPositions(positions)  // Aggregated positions
```

### Query Examples

**Trade History (from trades table):**
```sql
SELECT * FROM wallet_trade_history 
WHERE wallet_address = '0x...' 
ORDER BY timestamp DESC;
```

**Win Rate (from positions table):**
```sql
SELECT 
  COUNT(*) FILTER (WHERE total_pnl > 0) as wins,
  COUNT(*) FILTER (WHERE status != 'open') as total_closed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE total_pnl > 0) 
    / NULLIF(COUNT(*) FILTER (WHERE status != 'open'), 0), 2) as win_rate
FROM wallet_positions
WHERE wallet_address = '0x...';
```

**Open Positions (from positions table):**
```sql
SELECT * FROM wallet_positions 
WHERE wallet_address = '0x...' AND status = 'open';
```

**Position Details (join both):**
```sql
SELECT 
  p.*,
  json_agg(t ORDER BY t.timestamp) as trades
FROM wallet_positions p
LEFT JOIN wallet_trade_history t 
  ON t.position_key = p.position_key
WHERE p.wallet_address = '0x...'
GROUP BY p.id;
```

---

## Comparison

| Use Case | Trades Only | Positions Only | Both Tables |
|----------|-------------|----------------|-------------|
| Show trade history | ✅ Fast | ❌ Can't | ✅ Fast |
| Calculate win rate | ❌ Slow (complex) | ✅ Fast | ✅ Fast |
| Show open positions | ❌ Slow | ✅ Fast | ✅ Fast |
| Position details | ❌ Complex | ⚠️ Limited | ✅ Complete |
| Audit trail | ✅ Complete | ❌ Lost | ✅ Complete |
| Storage | Low | Low | Medium |
| Maintenance | Simple | Simple | Moderate |
| Query complexity | High | Low | Low |

---

## Recommendation: **Both Tables** ⭐

**Why:**
1. **Performance** - Fast queries for metrics (positions table)
2. **Completeness** - Full trade history preserved (trades table)
3. **Flexibility** - Can query at either level
4. **Data integrity** - Positions derived from trades, can recalculate
5. **Matches your pattern** - Similar to `orders` + `orders_copy_enriched`

**Implementation:**
- Backfill script calculates both during processing
- Positions table is a "materialized view" of trades
- Can add a cron job to recalculate positions if needed
- Trades table is source of truth

**Storage overhead:** Minimal - positions are small (one per market+outcome, not per trade)

This gives you the best of both worlds: fast performance queries AND complete trade history.
