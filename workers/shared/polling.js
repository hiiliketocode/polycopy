'use strict'

/**
 * Shared polling and reconciliation helpers for hot/cold workers
 */

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// Rate limiting
class RateLimiter {
  constructor({ requestsPerSecond = 10, burst = 20 }) {
    this.requestsPerSecond = requestsPerSecond
    this.burst = burst
    this.queue = []
    this.lastRequest = 0
    this.tokens = burst
  }

  async acquire() {
    const now = Date.now()
    const elapsed = (now - this.lastRequest) / 1000
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.requestsPerSecond)
    this.lastRequest = now

    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }

    const waitTime = (1 - this.tokens) / this.requestsPerSecond * 1000
    await new Promise(resolve => setTimeout(resolve, Math.max(0, waitTime)))
    this.tokens = 0
    this.lastRequest = Date.now()
  }
}

// Per-wallet cooldown
class WalletCooldown {
  constructor(cooldownMs = 5000) {
    this.cooldownMs = cooldownMs
    this.lastCall = new Map()
  }

  async waitIfNeeded(wallet) {
    const key = wallet.toLowerCase()
    const last = this.lastCall.get(key) || 0
    const elapsed = Date.now() - last
    if (elapsed < this.cooldownMs) {
      const wait = this.cooldownMs - elapsed
      await new Promise(resolve => setTimeout(resolve, wait))
    }
    this.lastCall.set(key, Date.now())
  }
}

// Exponential backoff
async function withRetry(fn, maxAttempts = 3, baseDelay = 1000) {
  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (err) {
      attempt++
      const status = err?.status || err?.response?.status
      const isRetryable = [429, 500, 502, 503, 504].includes(status)
      
      if (attempt >= maxAttempts || !isRetryable) {
        throw err
      }

      const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
}

// Fetch with timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    clearTimeout(timeoutId)
    return res
  } catch (err) {
    clearTimeout(timeoutId)
    if (err.name === 'AbortError') {
      const timeoutError = new Error('upstream request timeout')
      timeoutError.status = 408
      throw timeoutError
    }
    throw err
  }
}

// Fetch trades from Polymarket public API
async function fetchTradesPage(wallet, limit = 200, offset = 0) {
  const url = `https://data-api.polymarket.com/trades?user=${wallet.toLowerCase()}&limit=${limit}&offset=${offset}`
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'Polycopy Worker' }
  }, 15000) // 15 second timeout

  if (!res.ok) {
    const error = new Error(`Trades API returned ${res.status}: ${await res.text()}`)
    error.status = res.status
    throw error
  }

  const data = await res.json()
  return Array.isArray(data) ? data : []
}

// Fetch positions from Polymarket public API
async function fetchPositions(wallet) {
  const positions = []
  let offset = 0
  const limit = 500
  let hasMore = true

  while (hasMore) {
    const url = `https://data-api.polymarket.com/positions?user=${wallet.toLowerCase()}&limit=${limit}&offset=${offset}`
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'Polycopy Worker' }
    }, 15000) // 15 second timeout

    if (!res.ok) {
      if (res.status === 404 || res.status === 400) {
        break // No positions
      }
      const error = new Error(`Positions API returned ${res.status}`)
      error.status = res.status
      throw error
    }

    const batch = await res.json()
    if (!Array.isArray(batch) || batch.length === 0) {
      hasMore = false
    } else {
      positions.push(...batch)
      offset += batch.length
      hasMore = batch.length === limit
    }
  }

  return positions
}

// Fetch closed positions (if API exists, otherwise derive from position history)
async function fetchClosedPositions(wallet) {
  // Polymarket doesn't have a dedicated closed-positions endpoint
  // We'll derive closed positions by comparing current positions with historical snapshots
  // For now, return empty array - this will be handled by reconciliation logic
  return []
}

// Parse trade timestamp
function parseTradeTimestamp(value) {
  if (!value) return null
  let ts = Number(value)
  if (!Number.isFinite(ts)) return null
  if (ts < 10000000000) ts *= 1000
  const date = new Date(ts)
  return Number.isNaN(date.getTime()) ? null : date
}

