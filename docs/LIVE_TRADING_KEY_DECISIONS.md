# Live Trading System - Key Decisions & Next Steps

**Date:** February 8, 2026  
**Quick Reference:** Key architectural decisions and immediate next steps

---

## 🎯 Core Decisions

### 1. **Sub-Wallets vs Real Wallets**
**Decision**: Start with **sub-wallets** (virtual tracking), consider real Polymarket wallets in Phase 2.

**Rationale**:
- Faster to implement
- Easier P&L tracking per strategy
- No user friction
- Can migrate to real wallets later

### 2. **Database Architecture**
**Decision**: Three new tables + extend `orders` table

**Tables**:
- `lt_strategies` - Live strategy configs (1:1 with FT wallets)
- `lt_orders` - Links FT signals to real orders
- `lt_execution_quality` - Rich execution metrics
- `orders` - Extended with `lt_strategy_id`, `lt_order_id`, `signal_price`, `signal_size_usd`

### 3. **Execution Logic**
**Decision**: Reuse FT sync logic exactly, extract to shared module

**Benefits**:
- Ensures apples-to-apples comparison
- Validates FT assumptions
- Identifies execution quality impact

### 4. **Naming Convention**
**Decision**: `LT_{FT_WALLET_ID}` format

**Examples**:
- `LT_FT_HIGH_CONVICTION`
- `LT_FT_SHARP_SHOOTER`
- `LT_FT_ML_SHARP_SHOOTER`

### 5. **Performance Comparison**
**Decision**: Only compare trades after `launched_at` timestamp

**Implementation**:
- Filter FT orders: `WHERE order_time >= lt_strategy.launched_at`
- Show "since launch" metrics
- Side-by-side comparison dashboard

---

