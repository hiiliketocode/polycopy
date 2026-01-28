#!/usr/bin/env node
'use strict'

/**
 * Backfill outcome_prices for resolved markets that are missing this data.
 * Checks Dome API first, then falls back to CLOB/Gamma API if needed.
 *
 * Usage: node scripts/backfill-resolved-markets-outcome-prices.js
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

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

const BATCH_SIZE = 50 // Dome API limit is 100, but we'll use 50 for safety
const SLEEP_MS = 150
const PRICE_API_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function trim(s) {
  return typeof s === 'string' ? s.trim() : ''
}

function hasOutcomePrices(m) {
  if (!m.outcome_prices) return false
  const op = m.outcome_prices
  // Check if outcome_prices has the expected structure
  const outcomes = op.outcomes || op.labels || op.choices || []
  const prices = op.outcomePrices || op.prices || op.probabilities || []
  return Array.isArray(outcomes) && outcomes.length > 0 && Array.isArray(prices) && prices.length > 0
}

function isResolved(m) {
  // Market is resolved if it has explicit resolution data (winner determined):
  // 1. status = 'resolved', OR
  // 2. winning_side is not null/empty, OR
  // 3. resolved_outcome is not null/empty
  const hasResolutionData = trim(m.winning_side) !== '' || trim(m.resolved_outcome) !== ''
  
  return trim(m.status) === 'resolved' || hasResolutionData
}

function mightBeResolved(m) {
  // Market might be resolved (but we don't have confirmation in DB) if:
  // 1. closed = true (market closed for trading), OR
  // 2. end_time or close_time has passed (market should be resolved by now)
  const now = new Date()
  
  // Check if market is closed
  if (m.closed === true) {
    return true
  }
  
  // Check if end_time or close_time has passed
  if (m.end_time) {
    const endTime = new Date(m.end_time)
    if (!isNaN(endTime.getTime()) && endTime < now) {
      return true
    }
  }
  
  if (m.close_time) {
    const closeTime = new Date(m.close_time)
    if (!isNaN(closeTime.getTime()) && closeTime < now) {
      return true
    }
  }
  
  // Check if completed_time exists (market has been completed)
  if (m.completed_time) {
    return true
  }
  
  return false
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchMarketsByConditionIds(conditionIds) {
  const url = new URL(`${DOME_BASE_URL}/polymarket/markets`)
  conditionIds.forEach((id) => url.searchParams.append('condition_id', id))
  url.searchParams.set('limit', String(Math.min(100, conditionIds.length)))

  const headers = { Accept: 'application/json' }
  if (DOME_API_KEY) {
    headers.Authorization = `Bearer ${DOME_API_KEY}`
  }

  const res = await fetch(url.toString(), { headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Dome request failed (${res.status}): ${body || res.statusText}`)
  }
  const json = await res.json()
  return Array.isArray(json?.markets) ? json.markets : []
}

/**
 * Extract outcome_prices from Dome API response
 * Dome API might have this in different fields - check common patterns
 */
