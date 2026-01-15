# Trade History Backfill - Summary & Architecture

## What We're Building

A system to backfill and track complete trade history for top traders, enabling:
- ✅ Complete trade timeline (all BUY/SELL transactions)
- ✅ Performance metrics (win rate, total PnL, ROI)
- ✅ Position tracking (open/closed positions)
- ✅ Trade-level and position-level analysis

---

## The Core Challenge

**Trades vs Positions: What's the difference?**

- **Trade** = Individual transaction (one BUY or one SELL)
- **Position** = Aggregated state (all BUYs + SELLs for a market+outcome)

**Example:**
- Trade 1: BUY 10 shares @ $0.60
- Trade 2: SELL 3 shares @ $0.70
- Trade 3: SELL 4 shares @ $0.75
- Trade 4: Market resolves (remaining 3 shares)

**Result:**
- **3 trades** (BUY + 2 SELLs)
- **1 position** (closed by partial SELLs + resolution)

---

## Data Model Decision: **Both Tables** ⭐

### Why Not Just Trades?
❌ **Trades-only approach:**
- Need to process chronologically every time
- Complex queries for win rate (match SELLs to BUYs)
- Slow performance metrics
- Hard to query "open positions"

### Why Not Just Positions?
❌ **Positions-only approach:**
- Lose individual trade history
- Can't show trade timeline
- No audit trail
- Partial fills become complex

### ✅ **Both Tables Solution:**
- **Trades table** = Source of truth (all individual transactions)
- **Positions table** = Aggregated view (one row per market+outcome)
- Positions calculated from trades during backfill
- Fast queries for both use cases

---

## Architecture

```
┌─────────────────────┐
│ Dome API            │
│ /polymarket/orders  │
│ (Trade History)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Backfill Script     │
│ 1. Fetch trades     │
│ 2. Enrich with      │
│    Gamma API        │
│ 3. Process FIFO     │
│ 4. Calculate PnL    │
└──────────┬──────────┘
           │
           ├─────────────────┐
           ▼                 ▼
┌─────────────────────┐  ┌─────────────────────┐
│ wallet_trade_       │  │ wallet_positions    │
│ history             │  │                     │
│ (Individual trades) │  │ (Aggregated)        │
│                     │  │                     │
│ - order_hash        │  │ - position_key      │
│ - side (BUY/SELL)   │  │ - status            │
│ - price, shares     │  │ - total_pnl         │
│ - matched_buys      │  │ - realized_pnl      │
│ - remaining_size    │  │ - resolution_pnl    │
│ - trade_pnl         │  │ - net_size          │
└─────────────────────┘  └─────────────────────┘
```

---

## Key Data Points

### From Dome API (`/polymarket/orders`):
- ✅ `token_label` - Outcome ("Yes" or "No")
- ✅ `side` - "BUY" or "SELL"
- ✅ `price`, `shares_normalized`
- ✅ `timestamp`, `order_hash`
- ✅ `condition_id`, `market_slug`, `title`
- ✅ `user` (maker), `taker`

### From Gamma API (enrichment):
- ✅ `resolved` - Market resolution status
- ✅ `winningOutcome` - Which outcome won
- ✅ `closed` - Market closed for new bets
- ✅ `outcomePrices` - Current prices

---

## Critical Logic: Handling SELLs & Partial Fills

### The Problem
- SELL trades can close positions (match to BUYs)
- SELL trades can be standalone shorts
- Partial fills: One BUY can be closed by multiple SELLs
- Mixed closures: Some shares closed by SELL, some by resolution

### The Solution: FIFO Matching

**Process trades chronologically:**
1. BUY trades → Add to position, track `remaining_size`
2. SELL trades → Match to BUYs using FIFO (First In First Out)
   - If matches BUY → `is_closing_position = true`, calculate PnL
   - If no match → Standalone short, `is_closing_position = false`
3. Remaining BUY shares → Calculate PnL on `remaining_size` when resolved

