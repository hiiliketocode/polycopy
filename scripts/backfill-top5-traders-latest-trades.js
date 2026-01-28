#!/usr/bin/env node
'use strict'

/**
 * Backfill latest trades for top 5 traders into the main trades table.
 * 
 * This script:
 * 1. Gets top 5 traders by realized PnL rank
 * 2. For each trader, finds their latest trade timestamp
 * 3. Fetches new trades from Dome API since that timestamp
 * 4. Inserts them into the trades table
 * 
 * Usage:
 *   node scripts/backfill-top5-traders-latest-trades.js
 *   node scripts/backfill-top5-traders-latest-trades.js --top-n 5 --window ALL
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

const TOP_N = parseInt(process.argv.find(arg => arg.startsWith('--top-n='))?.split('=')[1] || '5')
const WINDOW = process.argv.find(arg => arg.startsWith('--window='))?.split('=')[1] || 'ALL'
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
  // trade_uid is a generated column: COALESCE(order_hash, 'tx:' || tx_hash)
  const seen = new Map()
  
  for (const trade of validTrades) {
    // Use order_hash if available, otherwise use tx_hash (matches trade_uid generation)
    const uniqueKey = trade.order_hash || `tx:${trade.tx_hash}`
    const key = `${trade.wallet_address.toLowerCase()}:${uniqueKey}`
    
    // Keep the last occurrence of each unique key
    seen.set(key, trade)
  }
  
  // Convert map values back to array
  const uniqueTrades = Array.from(seen.values())
  
  if (uniqueTrades.length === 0) return 0
  
  // Upsert in batches
  let totalInserted = 0
  for (let i = 0; i < uniqueTrades.length; i += INSERT_BATCH_SIZE) {
    const batch = uniqueTrades.slice(i, i + INSERT_BATCH_SIZE)
    
    const { error, count } = await supabase
      .from('trades')
      .upsert(batch, {
        onConflict: 'wallet_address,trade_uid',
        ignoreDuplicates: false,
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
      console.log(`  ⚠️  Market not found in Dome API: ${conditionId}`)
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
    
    const { error: upsertError } = await supabase
      .from('markets')
      .upsert(marketRow, { onConflict: 'condition_id' })
    
    if (upsertError) {
      console.error(`  ❌ Error upserting market: ${upsertError.message}`)
      return false
    }
    
    return true
  } catch (error) {
    console.error(`  ❌ Error fetching market: ${error.message}`)
    return false
  }
}

async function ensureMarketsExist(conditionIds) {
  if (conditionIds.length === 0) return { checked: 0, backfilled: 0 }
  
  // Filter out null/undefined condition_ids
  const validConditionIds = conditionIds.filter(id => id && typeof id === 'string')
  
  if (validConditionIds.length === 0) return { checked: 0, backfilled: 0 }
  
  // Check which markets exist
  const { data: existingMarkets, error: checkError } = await supabase
    .from('markets')
    .select('condition_id')
    .in('condition_id', validConditionIds)
  
  if (checkError) {
    console.error(`  ⚠️  Error checking existing markets: ${checkError.message}`)
    return { checked: validConditionIds.length, backfilled: 0 }
  }
  
  const existingSet = new Set((existingMarkets || []).map(m => m.condition_id))
  const missing = validConditionIds.filter(id => !existingSet.has(id))
  
  if (missing.length === 0) {
    return { checked: validConditionIds.length, backfilled: 0 }
  }
  
  console.log(`  📦 Backfilling ${missing.length} missing markets...`)
  
  // Backfill in batches with concurrency control
  const MARKET_BATCH_SIZE = 10
  let backfilled = 0
  
  for (let i = 0; i < missing.length; i += MARKET_BATCH_SIZE) {
    const batch = missing.slice(i, i + MARKET_BATCH_SIZE)
    const results = await Promise.all(batch.map(conditionId => backfillMarket(conditionId)))
    backfilled += results.filter(r => r === true).length
    
    // Small delay between batches
    if (i + MARKET_BATCH_SIZE < missing.length) {
      await sleep(SLEEP_MS)
    }
  }
  
  return { checked: validConditionIds.length, backfilled }
}

async function processTrader(trader, index, total) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`👤 Processing trader ${index + 1}/${total}: ${trader.wallet}`)
  console.log('='.repeat(60))
  
  // Get latest trade timestamp
  const latestTimestamp = await getLatestTradeTimestamp(trader.wallet)
  
  if (latestTimestamp) {
    const latestDate = new Date(latestTimestamp * 1000).toISOString()
    console.log(`  📅 Latest trade in DB: ${latestDate}`)
    console.log(`  🔍 Fetching trades since: ${latestDate}`)
  } else {
    console.log(`  📅 No existing trades in DB`)
    console.log(`  🔍 Fetching all recent trades`)
  }
  
  // Fetch trades from Dome API
  let allTrades = []
  let offset = 0
  let pageCount = 0
  let hasMore = true
  const MAX_PAGES_WITHOUT_TIMESTAMP = 20 // Limit pages when fetching all history
  const MAX_PAGES_WITH_TIMESTAMP = 100 // More pages when fetching recent trades
  
  while (hasMore) {
    pageCount++
    
    // If no latest timestamp, limit pages to avoid fetching too much history
    if (!latestTimestamp && pageCount > MAX_PAGES_WITHOUT_TIMESTAMP) {
      console.log(`  ⚠️  Reached max pages limit (${MAX_PAGES_WITHOUT_TIMESTAMP}) for initial fetch`)
      console.log(`  💡 Tip: Run again after initial backfill to fetch more recent trades`)
      break
    }
    
    // Limit pages even with timestamp to avoid infinite loops
    if (latestTimestamp && pageCount > MAX_PAGES_WITH_TIMESTAMP) {
      console.log(`  ⚠️  Reached max pages limit (${MAX_PAGES_WITH_TIMESTAMP})`)
      break
    }
    
    console.log(`  📡 Fetching page ${pageCount} (offset: ${offset})...`)
    
    try {
      const result = await fetchTradesFromDome(trader.wallet, latestTimestamp, offset)
      const { orders, pagination } = result
      
      if (orders.length === 0) {
        console.log(`  ✅ No more trades found`)
        break
      }
      
      // Map to trade rows
      const tradeRows = orders.map(order => mapDomeOrderToTradeRow(order, trader.wallet))
      allTrades.push(...tradeRows)
      
      console.log(`  ✅ Fetched ${orders.length} trades (total: ${allTrades.length})`)
      
      hasMore = pagination.has_more === true
      offset += orders.length
      
      if (hasMore) {
        await sleep(SLEEP_MS)
      }
    } catch (error) {
      // If we get a 400 error, it might mean we've hit API limits or invalid offset
      if (error.message && error.message.includes('400')) {
        console.log(`  ⚠️  API returned 400 (likely reached limit or invalid offset)`)
        console.log(`  ✅ Stopping fetch. Processed ${allTrades.length} trades so far.`)
        break
      }
      console.error(`  ❌ Error fetching trades:`, error.message)
      // If we have some trades, continue with what we have
      if (allTrades.length > 0) {
        console.log(`  ⚠️  Continuing with ${allTrades.length} trades already fetched`)
        break
      }
      throw error
    }
  }
  
  if (allTrades.length === 0) {
    console.log(`  ⏭️  No new trades to insert`)
    return { fetched: 0, inserted: 0, marketsChecked: 0, marketsBackfilled: 0 }
  }
  
  // Extract unique condition_ids from trades
  const conditionIds = [...new Set(allTrades.map(t => t.condition_id).filter(Boolean))]
  console.log(`  🔍 Found ${conditionIds.length} unique markets in trades`)
  
  // Ensure markets exist
  const marketResult = await ensureMarketsExist(conditionIds)
  if (marketResult.backfilled > 0) {
    console.log(`  ✅ Backfilled ${marketResult.backfilled} new markets`)
  } else {
    console.log(`  ✅ All ${marketResult.checked} markets already exist`)
  }
  
  // Upsert trades
  console.log(`  💾 Inserting ${allTrades.length} trades...`)
  const inserted = await upsertTrades(allTrades)
  
  console.log(`  ✅ Inserted ${inserted} new trades`)
  
  return { 
    fetched: allTrades.length, 
    inserted,
    marketsChecked: marketResult.checked,
    marketsBackfilled: marketResult.backfilled
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('🔄 Backfilling latest trades for top traders')
  console.log('='.repeat(60))
  console.log(`👥 Top N: ${TOP_N}`)
  console.log(`📅 Window: ${WINDOW}`)
  console.log('')
  
  try {
    // Get top traders
    const traders = await getTopTraders(TOP_N, WINDOW)
    
    if (traders.length === 0) {
      console.log('❌ No traders found')
      return
    }
    
    console.log('\n📋 Top traders:')
    traders.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.wallet} - Rank: ${t.rank}, PnL: $${t.pnl.toFixed(2)}`)
    })
    
    // Process each trader
    let totalFetched = 0
    let totalInserted = 0
    let totalMarketsChecked = 0
    let totalMarketsBackfilled = 0
    
    for (let i = 0; i < traders.length; i++) {
      const trader = traders[i]
      const result = await processTrader(trader, i, traders.length)
      totalFetched += result.fetched
      totalInserted += result.inserted
      totalMarketsChecked += result.marketsChecked || 0
      totalMarketsBackfilled += result.marketsBackfilled || 0
      
      // Small delay between traders
      if (i < traders.length - 1) {
        await sleep(SLEEP_MS)
      }
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('🎉 Backfill complete!')
    console.log('='.repeat(60))
    console.log(`✅ Total trades fetched: ${totalFetched.toLocaleString()}`)
    console.log(`✅ Total trades inserted: ${totalInserted.toLocaleString()}`)
    console.log(`✅ Total markets checked: ${totalMarketsChecked.toLocaleString()}`)
    console.log(`✅ Total markets backfilled: ${totalMarketsBackfilled.toLocaleString()}`)
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