function extractOutcomePricesFromDome(market) {
  if (!market || typeof market !== 'object') return null

  // Check various possible locations in Dome API response
  const possiblePaths = [
    market.outcome_prices,
    market.outcomePrices,
    market.prices,
    market.probabilities,
  ]

  // Check if side_a/side_b have price information
  if (market.side_a && typeof market.side_a === 'object') {
    if (market.side_a.price !== undefined || market.side_a.probability !== undefined) {
      const price = market.side_a.price ?? market.side_a.probability
      possiblePaths.push({
        outcomes: [market.side_a.label || market.side_a.id || 'Yes'],
        outcomePrices: [String(price)],
      })
    }
  }
  
  if (market.side_b && typeof market.side_b === 'object') {
    if (market.side_b.price !== undefined || market.side_b.probability !== undefined) {
      const price = market.side_b.price ?? market.side_b.probability
      possiblePaths.push({
        outcomes: [market.side_b.label || market.side_b.id || 'No'],
        outcomePrices: [String(price)],
      })
    }
  }

  for (const path of possiblePaths) {
    if (!path) continue
    
    // If it's already in the expected format
    if (path.outcomes && path.outcomePrices) {
      const outcomes = Array.isArray(path.outcomes) ? path.outcomes : []
      const prices = Array.isArray(path.outcomePrices) ? path.outcomePrices.map(String) : []
      if (outcomes.length > 0 && prices.length > 0 && outcomes.length === prices.length) {
        return { outcomes, outcomePrices: prices }
      }
    }
    
    // If it's an array of prices
    if (Array.isArray(path) && path.length > 0) {
      // Try to get outcomes from side_a/side_b or other fields
      const outcomes = []
      if (market.side_a?.label) outcomes.push(market.side_a.label)
      else if (market.side_a?.id) outcomes.push(market.side_a.id)
      if (market.side_b?.label) outcomes.push(market.side_b.label)
      else if (market.side_b?.id) outcomes.push(market.side_b.id)
      if (outcomes.length === 0) {
        // Fallback to generic outcomes
        outcomes.push('Yes', 'No')
      }
      
      const prices = path.map(String).slice(0, outcomes.length)
      if (prices.length === outcomes.length) {
        return { outcomes: outcomes.slice(0, prices.length), outcomePrices: prices }
      }
    }
  }

  // If market is resolved and we have winning_side, we can infer prices
  if (market.winning_side && (market.side_a || market.side_b)) {
    const outcomes = []
    const prices = []
    
    if (market.side_a) {
      const label = market.side_a.label || market.side_a.id || 'Yes'
      outcomes.push(label)
      const isWinner = market.winning_side === label || market.winning_side === market.side_a.id
      prices.push(isWinner ? '1.0' : '0.0')
    }
    if (market.side_b) {
      const label = market.side_b.label || market.side_b.id || 'No'
      outcomes.push(label)
      const isWinner = market.winning_side === label || market.winning_side === market.side_b.id
      prices.push(isWinner ? '1.0' : '0.0')
    }
    
    if (outcomes.length > 0 && prices.length > 0) {
      return { outcomes, outcomePrices: prices }
    }
  }

  return null
}

/**
 * Fetch outcome_prices from our price API (which uses CLOB/Gamma)
 */
async function fetchOutcomePricesFromPriceAPI(conditionId) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    
    const res = await fetch(
      `${PRICE_API_BASE_URL}/api/polymarket/price?conditionId=${encodeURIComponent(conditionId)}`,
      { signal: controller.signal, cache: 'no-store' }
    )
    clearTimeout(timeout)
    
    if (!res.ok) return null
    const json = await res.json()
    
    if (json?.success && json.market) {
      const outcomes = Array.isArray(json.market.outcomes) ? json.market.outcomes : []
      const prices = Array.isArray(json.market.outcomePrices) ? json.market.outcomePrices.map(String) : []
      
      if (outcomes.length > 0 && prices.length > 0) {
        return {
          outcomes,
          outcomePrices: prices,
        }
      }
    }
    return null
  } catch (error) {
    console.warn(`  ⚠️  Price API fetch failed for ${conditionId}: ${error.message}`)
    return null
  }
}

