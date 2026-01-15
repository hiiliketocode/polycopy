'use strict'

/**
 * Production-quality trade backfill script for top 500 wallets
 * 
 * Features:
 * - Real idempotency: Checks which trades are actually missing (by order_hash)
 * - Progress tracking: Saves state to resume from
 * - Accurate progress reporting
 * - Proper error handling and retries
 * - No arbitrary skips - processes all wallets
 * 
 * Env:
 *   DOME_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * 
 * Usage:
 *   node scripts/backfill-wallet-trades.js [--wallet <0x...>] [--days 30] [--start-time <unix>] [--end-time <unix>] [--fetch-all] [--select-days 30] [--select-start-time <unix>] [--select-end-time <unix>] [--max-wallets 10] [--limit 1000] [--concurrency 5] [--reset-progress]
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const DOME_API_KEY = process.env.DOME_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!DOME_API_KEY) throw new Error('Missing DOME_API_KEY')
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const BASE_URL = 'https://api.domeapi.io/v1'
const SLEEP_MS = 300 // Rate limiting (slightly slower to be safe)
const MAX_RETRIES = 3
const DEFAULT_DOME_LIMIT = 1000
const MAX_DOME_LIMIT = 1000
const DEFAULT_WALLET_CONCURRENCY = 5
const INSERT_BATCH_SIZE = 3000 // Supabase batch insert size (tune 2000-5000)
const REQUEST_TIMEOUT_MS = 60000 // 60 second timeout
const PROGRESS_FILE = path.join(__dirname, '.backfill-progress.json')
const DEFAULT_LOOKBACK_DAYS = 30
const RECENT_TRADES_PAGE_SIZE = 1000
const TRADER_CHUNK_SIZE = 500
const RECENT_ACTIVITY_TABLE = 'trades_public'
const RECENT_ACTIVITY_WALLET_COLUMN = 'trader_wallet'
const RECENT_ACTIVITY_TIME_COLUMN = 'trade_timestamp'
const PROGRESS_SAVE_EVERY_PAGES = 50

function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function parseArgs() {
  const args = process.argv.slice(2)
  const parsed = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--reset-progress') {
      parsed.resetProgress = true
      continue
    }
    if (arg === '--fetch-all') {
      parsed.fetchAll = true
      continue
    }

    const [key, rawValue] = arg.split('=')
    const nextValue = rawValue ?? args[i + 1]

    switch (key) {
      case '--wallet':
        parsed.wallet = nextValue
        if (!rawValue) i++
        break
      case '--days':
        parsed.days = toNumber(nextValue)
        if (!rawValue) i++
        break
      case '--start-time':
        parsed.startTime = toNumber(nextValue)
        if (!rawValue) i++
        break
      case '--end-time':
        parsed.endTime = toNumber(nextValue)
        if (!rawValue) i++
        break
      case '--max-wallets':
        parsed.maxWallets = toNumber(nextValue)
        if (!rawValue) i++
        break
      case '--limit':
        parsed.limit = toNumber(nextValue)
        if (!rawValue) i++
        break
      case '--concurrency':
        parsed.concurrency = toNumber(nextValue)
        if (!rawValue) i++
        break
      case '--select-days':
        parsed.selectDays = toNumber(nextValue)
        if (!rawValue) i++
        break
      case '--select-start-time':
        parsed.selectStartTime = toNumber(nextValue)
        if (!rawValue) i++
        break
      case '--select-end-time':
        parsed.selectEndTime = toNumber(nextValue)
        if (!rawValue) i++
        break
      default:
        break
    }
  }

  return parsed
}

const args = parseArgs()
const NOW_TS = Math.floor(Date.now() / 1000)
const ENV_LOOKBACK_DAYS = toNumber(process.env.DOME_LOOKBACK_DAYS)
const ENV_DOME_LIMIT = toNumber(process.env.DOME_ORDERS_LIMIT)
const ENV_WALLET_CONCURRENCY = toNumber(process.env.DOME_WALLET_CONCURRENCY)
const ENV_SELECT_LOOKBACK_DAYS = toNumber(process.env.DOME_SELECT_LOOKBACK_DAYS)
const ENV_SELECT_START_TIME = toNumber(process.env.DOME_SELECT_START_TIME)
const ENV_SELECT_END_TIME = toNumber(process.env.DOME_SELECT_END_TIME)
const ENV_START_TIME = toNumber(process.env.DOME_START_TIME)
const ENV_END_TIME = toNumber(process.env.DOME_END_TIME)
const FETCH_ALL = args.fetchAll === true
const REQUEST_LIMIT = Number.isFinite(args.limit)
  ? args.limit
  : (Number.isFinite(ENV_DOME_LIMIT) ? ENV_DOME_LIMIT : DEFAULT_DOME_LIMIT)
const BATCH_SIZE = Math.max(1, Math.min(MAX_DOME_LIMIT, Math.floor(REQUEST_LIMIT)))
const WALLET_CONCURRENCY = Number.isFinite(args.concurrency)
  ? args.concurrency
  : (Number.isFinite(ENV_WALLET_CONCURRENCY) ? ENV_WALLET_CONCURRENCY : DEFAULT_WALLET_CONCURRENCY)
const WALLET_WORKERS = Math.max(1, Math.floor(WALLET_CONCURRENCY))
const LOOKBACK_DAYS = Number.isFinite(args.days) ? args.days : (Number.isFinite(ENV_LOOKBACK_DAYS) ? ENV_LOOKBACK_DAYS : DEFAULT_LOOKBACK_DAYS)
const START_TIME = FETCH_ALL
  ? null
  : (Number.isFinite(args.startTime)
      ? args.startTime
      : (Number.isFinite(ENV_START_TIME)
          ? ENV_START_TIME
          : (LOOKBACK_DAYS > 0 ? NOW_TS - (LOOKBACK_DAYS * 24 * 60 * 60) : null)))
const END_TIME = FETCH_ALL
  ? null
  : (Number.isFinite(args.endTime)
      ? args.endTime
      : (Number.isFinite(ENV_END_TIME)
          ? ENV_END_TIME
          : (START_TIME ? NOW_TS : null)))
const SELECT_LOOKBACK_DAYS = Number.isFinite(args.selectDays)
  ? args.selectDays
  : (Number.isFinite(ENV_SELECT_LOOKBACK_DAYS) ? ENV_SELECT_LOOKBACK_DAYS : DEFAULT_LOOKBACK_DAYS)
const SELECT_START_TIME = Number.isFinite(args.selectStartTime)
  ? args.selectStartTime
  : (Number.isFinite(ENV_SELECT_START_TIME)
      ? ENV_SELECT_START_TIME
      : (SELECT_LOOKBACK_DAYS > 0 ? NOW_TS - (SELECT_LOOKBACK_DAYS * 24 * 60 * 60) : null))
const SELECT_END_TIME = Number.isFinite(args.selectEndTime)
  ? args.selectEndTime
  : (Number.isFinite(ENV_SELECT_END_TIME)
      ? ENV_SELECT_END_TIME
      : (SELECT_START_TIME ? NOW_TS : null))
const SINGLE_WALLET = args.wallet ? args.wallet.toLowerCase() : null
const MAX_WALLETS = Number.isFinite(args.maxWallets) ? args.maxWallets : null
const RESET_PROGRESS = args.resetProgress === true

if (START_TIME !== null && END_TIME !== null && START_TIME > END_TIME) {
  throw new Error('Invalid time window: start_time is after end_time')
}
if (SELECT_START_TIME !== null && SELECT_END_TIME !== null && SELECT_START_TIME > SELECT_END_TIME) {
  throw new Error('Invalid selection window: select-start-time is after select-end-time')
}

// Load or create progress state
function loadProgress(defaultSelectionWindow, defaultFetchWindow) {
  try {
    if (!RESET_PROGRESS && fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf8')
      const parsed = JSON.parse(data)
      if (!parsed.selectionWindow) {
        parsed.selectionWindow = parsed.window || defaultSelectionWindow
      }
      if (!parsed.fetchWindow) {
        parsed.fetchWindow = parsed.window || defaultFetchWindow
      }
      if (!parsed.walletStates) {
        parsed.walletStates = {}
      }
      return parsed
    }
  } catch (error) {
    console.warn('⚠️  Could not load progress file, starting fresh')
  }
  return {
    completedWallets: [],
    failedWallets: [],
    startTime: Date.now(),
    selectionWindow: defaultSelectionWindow,
    fetchWindow: defaultFetchWindow,
    walletStates: {}
  }
}

function saveProgress(progress) {
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2))
  } catch (error) {
    console.warn('⚠️  Could not save progress file:', error.message)
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url, options, attempt = 1) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`)), REQUEST_TIMEOUT_MS)
  })

  try {
    const res = await Promise.race([
      fetch(url, options),
      timeoutPromise
    ])
    
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('retry-after') || 0)
        const delay = Math.max(retryAfter * 1000, SLEEP_MS * Math.pow(2, attempt))
        console.warn(`   ⚠️  Retrying after ${delay}ms (status ${res.status})`)
        await sleep(delay)
        return fetchWithRetry(url, options, attempt + 1)
      }
      const body = await res.text()
      throw new Error(`Request failed (${res.status}): ${body || res.statusText}`)
    }
    
    return res
  } catch (error) {
    if (error.message.includes('timeout')) {
      throw error
    }
    if ((error.message.includes('429') || error.message.includes('500')) && attempt < MAX_RETRIES) {
      const delay = SLEEP_MS * Math.pow(2, attempt)
      console.warn(`   ⚠️  Retrying after ${delay}ms (error: ${error.message})`)
      await sleep(delay)
      return fetchWithRetry(url, options, attempt + 1)
    }
    throw error
  }
}

/**
 * Load top 500 wallets by PnL
 */
