# Rate Limiting Implementation Guide

## Environment Setup

### Required Environment Variables

Add these to your `.env.local` (local dev) and production environment:

```bash
# Upstash Redis Configuration
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token-here
```

### Getting Upstash Credentials

1. **Create Upstash Account:**
   - Go to https://upstash.com/
   - Sign up for free account
   - Free tier includes: 10,000 commands/day

2. **Create Redis Database:**
   - Click "Create Database"
   - Select region closest to your deployment
   - Choose "Global" for multi-region (recommended for production)

3. **Get Credentials:**
   - Go to your database details
   - Copy "REST URL" → `UPSTASH_REDIS_REST_URL`
   - Copy "REST Token" → `UPSTASH_REDIS_REST_TOKEN`

4. **Add to Fly.io:**
```bash
fly secrets set UPSTASH_REDIS_REST_URL="https://..." -a polycopy
fly secrets set UPSTASH_REDIS_REST_TOKEN="..." -a polycopy
```

## Rate Limit Tiers

### CRITICAL (10 requests/minute)
**Usage:** Financial operations, fund-related endpoints  
**Prevents:** Fund drainage, wallet compromise

- `POST /api/polymarket/orders/place` - Order placement
- `POST /api/polymarket/l2-credentials` - L2 credential generation
- `POST /api/turnkey/wallet/create` - Wallet creation
- `POST /api/turnkey/import-private-key` - Private key import

### AUTH (5 requests/5 minutes)
**Usage:** Authentication endpoints  
**Prevents:** Brute force attacks, credential stuffing

- Login/signup endpoints
- Password reset
- Email verification

### TRADING (60 requests/minute)
**Usage:** Trading data fetches  
**Prevents:** API abuse, excessive external calls

- `GET /api/polymarket/positions` - Position fetches
- `POST /api/polymarket/orders/cancel` - Order cancellation
- `GET /api/polymarket/balance` - Balance checks
- `GET /api/polymarket/orders/all` - Order history

### PUBLIC (100 requests/minute)
**Usage:** Public read-only data  
**Prevents:** General API abuse

- Market data
- Trader stats
- Leaderboard

### WEBHOOK (100 requests/minute)
**Usage:** External webhooks  
**Prevents:** Webhook spam/replay

- Stripe webhooks
- External callbacks

## Implementation Examples

### Example 1: Apply Rate Limit to Existing Endpoint

```typescript
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  // Auth check first
  const userId = await getAuthenticatedUserId(request)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rate limit check
  const rateLimitResult = await checkRateLimit(
    request,
    'CRITICAL', // tier
    userId,     // user ID
    'ip-user'   // identifier type
  )
  
  if (!rateLimitResult.success) {
    return rateLimitedResponse(rateLimitResult)
  }

  // Your handler logic here
}
```

### Example 2: Using HOC Wrapper

```typescript
import { withRateLimit } from '@/lib/rate-limit'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'

export const POST = withRateLimit(
  async (request) => {
    // Your handler code
    return NextResponse.json({ success: true })
  },
  'CRITICAL',
  'ip-user',
  getAuthenticatedUserId // Optional: function to get user ID
)
```

### Example 3: Anonymous/Public Endpoints

```typescript
export async function GET(request: NextRequest) {
  // No auth required, rate limit by IP only
  const rateLimitResult = await checkRateLimit(
    request,
    'PUBLIC',
    null,      // no user ID
    'ip'       // IP-only identifier
  )
  
  if (!rateLimitResult.success) {
    return rateLimitedResponse(rateLimitResult)
  }

  // Public data handler
}
```

## Identifier Types

### `'ip'` - IP Address Only
- Use for: Anonymous/public endpoints
- Example: Public market data, leaderboard

### `'user'` - User ID Only
- Use for: Per-user limits regardless of IP
- Example: Position fetches, balance checks

### `'ip-user'` - Combined IP + User ID
- Use for: Critical operations (default)
- Example: Order placement, wallet operations
- Most secure: Limits per user AND per IP

### `'anonymous'` - Anonymous Requests
- Use for: Unauthenticated endpoints
- Example: Signup pages, public APIs

## Graceful Degradation

Rate limiting automatically degrades gracefully if Redis is unavailable:

```typescript
// If UPSTASH_REDIS_REST_URL not set:
// - All requests allowed
// - Warning logged to console
// - No errors thrown
// - App continues to function

// This ensures:
// ✅ Local dev without Redis works
// ✅ Production deploys before Redis setup
// ✅ Redis outages don't break site
```