async function findResolvedMarketsMissingOutcomePrices() {
  console.log('Finding resolved markets (or potentially resolved) missing outcome_prices...\n')
  
  const markets = []
  let from = 0
  const PAGE = 1000
  
  while (true) {
    const { data, error } = await supabase
      .from('markets')
      .select('condition_id, closed, status, winning_side, resolved_outcome, outcome_prices, raw_dome, side_a, side_b, end_time, close_time, completed_time')
      .order('condition_id')
      .range(from, from + PAGE - 1)
    
    if (error) throw error
    if (!data || !data.length) break
    markets.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  // Find markets that are:
  // 1. Already confirmed as resolved (have resolution data) but missing outcome_prices, OR
  // 2. Might be resolved (closed or past end time) but missing outcome_prices
  const needingPrices = markets.filter((m) => {
    if (hasOutcomePrices(m)) return false // Already has outcome_prices
    
    // If we have explicit resolution data, definitely include it
    if (isResolved(m)) return true
    
    // If market might be resolved (closed or past end time), include it for checking
    if (mightBeResolved(m)) return true
    
    return false
  })

  const confirmedResolved = needingPrices.filter(isResolved).length
  const mightBeResolvedCount = needingPrices.filter((m) => !isResolved(m) && mightBeResolved(m)).length

  console.log(`Found ${needingPrices.length} markets missing outcome_prices:`)
  console.log(`  - ${confirmedResolved} confirmed as resolved`)
  console.log(`  - ${mightBeResolvedCount} might be resolved (will check with Dome API)\n`)
  
  // Return both condition_id and the market data (for checking raw_dome)
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
  const mightBeResolved = marketData.length - confirmedResolved
  
  console.log(`📦 Batch ${batchNumber}: processing ${conditionIds.length} markets (${confirmedResolved} confirmed, ${mightBeResolved} to check)...`)

  try {
    const updates = []
    const needsDomeAPI = []
    const needsPriceAPI = []

    // First, check existing raw_dome data in database
    for (const market of marketData) {
      let outcomePrices = null

      // Try to extract from existing raw_dome data first
      if (market.raw_dome) {
        outcomePrices = extractOutcomePricesFromDome(market.raw_dome)
      }

      // If not in raw_dome, try using side_a/side_b with winning_side
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
        // Need to fetch fresh data - either from Dome API or Price API
        needsDomeAPI.push(market.condition_id)
      }
    }

    // Fetch from Dome API for markets that need it
    if (needsDomeAPI.length > 0) {
      console.log(`  🔄 Fetching ${needsDomeAPI.length} markets from Dome API...`)
      const domeMarkets = await fetchMarketsByConditionIds(needsDomeAPI)
      const domeMap = new Map()
      domeMarkets.forEach((m) => {
        if (m.condition_id) {
          domeMap.set(m.condition_id, m)
        }
      })

      for (const conditionId of needsDomeAPI) {
        const domeMarket = domeMap.get(conditionId)
        let outcomePrices = null

        // Try to extract from Dome API response
        if (domeMarket) {
          outcomePrices = extractOutcomePricesFromDome(domeMarket)
          
          // If Dome API shows the market is resolved (has winning_side) but we don't have prices,
          // we can infer them from winning_side
          if (!outcomePrices && domeMarket.winning_side) {
            const outcomes = []
            const prices = []
            
            if (domeMarket.side_a) {
              const label = domeMarket.side_a.label || domeMarket.side_a.id || 'Yes'
              outcomes.push(label)
              const isWinner = domeMarket.winning_side === label || domeMarket.winning_side === domeMarket.side_a.id
              prices.push(isWinner ? '1.0' : '0.0')
            }
            if (domeMarket.side_b) {
              const label = domeMarket.side_b.label || domeMarket.side_b.id || 'No'
              outcomes.push(label)
              const isWinner = domeMarket.winning_side === label || domeMarket.winning_side === domeMarket.side_b.id
              prices.push(isWinner ? '1.0' : '0.0')
            }
            
            if (outcomes.length > 0 && prices.length > 0) {
              outcomePrices = { outcomes, outcomePrices: prices }
            }
          }
        }

        if (outcomePrices) {
          updates.push({
            condition_id: conditionId,
            outcome_prices: outcomePrices,
            last_price_updated_at: new Date().toISOString(),
          })
        } else {
          // Only try Price API if market is actually resolved (not just might be)
          const marketInfo = marketData.find((m) => m.condition_id === conditionId)
          if (marketInfo?.isConfirmedResolved) {
            needsPriceAPI.push(conditionId)
          }
        }
      }
    }

    // Fetch from Price API for markets that Dome didn't have prices for
    if (needsPriceAPI.length > 0) {
      console.log(`  🔄 Fetching ${needsPriceAPI.length} markets from Price API...`)
      for (const conditionId of needsPriceAPI) {
        const outcomePrices = await fetchOutcomePricesFromPriceAPI(conditionId)
        if (outcomePrices) {
          updates.push({
            condition_id: conditionId,
            outcome_prices: outcomePrices,
            last_price_updated_at: new Date().toISOString(),
          })
        }
        // Small delay to avoid rate limiting
        await sleep(50)
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
  } finally {
    if (SLEEP_MS > 0) {
      await sleep(SLEEP_MS)
    }
  }
}

async function main() {
  console.log('🚀 Backfilling outcome_prices for resolved markets\n')

  const conditionIds = await findResolvedMarketsMissingOutcomePrices()

  if (conditionIds.length === 0) {
    console.log('✅ All resolved markets already have outcome_prices!')
    return
  }

  let totalUpdated = 0
  let totalMissing = 0
  let totalFromRawDome = 0
  let totalFromDome = 0
  let totalFromPriceAPI = 0
  let batchCount = 0

  // Process in batches
  for (let i = 0; i < conditionIds.length; i += BATCH_SIZE) {
    const batch = conditionIds.slice(i, i + BATCH_SIZE)
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
  console.log(`   - From Price API (CLOB/Gamma): ${totalFromPriceAPI}`)
  console.log(`❌ Missing/not found: ${totalMissing}`)
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  if (error.stack) console.error(error.stack)
  process.exit(1)
})