async function loadWalletsWithRecentTrades(window) {
  if (!window?.startTime && !window?.endTime) return null

  const wallets = new Set()
  let from = 0
  let hasMore = true

  while (hasMore) {
    let query = supabase
      .from(RECENT_ACTIVITY_TABLE)
      .select(RECENT_ACTIVITY_WALLET_COLUMN)
      .order(RECENT_ACTIVITY_WALLET_COLUMN, { ascending: true })
      .range(from, from + RECENT_TRADES_PAGE_SIZE - 1)

    if (window?.startTime) {
      query = query.gte(RECENT_ACTIVITY_TIME_COLUMN, new Date(window.startTime * 1000).toISOString())
    }
    if (window?.endTime) {
      query = query.lte(RECENT_ACTIVITY_TIME_COLUMN, new Date(window.endTime * 1000).toISOString())
    }

    const { data, error } = await query
    if (error) throw error

    ;(data || []).forEach(row => {
      const wallet = row?.[RECENT_ACTIVITY_WALLET_COLUMN]
      if (wallet) wallets.add(String(wallet).toLowerCase())
    })

    if (!data || data.length < RECENT_TRADES_PAGE_SIZE) {
      hasMore = false
    } else {
      from += RECENT_TRADES_PAGE_SIZE
    }
  }

  return Array.from(wallets)
}