## Response Headers

Rate-limited responses include these headers:

```
X-RateLimit-Limit: 10          // Max requests per window
X-RateLimit-Remaining: 7        // Requests remaining
X-RateLimit-Reset: 1704924123   // Unix timestamp when limit resets
Retry-After: 45                 // Seconds until reset
```

## Monitoring

### Check Rate Limit Status

```bash
# View Redis analytics dashboard
# Go to: https://console.upstash.com/

# Check rate limit logs
fly logs -a polycopy | grep "RATE-LIMIT"
```

### Common Log Messages

```
[RATE-LIMIT] Redis not configured - rate limiting disabled
# → Need to set UPSTASH_REDIS_REST_URL/TOKEN

[RATE-LIMIT] Rate limit exceeded { tier: 'CRITICAL', identifier: '1.2.3.4:***', ... }
# → User hit rate limit (expected behavior)

[RATE-LIMIT] Error checking rate limit: ...
# → Redis connection issue (degrades gracefully)
```

## Testing Rate Limits

### Local Testing

```bash
# 1. Set up Upstash Redis (see above)

# 2. Add credentials to .env.local
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# 3. Test with curl
for i in {1..15}; do
  curl -X POST http://localhost:3000/api/polymarket/orders/place \
    -H "Content-Type: application/json" \
    -d '{"tokenId":"123","price":0.5,"amount":1,"side":"BUY"}'
  echo "\nRequest $i"
  sleep 1
done

# Expected: First 10 succeed, next 5 get 429
```

### Production Testing

```bash
# Test public endpoint (100 req/min)
ab -n 150 -c 10 https://polycopy.app/api/public/markets

# Should see:
# - First ~100 requests: 200 OK
# - Next ~50 requests: 429 Too Many Requests
```

## Security Best Practices

### ✅ DO:
- Apply most restrictive tier to financial operations
- Use `'ip-user'` for critical endpoints
- Monitor rate limit logs regularly
- Adjust limits based on actual usage patterns

### ❌ DON'T:
- Remove rate limiting from auth endpoints
- Use `'PUBLIC'` tier for order placement
- Ignore rate limit exceeded logs
- Share Redis credentials in code

## Adjusting Rate Limits

To change rate limits, edit `lib/rate-limit/config.ts`:

```typescript
export const RATE_LIMIT_CONFIG = {
  CRITICAL: {
    requests: 10,    // ← Change this
    window: '1m',    // ← Or this (5m, 1h, 1d)
    description: '...',
  },
}
```

Window formats:
- `'1m'` = 1 minute
- `'5m'` = 5 minutes
- `'1h'` = 1 hour
- `'1d'` = 1 day

## Troubleshooting

### Rate Limiting Not Working

**Check:**
1. Are env vars set? `echo $UPSTASH_REDIS_REST_URL`
2. Are credentials correct? Test in Upstash console
3. Check logs: `fly logs -a polycopy | grep RATE-LIMIT`

### Users Getting False 429s

**Possible Causes:**
1. Shared IP (corporate VPN, mobile network)
   - **Fix:** Use `'user'` identifier instead of `'ip-user'`
2. Rate limit too restrictive
   - **Fix:** Increase limits for that tier
3. Multiple tabs/devices
   - **Fix:** Document limits to users

### Redis Connection Issues

```
[RATE-LIMIT] Error checking rate limit: ...
```

**Solution:** Rate limiting auto-disables, app continues working.  
**Action:** Check Upstash dashboard for outages, verify credentials.

## Cost Estimates

### Upstash Redis Pricing

**Free Tier:**
- 10,000 commands/day
- Good for: Dev, small apps (<500 users)

**Pay-as-you-go:**
- $0.20 per 100,000 commands
- 1 rate limit check = 1-2 commands
- Example: 1M API requests/month = ~$2-4/month

**Recommended:**
- Start with free tier
- Monitor usage in Upstash console
- Upgrade when approaching 10k/day

## Next Steps

1. **Set up Upstash Redis** (5 min)
2. **Add env vars to production** (2 min)
3. **Deploy and test** (5 min)
4. **Monitor for 24 hours** (Check logs)
5. **Adjust limits if needed** (Optional)

---

**Status:** ✅ Rate limiting implemented on 7+ critical endpoints  
**Security Impact:** Prevents fund drainage, brute force, DDoS  
**Ready to Deploy:** Yes (with Upstash setup)
