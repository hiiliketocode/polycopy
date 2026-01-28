#!/usr/bin/env node
'use strict'

/**
 * Backfill trade timing columns for top traders by realized ROI.
 * 
 * This script:
 * 1. Gets top 20 traders from wallet_realized_pnl_rankings (by ROI)
 * 2. For each trader's trades:
 *    - Checks if market exists, if not backfills it from Dome API
 *    - Calculates and updates timing columns in batches
 * 
 * Usage: 
 *   node scripts/backfill-trade-timing-top-traders.js
 *   node scripts/backfill-trade-timing-top-traders.js --top-n 10
 *   node scripts/backfill-trade-timing-top-traders.js --window ALL
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOME_API_KEY = process.env.DOME_API_KEY || null
const DOME_BASE_URL = process.env.DOME_BASE_URL || 'https://api.domeapi.io/v1'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Configuration
const TOP_N = parseInt(process.argv.find(arg => arg.startsWith('--top-n='))?.split('=')[1] || '20')
const WINDOW = process.argv.find(arg => arg.startsWith('--window='))?.split('=')[1] || 'ALL'
const TRADE_BATCH_SIZE = 1000
const MARKET_BATCH_SIZE = 50
const SLEEP_MS = 150

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
  const timeout = setTimeout(() => controller.abort(), 30000)
  
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(1500 * Math.pow(2, attempt - 1))
        return fetchWithRetry(url, options, attempt + 1)
      }
      throw new Error(`Request failed (${res.status}): ${res.statusText}`)
    }
    return res
  } catch (error) {
    if (error.name === 'AbortError' && attempt < 3) {
      await sleep(1500 * Math.pow(2, attempt - 1))
      return fetchWithRetry(url, options, attempt + 1)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function getTopTradersByROI(limit, window) {
  console.log(`📊 Fetching top ${limit} traders by realized ROI (window: ${window})...`)
  
  // Get rankings for the window
  const { data: rankings, error: rankingsError } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address, pnl_sum, rank')
    .eq('window_key', window)
    .order('rank', { ascending: true })
    .limit(limit * 2) // Get more to calculate ROI
  
  if (rankingsError) throw rankingsError
  
  // Get volume data to calculate ROI
  const wallets = (rankings || []).map(r => r.wallet_address?.toLowerCase()).filter(Boolean)
  if (wallets.length === 0) return []
  
  // Get volume from wallet_realized_pnl_daily
  const { data: dailyData, error: dailyError } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('wallet_address, volume')
    .in('wallet_address', wallets)
  
  if (dailyError) throw dailyError
  
  // Calculate total volume per wallet
  const volumeMap = new Map()
  ;(dailyData || []).forEach(row => {
    const wallet = row.wallet_address?.toLowerCase()
    if (!wallet) return
    const vol = toNumber(row.volume) || 0
    volumeMap.set(wallet, (volumeMap.get(wallet) || 0) + vol)
  })
  
  // Calculate ROI and sort
  const tradersWithROI = (rankings || [])
    .map(r => {
      const wallet = r.wallet_address?.toLowerCase()
      const pnl = toNumber(r.pnl_sum) || 0
      const volume = volumeMap.get(wallet) || 0
      const roi = volume > 0 ? (pnl / volume) * 100 : 0
      return { wallet, pnl, volume, roi, rank: r.rank }
    })
    .filter(t => t.volume > 0) // Only traders with volume
    .sort((a, b) => b.roi - a.roi)
    .slice(0, limit)
  
  console.log(`✅ Found ${tradersWithROI.length} traders`)
  return tradersWithROI
}

async function backfillMarket(conditionId) {
  console.log(`  🔄 Backfilling market: ${conditionId}`)
  
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
    
    console.log(`  ✅ Market backfilled: ${conditionId}`)
    await sleep(SLEEP_MS)
    return true
  } catch (error) {
    console.error(`  ❌ Error fetching market: ${error.message}`)
    return false
  }
}

async function ensureMarketsExist(conditionIds) {
  if (conditionIds.length === 0) return
  
  // Check which markets exist
  const { data: existingMarkets, error: checkError } = await supabase
    .from('markets')
    .select('condition_id')
    .in('condition_id', conditionIds)
  
  if (checkError) throw checkError
  
  const existingSet = new Set((existingMarkets || []).map(m => m.condition_id))
  const missing = conditionIds.filter(id => !existingSet.has(id))
  
  if (missing.length === 0) {
    console.log(`  ✅ All ${conditionIds.length} markets exist`)
    return
  }
  
  console.log(`  📦 Backfilling ${missing.length} missing markets...`)
  
  // Backfill in batches
  for (let i = 0; i < missing.length; i += MARKET_BATCH_SIZE) {
    const batch = missing.slice(i, i + MARKET_BATCH_SIZE)
    await Promise.all(batch.map(conditionId => backfillMarket(conditionId)))
  }
}

async function updateTradeTimingBatch(tradeIds) {
  if (tradeIds.length === 0) return 0
  
  // Use the cache function to populate cache for these trades
  const { data: rpcData, error: rpcError } = await supabase.rpc('cache_trade_timing', {
    p_trade_ids: tradeIds
  })
  
  if (!rpcError && rpcData !== null && rpcData !== undefined) {
    return typeof rpcData === 'number' ? rpcData : (rpcData || 0)
  }
  
  // Fallback: individual cache updates
  if (rpcError && (rpcError.message.includes('function') || rpcError.message.includes('does not exist'))) {
    console.log('   ⚠️  Cache function not available, using fallback...')
    return await updateTradeTimingBatchFallback(tradeIds)
  }
  
  if (rpcError) throw rpcError
  return 0
}

async function updateTradeTimingBatchFallback(tradeIds) {
  let updated = 0
  
  for (const tradeId of tradeIds) {
    const { data: trade, error: tradeError } = await supabase
      .from('trades')
      .select('timestamp, condition_id')
      .eq('id', tradeId)
      .single()
    
    if (tradeError || !trade) continue
    
    const { data: timing, error: timingError } = await supabase.rpc('calculate_trade_timing', {
      p_trade_timestamp: trade.timestamp,
      p_condition_id: trade.condition_id
    })
    
    if (timingError || !timing || timing.length === 0) continue
    
    const timingData = timing[0]
    
    // Insert or update in trade_timing_cache table
    const { error: upsertError } = await supabase
      .from('trade_timing_cache')
      .upsert({
        trade_id: tradeId,
        seconds_before_game_start: timingData.seconds_before_game_start,
        seconds_before_market_end: timingData.seconds_before_market_end,
        trade_timing_category: timingData.trade_timing_category,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'trade_id'
      })
    
    if (!upsertError) updated++
  }
  
  return updated
}

async function processTrader(wallet, index, total) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`👤 Processing trader ${index + 1}/${total}: ${wallet}`)
  console.log('='.repeat(60))
  
  // Get all trades for this trader
  const trades = []
  let offset = 0
  const PAGE_SIZE = 1000
  
  while (true) {
    const { data, error } = await supabase
      .from('trades')
      .select('id, condition_id, timestamp')
      .eq('wallet_address', wallet)
      .not('condition_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    
    if (error) throw error
    if (!data || data.length === 0) break
    
    trades.push(...data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  
  console.log(`  📊 Found ${trades.length} trades`)
  
  if (trades.length === 0) {
    console.log(`  ⏭️  No trades to process`)
    return { processed: 0, updated: 0 }
  }
  
  // Get unique condition_ids and ensure markets exist
  const conditionIds = Array.from(new Set(trades.map(t => t.condition_id).filter(Boolean)))
  await ensureMarketsExist(conditionIds)
  
  // Update trades in batches
  let totalUpdated = 0
  const tradeIds = trades.map(t => t.id)
  
  for (let i = 0; i < tradeIds.length; i += TRADE_BATCH_SIZE) {
    const batch = tradeIds.slice(i, i + TRADE_BATCH_SIZE)
    console.log(`  📦 Processing batch ${Math.floor(i / TRADE_BATCH_SIZE) + 1}/${Math.ceil(tradeIds.length / TRADE_BATCH_SIZE)} (${batch.length} trades)...`)
    
    try {
      const updated = await updateTradeTimingBatch(batch)
      totalUpdated += updated
      console.log(`     ✅ Updated ${updated} trades`)
    } catch (error) {
      console.error(`     ❌ Error: ${error.message}`)
    }
  }
  
  console.log(`  ✅ Completed: ${totalUpdated}/${trades.length} trades updated`)
  return { processed: trades.length, updated: totalUpdated }
}

async function main() {
  console.log('='.repeat(60))
  console.log('🚀 Starting trade timing backfill for top traders')
  console.log('='.repeat(60))
  console.log(`📊 Top N: ${TOP_N}`)
  console.log(`📅 Window: ${WINDOW}`)
  console.log('')
  
  try {
    // Get top traders
    const traders = await getTopTradersByROI(TOP_N, WINDOW)
    
    if (traders.length === 0) {
      console.log('❌ No traders found')
      return
    }
    
    console.log('\n📋 Top traders:')
    traders.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.wallet} - ROI: ${t.roi.toFixed(2)}%, PnL: $${t.pnl.toFixed(2)}, Volume: $${t.volume.toFixed(2)}`)
    })
    console.log('')
    
    // Process each trader
    let totalProcessed = 0
    let totalUpdated = 0
    
    for (let i = 0; i < traders.length; i++) {
      const trader = traders[i]
      const result = await processTrader(trader.wallet, i, traders.length)
      totalProcessed += result.processed
      totalUpdated += result.updated
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('🎉 Backfill complete!')
    console.log('='.repeat(60))
    console.log(`✅ Total trades processed: ${totalProcessed.toLocaleString()}`)
    console.log(`✅ Total trades updated: ${totalUpdated.toLocaleString()}`)
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