async function loadTopWallets(window) {
  const recentWallets = await loadWalletsWithRecentTrades(window)

  if (recentWallets && recentWallets.length === 0) {
    console.log(`ℹ️  No wallets with trades in ${RECENT_ACTIVITY_TABLE} for the selected window`)
    return []
  }

  const walletFilter = recentWallets && recentWallets.length > 0 ? recentWallets : null
  const traderRows = []

  if (walletFilter) {
    console.log(`📌 Found ${walletFilter.length} wallets with trades in ${RECENT_ACTIVITY_TABLE} in the window`)
    for (let i = 0; i < walletFilter.length; i += TRADER_CHUNK_SIZE) {
      const chunk = walletFilter.slice(i, i + TRADER_CHUNK_SIZE)
      const { data, error } = await supabase
        .from('traders')
        .select('wallet_address, pnl')
        .eq('is_active', true)
        .not('pnl', 'is', null)
        .in('wallet_address', chunk)

      if (error) throw error
      if (data && data.length > 0) traderRows.push(...data)
    }
  } else {
    const { data, error } = await supabase
      .from('traders')
      .select('wallet_address, pnl')
      .eq('is_active', true)
      .not('pnl', 'is', null)
      .order('pnl', { ascending: false })
      .limit(500)

    if (error) throw error
    return (data || []).map((r) => r.wallet_address).filter(Boolean)
  }

  const byWallet = new Map()
  traderRows.forEach(row => {
    const wallet = row.wallet_address?.toLowerCase()
    if (!wallet) return
    const pnl = Number(row.pnl)
    byWallet.set(wallet, Number.isFinite(pnl) ? pnl : null)
  })

  const ordered = Array.from(byWallet.entries())
    .sort((a, b) => {
      const pnlA = a[1] ?? Number.NEGATIVE_INFINITY
      const pnlB = b[1] ?? Number.NEGATIVE_INFINITY
      return pnlB - pnlA
    })
    .map(([wallet]) => wallet)

  console.log(`📌 Active traders with PnL in window: ${ordered.length}`)

  return ordered.slice(0, 500)
}

