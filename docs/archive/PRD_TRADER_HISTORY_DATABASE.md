# PRD: Complete Trader History Database System

**Status**: 📋 Planning Phase  
**Priority**: P1 - High  
**Estimated Timeline**: 4-6 hours implementation + 1-2 weeks data collection  
**Dependencies**: Supabase, Fly.io cron jobs

---

## 🎯 Problem Statement

### Current Limitations
- **Only 100 trades visible** per trader (Polymarket API limitation)
- **Estimated performance metrics** based on incomplete data
- **No historical trend analysis** beyond visible trades
- **Inaccurate win rates** calculated from limited sample
- **Can't track trader evolution** over time
- **No portfolio tracking** for premium users

### Impact on Users
- ❌ Can't see full trading history of traders they follow
- ❌ Performance metrics are approximations, not real data
- ❌ Can't make informed decisions based on complete history
- ❌ Missing context for trader's long-term performance
- ❌ No way to track their own copied trades over time

---

## 🚀 Proposed Solution

Build a **comprehensive trade history database** that:
1. Stores all trades for followed/featured traders
2. Syncs regularly via background jobs
3. Provides complete, accurate historical data
4. Enables advanced analytics and features

---

## 📐 Technical Architecture

### 1. Database Schema

#### New Table: `trader_trades_history`

```sql
CREATE TABLE trader_trades_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Trade Identification
  trade_id TEXT NOT NULL UNIQUE,  -- Polymarket's unique trade ID
  trader_wallet TEXT NOT NULL,
  
  -- Trade Details
  market_id TEXT NOT NULL,
  market_title TEXT NOT NULL,
  market_slug TEXT,
  condition_id TEXT,
  
  -- Trade Execution
  side TEXT NOT NULL,  -- 'BUY' or 'SELL'
  outcome TEXT NOT NULL,
  size NUMERIC NOT NULL,
  price NUMERIC NOT NULL,
  timestamp BIGINT NOT NULL,
  
  -- Trade Status
  status TEXT DEFAULT 'open',  -- 'open', 'closed', 'resolved'
  closed_at BIGINT,
  exit_price NUMERIC,
  pnl NUMERIC,  -- Profit/Loss when closed
  
  -- Market Metadata
  category TEXT,  -- 'politics', 'sports', etc.
  resolved BOOLEAN DEFAULT false,
  resolved_outcome TEXT,
  resolved_at BIGINT,
  
  -- Sync Metadata
  first_seen_at TIMESTAMP DEFAULT NOW(),
  last_updated_at TIMESTAMP DEFAULT NOW(),
  sync_source TEXT DEFAULT 'api',  -- 'api', 'manual', 'backfill'
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_trader_trades_wallet ON trader_trades_history(trader_wallet);
CREATE INDEX idx_trader_trades_timestamp ON trader_trades_history(timestamp DESC);
CREATE INDEX idx_trader_trades_market ON trader_trades_history(market_id);
CREATE INDEX idx_trader_trades_status ON trader_trades_history(status);
CREATE INDEX idx_trader_trades_category ON trader_trades_history(category);
CREATE INDEX idx_trader_trades_composite ON trader_trades_history(trader_wallet, timestamp DESC);

-- Unique constraint to prevent duplicates
CREATE UNIQUE INDEX idx_trader_trades_unique ON trader_trades_history(trade_id);

-- Comments
COMMENT ON TABLE trader_trades_history IS 'Complete historical trade data for traders, synced from Polymarket API';
COMMENT ON COLUMN trader_trades_history.trade_id IS 'Unique identifier from Polymarket API';
COMMENT ON COLUMN trader_trades_history.pnl IS 'Realized P&L when trade is closed (null for open trades)';
```

#### New Table: `trader_sync_status`

```sql
CREATE TABLE trader_sync_status (
  trader_wallet TEXT PRIMARY KEY,
  
  -- Sync Status
  last_sync_at TIMESTAMP,
  last_successful_sync_at TIMESTAMP,
  sync_status TEXT DEFAULT 'pending',  -- 'pending', 'syncing', 'success', 'error'
  sync_error TEXT,
  
  -- Trade Counts
  total_trades_synced INTEGER DEFAULT 0,
  oldest_trade_timestamp BIGINT,
  newest_trade_timestamp BIGINT,
  
  -- Sync Configuration
  sync_priority INTEGER DEFAULT 1,  -- 1=high (followed), 2=medium (featured), 3=low (other)
  sync_frequency TEXT DEFAULT 'daily',  -- 'hourly', 'daily', 'weekly'
  is_active BOOLEAN DEFAULT true,
  
  -- Metadata
  first_synced_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trader_sync_priority ON trader_sync_status(sync_priority, last_sync_at);
CREATE INDEX idx_trader_sync_status ON trader_sync_status(sync_status);

COMMENT ON TABLE trader_sync_status IS 'Tracks sync status and metadata for each trader';
```

