# Polymarket API Integration

## Overview
Polycopy fetches real trader data from Polymarket's public Data API to display accurate statistics and trading activity.

---

## API Routes

### 1. Trader Stats
**Endpoint:** `GET /api/polymarket/trader-stats?wallet={wallet_address}`  
**Purpose:** Fetches real-time trading statistics for a specific Polymarket trader.

### 2. Leaderboard
**Endpoint:** `GET /api/polymarket/leaderboard`  
**Purpose:** Fetches top traders from Polymarket's leaderboard with customizable filters.

---

## Request

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wallet` | string | Yes | Ethereum wallet address (0x..., 42 characters) |

### Example Request
```bash
curl "http://localhost:3000/api/polymarket/trader-stats?wallet=0x6af75d4e4aaf700450efbac3708cce1665810ff1"
```

---

## Response

### Success Response (200)

```json
{
  "wallet": "0x6af75d4e4aaf700450efbac3708cce1665810ff1",
  "displayName": "0x6af7...0ff1",
  "pnl": 45230.50,
  "winRate": 72.5,
  "totalTrades": 156,
  "followerCount": 0
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `wallet` | string | Wallet address (lowercase) |
| `displayName` | string | Trader's name or abbreviated wallet |
| `pnl` | number | Total profit/loss in USD (rounded to 2 decimals) |
| `winRate` | number | Percentage of profitable trades (rounded to 1 decimal) |
| `totalTrades` | number | Total number of trades |
| `followerCount` | number | Number of Polycopy followers (currently always 0) |

### Error Responses

**400 Bad Request - Missing Wallet**
```json
{
  "error": "Wallet address is required"
}
```

**400 Bad Request - Invalid Format**
```json
{
  "error": "Invalid Ethereum address format"
}
```

**504 Gateway Timeout**
```json
{
  "error": "Request timeout - Polymarket API is slow or unavailable"
}
```

**500 Internal Server Error**
```json
{
  "error": "Failed to fetch trader stats",
  "details": "Specific error message"
}
```

---

## API Route: Leaderboard

### Endpoint
```
GET /api/polymarket/leaderboard
```

### Purpose
Fetches top traders from Polymarket's leaderboard with customizable filters for time period, ordering, and category.

---

## Request Parameters

### Query Parameters

| Parameter | Type | Default | Options | Description |
|-----------|------|---------|---------|-------------|
| `timePeriod` | string | `month` | `day`, `week`, `month`, `all` | Time period for leaderboard |
| `orderBy` | string | `VOL` | `VOL`, `PROFIT` | Sort by volume or profit |
| `limit` | number | `50` | `1-100` | Number of traders to return |
| `category` | string | `overall` | `overall`, `politics`, `sports`, etc. | Market category filter |
| `offset` | number | `0` | `0+` | Pagination offset |

### Example Requests

**Get top 10 traders by volume:**
```bash
curl "http://localhost:3000/api/polymarket/leaderboard?limit=10"
```

**Get top 20 traders by profit this week:**
```bash
curl "http://localhost:3000/api/polymarket/leaderboard?timePeriod=week&orderBy=PROFIT&limit=20"
```

**Get politics traders:**
```bash
curl "http://localhost:3000/api/polymarket/leaderboard?category=politics&limit=25"
```

---

## Response Format

### Success Response (200)

```json
{
  "traders": [
    {
      "wallet": "0x6af75d4e4aaf700450efbac3708cce1665810ff1",
      "displayName": "crypto_whale",
      "pnl": 45230.50,
      "winRate": 72.5,
      "totalTrades": 156,
      "volume": 250000.00,
      "followerCount": 0
    },
    {
      "wallet": "0x1234567890abcdef1234567890abcdef12345678",
      "displayName": "0x1234...5678",
      "pnl": 38450.25,
      "winRate": 68.3,
      "totalTrades": 203,
      "volume": 180000.00,
      "followerCount": 0
    }
  ],
  "meta": {
    "timePeriod": "month",
    "orderBy": "VOL",
    "limit": 50,
    "category": "overall",
    "offset": 0,
    "returned": 2
  }
}
```

### Field Descriptions

**Traders Array:**
| Field | Type | Description |
|-------|------|-------------|
| `wallet` | string | Wallet address (lowercase) |
| `displayName` | string | Username or abbreviated wallet |
| `pnl` | number | Total profit/loss in USD |
| `winRate` | number | Percentage of winning trades |
| `totalTrades` | number | Total number of trades |
| `volume` | number | Total trading volume in USD |
| `followerCount` | number | Polycopy followers (currently 0) |

**Meta Object:**
| Field | Type | Description |
|-------|------|-------------|
| `timePeriod` | string | Time period used for query |
| `orderBy` | string | Sorting method used |
| `limit` | number | Max results requested |
| `category` | string | Category filter applied |
| `offset` | number | Pagination offset |
| `returned` | number | Actual number of traders returned |

### Error Responses

**400 Bad Request - Invalid Time Period**
```json
{
  "error": "Invalid timePeriod. Must be: day, week, month, or all"
}
```

**400 Bad Request - Invalid Order By**
```json
{
  "error": "Invalid orderBy. Must be: VOL or PROFIT"
}
```

**400 Bad Request - Invalid Limit**
```json
{
  "error": "Invalid limit. Must be between 1 and 100"
}
```

**504 Gateway Timeout**
```json
{
  "error": "Request timeout - Polymarket API is slow or unavailable"
}
```

**500 Internal Server Error**
```json
{
  "error": "Failed to fetch leaderboard",
  "details": "Specific error message"
}
```

---

## Leaderboard Usage

### In Discover Page

```typescript
const [traders, setTraders] = useState([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const fetchTopTraders = async () => {
    try {
      const response = await fetch(
        '/api/polymarket/leaderboard?limit=20&orderBy=PROFIT'
      );
      const data = await response.json();
      setTraders(data.traders);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  fetchTopTraders();
}, []);
```

### With Pagination

```typescript
const [page, setPage] = useState(0);
const limit = 20;

const fetchPage = async (pageNum: number) => {
  const offset = pageNum * limit;
  const response = await fetch(
    `/api/polymarket/leaderboard?limit=${limit}&offset=${offset}`
  );
  const data = await response.json();
  return data.traders;
};
```

### With Category Filter

```typescript
const [category, setCategory] = useState('overall');

const fetchByCategory = async (cat: string) => {
  const response = await fetch(
    `/api/polymarket/leaderboard?category=${cat}&limit=30`
  );
  const data = await response.json();
  return data.traders;
};
```

---

## Trader Stats API

---

## How It Works

### 1. Data Sources

The route fetches data from two Polymarket endpoints:

**Positions API:**
```
GET https://data-api.polymarket.com/positions?user={wallet}
```
- Returns all current positions for a trader
- Used to calculate total P&L

**Trades API:**
```
GET https://data-api.polymarket.com/trades?user={wallet}&limit=50
```
- Returns recent trade history (up to 50 trades)
- Used to calculate win rate

### 2. Calculations

**Total P&L:**
```typescript
let totalPnl = 0;
positions.forEach(position => {
  totalPnl += parseFloat(position.cashPnl || 0);
});
```

**Win Rate:**
```typescript
let profitableTrades = 0;
trades.forEach(trade => {
  if (parseFloat(trade.pnl || 0) > 0) {
    profitableTrades++;
  }
});
const winRate = (profitableTrades / totalTrades) * 100;
```

**Total Trades:**
- Uses count from trades API
- Falls back to positions count if trades unavailable

### 3. Display Name
- Tries to extract trader name from API response
- Falls back to abbreviated wallet address (0xabc...def)

### 4. Timeout Protection
- 10-second timeout for API requests
- Prevents hanging if Polymarket API is slow
- Returns 504 error if timeout occurs

---

## Usage in App

### In TraderCard Component

```typescript
// Fetch real stats for a trader
const response = await fetch(
  `/api/polymarket/trader-stats?wallet=${wallet}`
);
const stats = await response.json();

// Use stats in component
<TraderCard
  wallet={stats.wallet}
  displayName={stats.displayName}
  pnl={stats.pnl}
  winRate={stats.winRate}
  totalTrades={stats.totalTrades}
  followerCount={stats.followerCount}
/>
```

### In Trader Profile Page

```typescript
const [stats, setStats] = useState(null);

useEffect(() => {
  const fetchStats = async () => {
    const response = await fetch(
      `/api/polymarket/trader-stats?wallet=${wallet}`
    );
    const data = await response.json();
    setStats(data);
  };
  
  fetchStats();
}, [wallet]);
```

---

## Testing

### Test Wallets

Use these real Polymarket wallets for testing:

1. **Active Trader:**
   ```
   0x6af75d4e4aaf700450efbac3708cce1665810ff1
   ```

2. **High Volume:**
   ```
   0xd7f85d0eb0fe0732ca38d9107ad0d4d01b1289e4
   ```

### Test in Browser

Visit:
```
http://localhost:3000/api/polymarket/trader-stats?wallet=0x6af75d4e4aaf700450efbac3708cce1665810ff1
```

### Expected Console Logs

```
📊 Fetching trader stats for: 0x6af75d4e4aaf700450efbac3708cce1665810ff1
✅ Positions fetched: 45
✅ Trades fetched: 50
✅ Stats calculated: {
  wallet: '0x6af75d4e4aaf700450efbac3708cce1665810ff1',
  displayName: '0x6af7...0ff1',
  pnl: 12450.75,
  winRate: 68.0,
  totalTrades: 50,
  followerCount: 0
}
```

---

## Error Handling

### Network Errors
- Catches fetch failures
- Returns 500 with error details

### API Errors
- Logs Polymarket API HTTP errors
- Returns 500 with status code info

### Timeouts
- 10-second timeout per request
- Returns 504 Gateway Timeout
- Prevents hanging indefinitely

### Invalid Input
- Validates Ethereum address format
- Returns 400 for invalid/missing wallet

---

## Performance

### Response Times
- **Fast:** 200-500ms (Polymarket API responding quickly)
- **Slow:** 1-3s (Polymarket API under load)
- **Timeout:** 10s (API not responding)

### Caching
- Currently: `cache: 'no-store'` (always fresh data)
- Future: Could add Redis/in-memory cache with 5-minute TTL

### Rate Limiting
- No rate limiting on our end currently
- Polymarket API may have its own limits
- Consider adding rate limiting for production

---

## Future Enhancements

### 1. Database Caching
```typescript
// Cache trader stats in Supabase
const { data: cached } = await supabase
  .from('trader_stats_cache')
  .select('*')
  .eq('wallet', wallet)
  .gte('updated_at', oneHourAgo)
  .single();

if (cached) return cached;
```

### 2. Follower Count Integration
```typescript
// Fetch real follower count from our database
const { count } = await supabase
  .from('follows')
  .select('*', { count: 'exact' })
  .eq('trader_wallet', wallet);

stats.followerCount = count || 0;
```

### 3. Historical Data
```typescript
// Fetch historical performance
const history = await fetch(
  `https://data-api.polymarket.com/history?user=${wallet}&days=30`
);
```

### 4. Batch Fetching
```typescript
// Fetch multiple traders at once
POST /api/polymarket/trader-stats
{
  "wallets": ["0xabc...", "0xdef...", "0x123..."]
}
```

### 5. WebSocket Updates
```typescript
// Real-time updates for active traders
const ws = new WebSocket('wss://api.polycopy.com/trader-updates');
ws.send(JSON.stringify({ wallet, subscribe: true }));
```

---

## Polymarket API Documentation

### Official Docs
- **Base URL:** `https://data-api.polymarket.com`
- **No authentication required** for public endpoints
- **Rate limits:** Not officially documented