// Build trade row for upsert
function buildTradeRow(trade, wallet, traderId) {
  const tradeTimestamp = parseTradeTimestamp(trade.timestamp)
  if (!tradeTimestamp || !trade.conditionId) return null

  const tradeId = trade.transactionHash || 
    `${wallet.toLowerCase()}-${trade.conditionId}-${trade.timestamp}`

  return {
    trade_id: tradeId,
    trader_wallet: wallet.toLowerCase(),
    trader_id: traderId || null,
    transaction_hash: trade.transactionHash || null,
    status: trade.status || null,
    asset: trade.asset || null,
    condition_id: trade.conditionId,
    market_slug: trade.slug || null,
    event_slug: trade.eventSlug || null,
    market_title: trade.title || null,
    side: trade.side?.toUpperCase() || null,
    outcome: trade.outcome?.toUpperCase() || null,
    outcome_index: Number.isFinite(trade.outcomeIndex) ? Number(trade.outcomeIndex) : null,
    size: Number.isFinite(trade.size) ? Number(trade.size) : null,
    price: Number.isFinite(trade.price) ? Number(trade.price) : null,
    trade_timestamp: tradeTimestamp.toISOString(),
    trade_time: tradeTimestamp.toISOString(),
    source_updated_at: tradeTimestamp.toISOString(),
    raw: trade
  }
}

// Upsert trades into trades_public
// Batch upserts to avoid timeouts on large datasets
async function upsertTrades(rows) {
  if (rows.length === 0) return 0
  
  // Reduced batch size to 500 to avoid statement timeouts on large datasets
  const BATCH_SIZE = 500
  let totalUpserted = 0
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error, count } = await supabase
      .from('trades_public')
      .upsert(batch, { onConflict: 'trade_id', ignoreDuplicates: false, count: 'exact' })
    
    if (error) throw error
    totalUpserted += count ?? batch.length
  }
  
  return totalUpserted
}

// Update wallet poll state (tier removed - derived dynamically from follows table)
async function updateWalletPollState(wallet, tier, lastTradeTime, lastPositionCheck) {
  // Note: tier parameter is kept for backward compatibility but not stored
  const { error } = await supabase
    .from('wallet_poll_state')
    .upsert({
      wallet_address: wallet.toLowerCase(),
      last_trade_time_seen: lastTradeTime ? new Date(lastTradeTime).toISOString() : null,
      last_position_check_at: lastPositionCheck ? new Date(lastPositionCheck).toISOString() : null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'wallet_address' })

  if (error) throw error
}

// Get wallet poll state
async function getWalletPollState(wallet) {
  const { data, error } = await supabase
    .from('wallet_poll_state')
    .select('*')
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle()

  if (error) throw error
  return data
}

// Upsert current positions
async function upsertCurrentPositions(wallet, positions) {
  const rows = positions.map(pos => ({
    wallet_address: wallet.toLowerCase(),
    market_id: pos.conditionId || pos.asset || null,
    size: Number.isFinite(pos.size) ? Number(pos.size) : null,
    redeemable: pos.redeemable || false,
    last_seen_at: new Date().toISOString(),
    raw: pos
  }))

  if (rows.length === 0) {
    // Delete all positions for this wallet if none exist
    await supabase
      .from('positions_current')
      .delete()
      .eq('wallet_address', wallet.toLowerCase())
    return 0
  }

  // Optimized: Just use UPSERT - it handles conflicts automatically via onConflict
  // No need to DELETE first, which was causing timeouts on wallets with many positions
  // UPSERT will update existing rows and insert new ones in a single operation
  const { error, count } = await supabase
    .from('positions_current')
    .upsert(rows, { onConflict: 'wallet_address,market_id', ignoreDuplicates: false, count: 'exact' })

  if (error) throw error
  return count ?? rows.length
}

// Check if market is closed
async function checkMarketClosed(marketId) {
  try {
    const url = `https://clob.polymarket.com/markets/${marketId}`
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Polycopy Worker' } }, 10000) // 10 second timeout
    if (!res.ok) return null
    const market = await res.json()
    return market.closed === true || market.resolved === true
  } catch {
    return null
  }
}