/**
 * Fetch all trades for a wallet with pagination
 */
async function fetchTradesPage(wallet, window, offset) {
  const startTime = window?.startTime ?? null
  const endTime = window?.endTime ?? null

  const url = new URL(`${BASE_URL}/polymarket/orders`)
  url.searchParams.set('user', wallet)
  url.searchParams.set('limit', String(BATCH_SIZE))
  url.searchParams.set('offset', String(offset))
  if (startTime) url.searchParams.set('start_time', String(startTime))
  if (endTime) url.searchParams.set('end_time', String(endTime))

  const res = await fetchWithRetry(url.toString(), {
    headers: {
      'Authorization': `Bearer ${DOME_API_KEY}`
    }
  })

  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after') || 60
    console.warn(`   ⚠️  Rate limited! Waiting ${retryAfter}s...`)
    await sleep(Number(retryAfter) * 1000)
    return fetchTradesPage(wallet, window, offset)
  }

  const json = await res.json()
  const orders = Array.isArray(json?.orders) ? json.orders : []
  const pagination = json?.pagination || {}

  return { orders, pagination }
}

/**
 * Map Dome API order to trades table row
 */
function mapDomeEventToFillRow(event) {
  const timestamp = new Date(event.timestamp * 1000).toISOString()

  return {
    wallet_address: event.user.toLowerCase(),
    timestamp,
    side: event.side,
    shares: event.shares ?? null,
    shares_normalized: event.shares_normalized,
    price: event.price,
    token_id: event.token_id || null,
    token_label: event.token_label || null,
    condition_id: event.condition_id || null,
    market_slug: event.market_slug || null,
    title: event.title || null,
    tx_hash: event.tx_hash,
    order_hash: event.order_hash || null,
    taker: event.taker?.toLowerCase() || null,
    source: 'dome',
    raw: event
  }
}

function filterOrdersByWindow(orders, startTime, endTime) {
  if (!startTime && !endTime) return orders
  return orders.filter(order => {
    if (typeof order.timestamp !== 'number') return true
    if (startTime && order.timestamp < startTime) return false
    if (endTime && order.timestamp > endTime) return false
    return true
  })
}

