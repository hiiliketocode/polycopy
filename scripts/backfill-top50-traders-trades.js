#!/usr/bin/env node
'use strict'

/**
 * Backfill trades for top 50 traders into the main trades table.
 * 
 * This script:
 * 1. Gets top 50 traders by realized PnL rank (30D window)
 * 2. For each trader, finds their latest trade timestamp
 * 3. Fetches new trades from Dome API since that timestamp
 * 4. Inserts them into the trades table
 * 5. Backfills missing markets for those trades
 * 
 * Usage:
 *   node scripts/backfill-top50-traders-trades.js
 *   node scripts/backfill-top50-traders-trades.js --top-n 50 --window 30D
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOME_API_KEY = process.env.DOME_API_KEY
const DOME_BASE_URL = process.env.DOME_BASE_URL || 'https://api.domeapi.io/v1'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

if (!DOME_API_KEY) {
  console.error('Missing DOME_API_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TOP_N = parseInt(process.argv.find(arg => arg.startsWith('--top-n='))?.split('=')[1] || '50')
const WINDOW = process.argv.find(arg => arg.startsWith('--window='))?.split('=')[1] || '30D'
const BATCH_SIZE = 1000
const INSERT_BATCH_SIZE = 3000
const SLEEP_MS = 300

function toNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toIsoFromUnix(ts) {
  if (!ts) return null
  const n = toNumber(ts)
  if (n === null) return null
  return new Date(n * 1000).toISOString()
}

function toIsoFromGameStart(raw) {
  if (!raw || typeof raw !== 'string') return null
  try {
    const d = new Date(raw)
    if (!isNaN(d.getTime())) return d.toISOString()
  } catch {}
  return null
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url, options, attempt = 1) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60000)
  
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        const retryAfter = Number(res.headers.get('retry-after') || 0)
        const delay = Math.max(retryAfter * 1000, 2000 * Math.pow(2, attempt - 1))
        await sleep(delay)
        return fetchWithRetry(url, options, attempt + 1)
      }
      throw new Error(`Request failed (${res.status}): ${res.statusText}`)
    }
    return res
  } catch (error) {
    if (error.name === 'AbortError' && attempt < 3) {
      await sleep(2000 * Math.pow(2, attempt - 1))
      return fetchWithRetry(url, options, attempt + 1)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function getTopTraders(limit, window) {
  console.log(`📊 Fetching top ${limit} traders by realized PnL rank (window: ${window})...`)
  
  const { data: rankings, error: rankingsError } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address, pnl_sum, rank')
    .eq('window_key', window)
    .order('rank', { ascending: true })
    .limit(limit)
  
  if (rankingsError) throw rankingsError
  
  if (!rankings || rankings.length === 0) return []
  
  const traders = rankings.map(r => ({
    wallet: r.wallet_address?.toLowerCase(),
    pnl: toNumber(r.pnl_sum) || 0,
    rank: r.rank
  }))
  
  console.log(`✅ Found ${traders.length} traders`)
  return traders
}

async function getLatestTradeTimestamp(wallet) {
  const { data, error } = await supabase
    .from('trades')
    .select('timestamp')
    .eq('wallet_address', wallet)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  
  if (!data) return null
  
  return new Date(data.timestamp).getTime() / 1000 // Convert to Unix timestamp
}

function mapDomeOrderToTradeRow(order, wallet) {
  const timestamp = new Date(order.timestamp * 1000).toISOString()
  
  // Calculate shares_normalized if not provided
  let sharesNormalized = toNumber(order.shares_normalized)
  if (sharesNormalized === null && toNumber(order.shares) !== null) {
    sharesNormalized = toNumber(order.shares) / 1000000
  }
  
  return {
    wallet_address: wallet.toLowerCase(),
    timestamp: timestamp,
    side: (order.side || '').toUpperCase(),
    shares_normalized: sharesNormalized,
    price: toNumber(order.price),
    token_id: order.token_id || null,
    token_label: order.token_label || null,
    condition_id: order.condition_id || null,
    market_slug: order.market_slug || null,
    title: order.title || null,
    tx_hash: order.tx_hash || order.transaction_hash || '',
    order_hash: order.order_hash || null,
    taker: order.taker?.toLowerCase() || null,
    source: 'dome',
    raw: order || {},
  }
}

async function fetchTradesFromDome(wallet, sinceTimestamp = null, offset = 0) {
  const url = new URL(`${DOME_BASE_URL}/polymarket/orders`)
  url.searchParams.set('user', wallet)
  url.searchParams.set('limit', String(BATCH_SIZE))
  url.searchParams.set('offset', String(offset))
  
  if (sinceTimestamp) {
    url.searchParams.set('start_time', String(Math.floor(sinceTimestamp)))
  }
  
  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${DOME_API_KEY}`
  }
  
  const res = await fetchWithRetry(url.toString(), { headers })
  const json = await res.json()
  
  const orders = Array.isArray(json?.orders) ? json.orders : []
  const pagination = json?.pagination || {}
  
  return { orders, pagination, hasMore: pagination.has_more === true }
}

async function upsertTrades(trades) {
  if (trades.length === 0) return 0
  
  // Filter out trades with missing required fields
  const validTrades = trades.filter(t => 
    t.wallet_address && 
    t.timestamp && 
    t.tx_hash && 
    t.side && 
    t.shares_normalized !== null && 
    t.price !== null
  )
  
  if (validTrades.length === 0) return 0
  
  // Deduplicate by (wallet_address, order_hash or tx_hash) - keep the last occurrence
  const seen = new Map()
  
  for (const trade of validTrades) {
    const uniqueKey = trade.order_hash || `tx:${trade.tx_hash}`
    const key = `${trade.wallet_address.toLowerCase()}:${uniqueKey}`
    seen.set(key, trade)
  }
  
  const uniqueTrades = Array.from(seen.values())
  
  if (uniqueTrades.length === 0) return 0
  
  // Upsert in batches
  let totalInserted = 0
  for (let i = 0; i < uniqueTrades.length; i += INSERT_BATCH_SIZE) {
    const batch = uniqueTrades.slice(i, i + INSERT_BATCH_SIZE)
    
    const { error, count } = await supabase
      .from('trades')
      .upsert(batch, {
        ignoreDuplicates: true,
        count: 'exact'
      })
    
    if (error) {
      console.error(`   ❌ Batch upsert error:`, error.message)
      throw error
    }
    
    totalInserted += count || 0
  }
  
  return totalInserted
}

async function backfillMarket(conditionId) {
  if (!conditionId) return false
  
  const url = new URL(`${DOME_BASE_URL}/polymarket/markets`)
  url.searchParams.set('condition_id', conditionId)
  url.searchParams.set('limit', '1')
  
  const headers = { Accept: 'application/json' }
  if (DOME_API_KEY) {
    headers.Authorization = `Bearer ${DOME_API_KEY}`
  }
  
  try {
    const res = await fetchWithRetry(url.toString(), { headers })
    const data = await res.json()
    
    if (!Array.isArray(data) || data.length === 0) {
      return false
    }
    
    const market = data[0]
    const startIso = toIsoFromUnix(market?.start_time)
    const endIso = toIsoFromUnix(market?.end_time)
    const completedIso = toIsoFromUnix(market?.completed_time)
    const closeIso = toIsoFromUnix(market?.close_time)
    const gameStartIso = toIsoFromGameStart(market?.game_start_time)
    
    const marketRow = {
      condition_id: market?.condition_id ?? null,
      market_slug: market?.market_slug ?? null,
      event_slug: market?.event_slug ?? null,
      title: market?.title ?? null,
      start_time_unix: toNumber(market?.start_time),
      end_time_unix: toNumber(market?.end_time),
      completed_time_unix: toNumber(market?.completed_time),
      close_time_unix: toNumber(market?.close_time),
      game_start_time_raw: market?.game_start_time ?? null,
      start_time: startIso,
      end_time: endIso,
      completed_time: completedIso,
      close_time: closeIso,
      game_start_time: gameStartIso,
      tags: market?.tags ?? null,
      volume_1_week: toNumber(market?.volume_1_week),
      volume_1_month: toNumber(market?.volume_1_month),
      volume_1_year: toNumber(market?.volume_1_year),
      volume_total: toNumber(market?.volume_total),
      resolution_source: market?.resolution_source ?? null,
      image: market?.image ?? null,
      description: market?.description ?? null,
      negative_risk_id: market?.negative_risk_id ?? null,
      side_a: market?.side_a ?? null,
      side_b: market?.side_b ?? null,
      winning_side: market?.winning_side ?? null,
      status: market?.status ?? null,
      extra_fields: market?.extra_fields ?? null,
      raw_dome: market ?? {},
      updated_at: new Date().toISOString(),
    }
    
    const { error } = await supabase
      .from('markets')
      .upsert(marketRow, { onConflict: 'condition_id' })
    
    if (error) {
      console.error(`   ❌ Error upserting market ${conditionId}:`, error.message)
      return false
    }
    
    return true
  } catch (error) {
    return false
  }
}

async function fetchMarketsByConditionIds(conditionIds) {
  if (conditionIds.length === 0) return []
  
  const url = new URL(`${DOME_BASE_URL}/polymarket/markets`)
  conditionIds.forEach(id => url.searchParams.append('condition_id', id))
  url.searchParams.set('limit', String(Math.min(100, conditionIds.length)))
  
  const headers = { Accept: 'application/json' }
  if (DOME_API_KEY) {
    headers.Authorization = `Bearer ${DOME_API_KEY}`
  }
  
  try {
    const res = await fetchWithRetry(url.toString(), { headers })
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch (error) {
    return []
  }
}

async function processTrader(trader, index, total) {
  const { wallet, pnl, rank } = trader
  console.log(`\n[${index + 1}/${total}] Processing trader #${rank}: ${wallet.substring(0, 12)}... (PnL: $${pnl.toLocaleString()})`)
  
  try {
    const latestTimestamp = await getLatestTradeTimestamp(wallet)
    const sinceText = latestTimestamp ? new Date(latestTimestamp * 1000).toISOString() : 'beginning'
    console.log(`  📅 Latest trade: ${sinceText}`)
    
    let allTrades = []
    let offset = 0
    let pageCount = 0
    const maxPages = latestTimestamp ? 50 : 20 // Limit pages if no watermark
    
    while (true) {
      if (pageCount >= maxPages) {
        console.log(`  ⚠️  Reached max pages (${maxPages}), stopping`)
        break
      }
      
      await sleep(SLEEP_MS)
      
      try {
        const { orders, hasMore } = await fetchTradesFromDome(wallet, latestTimestamp, offset)
        
        if (orders.length === 0) break
        
        const tradeRows = orders
          .map(order => mapDomeOrderToTradeRow(order, wallet))
          .filter(row => row !== null)
        
        allTrades.push(...tradeRows)
        pageCount++
        
        console.log(`  📄 Page ${pageCount}: ${orders.length} orders, ${tradeRows.length} valid trades`)
        
        if (!hasMore || orders.length < BATCH_SIZE) break
        
        offset += BATCH_SIZE
      } catch (error) {
        if (error.message?.includes('400')) {
          console.log(`  ⚠️  API returned 400, stopping fetch`)
          break
        }
        throw error
      }
    }
    
    if (allTrades.length === 0) {
      console.log(`  ✅ No new trades`)
      return { tradesInserted: 0, marketsBackfilled: 0 }
    }
    
    // Upsert trades
    console.log(`  💾 Upserting ${allTrades.length} trades...`)
    const tradesInserted = await upsertTrades(allTrades)
    console.log(`  ✅ Inserted ${tradesInserted} trades`)
    
    // Collect unique condition_ids
    const conditionIds = Array.from(new Set(
      allTrades
        .map(t => t.condition_id)
        .filter(Boolean)
    ))
    
    if (conditionIds.length === 0) {
      return { tradesInserted, marketsBackfilled: 0 }
    }
    
    // Check which markets we already have
    const { data: existingMarkets } = await supabase
      .from('markets')
      .select('condition_id')
      .in('condition_id', conditionIds)
    
    const existingIds = new Set((existingMarkets || []).map(m => m.condition_id))
    const missingIds = conditionIds.filter(id => !existingIds.has(id))
    
    if (missingIds.length === 0) {
      console.log(`  ✅ All ${conditionIds.length} markets already exist`)
      return { tradesInserted, marketsBackfilled: 0 }
    }
    
    // Backfill missing markets
    console.log(`  🔄 Backfilling ${missingIds.length} missing markets...`)
    let marketsBackfilled = 0
    
    // Fetch in batches
    for (let i = 0; i < missingIds.length; i += 50) {
      const batch = missingIds.slice(i, i + 50)
      await sleep(SLEEP_MS)
      
      const markets = await fetchMarketsByConditionIds(batch)
      
      for (const market of markets) {
        const success = await backfillMarket(market.condition_id)
        if (success) marketsBackfilled++
        await sleep(50) // Small delay between market upserts
      }
    }
    
    console.log(`  ✅ Backfilled ${marketsBackfilled} markets`)
    
    return { tradesInserted, marketsBackfilled }
  } catch (error) {
    console.error(`  ❌ Error processing trader ${wallet}:`, error.message)
    return { tradesInserted: 0, marketsBackfilled: 0 }
  }
}

async function main() {
  console.log('='.repeat(70))
  console.log(`🚀 Backfilling trades for top ${TOP_N} traders (${WINDOW} window)`)
  console.log('='.repeat(70))
  console.log('')
  
  const traders = await getTopTraders(TOP_N, WINDOW)
  
  if (traders.length === 0) {
    console.error('❌ No traders found')
    process.exit(1)
  }
  
  let totalTrades = 0
  let totalMarkets = 0
  
  for (let i = 0; i < traders.length; i++) {
    const result = await processTrader(traders[i], i, traders.length)
    totalTrades += result.tradesInserted
    totalMarkets += result.marketsBackfilled
    
    // Small delay between traders
    if (i < traders.length - 1) {
      await sleep(SLEEP_MS)
    }
  }
  
  console.log('\n' + '='.repeat(70))
  console.log('✨ Backfill complete')
  console.log(`✅ Total trades inserted: ${totalTrades.toLocaleString()}`)
  console.log(`✅ Total markets backfilled: ${totalMarkets.toLocaleString()}`)
  console.log('='.repeat(70))
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  console.error(error.stack)
  process.exit(1)
})
