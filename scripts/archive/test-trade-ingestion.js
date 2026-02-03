'use strict'

/**
 * Test script to fetch and ingest trades for one wallet from Dome API
 * 
 * Tests the trades ingestion pipeline with a real wallet from the top 500 by PnL
 * 
 * Env:
 *   DOME_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * 
 * Usage:
 *   node scripts/test-trade-ingestion.js [--wallet <0x...>] [--days 30] [--start-time <unix>] [--end-time <unix>] [--limit 100] [--dry-run]
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
const SLEEP_MS = 250
const MAX_RETRIES = 3
const DEFAULT_LOOKBACK_DAYS = 30

function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function parseArgs() {
  const args = process.argv.slice(2)
  const parsed = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--dry-run') {
      parsed.dryRun = true
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
      case '--limit':
        parsed.limit = toNumber(nextValue)
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
const LOOKBACK_DAYS = Number.isFinite(args.days) ? args.days : (Number.isFinite(ENV_LOOKBACK_DAYS) ? ENV_LOOKBACK_DAYS : DEFAULT_LOOKBACK_DAYS)
const START_TIME = Number.isFinite(args.startTime)
  ? args.startTime
  : (LOOKBACK_DAYS > 0 ? NOW_TS - (LOOKBACK_DAYS * 24 * 60 * 60) : null)
const END_TIME = Number.isFinite(args.endTime)
  ? args.endTime
  : (START_TIME ? NOW_TS : null)
const LIMIT = Number.isFinite(args.limit) ? args.limit : 100
const WALLET_OVERRIDE = args.wallet ? args.wallet.toLowerCase() : null
const DRY_RUN = args.dryRun === true

if (START_TIME !== null && END_TIME !== null && START_TIME > END_TIME) {
  throw new Error('Invalid time window: start_time is after end_time')
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url, options, attempt = 1) {
  const res = await fetch(url, options)
  if (res.ok) return res

  if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
    const delay = SLEEP_MS * attempt
    console.warn(`Retrying ${url} after ${delay}ms (status ${res.status})`)
    await sleep(delay)
    return fetchWithRetry(url, options, attempt + 1)
  }

  const body = await res.text()
  throw new Error(`Request failed (${res.status}): ${body || res.statusText}`)
}

/**
 * Get one wallet from top 500 by PnL
 */
async function getTopWallet() {
  const { data, error } = await supabase
    .from('traders')
    .select('wallet_address, pnl')
    .eq('is_active', true)
    .not('pnl', 'is', null)
    .order('pnl', { ascending: false })
    .limit(1)
    .single()

  if (error) throw error
  if (!data) throw new Error('No active traders found')

  return data.wallet_address
}

/**
 * Fetch all trades for a wallet from Dome API
 */
async function fetchTradesForWallet(wallet, limit = 100, window = {}) {
  const url = new URL(`${BASE_URL}/polymarket/orders`)
  url.searchParams.set('user', wallet)
  url.searchParams.set('limit', String(limit))
  if (window.startTime) url.searchParams.set('start_time', String(window.startTime))
  if (window.endTime) url.searchParams.set('end_time', String(window.endTime))

  console.log(`📡 Fetching trades for ${wallet}...`)
  
  const res = await fetchWithRetry(url.toString(), {
    headers: {
      'Authorization': `Bearer ${DOME_API_KEY}`
    }
  })

  const json = await res.json()
  const orders = Array.isArray(json?.orders) ? json.orders : []
  const pagination = json?.pagination || {}

  console.log(`   Found ${orders.length} trades (total: ${pagination.total || 'unknown'})`)

  return { orders, pagination }
}

/**
 * Map Dome API order to our table structure
 */