// Reconcile positions: detect changes and classify closed positions
// Note: previousPositions should be passed in to avoid duplicate query
async function reconcilePositions(wallet, currentPositions, previousPositions) {
  const previousMap = new Map((previousPositions || []).map(p => [p.market_id, p]))
  const currentMap = new Map(currentPositions.map(p => [p.conditionId || p.asset, p]))

  const disappearedMarkets = []

  // Find all disappeared positions first
  for (const [marketId, prev] of previousMap) {
    if (!currentMap.has(marketId)) {
      disappearedMarkets.push({ marketId, prev })
    }
  }

  if (disappearedMarkets.length === 0) {
    return 0
  }

  // Optimized: Parallelize API calls to check market status
  // Instead of sequential calls (10 positions = 100s), do them in parallel
  const marketChecks = await Promise.allSettled(
    disappearedMarkets.map(({ marketId }) => checkMarketClosed(marketId))
  )

  const closed = []
  for (let i = 0; i < disappearedMarkets.length; i++) {
    const { marketId, prev } = disappearedMarkets[i]
    const checkResult = marketChecks[i]
    // If API call failed or returned null, default to 'manual_close'
    const isMarketClosed = checkResult.status === 'fulfilled' && checkResult.value === true
    const closedReason = isMarketClosed ? 'market_closed' : 'manual_close'
    
    closed.push({
      wallet_address: wallet.toLowerCase(),
      market_id: marketId,
      closed_reason: closedReason,
      closed_at: new Date().toISOString(),
      raw: prev.raw
    })
  }

  // Insert closed positions (batch insert)
  if (closed.length > 0) {
    await supabase
      .from('positions_closed')
      .upsert(closed, { onConflict: 'wallet_address,market_id,closed_at', ignoreDuplicates: true })
  }

  return closed.length
}

// Process a single wallet (trades + positions)
async function processWallet(wallet, traderId, tier, rateLimiter, walletCooldown) {
  const startTime = Date.now()
  let tradesUpserted = 0
  let lastTradeTime = null

  try {
    await walletCooldown.waitIfNeeded(wallet)

    // Fetch and upsert trades
    const pollState = await getWalletPollState(wallet)
    const watermark = pollState?.last_trade_time_seen ? new Date(pollState.last_trade_time_seen) : null

    let offset = 0
    const limit = 200
    let hasNewTrades = false

    while (true) {
      await rateLimiter.acquire()
      const trades = await withRetry(() => fetchTradesPage(wallet, limit, offset))

      if (trades.length === 0) break

      const rows = []
      let oldestInPage = null

      for (const trade of trades) {
        const tradeTs = parseTradeTimestamp(trade.timestamp)
        if (!tradeTs) continue

        if (watermark && tradeTs <= watermark) {
          continue
        }

        const row = buildTradeRow(trade, wallet, traderId)
        if (row) {
          rows.push(row)
          if (!lastTradeTime || tradeTs > lastTradeTime) {
            lastTradeTime = tradeTs
            hasNewTrades = true
          }
        }

        if (!oldestInPage || tradeTs < oldestInPage) {
          oldestInPage = tradeTs
        }
      }

      if (rows.length > 0) {
        await rateLimiter.acquire()
        tradesUpserted += await upsertTrades(rows)
      }

      if (trades.length < limit) break
      if (watermark && oldestInPage && oldestInPage <= watermark) break

      offset += limit
    }

    // Fetch and reconcile positions
    await rateLimiter.acquire()
    const positions = await withRetry(() => fetchPositions(wallet))

    // Get previous positions BEFORE upserting (needed for reconciliation)
    // Optimized: Only select columns we actually need (market_id and raw)
    await rateLimiter.acquire()
    const { data: previousPositions } = await supabase
      .from('positions_current')
      .select('market_id, raw')
      .eq('wallet_address', wallet.toLowerCase())

    await rateLimiter.acquire()
    const closedCount = await reconcilePositions(wallet, positions, previousPositions || [])

    await rateLimiter.acquire()
    await upsertCurrentPositions(wallet, positions)

    // Update poll state
    const now = Date.now()
    await updateWalletPollState(
      wallet,
      tier,
      lastTradeTime || watermark,
      new Date(now)
    )

    const duration = Date.now() - startTime
    console.log(`✅ ${wallet}: ${tradesUpserted} trades, ${positions.length} positions, ${closedCount} closed (${duration}ms)`)

    return { tradesUpserted, positionsCount: positions.length, closedCount, duration }
  } catch (err) {
    console.error(`❌ ${wallet}:`, err.message || err)
    throw err
  }
}

module.exports = {
  RateLimiter,
  WalletCooldown,
  withRetry,
  processWallet,
  getWalletPollState,
  updateWalletPollState,
  supabase
}