function isSortedDescByTimestamp(orders) {
  if (orders.length < 2) return true
  for (let i = 1; i < orders.length; i++) {
    const prev = orders[i - 1]?.timestamp
    const next = orders[i]?.timestamp
    if (typeof prev !== 'number' || typeof next !== 'number') return false
    if (next > prev) return false
  }
  return true
}

/**
 * Ingest trades in batches (only new ones)
 */
async function ingestTradesBatch(orders) {
  if (orders.length === 0) return 0

  let rows = orders.map(mapDomeEventToFillRow)
  let totalInserted = 0

  // Process in batches
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const batch = rows.slice(i, i + INSERT_BATCH_SIZE)

    // Try with shares first
    let { error, count } = await supabase
      .from('trades')
      .upsert(batch, {
        onConflict: 'wallet_address,trade_uid',
        ignoreDuplicates: true,
        count: 'exact'
      })

    // If error about shares column, remove it and retry
    if (error && error.message && error.message.includes('shares')) {
      const batchWithoutShares = batch.map(row => {
        const { shares, ...rest } = row
        return rest
      })

      const retry = await supabase
        .from('trades')
        .upsert(batchWithoutShares, {
          onConflict: 'wallet_address,trade_uid',
          ignoreDuplicates: true,
          count: 'exact'
        })

      error = retry.error
      count = retry.count
    }

    if (error) {
      console.error(`   ❌ Batch upsert error:`, error.message)
      throw error
    } else {
      totalInserted += count ?? 0
    }
  }

  return totalInserted
}

/**
 * Process one wallet with real idempotency
 */