function mapDomeEventToFillRow(event) {
  const timestamp = new Date(event.timestamp * 1000).toISOString()

  return {
    wallet_address: event.user.toLowerCase(),
    timestamp,
    side: event.side,
    shares: event.shares ?? null,  // Will be removed if column doesn't exist
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

/**
 * Ingest trades into the trades table
 */
async function ingestTrades(orders) {
  if (orders.length === 0) return 0

  let rows = orders.map(mapDomeEventToFillRow)

  console.log(`💾 Ingesting ${rows.length} trades...`)

  // Try with shares first
  let { data, error } = await supabase
    .from('trades')
    .insert(rows)
    .select('id')

  // If error about shares column, remove it and retry
  if (error && error.message && error.message.includes('shares')) {
    console.log(`   ⚠️  shares column missing, retrying without it...`)
    rows = rows.map(row => {
      const { shares, ...rest } = row
      return rest
    })
    
    const retry = await supabase
      .from('trades')
      .insert(rows)
      .select('id')
    
    data = retry.data
    error = retry.error
  }

  if (error) {
    if (error.code === '23505') {
      // Duplicate - some trades already exist, that's ok
      console.log(`   ⚠️  Some trades already exist (idempotent)`)
      
      // Try individual inserts to count new ones
      let inserted = 0
      for (const order of orders) {
        try {
          const row = mapDomeEventToFillRow(order)
          const { error: insertError } = await supabase
            .from('trades')
            .insert(row)
            .select('id')
            .single()
          
          if (!insertError) inserted++
        } catch (err) {
          // Ignore duplicates
        }
      }
      return inserted
    }
    
    throw error
  }

  return data?.length || 0
}

/**
 * Verify trades were ingested
 */
async function verifyIngestion(wallet) {
  const { data, error, count } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: false })
    .eq('wallet_address', wallet.toLowerCase())
    .order('timestamp', { ascending: false })
    .limit(10)

  if (error) {
    console.error('❌ Error verifying:', error)
    return
  }

  console.log(`\n✅ Verification:`)
  console.log(`   Total trades in DB: ${count || 0}`)
  console.log(`   Sample trades:`)
  
  if (data && data.length > 0) {
    data.slice(0, 3).forEach((trade, i) => {
      console.log(`   ${i + 1}. ${trade.side} ${trade.shares_normalized} @ $${trade.price} (${trade.token_label || 'N/A'})`)
      console.log(`      Market: ${trade.market_slug || 'N/A'}`)
      console.log(`      Time: ${new Date(trade.timestamp).toISOString()}`)
    })
  }
}

async function main() {
  try {
    console.log('🚀 Starting trade ingestion test...\n')

    // Get a top wallet
    const wallet = WALLET_OVERRIDE || await getTopWallet()
    console.log(`📊 Testing with wallet: ${wallet}\n`)
    if (START_TIME && END_TIME) {
      const windowStartIso = new Date(START_TIME * 1000).toISOString()
      const windowEndIso = new Date(END_TIME * 1000).toISOString()
      console.log(`🗓️  Window: ${windowStartIso} → ${windowEndIso}`)
    } else {
      console.log('🗓️  Window: all-time')
    }
    console.log(`🔢 Limit: ${LIMIT}\n`)

    // Fetch trades
    const { orders } = await fetchTradesForWallet(wallet, LIMIT, { startTime: START_TIME, endTime: END_TIME })
    
    if (orders.length === 0) {
      console.log('⚠️  No trades found for this wallet')
      return
    }
    const timestamps = orders.map(o => o.timestamp).filter(ts => typeof ts === 'number')
    if (timestamps.length > 0) {
      const minTs = Math.min(...timestamps)
      const maxTs = Math.max(...timestamps)
      console.log(`🕒 Dome range: ${new Date(minTs * 1000).toISOString()} → ${new Date(maxTs * 1000).toISOString()}\n`)
    }

    if (DRY_RUN) {
      console.log('🧪 Dry run: skipping inserts and verification')
      return
    }

    // Ingest trades
    const inserted = await ingestTrades(orders)
    console.log(`   ✅ Inserted ${inserted} new trades\n`)

    // Verify
    await verifyIngestion(wallet)

    console.log('\n✨ Test complete!')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.stack) console.error(error.stack)
    process.exit(1)
  }
}

main()
