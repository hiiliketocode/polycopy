# Trade Card Data Schema

Complete data schema for all possible data points that can be sent from the app for a trade card.

## Table of Contents
1. [Trade Data](#trade-data)
2. [Trader Data](#trader-data)
3. [Market Data](#market-data)
4. [Live/Real-time Data](#livereal-time-data)
5. [Position/Hedging Data](#positionhedging-data)
6. [User-Specific Data](#user-specific-data)
7. [Calculated/Derived Data](#calculatedderived-data)
8. [Other Trades Data](#other-trades-data)
9. [Market Condition Data](#market-condition-data)

---

## Trade Data

**Source:** `public.trades` table

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `id` | `UUID` | Unique trade identifier | Yes |
| `wallet_address` | `TEXT` | Trader's wallet address (lowercase normalized) | Yes |
| `timestamp` | `TIMESTAMPTZ` | Trade execution timestamp | Yes |
| `timestamp_ms` | `number` | Trade timestamp in milliseconds (Unix epoch) | Yes |
| `side` | `'BUY' \| 'SELL'` | Trade side (BUY or SELL) | Yes |
| `shares_normalized` | `NUMERIC(18, 6)` | Normalized share quantity | Yes |
| `size` | `number` | Trade size (shares/contracts) | Yes |
| `price` | `NUMERIC(18, 8)` | Trade execution price (0-1 range) | Yes |
| `total` | `number` | Total cost/value (price × size) | Calculated |
| `token_id` | `TEXT` | Token identifier for the outcome | Optional |
| `token_label` | `TEXT` | Outcome label ("Yes" or "No") | Optional |
| `condition_id` | `TEXT` | Market condition ID (primary key for markets) | Optional |
| `market_slug` | `TEXT` | Market slug URL identifier | Optional |
| `title` | `TEXT` | Market title (from trade data) | Optional |
| `tx_hash` | `TEXT` | Blockchain transaction hash | Yes |
| `order_hash` | `TEXT` | Order hash (if available) | Optional |
| `trade_uid` | `TEXT` | Generated unique ID (order_hash or 'tx:' + tx_hash) | Generated |
| `taker` | `TEXT` | Taker wallet address | Optional |
| `source` | `TEXT` | Data source (default: 'dome') | Yes |
| `raw` | `JSONB` | Raw API response data | Yes |
| `created_at` | `TIMESTAMPTZ` | Record creation timestamp | Yes |

---

## Trader Data

**Source:** `public.traders` table or derived from wallet address

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `trader.wallet` | `string` | Trader wallet address | Yes |
| `trader.address` | `string` | Same as wallet (for compatibility) | Yes |
| `trader.name` | `string` | Trader display name/username | Yes |
| `trader.displayName` | `string` | Trader display name | Yes |
| `trader.id` | `string` | Trader identifier (usually wallet) | Optional |
| `trader.avatar` | `string` | Trader profile image URL | Optional |
| `trader.roi` | `number` | Trader's return on investment percentage | Optional |

---

## Market Data

**Source:** `public.markets` table (joined via `condition_id`)

### Basic Market Information

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `market.conditionId` | `string` | Market condition ID (primary key) | Yes |
| `market.title` | `string` | Market title/question | Yes |
| `market.market` | `string` | Market title (alias) | Yes |
| `market.slug` | `string` | Market slug URL identifier | Optional |
| `market.eventSlug` | `string` | Event slug (for event-based markets) | Optional |
| `market.description` | `string` | Market description | Optional |
| `market.category` | `string` | Market category (politics, sports, crypto, etc.) | Optional |
| `market.avatarUrl` | `string` | Market avatar/image URL | Optional |
| `market.image` | `string` | Market image URL | Optional |
| `market.icon` | `string` | Market icon URL | Optional |
| `market.marketAvatar` | `string` | Market avatar (alias) | Optional |

### Market Classification

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `market.market_type` | `string` | Market type (Sports, Crypto, Politics, Finance/Tech, Entertainment, Esports, Weather) | Optional |
| `market.market_subtype` | `string` | Market subtype (e.g., NBA, Bitcoin, Election) | Optional |
| `market.bet_structure` | `string` | Bet structure (Prop, Yes/No, Over/Under, Spread, Head-to-Head, Multiple Choice, Other) | Optional |
| `market.marketCategoryType` | `string` | Resolved category type | Optional |

### Market Timing

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `market.start_time` | `TIMESTAMPTZ` | Market start time | Optional |
| `market.end_time` | `TIMESTAMPTZ` | Market end time | Optional |
| `market.completed_time` | `TIMESTAMPTZ` | Market completion time | Optional |
| `market.close_time` | `TIMESTAMPTZ` | Market close time | Optional |
| `market.game_start_time` | `TIMESTAMPTZ` | Game/event start time (for sports) | Optional |
| `market.start_time_unix` | `BIGINT` | Start time as Unix timestamp | Optional |
| `market.end_time_unix` | `BIGINT` | End time as Unix timestamp | Optional |
| `market.completed_time_unix` | `BIGINT` | Completed time as Unix timestamp | Optional |
| `market.close_time_unix` | `BIGINT` | Close time as Unix timestamp | Optional |
| `market.game_start_time_raw` | `TEXT` | Raw game start time string | Optional |

### Market Status & Resolution

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `market.status` | `string` | Market status (open, closed, resolved) | Optional |
| `market.closed` | `BOOLEAN` | Whether market is closed | Optional |
| `market.active` | `BOOLEAN` | Whether market is active | Optional |
| `market.resolved` | `boolean` | Whether market is resolved | Optional |
| `market.resolved_outcome` | `TEXT` | Winning outcome | Optional |
| `market.winning_side` | `TEXT` | Winning side | Optional |
| `market.resolution_source` | `TEXT` | Source of resolution | Optional |

### Market Volume & Liquidity

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `market.volume` | `NUMERIC` | Market volume | Optional |
| `market.volume_1_week` | `NUMERIC` | Volume in last week | Optional |
| `market.volume_1_month` | `NUMERIC` | Volume in last month | Optional |
| `market.volume_1_year` | `NUMERIC` | Volume in last year | Optional |
| `market.volume_total` | `NUMERIC` | Total volume | Optional |
| `market.liquidity` | `NUMERIC` | Market liquidity | Optional |

### Market Outcomes & Prices

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `market.outcomes` | `JSONB` | Available outcomes array | Optional |
| `market.outcome_prices` | `JSONB` | Current prices for each outcome | Optional |
| `market.last_price_updated_at` | `TIMESTAMPTZ` | Last time prices were updated | Optional |
| `market.side_a` | `JSONB` | Side A data | Optional |
| `market.side_b` | `JSONB` | Side B data | Optional |
| `market.negative_risk_id` | `TEXT` | Negative risk ID | Optional |

### Market Tags & Metadata

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `market.tags` | `JSONB` | Market tags array | Optional |
| `market.extra_fields` | `JSONB` | Additional market fields | Optional |
| `market.raw_dome` | `JSONB` | Raw Dome API response | Optional |
| `market.raw_gamma` | `JSONB` | Raw Gamma API response | Optional |

### Market External Links

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `market.polymarketUrl` | `string` | Polymarket market URL | Optional |
| `market.espnUrl` | `string` | ESPN event URL (for sports) | Optional |
| `market.espn_game_id` | `TEXT` | ESPN game ID | Optional |
| `market.espn_last_checked` | `TIMESTAMPTZ` | Last ESPN check timestamp | Optional |

---

## Live/Real-time Data

**Source:** Live market data API or real-time price updates

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `currentMarketPrice` | `number` | Current market price for the outcome | Optional |
| `currentMarketUpdatedAt` | `number` | Timestamp when price was last updated (ms) | Optional |
| `marketIsOpen` | `boolean \| null` | Whether market is currently open | Optional |
| `liveScore` | `string` | Live score (for sports markets) | Optional |
| `eventStartTime` | `string` | Event start time (ISO string) | Optional |
| `eventEndTime` | `string` | Event end time (ISO string) | Optional |
| `eventStatus` | `string` | Current event status | Optional |
| `liveStatus` | `'live' \| 'scheduled' \| 'final' \| 'unknown'` | Live status indicator | Optional |
| `homeTeam` | `string \| null` | Home team name (sports) | Optional |
| `awayTeam` | `string \| null` | Away team name (sports) | Optional |
| `gameTimeInfo` | `string \| null` | Game time information | Optional |

---

## Position/Hedging Data

**Source:** Calculated from trader's trades on same market

### Position Badge Data

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `traderPositionBadge.label` | `string` | Position badge label | Optional |
| `traderPositionBadge.variant` | `'trader' \| 'user'` | Badge variant | Optional |
| `traderPositionBadge.trades` | `PositionTradeSummary[]` | Array of trades in position | Optional |
| `userPositionBadge.label` | `string` | User position badge label | Optional |
| `userPositionBadge.variant` | `'trader' \| 'user'` | Badge variant | Optional |
| `userPositionBadge.trades` | `PositionTradeSummary[]` | Array of user trades in position | Optional |

### Position Trade Summary

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `trade.side` | `'BUY' \| 'SELL'` | Trade side | Yes |
| `trade.outcome` | `string` | Outcome name | Yes |
| `trade.size` | `number \| null` | Trade size | Optional |
| `trade.price` | `number \| null` | Trade price | Optional |
| `trade.amountUsd` | `number \| null` | Trade amount in USD | Optional |
| `trade.timestamp` | `number \| null` | Trade timestamp (ms) | Optional |

### Hedging Information

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `isHedging` | `boolean` | Whether trader is hedging (multiple outcomes) | Calculated |
| `longerOutcome` | `string \| null` | Outcome with longer position | Calculated |
| `hedgeDiff` | `number` | Difference between positions | Calculated |
| `hedgePercent` | `number` | Percentage difference | Calculated |
| `hedgeBasis` | `'contracts' \| 'usd'` | Basis for hedge calculation | Calculated |
| `isEven` | `boolean` | Whether positions are even | Calculated |

---

## User-Specific Data

**Source:** User session and preferences

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `walletAddress` | `string \| null` | Connected user wallet address | Optional |
| `isPremium` | `boolean` | Whether user has premium access | Optional |
| `isAdmin` | `boolean` | Whether user is admin | Optional |
| `isCopied` | `boolean` | Whether user has copied this trade | Optional |
| `isPinned` | `boolean` | Whether trade is pinned by user | Optional |
| `manualTradingEnabled` | `boolean` | Whether manual trading is enabled | Optional |
| `hideActions` | `boolean` | Whether to hide action buttons | Optional |

---

## Calculated/Derived Data

**Source:** Computed from trade and market data

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `entryPrice` | `number` | Entry price (same as trade price) | Calculated |
| `currentPrice` | `number` | Current market price | Calculated |
| `priceChange` | `number` | Price change since entry | Calculated |
| `priceChangePercent` | `number` | Price change percentage | Calculated |
| `unrealizedPnl` | `number` | Unrealized profit/loss | Calculated |
| `unrealizedPnlPercent` | `number` | Unrealized PnL percentage | Calculated |
| `realizedPnl` | `number` | Realized profit/loss (if closed) | Calculated |
| `roi` | `number` | Return on investment | Calculated |
| `timeElapsed` | `string` | Human-readable time elapsed | Calculated |
| `timeElapsedMs` | `number` | Time elapsed in milliseconds | Calculated |
| `currentTime` | `number` | Current timestamp (ms) | Calculated |
| `badgeState` | `object` | Badge state for trade | Calculated |

---

## Other Trades Data

**Source:** Query for other trades by same trader on same market

### Other Trades by Same Trader on Same Market

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `otherTrades` | `Trade[]` | Array of other trades | Optional |
| `otherTrades[].id` | `UUID` | Trade ID | Yes |
| `otherTrades[].timestamp` | `TIMESTAMPTZ` | Trade timestamp | Yes |
| `otherTrades[].side` | `'BUY' \| 'SELL'` | Trade side | Yes |
| `otherTrades[].outcome` | `string` | Outcome | Yes |
| `otherTrades[].size` | `number` | Trade size | Yes |
| `otherTrades[].price` | `number` | Trade price | Yes |
| `otherTrades[].tokenId` | `string` | Token ID | Optional |

### Buy Trades Summary

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `buyTrades` | `Trade[]` | Array of BUY trades | Optional |
| `buyTradesCount` | `number` | Number of BUY trades | Calculated |
| `totalBuySize` | `number` | Total size of BUY trades | Calculated |
| `averageBuyPrice` | `number` | Average BUY price | Calculated |
| `totalBuyCost` | `number` | Total cost of BUY trades | Calculated |

### Sell Trades Summary

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `sellTrades` | `Trade[]` | Array of SELL trades | Optional |
| `sellTradesCount` | `number` | Number of SELL trades | Calculated |
| `totalSellSize` | `number` | Total size of SELL trades | Calculated |
| `averageSellPrice` | `number` | Average SELL price | Calculated |
| `totalSellProceeds` | `number` | Total proceeds from SELL trades | Calculated |

### Hedge Trades Summary

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `hedgeTrades` | `Trade[]` | Array of hedging trades (opposite outcomes) | Optional |
| `hedgeTradesCount` | `number` | Number of hedge trades | Calculated |
| `netPosition` | `object` | Net position per outcome | Calculated |
| `netPosition[outcome]` | `number` | Net position size for outcome | Calculated |

---

## Market Condition Data

**Source:** Market condition metadata

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `conditionId` | `string` | Market condition ID | Yes |
| `marketConditionId` | `string` | Alias for condition ID | Yes |
| `marketId` | `string` | Market ID (if different from condition ID) | Optional |

---

## Complete TypeScript Interface

```typescript
interface TradeCardData {
  // Trade Data
  id: string
  timestamp: number // milliseconds
  timestampFormatted: string // human-readable
  side: 'BUY' | 'SELL'
  size: number
  price: number
  total: number
  tokenId?: string
  tokenLabel?: string
  txHash: string
  orderHash?: string
  tradeUid: string
  
  // Trader Data
  trader: {
    wallet: string
    address: string
    name: string
    displayName: string
    id?: string
    avatar?: string
    roi?: number
  }
  
  // Market Data
  market: {
    conditionId: string
    title: string
    slug?: string
    eventSlug?: string
    description?: string
    category?: string
    avatarUrl?: string
    image?: string
    icon?: string
    marketType?: string
    marketSubtype?: string
    betStructure?: string
    startTime?: string
    endTime?: string
    completedTime?: string
    closeTime?: string
    gameStartTime?: string
    status?: string
    closed?: boolean
    active?: boolean
    resolved?: boolean
    resolvedOutcome?: string
    winningSide?: string
    volume?: number
    volume1Week?: number
    volume1Month?: number
    volume1Year?: number
    volumeTotal?: number
    liquidity?: number
    outcomes?: string[]
    outcomePrices?: Record<string, number>
    lastPriceUpdatedAt?: string
    tags?: string[]
    polymarketUrl?: string
    espnUrl?: string
    espnGameId?: string
  }
  
  // Live Data
  currentMarketPrice?: number
  currentMarketUpdatedAt?: number
  marketIsOpen?: boolean | null
  liveScore?: string
  eventStartTime?: string
  eventEndTime?: string
  eventStatus?: string
  liveStatus?: 'live' | 'scheduled' | 'final' | 'unknown'
  homeTeam?: string | null
  awayTeam?: string | null
  gameTimeInfo?: string | null
  
  // Position Data
  position: string // outcome name
  action: 'Buy' | 'Sell'
  traderPositionBadge?: {
    label: string
    variant: 'trader' | 'user'
    trades: Array<{
      side: 'BUY' | 'SELL'
      outcome: string
      size: number | null
      price: number | null
      amountUsd: number | null
      timestamp?: number | null
    }>
  }
  userPositionBadge?: {
    label: string
    variant: 'trader' | 'user'
    trades: Array<{
      side: 'BUY' | 'SELL'
      outcome: string
      size: number | null
      price: number | null
      amountUsd: number | null
      timestamp?: number | null
    }>
  }
  
  // Hedging Data
  hedgingInfo?: {
    isHedging: boolean
    longerOutcome: string | null
    diff: number
    percent: number
    basis: 'contracts' | 'usd'
    isEven: boolean
  }
  
  // Other Trades
  otherTrades?: Array<{
    id: string
    timestamp: number
    side: 'BUY' | 'SELL'
    outcome: string
    size: number
    price: number
    tokenId?: string
  }>
  buyTrades?: Array<{
    id: string
    timestamp: number
    outcome: string
    size: number
    price: number
  }>
  sellTrades?: Array<{
    id: string
    timestamp: number
    outcome: string
    size: number
    price: number
  }>
  hedgeTrades?: Array<{
    id: string
    timestamp: number
    outcome: string
    size: number
    price: number
  }>
  
  // Calculated Data
  entryPrice: number
  currentPrice?: number
  priceChange?: number
  priceChangePercent?: number
  unrealizedPnl?: number
  unrealizedPnlPercent?: number
  realizedPnl?: number
  roi?: number
  timeElapsed: string
  timeElapsedMs: number
  currentTime: number
  
  // User Data
  walletAddress?: string | null
  isPremium?: boolean
  isAdmin?: boolean
  isCopied?: boolean
  isPinned?: boolean
  manualTradingEnabled?: boolean
  
  // Trade Execution
  defaultBuySlippage?: number
  defaultSellSlippage?: number
  tradeAnchorId?: string
}
```

---

## Database Query Example

To fetch all trade card data, you would typically:

1. **Query trades table** with market join:
```sql
SELECT 
  t.*,
  m.title as market_title,
  m.slug as market_slug,
  m.event_slug,
  m.category,
  m.image as market_avatar_url,
  m.status,
  m.closed,
  m.resolved_outcome,
  m.outcome_prices,
  m.last_price_updated_at,
  m.espn_url,
  m.market_type,
  m.market_subtype,
  m.bet_structure
FROM trades t
LEFT JOIN markets m ON t.condition_id = m.condition_id
WHERE t.wallet_address = $1
ORDER BY t.timestamp DESC
```

2. **Query other trades** for same trader + market:
```sql
SELECT *
FROM trades
WHERE wallet_address = $1
  AND condition_id = $2
  AND id != $3
ORDER BY timestamp DESC
```

3. **Calculate position data** from trades:
```sql
SELECT 
  outcome,
  side,
  SUM(CASE WHEN side = 'BUY' THEN shares_normalized ELSE -shares_normalized END) as net_position,
  COUNT(*) as trade_count
FROM trades
WHERE wallet_address = $1
  AND condition_id = $2
GROUP BY outcome, side
```

---

## Notes

- All timestamps are in milliseconds (Unix epoch) unless specified as `TIMESTAMPTZ`
- Prices are normalized to 0-1 range
- Sizes are in normalized shares/contracts
- Market condition ID (`condition_id`) is the primary key linking trades to markets
- Position badges show aggregated position data for trader and user
- Hedging is detected when trader has BUY positions on 2+ different outcomes
- Live data is updated via polling or WebSocket connections
- Current time is always `Date.now()` or `new Date().getTime()`