## 🔧 Technical Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| **Partial Fills** | Track `fill_rate`, calculate PnL on actual fills |
| **Order Rejections** | Record reason, skip (don't retry), report rate |
| **Price Movement** | Record `signal_price` vs `executed_price`, reject if slippage > tolerance |
| **FT Config Changes** | `sync_ft_changes` flag, auto-update non-breaking changes |
| **Timing Comparison** | Use `launched_at` timestamp, filter FT orders accordingly |
| **Capital Management** | Track `current_exposure`, enforce `max_total_exposure` |
| **Execution Latency** | Record `execution_latency_ms`, alert if > threshold |

---

## 📊 Execution Quality Metrics

### Slippage Types
1. **Signal Slippage**: `(executed_price - signal_price) / signal_price`
2. **Mid-Price Slippage**: `(executed_price - mid_price) / mid_price`

### Key Metrics
- **Fill Rate**: `executed_size / signal_size`
- **Order Latency**: Signal → Order placement
- **Fill Latency**: Order placement → First fill
- **Quality Score**: Composite (0-100) based on slippage, fill rate, latency

### Default Settings
- **Slippage Tolerance**: 0.5% (configurable per strategy)
- **Order Type**: GTC (Good-Til-Cancelled)
- **Min Order Size**: $1.00
- **Max Order Size**: $100.00

---

## 🚀 Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Database migrations
- [ ] API endpoints (strategies, execute, resolve)
- [ ] Extract shared FT logic

### Phase 2: Execution Engine (Week 2-3)
- [ ] Build `lt_executor` (reuse FT logic)
- [ ] Build `lt_resolve` (check fills, resolve positions)
- [ ] Add cron jobs

### Phase 3: Execution Quality (Week 3-4)
- [ ] Slippage calculation
- [ ] Fill rate tracking
- [ ] Latency measurement
- [ ] Quality score

### Phase 4: UI & Controls (Week 4-5)
- [ ] Strategy management UI
- [ ] Performance dashboard
- [ ] Order tracking UI

### Phase 5: Testing (Week 5-6)
- [ ] Test with small capital
- [ ] Monitor execution quality
- [ ] Tune parameters

---

## 📝 Key SQL Schemas

### lt_strategies
```sql
strategy_id TEXT PRIMARY KEY,  -- "LT_FT_HIGH_CONVICTION"
ft_wallet_id TEXT REFERENCES ft_wallets(wallet_id),
user_id UUID REFERENCES auth.users(id),
is_active BOOLEAN,
is_paused BOOLEAN,
launched_at TIMESTAMPTZ,
starting_capital DECIMAL(12,2),
slippage_tolerance_pct DECIMAL(5,3) DEFAULT 0.5
```

### lt_orders
```sql
lt_order_id UUID PRIMARY KEY,
strategy_id TEXT REFERENCES lt_strategies(strategy_id),
order_id UUID REFERENCES orders(order_id),
ft_order_id UUID REFERENCES ft_orders(order_id),
source_trade_id TEXT,
signal_price DECIMAL(6,4),
executed_price DECIMAL(6,4),
slippage_pct DECIMAL(6,4),
fill_rate DECIMAL(5,4),
status TEXT,  -- PENDING, PARTIAL, FILLED, REJECTED
outcome TEXT  -- OPEN, WON, LOST
```

---

## 🎨 User Experience Highlights

### Creating Strategy
1. Select FT wallet to mirror
2. Set capital allocation
3. Configure execution settings
4. Launch strategy

### Dashboard View
- Performance metrics (P&L, win rate)
- Execution quality (slippage, fill rate)
- Comparison to FT (side-by-side)
- Open positions
- Recent orders

### Order Details
- Signal details (from FT)
- Execution details (actual fills)
- Execution quality metrics
- Comparison to FT

---

## ⚠️ Important Considerations

### Slippage Management
- **Pre-order**: Check order book depth, estimate slippage
- **Post-order**: Compare actual vs expected, identify patterns
- **Dynamic**: Adjust tolerance based on market conditions

### Capital Management
- Track `current_exposure = SUM(size WHERE outcome='OPEN')`
- Available capital: `starting_capital + realized_pnl - open_exposure`
- Enforce `max_total_exposure` limit

### FT Strategy Sync
- `sync_ft_changes` flag controls auto-update
- Only sync non-breaking changes (filters, thresholds)
- Don't auto-sync capital/allocation (user decision)

---

## 🔗 Integration Points

### With Forward Testing
- Reuse `ft/sync` evaluation logic
- Link via `ft_order_id` and `source_trade_id`
- Compare performance side-by-side

### With Orders System
- Extend `orders` table with LT metadata
- Reuse existing order refresh logic
- Single source of truth for order state

### With User System
- One strategy per user per FT wallet
- Link to user's Polymarket wallet
- Track capital per strategy

---

## 📈 Success Metrics

### Execution Quality
- Average slippage < 0.5%
- Fill rate > 95%
- Order latency < 2 seconds
- Rejection rate < 5%

### Performance
- Live P&L within 10% of FT P&L (accounting for execution quality)
- Win rate matches FT win rate
- Execution quality score > 80

---

## 🛠️ Next Immediate Steps

1. **Review Architecture Plan** (`LIVE_TRADING_ARCHITECTURE_PLAN.md`)
2. **Create Database Migrations**
   - `lt_strategies` table
   - `lt_orders` table
   - `lt_execution_quality` table
   - Extend `orders` table
3. **Extract Shared Logic**
   - Create `lib/ft-sync/shared-logic.ts`
   - Move trade evaluation from `ft/sync` to shared module
4. **Build API Endpoints**
   - `POST /api/lt/strategies` - Create strategy
   - `GET /api/lt/strategies` - List strategies
   - `POST /api/lt/execute` - Execute trades
   - `POST /api/lt/resolve` - Resolve positions
5. **Add Cron Jobs**
   - `lt-execute` (every 2 min)
   - `lt-resolve` (every 10 min)

---

**Ready to start implementation?** Begin with Phase 1: Database migrations and API endpoints.