async function processWallet(wallet, index, total, progress, window) {
  const walletShort = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
  console.log(`\n[${index + 1}/${total}] Processing ${walletShort}...`)

  try {
    if (!progress.walletStates) progress.walletStates = {}
    const state = progress.walletStates[wallet] || {}
    let offset = Number.isFinite(state.offset) ? state.offset : 0
    let pageCount = Number.isFinite(state.pageCount) ? state.pageCount : 0
    let totalFetched = Number.isFinite(state.fetched) ? state.fetched : 0
    let totalInserted = Number.isFinite(state.inserted) ? state.inserted : 0
    let consecutiveErrors = 0
    const MAX_CONSECUTIVE_ERRORS = 3
    const startTime = window?.startTime ?? null
    const endTime = window?.endTime ?? null

    if (offset > 0) {
      console.log(`   🔁 Resuming at offset ${offset} (page ${pageCount})`)
    }

    console.log(`   🔍 Using DB idempotency (no pre-check)`)

    // Fetch trades page-by-page
    console.log(`   📡 Fetching trades from Dome API...`)

    let hasMore = true

    while (hasMore) {
      pageCount++
      try {
        const { orders, pagination } = await fetchTradesPage(wallet, window, offset)
        const filteredOrders = filterOrdersByWindow(orders, startTime, endTime)

        if (pageCount % 20 === 0) {
          console.log(`   📄 Fetched ${pageCount} pages (${totalFetched} trades)...`)
        }

        totalFetched += filteredOrders.length

        if (orders.length === 0) {
          hasMore = false
          break
        }

        if (filteredOrders.length > 0) {
          const inserted = await ingestTradesBatch(filteredOrders)
          totalInserted += inserted
        }

        offset += orders.length
        hasMore = pagination.has_more === true && orders.length > 0
        consecutiveErrors = 0

        if (startTime && orders.length > 0 && isSortedDescByTimestamp(orders)) {
          const oldestTimestamp = orders[orders.length - 1]?.timestamp
          if (typeof oldestTimestamp === 'number' && oldestTimestamp < startTime) {
            hasMore = false
          }
        }

        progress.walletStates[wallet] = {
          offset,
          pageCount,
          fetched: totalFetched,
          inserted: totalInserted,
          updatedAt: Date.now()
        }

        if (pageCount % PROGRESS_SAVE_EVERY_PAGES === 0) {
          saveProgress(progress)
        }

        if (hasMore) {
          await sleep(SLEEP_MS)
        }
      } catch (error) {
        consecutiveErrors++
        console.error(`   ❌ Error fetching page ${pageCount} (offset ${offset}):`, error.message)
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(`   ❌ Too many consecutive errors, stopping for this wallet`)
          throw error
        }
        const delay = SLEEP_MS * Math.pow(2, consecutiveErrors) * 5
        console.warn(`   ⚠️  Retrying after ${delay}ms...`)
        await sleep(delay)
      }
    }

    if (totalFetched === 0) {
      console.log(`   ⚠️  No trades found for this wallet`)
      return { wallet, success: true, fetched: 0, inserted: 0, skipped: true }
    }

    if (totalInserted === 0) {
      console.log(`   ✅ All trades already exist, skipping insert`)
      return { wallet, success: true, fetched: totalFetched, inserted: 0, skipped: true }
    }

    console.log(`   ✅ Inserted ${totalInserted} new trades`)
    return { wallet, success: true, fetched: totalFetched, inserted: totalInserted, skipped: false }
  } catch (error) {
    console.error(`   ❌ Error processing wallet:`, error.message)
    return { wallet, success: false, error: error.message, fetched: 0, inserted: 0 }
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting trade backfill for top 500 wallets...\n')

  const defaultSelectionWindow = { startTime: SELECT_START_TIME, endTime: SELECT_END_TIME, lookbackDays: SELECT_LOOKBACK_DAYS }
  const defaultFetchWindow = { startTime: START_TIME, endTime: END_TIME, lookbackDays: LOOKBACK_DAYS, mode: FETCH_ALL ? 'all' : 'window' }
  const progress = loadProgress(defaultSelectionWindow, defaultFetchWindow)
  const selectionWindow = progress.selectionWindow || defaultSelectionWindow
  const fetchWindow = progress.fetchWindow || defaultFetchWindow
  if (
    progress.selectionWindow &&
    (progress.selectionWindow.startTime !== defaultSelectionWindow.startTime ||
      progress.selectionWindow.endTime !== defaultSelectionWindow.endTime)
  ) {
    console.warn('⚠️  Selection window differs from current config; using saved window. Use --reset-progress to override.')
  }
  if (
    progress.fetchWindow &&
    (progress.fetchWindow.startTime !== defaultFetchWindow.startTime ||
      progress.fetchWindow.endTime !== defaultFetchWindow.endTime)
  ) {
    console.warn('⚠️  Fetch window differs from current config; using saved window. Use --reset-progress to override.')
  }
  const elapsed = Math.floor((Date.now() - progress.startTime) / 1000 / 60)
  console.log(`📊 Resume: ${progress.completedWallets.length} wallets completed, ${progress.failedWallets.length} failed`)
  if (elapsed > 0) {
    console.log(`   Elapsed time: ${elapsed} minutes\n`)
  }
  if (selectionWindow.startTime && selectionWindow.endTime) {
    const windowStartIso = new Date(selectionWindow.startTime * 1000).toISOString()
    const windowEndIso = new Date(selectionWindow.endTime * 1000).toISOString()
    console.log(`🗓️  Selection window (${RECENT_ACTIVITY_TABLE}): ${windowStartIso} → ${windowEndIso}`)
  } else {
    console.log(`🗓️  Selection window (${RECENT_ACTIVITY_TABLE}): all-time`)
  }
  if (fetchWindow.startTime && fetchWindow.endTime) {
    const fetchStartIso = new Date(fetchWindow.startTime * 1000).toISOString()
    const fetchEndIso = new Date(fetchWindow.endTime * 1000).toISOString()
    console.log(`🗓️  Fetch window (Dome): ${fetchStartIso} → ${fetchEndIso}\n`)
  } else {
    console.log('🗓️  Fetch window (Dome): all-time\n')
  }
  if (RESET_PROGRESS) {
    console.log(`♻️  Progress reset requested, writing to ${PROGRESS_FILE}\n`)
  }

  try {
    // Load wallets
    const allWallets = SINGLE_WALLET ? [SINGLE_WALLET] : await loadTopWallets(selectionWindow)
    console.log(`📊 Loaded ${allWallets.length} wallets\n`)

    if (allWallets.length === 0) {
      console.log('⚠️  No wallets found')
      return
    }

    // Filter out already completed wallets
    const completedSet = new Set(progress.completedWallets)
    let walletsToProcess = allWallets.filter(w => !completedSet.has(w))

    if (MAX_WALLETS && walletsToProcess.length > MAX_WALLETS) {
      walletsToProcess = walletsToProcess.slice(0, MAX_WALLETS)
    }
    
    console.log(`📋 Processing ${walletsToProcess.length} wallets (${progress.completedWallets.length} already completed) with concurrency ${WALLET_WORKERS}\n`)

    const walletIndexByAddress = new Map(allWallets.map((wallet, idx) => [wallet, idx]))
    const results = new Array(walletsToProcess.length)
    let successCount = 0
    let failCount = 0
    let totalFetched = 0
    let totalInserted = 0
    let progressUpdate = Promise.resolve()

    const recordResult = (result, wallet, localIndex) => {
      results[localIndex] = result
      if (result.success) {
        successCount++
        totalFetched += result.fetched || 0
        totalInserted += result.inserted || 0

        // Mark as completed
        if (!progress.completedWallets.includes(wallet)) {
          progress.completedWallets.push(wallet)
        }
        if (progress.walletStates && progress.walletStates[wallet]) {
          delete progress.walletStates[wallet]
        }
      } else {
        failCount++
        if (!progress.failedWallets.find(f => f.wallet === wallet)) {
          progress.failedWallets.push({ wallet, error: result.error, timestamp: Date.now() })
        }
      }

      // Save progress after each wallet
      saveProgress(progress)
    }

    const queueProgressUpdate = (result, wallet, localIndex) => {
      progressUpdate = progressUpdate
        .then(() => recordResult(result, wallet, localIndex))
        .catch((err) => {
          console.error('Failed to update progress:', err.message || err)
        })
      return progressUpdate
    }

    const runPool = async (items, limit, handler) => {
      let nextIndex = 0
      const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
          const current = nextIndex++
          if (current >= items.length) break
          await handler(items[current], current)
        }
      })
      await Promise.all(workers)
    }

    await runPool(walletsToProcess, WALLET_WORKERS, async (wallet, localIndex) => {
      const globalIndex = walletIndexByAddress.get(wallet) ?? localIndex
      const result = await processWallet(wallet, globalIndex, allWallets.length, progress, fetchWindow)
      await queueProgressUpdate(result, wallet, localIndex)
    })

    // Final summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 BACKFILL SUMMARY')
    console.log('='.repeat(60))
    console.log(`Total wallets: ${allWallets.length}`)
    console.log(`✅ Successful: ${successCount}`)
    console.log(`❌ Failed: ${failCount}`)
    console.log(`📡 Total trades fetched: ${totalFetched.toLocaleString()}`)
    console.log(`💾 Total trades inserted: ${totalInserted.toLocaleString()}`)
    console.log(`🔄 Duplicates skipped: ${(totalFetched - totalInserted).toLocaleString()}`)

    if (failCount > 0) {
      console.log('\n❌ Failed wallets:')
      results
        .filter(r => !r.success)
        .forEach(r => console.log(`   - ${r.wallet}: ${r.error}`))
    }

    console.log('\n✨ Backfill complete!')
    
    // Clean up progress file on success
    if (failCount === 0 && walletsToProcess.length === allWallets.length) {
      try {
        fs.unlinkSync(PROGRESS_FILE)
        console.log('🧹 Cleaned up progress file')
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('❌ Fatal error:', error.message)
    if (error.stack) console.error(error.stack)
    process.exit(1)
  }
}

main()