---

### 2. Background Sync System

#### Fly.io Cron Job Configuration

**File**: `fly.worker-history-sync.toml`

```toml
app = "polycopy-history-sync"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[processes]
  sync = "node workers/sync-trader-history.js"

[env]
  NODE_ENV = "production"
  SYNC_MODE = "continuous"

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

#### Sync Worker Script

**File**: `workers/sync-trader-history.js`

```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Sync configuration
const SYNC_CONFIG = {
  high_priority: { limit: 100, interval: '1 hour' },   // Followed traders
  medium_priority: { limit: 100, interval: '6 hours' }, // Featured traders
  low_priority: { limit: 100, interval: '24 hours' }   // Other traders
};

async function syncTraderHistory(traderWallet, priority = 1) {
  console.log(`🔄 Syncing trader: ${traderWallet} (priority: ${priority})`);
  
  try {
    // Update sync status
    await supabase
      .from('trader_sync_status')
      .upsert({
        trader_wallet: traderWallet,
        sync_status: 'syncing',
        updated_at: new Date().toISOString()
      });

    // Fetch trades from Polymarket
    const response = await fetch(
      `https://data-api.polymarket.com/trades?user=${traderWallet}&limit=100`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const trades = await response.json();
    console.log(`📊 Fetched ${trades.length} trades for ${traderWallet}`);

    // Process and store trades
    let newTrades = 0;
    let updatedTrades = 0;

    for (const trade of trades) {
      const tradeData = {
        trade_id: trade.id || `${trade.market}-${trade.timestamp}`,
        trader_wallet: traderWallet.toLowerCase(),
        market_id: trade.market,
        market_title: trade.title || trade.question || 'Unknown Market',
        market_slug: trade.marketSlug,
        condition_id: trade.conditionId,
        side: trade.side || 'BUY',
        outcome: trade.outcome || '',
        size: parseFloat(trade.size || 0),
        price: parseFloat(trade.price || 0),
        timestamp: parseInt(trade.timestamp || Date.now()),
        status: determineTradeStatus(trade),
        category: categorizeMarket(trade.title || ''),
        last_updated_at: new Date().toISOString(),
        sync_source: 'api'
      };

      // Upsert trade (insert or update if exists)
      const { error } = await supabase
        .from('trader_trades_history')
        .upsert(tradeData, {
          onConflict: 'trade_id',
          ignoreDuplicates: false
        });

      if (error) {
        console.error(`❌ Error storing trade ${tradeData.trade_id}:`, error);
      } else {
        newTrades++;
      }
    }

    // Update sync status
    const oldestTrade = trades.length > 0 ? Math.min(...trades.map(t => t.timestamp)) : null;
    const newestTrade = trades.length > 0 ? Math.max(...trades.map(t => t.timestamp)) : null;

    await supabase
      .from('trader_sync_status')
      .upsert({
        trader_wallet: traderWallet,
        last_sync_at: new Date().toISOString(),
        last_successful_sync_at: new Date().toISOString(),
        sync_status: 'success',
        total_trades_synced: trades.length,
        oldest_trade_timestamp: oldestTrade,
        newest_trade_timestamp: newestTrade,
        sync_error: null,
        updated_at: new Date().toISOString()
      });

    console.log(`✅ Sync complete: ${newTrades} new trades stored`);
    return { success: true, trades: newTrades };

  } catch (error) {
    console.error(`❌ Sync failed for ${traderWallet}:`, error);
    
    // Record error
    await supabase
      .from('trader_sync_status')
      .upsert({
        trader_wallet: traderWallet,
        last_sync_at: new Date().toISOString(),
        sync_status: 'error',
        sync_error: error.message,
        updated_at: new Date().toISOString()
      });

    return { success: false, error: error.message };
  }
}

function determineTradeStatus(trade) {
  if (trade.resolved) return 'resolved';
  if (trade.closed || trade.closedAt) return 'closed';
  return 'open';
}

function categorizeMarket(title) {
  const t = title.toLowerCase();
  if (t.match(/trump|biden|election|president/)) return 'politics';
  if (t.match(/nfl|nba|soccer|football|sports/)) return 'sports';
  if (t.match(/bitcoin|eth|crypto/)) return 'crypto';
  // ... more categories
  return 'other';
}

// Main sync loop
async function runSyncCycle() {
  console.log('🚀 Starting sync cycle...');

  // Get traders to sync (prioritize followed traders)
  const { data: traders, error } = await supabase
    .from('trader_sync_status')
    .select('*')
    .eq('is_active', true)
    .order('sync_priority', { ascending: true })
    .order('last_sync_at', { ascending: true, nullsFirst: true })
    .limit(50);

  if (error) {
    console.error('❌ Error fetching traders to sync:', error);
    return;
  }

  console.log(`📋 Found ${traders.length} traders to sync`);

  // Sync traders sequentially (avoid rate limits)
  for (const trader of traders) {
    await syncTraderHistory(trader.trader_wallet, trader.sync_priority);
    
    // Rate limiting: wait 2 seconds between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('✅ Sync cycle complete');
}

// Run sync every hour
setInterval(runSyncCycle, 60 * 60 * 1000);

// Run immediately on start
runSyncCycle();
```

---

### 3. API Endpoints

#### GET `/api/trader/[wallet]/history`

**Purpose**: Fetch complete trade history from database

**Response**:
```json
{
  "trades": [...],
  "stats": {
    "totalTrades": 1234,
    "oldestTrade": "2023-01-15",
    "newestTrade": "2025-01-05",
    "dataCompleteness": "95%",
    "lastSyncAt": "2025-01-05T10:30:00Z"
  }
}
```

#### GET `/api/trader/[wallet]/performance`

**Purpose**: Calculate accurate performance metrics from stored data

**Response**:
```json
{
  "monthlyROI": [...],  // Real data, not estimates
  "categoryDistribution": [...],
  "winRate": 68.5,  // Accurate from all trades
  "averageHoldTime": "4.2 days",
  "bestMonth": { "month": "Dec 2024", "roi": 45.2 },
  "worstMonth": { "month": "Aug 2024", "roi": -12.3 }
}
```

---

### 4. Frontend Updates

#### Trader Profile Page

**Changes**:
1. Query database instead of live API
2. Show "X total trades" instead of "last 100"
3. Remove "Estimated" badges
4. Add "Data updated X hours ago" timestamp
5. Enable pagination for trade history
6. Add "Load more" button for older trades

**New Features**:
- Filter by date range
- Export trade history (CSV)
- Compare performance across time periods
- Show data completeness indicator

---

## 📊 Implementation Phases

### Phase 1: Database Setup (1 hour)
- [ ] Create `trader_trades_history` table
- [ ] Create `trader_sync_status` table
- [ ] Add indexes and constraints
- [ ] Test with sample data

### Phase 2: Sync Worker (2-3 hours)
- [ ] Create `workers/sync-trader-history.js`
- [ ] Implement sync logic
- [ ] Add error handling and retries
- [ ] Test with multiple traders
- [ ] Deploy to Fly.io

### Phase 3: API Endpoints (1 hour)
- [ ] Create `/api/trader/[wallet]/history` endpoint
- [ ] Create `/api/trader/[wallet]/performance` endpoint
- [ ] Add caching layer
- [ ] Test response times

### Phase 4: Frontend Integration (1-2 hours)
- [ ] Update trader profile page to use database
- [ ] Remove estimation logic
- [ ] Add data freshness indicators
- [ ] Update performance tab calculations
- [ ] Add pagination for trade history

### Phase 5: Monitoring & Optimization (ongoing)
- [ ] Set up sync monitoring dashboard
- [ ] Add alerts for sync failures
- [ ] Optimize query performance
- [ ] Monitor database size and costs

---

## 🎯 Success Metrics

### Technical Metrics
- **Sync Success Rate**: >95% of syncs complete successfully
- **Data Freshness**: <6 hours lag for followed traders
- **Query Performance**: <500ms for trade history queries
- **Storage Efficiency**: <100MB per 10,000 trades

### User Metrics
- **Data Completeness**: Show 100% of available trade history
- **Accuracy**: 100% accurate win rates and performance metrics
- **User Satisfaction**: Positive feedback on data quality

---

## 💰 Cost Analysis

### Storage Costs
- **Per Trader**: ~10KB per 100 trades
- **1000 Traders**: ~10MB total
- **10,000 Traders**: ~100MB total
- **Supabase Free Tier**: 500MB included
- **Estimated Monthly Cost**: $0-5 (well within free tier)

### Compute Costs
- **Fly.io Worker**: $5-10/month (shared CPU)
- **API Calls**: Free (Polymarket API is public)
- **Total**: $5-10/month

---

## 🚨 Risks & Mitigation

### Risk 1: Polymarket API Rate Limits
**Mitigation**: 
- Add 2-second delay between requests
- Implement exponential backoff on errors
- Cache responses
- Prioritize followed traders

### Risk 2: Data Storage Growth
**Mitigation**:
- Archive old trades (>1 year) to cold storage
- Implement data retention policy
- Monitor storage usage
- Optimize data types

### Risk 3: Sync Failures
**Mitigation**:
- Retry logic with exponential backoff
- Alert on repeated failures
- Manual sync trigger for critical traders
- Fallback to live API if sync is stale

### Risk 4: Historical Data Gaps
**Mitigation**:
- Start syncing immediately (builds history over time)
- Backfill important traders manually if needed
- Show data completeness percentage
- Be transparent about limitations

---

## 🔄 Migration Plan

### Week 1: Setup & Testing
1. Deploy database schema
2. Deploy sync worker
3. Start syncing followed traders
4. Monitor for issues

### Week 2: Data Collection
1. Let system collect 1-2 weeks of data
2. Verify data quality
3. Test API endpoints
4. Prepare frontend changes

### Week 3: Frontend Rollout
1. Deploy frontend updates
2. A/B test with small user group
3. Monitor performance
4. Full rollout if successful

---

## 📚 Future Enhancements

### Phase 2 Features
1. **Portfolio Tracking**: Track user's copied trades over time
2. **Performance Alerts**: Notify when followed trader's performance changes
3. **Comparative Analysis**: Compare multiple traders side-by-side
4. **Advanced Filters**: Filter by market, category, date range
5. **Export Data**: Download complete trade history as CSV
6. **Trade Replay**: See how trader's portfolio evolved over time

### Phase 3 Features
1. **Predictive Analytics**: ML models to predict trader performance
2. **Risk Scoring**: Calculate risk metrics for each trader
3. **Auto-Copy**: Automatically copy trades based on criteria
4. **Leaderboard History**: Track trader rankings over time
5. **Social Features**: Share trader analysis with community

---

## 📖 Documentation Needs

1. **Developer Docs**: How to run sync worker locally
2. **API Docs**: New endpoint documentation
3. **User Docs**: Explain data sources and freshness
4. **Admin Docs**: How to monitor and troubleshoot sync

---

## ✅ Acceptance Criteria

- [ ] Database tables created and indexed
- [ ] Sync worker deployed and running
- [ ] At least 1 week of historical data collected
- [ ] API endpoints return accurate data
- [ ] Frontend shows complete trade history
- [ ] Performance metrics are calculated from real data
- [ ] No "Estimated" badges on accurate metrics
- [ ] Data freshness indicator shows last sync time
- [ ] Sync success rate >95%
- [ ] Query response time <500ms
- [ ] Zero data loss or corruption
- [ ] Documentation complete

---

## 🎬 Next Steps

1. **Review & Approve PRD** ✋ (You are here)
2. **Schedule Implementation** (4-6 hour block)
3. **Create Database Schema** (Run SQL)
4. **Deploy Sync Worker** (Fly.io)
5. **Wait for Data Collection** (1-2 weeks)
6. **Deploy Frontend Updates**
7. **Monitor & Optimize**

---

## 📞 Questions & Discussion

**Open Questions:**
1. Should we backfill historical data for top traders?
2. What's the priority order for syncing? (followed > featured > all?)
3. How long should we retain historical data?
4. Should we expose this data via public API?

**Discussion Points:**
- Storage vs compute tradeoffs
- Sync frequency optimization
- Data retention policy
- Premium feature opportunities

---

**Document Version**: 1.0  
**Last Updated**: January 5, 2025  
**Owner**: Engineering Team  
**Status**: Awaiting Approval

