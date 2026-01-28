#!/usr/bin/env node
'use strict'

/**
 * Fetch missing markets from Dome API for top5_traders_trades
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOME_API_KEY = process.env.DOME_API_KEY || process.env.NEXT_PUBLIC_DOME_API_KEY
const DOME_BASE_URL = process.env.DOME_BASE_URL || 'https://api.domeapi.io/v1'

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const SLEEP_MS = 100 // Small delay between API calls

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toNumber(value) {
  if (value === null || value === undefined) return null
  const num = Number(value)
  return isNaN(num) ? null : num
}

function toIsoFromUnix(timestamp) {
  if (!timestamp) return null
  const num = toNumber(timestamp)
  if (!num) return null
  return new Date(num * 1000).toISOString()
}

async function fetchMarketFromDome(conditionId) {
  const url = new URL(`${DOME_BASE_URL}/polymarket/markets`)
  url.searchParams.set('condition_id', conditionId)
  url.searchParams.set('limit', '1')
  
  const headers = { Accept: 'application/json' }
  if (DOME_API_KEY) {
    headers.Authorization = `Bearer ${DOME_API_KEY}`
  }
  
  try {
    const res = await fetch(url.toString(), { headers })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }
    
    const data = await res.json()
    
    // Handle both array response and { markets: [...] } response
    let markets = []
    if (Array.isArray(data)) {
      markets = data
    } else if (data?.markets && Array.isArray(data.markets)) {
      markets = data.markets
    }
    
    if (markets.length === 0) {
      return null // Market not found
    }
    
    return markets[0]
  } catch (error) {
    console.error(`  ❌ Error fetching market ${conditionId}:`, error.message)
    return null
  }
}

function mapDomeMarketToRow(market) {
  const startIso = toIsoFromUnix(market?.start_time)
  const endIso = toIsoFromUnix(market?.end_time)
  const completedIso = toIsoFromUnix(market?.completed_time)
  const closeIso = toIsoFromUnix(market?.close_time)
  const gameStartIso = market?.game_start_time ? toIsoFromUnix(market.game_start_time) : null
  
  return {
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
}

async function main() {
  console.log('🚀 Fetching Missing Markets from Dome API')
  console.log('='.repeat(60))
  
  // Step 1: Get all condition_ids from top5_traders_trades
  console.log('\n📊 Step 1: Finding missing markets...')
  
  let allTrades = []
  let offset = 0
  const batchSize = 1000
  
  while (true) {
    const { data: trades, error: tradesError } = await supabase
      .from('top5_traders_trades')
      .select('condition_id')
      .not('condition_id', 'is', null)
      .range(offset, offset + batchSize - 1)
    
    if (tradesError) {
      throw new Error(`Failed to get trades: ${tradesError.message}`)
    }
    
    if (!trades || trades.length === 0) break
    
    allTrades = allTrades.concat(trades)
    offset += batchSize
    
    if (trades.length < batchSize) break
  }
  
  const allConditionIds = [...new Set(allTrades.map(t => t.condition_id).filter(Boolean))]
  console.log(`✅ Found ${allConditionIds.length} unique condition_ids from top5_traders_trades`)
  
  // Step 2: Check which exist in markets table
  let foundConditionIds = new Set()
  const checkBatchSize = 200
  for (let i = 0; i < allConditionIds.length; i += checkBatchSize) {
    const batch = allConditionIds.slice(i, i + checkBatchSize)
    const { data: markets } = await supabase
      .from('markets')
      .select('condition_id')
      .in('condition_id', batch)
    
    if (markets) {
      markets.forEach(m => foundConditionIds.add(m.condition_id))
    }
  }
  
  const missingConditionIds = allConditionIds.filter(id => !foundConditionIds.has(id))
  
  console.log(`✅ Found ${foundConditionIds.size} markets already in database`)
  console.log(`⚠️  Missing ${missingConditionIds.length} markets`)
  
  if (missingConditionIds.length === 0) {
    console.log('\n✨ All markets already exist! Nothing to fetch.')
    return
  }
  
  // Step 3: Fetch missing markets from Dome API (batch fetch for efficiency)
  console.log(`\n📥 Step 2: Fetching ${missingConditionIds.length} missing markets from Dome API...`)
  console.log(`📦 Using batch fetching (up to 50 markets per API call)`)
  
  let fetched = 0
  let notFound = 0
  let errors = 0
  const FETCH_BATCH_SIZE = 50 // Dome API can handle multiple condition_ids
  
  for (let i = 0; i < missingConditionIds.length; i += FETCH_BATCH_SIZE) {
    const batch = missingConditionIds.slice(i, i + FETCH_BATCH_SIZE)
    const batchNum = Math.floor(i / FETCH_BATCH_SIZE) + 1
    const totalBatches = Math.ceil(missingConditionIds.length / FETCH_BATCH_SIZE)
    const progress = `[Batch ${batchNum}/${totalBatches}]`
    
    console.log(`\n${progress} Fetching ${batch.length} markets...`)
    
    // Fetch batch from Dome API
    const url = new URL(`${DOME_BASE_URL}/polymarket/markets`)
    batch.forEach(id => url.searchParams.append('condition_id', id))
    url.searchParams.set('limit', String(batch.length))
    
    const headers = { Accept: 'application/json' }
    if (DOME_API_KEY) {
      headers.Authorization = `Bearer ${DOME_API_KEY}`
    }
    
    let markets = []
    try {
      const res = await fetch(url.toString(), { headers })
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      
      const data = await res.json()
      
      // Handle both array response and { markets: [...] } response
      if (Array.isArray(data)) {
        markets = data
      } else if (data?.markets && Array.isArray(data.markets)) {
        markets = data.markets
      }
    } catch (error) {
      console.error(`  ❌ Error fetching batch: ${error.message}`)
      errors += batch.length
      await sleep(SLEEP_MS * 2) // Longer delay on error
      continue
    }
    
    // Process each market in the batch
    const marketMap = new Map()
    markets.forEach(m => {
      if (m?.condition_id) {
        marketMap.set(m.condition_id, m)
      }
    })
    
    const marketRows = []
    for (const conditionId of batch) {
      const market = marketMap.get(conditionId)
      
      if (!market) {
        notFound++
        continue
      }
      
      const marketRow = mapDomeMarketToRow(market)
      
      if (!marketRow.condition_id) {
        errors++
        continue
      }
      
      marketRows.push(marketRow)
    }
    
    // Batch upsert to database
    if (marketRows.length > 0) {
      const { error: upsertError } = await supabase
        .from('markets')
        .upsert(marketRows, { onConflict: 'condition_id' })
      
      if (upsertError) {
        console.error(`  ❌ Error upserting batch: ${upsertError.message}`)
        errors += marketRows.length
      } else {
        console.log(`  ✅ Fetched and saved ${marketRows.length} markets`)
        fetched += marketRows.length
      }
    }
    
    if (notFound > 0 && (i + FETCH_BATCH_SIZE) % 500 === 0) {
      console.log(`  ⚠️  ${notFound} markets not found so far`)
    }
    
    await sleep(SLEEP_MS)
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('✨ Fetch Complete')
  console.log('='.repeat(60))
  console.log(`✅ Successfully fetched: ${fetched} markets`)
  console.log(`⚠️  Not found in Dome API: ${notFound} markets`)
  console.log(`❌ Errors: ${errors} markets`)
  console.log('='.repeat(60))
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  console.error(error.stack)
  process.exit(1)
})