### Available Endpoints

**Positions:**
```
GET /positions?user={wallet}
GET /positions?market={market_id}
```

**Trades:**
```
GET /trades?user={wallet}&limit={limit}
GET /trades?market={market_id}
```

**Markets:**
```
GET /markets
GET /markets/{market_id}
```

**User Profile:**
```
GET /users/{wallet}
```

---

## Security Considerations

### Input Validation
- ✅ Validates Ethereum address format
- ✅ Prevents injection attacks
- ✅ Sanitizes input

### API Key Management
- ℹ️ Polymarket public API requires no key
- ℹ️ If they add auth later, use env variables

### Rate Limiting
- ⚠️ Should add rate limiting in production
- ⚠️ Prevent abuse of our proxy API
- ✅ Consider using upstash-ratelimit

### Error Information
- ✅ Doesn't expose internal details
- ✅ Logs full errors server-side only
- ✅ Returns sanitized errors to client

---

## Troubleshooting

### Problem: API returns 504 timeout

**Causes:**
- Polymarket API is slow or down
- Network connectivity issues
- Wallet has too many positions (large response)

**Solutions:**
- Increase timeout (currently 10s)
- Add retry logic
- Implement caching

### Problem: P&L seems incorrect

**Possible reasons:**
- Open positions vs closed trades
- Currency conversion issues
- API data lag

**Debug:**
```typescript
console.log('Raw positions:', positions);
console.log('Calculated P&L:', totalPnl);
```

### Problem: Win rate is 0%

**Causes:**
- No trade history available
- All trades are losses
- Trades API returned empty

**Check:**
```typescript
console.log('Trades count:', trades.length);
console.log('Profitable trades:', profitableTrades);
```

---

## Support

For issues with:
- **Polymarket API:** Contact Polymarket support
- **Polycopy integration:** Check server logs and console
- **Data accuracy:** Compare with Polymarket.com directly