**Example:**
```
BUY 10 @ $0.60  → remaining_size = 10
SELL 3 @ $0.70  → matches BUY, PnL = +$0.30 (on SELL)
                 → BUY remaining_size = 7
SELL 4 @ $0.75  → matches BUY, PnL = +$0.60 (on SELL)
                 → BUY remaining_size = 3
Resolve          → PnL = +$0.12 (on BUY, for remaining 3)
Total PnL = $1.02 ✅
```

---

## Database Schema

### Table 1: `wallet_trade_history`
**Purpose:** Individual trade records (source of truth)

**Key Fields:**
- `order_hash` (unique) - Trade identifier
- `side` - "BUY" or "SELL"
- `price`, `shares_normalized` - Trade details
- `position_key` - Links to position (`condition_id-token_label`)
- `matched_buys` (JSONB) - For SELLs: which BUYs matched
- `closed_by_sells` (JSONB) - For BUYs: which SELLs closed it
- `remaining_size` - For BUYs: how much still open
- `trade_pnl` - PnL for this specific trade
- `market_resolved`, `winning_outcome` - From Gamma API

### Table 2: `wallet_positions`
**Purpose:** Aggregated positions (for fast queries)

**Key Fields:**
- `position_key` (unique) - `condition_id-token_label`
- `status` - 'open', 'closed_by_sell', 'closed_by_resolution'
- `net_size` - Current position size
- `total_buy_shares`, `total_buy_cost` - Entry
- `total_sell_shares`, `total_sell_proceeds` - Exit
- `realized_pnl` - From SELL trades
- `resolution_pnl` - From market resolution
- `total_pnl` - Sum of both

---

## Query Patterns

### Fast Performance Metrics (from positions table):
```sql
-- Win rate
SELECT 
  COUNT(*) FILTER (WHERE total_pnl > 0) / COUNT(*) as win_rate
FROM wallet_positions
WHERE wallet_address = '0x...' AND status != 'open';
```

### Complete Trade History (from trades table):
```sql
SELECT * FROM wallet_trade_history 
WHERE wallet_address = '0x...' 
ORDER BY timestamp DESC;
```

### Position Details (join both):
```sql
SELECT p.*, json_agg(t) as trades
FROM wallet_positions p
LEFT JOIN wallet_trade_history t ON t.position_key = p.position_key
WHERE p.wallet_address = '0x...'
GROUP BY p.id;
```

---

## Why This Architecture?

1. **Performance** ⚡
   - Fast metrics queries (positions table)
   - No need to process trades every time

2. **Completeness** 📊
   - Full trade history preserved (trades table)
   - Complete audit trail

3. **Flexibility** 🔄
   - Query at trade level or position level
   - Can recalculate positions from trades if needed

4. **Data Integrity** ✅
   - Positions derived from trades (single source of truth)
   - Can rebuild positions table from trades

5. **Matches Existing Pattern** 🎯
   - Similar to `orders` + `orders_copy_enriched`
   - Raw data + aggregated view

---

## Storage Overhead

**Minimal:**
- Trades: One row per transaction
- Positions: One row per market+outcome combination

**Example:**
- 10,000 trades across 500 positions
- = 10,000 trade rows + 500 position rows
- Positions are small (aggregated data)

---

## Next Steps

1. ✅ Create database migration (both tables)
2. ✅ Build backfill script (`backfill-wallet-trade-history.js`)
3. ✅ Implement FIFO matching logic
4. ✅ Enrich with Gamma API resolution data
5. ✅ Set up Vercel cron job
6. ✅ Build API endpoints for queries

---

## Key Takeaways

- **Two tables** = Best of both worlds (performance + completeness)
- **Trades table** = Source of truth (all individual transactions)
- **Positions table** = Materialized view (fast queries)
- **FIFO matching** = Handles partial fills correctly
- **Gamma API** = Enriches with resolution data
- **Minimal overhead** = Positions are small (one per market+outcome)

This architecture gives you fast performance queries AND complete trade history, with proper handling of partial fills, SELLs, and market resolutions.
