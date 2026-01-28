#!/usr/bin/env node
'use strict'

/**
 * Backfill outcome_prices for markets used by top 50 traders.
 * 
 * This script:
 * 1. Gets all unique condition_ids from top50_traders_trades
 * 2. Finds markets that are resolved but missing outcome_prices
 * 3. Backfills outcome_prices from raw_dome, Dome API, or Price API
 * 
 * Usage:
 *   node scripts/backfill-top50-markets-outcome-prices.js
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOME_API_KEY = process.env.DOME_API_KEY
const DOME_BASE_URL = process.env.DOME_BASE_URL || 'https://api.domeapi.io/v1'
const PRICE_API_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const BATCH_SIZE = 50
const SLEEP_MS = 200

function hasOutcomePrices(market) {
  if (!market.outcome_prices) return false
  if (typeof market.outcome_prices !== 'object') return false
  const op = market.outcome_prices
  return (
    Array.isArray(op.outcomes) &&
    Array.isArray(op.outcomePrices) &&
    op.outcomes.length > 0 &&
    op.outcomePrices.length > 0
  )
}

function isResolved(market) {
  return (
    market.closed === true ||
    market.status === 'Resolved' ||
    market.winning_side !== null ||
    market.resolved_outcome !== null
  )
}

function mightBeResolved(market) {
  if (isResolved(market)) return true
  if (!market.end_time && !market.close_time) return false
  const endTime = market.close_time || market.end_time
  if (!endTime) return false
  const end = new Date(endTime)
  const now = new Date()
  return end < now
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
        await sleep(2000 * Math.pow(2, attempt - 1))
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

function extractOutcomePricesFromDome(rawDome) {
  if (!rawDome || typeof rawDome !== 'object') return null
  
  // Try various paths in raw_dome
  if (rawDome.outcome_prices && Array.isArray(rawDome.outcome_prices)) {
    const outcomes = []
    const prices = []
    
    for (const op of rawDome.outcome_prices) {
      if (op.outcome && op.price !== undefined) {
        outcomes.push(String(op.outcome))
        prices.push(String(op.price))
      }
    }
    
    if (outcomes.length > 0 && prices.length > 0) {
      return { outcomes, outcomePrices: prices }
    }
  }
  
  // Try outcomes array with prices
  if (rawDome.outcomes && Array.isArray(rawDome.outcomes)) {
    const outcomes = []
    const prices = []
    
    for (const outcome of rawDome.outcomes) {
      if (outcome.outcome && outcome.price !== undefined) {
        outcomes.push(String(outcome.outcome))
        prices.push(String(outcome.price))
      }
    }
    
    if (outcomes.length > 0 && prices.length > 0) {
      return { outcomes, outcomePrices: prices }
    }
  }
  
  return null
}

async function fetchOutcomePricesFromPriceAPI(conditionId) {
  try {
    const url = `${PRICE_API_BASE_URL}/api/polymarket/price?conditionId=${conditionId}`
    const res = await fetchWithRetry(url, {})
    if (!res.ok) return null
    
    const json = await res.json()
    if (!json?.success || !json.market) return null
    
    const outcomes = Array.isArray(json.market.outcomes) ? json.market.outcomes : []
    const prices = Array.isArray(json.market.outcomePrices) ? json.market.outcomePrices.map(String) : []
    
    if (outcomes.length > 0 && prices.length > 0) {
      return { outcomes, outcomePrices: prices }
    }
    return null
  } catch (e) {
    return null
  }
}

async function findMarketsNeedingOutcomePrices() {
  console.log('Finding markets used by top 50 traders that need outcome_prices...\n')
  
  // Get all unique condition_ids from top50_traders_trades
  const { data: trades, error: tradesError } = await supabase
    .from('top50_traders_trades')
    .select('condition_id')
  
  if (tradesError) throw tradesError
  
  const conditionIds = Array.from(new Set(
    (trades || [])
      .map(t => t.condition_id)
      .filter(Boolean)
  ))
  
  console.log(`Found ${conditionIds.length} unique markets from top 50 traders\n`)
  
  // Fetch market data
  const markets = []
  for (let i = 0; i < conditionIds.length; i += 500) {
    const chunk = conditionIds.slice(i, i + 500)
    const { data, error } = await supabase
      .from('markets')
      .select('condition_id, closed, status, winning_side, resolved_outcome, outcome_prices, raw_dome, side_a, side_b, end_time, close_time, completed_time')
      .in('condition_id', chunk)
    
    if (error) throw error
    if (data) markets.push(...data)
  }
  
  // Find markets that need outcome_prices
  const needingPrices = markets.filter((m) => {
    if (hasOutcomePrices(m)) return false
    
    if (isResolved(m)) return true
    if (mightBeResolved(m)) return true
    
    return false
  })
  
  const confirmedResolved = needingPrices.filter(isResolved).length
  const mightBeResolvedCount = needingPrices.filter((m) => !isResolved(m) && mightBeResolved(m)).length
  
  console.log(`Found ${needingPrices.length} markets missing outcome_prices:`)
  console.log(`  - ${confirmedResolved} confirmed as resolved`)
  console.log(`  - ${mightBeResolvedCount} might be resolved (will check)\n`)
  
  return needingPrices.map((m) => ({
    condition_id: m.condition_id,
    raw_dome: m.raw_dome,
    side_a: m.side_a,
    side_b: m.side_b,
    winning_side: m.winning_side,
    isConfirmedResolved: isResolved(m),
  })).filter((m) => m.condition_id)
}

async function processBatch(batchNumber, marketData) {
  const conditionIds = marketData.map((m) => m.condition_id)
  const confirmedResolved = marketData.filter((m) => m.isConfirmedResolved).length
  
  console.log(`📦 Batch ${batchNumber}: processing ${conditionIds.length} markets (${confirmedResolved} confirmed)...`)
  
  try {
    const updates = []
    const needsDomeAPI = []
    const needsPriceAPI = []
    
    // First, check existing raw_dome data
    for (const market of marketData) {
      let outcomePrices = null
      
      if (market.raw_dome) {
        outcomePrices = extractOutcomePricesFromDome(market.raw_dome)
      }
      
      // Try using side_a/side_b with winning_side
      if (!outcomePrices && (market.side_a || market.side_b) && market.winning_side) {
        const outcomes = []
        const prices = []
        
        if (market.side_a) {
          const label = market.side_a.label || market.side_a.id || 'Yes'
          outcomes.push(label)
          prices.push(market.winning_side === label || market.winning_side === market.side_a.id ? '1.0' : '0.0')
        }
        if (market.side_b) {
          const label = market.side_b.label || market.side_b.id || 'No'
          outcomes.push(label)
          prices.push(market.winning_side === label || market.winning_side === market.side_b.id ? '1.0' : '0.0')
        }
        
        if (outcomes.length > 0 && prices.length > 0) {
          outcomePrices = { outcomes, outcomePrices: prices }
        }
      }
      
      if (outcomePrices) {
        updates.push({
          condition_id: market.condition_id,
          outcome_prices: outcomePrices,
          last_price_updated_at: new Date().toISOString(),
        })
      } else {
        needsDomeAPI.push(market.condition_id)
      }
    }
    
    // Fetch from Dome API
    if (needsDomeAPI.length > 0) {
      console.log(`  🔄 Fetching ${needsDomeAPI.length} markets from Dome API...`)
      for (const conditionId of needsDomeAPI) {
        await sleep(SLEEP_MS)
        
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
          const market = Array.isArray(data) && data.length > 0 ? data[0] : null
          
          if (market) {
            const outcomePrices = extractOutcomePricesFromDome(market)
            if (outcomePrices) {
              updates.push({
                condition_id: conditionId,
                outcome_prices: outcomePrices,
                last_price_updated_at: new Date().toISOString(),
              })
            } else {
              const marketInfo = marketData.find((m) => m.condition_id === conditionId)
              if (marketInfo?.isConfirmedResolved) {
                needsPriceAPI.push(conditionId)
              }
            }
          }
        } catch (e) {
          // Continue with next market
        }
      }
    }
    
    // Fetch from Price API for confirmed resolved markets
    if (needsPriceAPI.length > 0) {
      console.log(`  🔄 Fetching ${needsPriceAPI.length} markets from Price API...`)
      for (const conditionId of needsPriceAPI) {
        await sleep(100)
        const outcomePrices = await fetchOutcomePricesFromPriceAPI(conditionId)
        if (outcomePrices) {
          updates.push({
            condition_id: conditionId,
            outcome_prices: outcomePrices,
            last_price_updated_at: new Date().toISOString(),
          })
        }
      }
    }
    
    // Update database
    if (updates.length > 0) {
      const { error } = await supabase
        .from('markets')
        .upsert(updates, { onConflict: 'condition_id' })
      
      if (error) throw error
    }
    
    const fromRawDome = updates.length - needsDomeAPI.length - needsPriceAPI.length
    const fromDomeAPI = updates.length - fromRawDome - needsPriceAPI.length
    const fromPriceAPI = needsPriceAPI.length
    const missing = conditionIds.length - updates.length
    
    console.log(
      `✅ Batch ${batchNumber} done. updated=${updates.length} ` +
      `(raw_dome=${fromRawDome}, DomeAPI=${fromDomeAPI}, PriceAPI=${fromPriceAPI}) missing=${missing}`
    )
    
    return { updated: updates.length, missing, fromRawDome, fromDome: fromDomeAPI, fromPriceAPI }
  } catch (error) {
    console.error(`❌ Batch ${batchNumber} failed: ${error.message}`)
    return { updated: 0, missing: conditionIds.length, fromRawDome: 0, fromDome: 0, fromPriceAPI: 0 }
  }
}

async function main() {
  console.log('🚀 Backfilling outcome_prices for top 50 traders markets\n')
  
  const markets = await findMarketsNeedingOutcomePrices()
  
  if (markets.length === 0) {
    console.log('✅ All markets already have outcome_prices!')
    return
  }
  
  let totalUpdated = 0
  let totalMissing = 0
  let totalFromRawDome = 0
  let totalFromDome = 0
  let totalFromPriceAPI = 0
  let batchCount = 0
  
  // Process in batches
  for (let i = 0; i < markets.length; i += BATCH_SIZE) {
    const batch = markets.slice(i, i + BATCH_SIZE)
    batchCount += 1
    
    const result = await processBatch(batchCount, batch)
    totalUpdated += result.updated
    totalMissing += result.missing
    totalFromRawDome += result.fromRawDome || 0
    totalFromDome += result.fromDome || 0
    totalFromPriceAPI += result.fromPriceAPI || 0
    
    console.log(
      `📊 Progress: updated=${totalUpdated} missing=${totalMissing} ` +
      `(raw_dome=${totalFromRawDome}, DomeAPI=${totalFromDome}, PriceAPI=${totalFromPriceAPI})`
    )
  }
  
  console.log('\n✨ Backfill complete')
  console.log(`✅ Updated ${totalUpdated} markets with outcome_prices`)
  console.log(`   - From existing raw_dome: ${totalFromRawDome}`)
  console.log(`   - From Dome API: ${totalFromDome}`)
  console.log(`   - From Price API: ${totalFromPriceAPI}`)
  console.log(`❌ Missing/not found: ${totalMissing}`)
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  console.error(error.stack)
  process.exit(1)
})
