#!/usr/bin/env node
'use strict'

/**
 * Comprehensive backfill of outcome_prices for all markets that should have them
 * - Markets with winning_side but missing outcome_prices
 * - Markets with resolved_outcome but missing outcome_prices
 * - Markets that are closed/resolved but missing outcome_prices
 * 
 * Usage: node scripts/backfill-all-missing-outcome-prices.js
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOME_API_KEY = process.env.DOME_API_KEY || null
const DOME_BASE_URL = process.env.DOME_BASE_URL || 'https://api.domeapi.io/v1'

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const BATCH_SIZE = 50
const SLEEP_MS = 150
const PRICE_API_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function trim(s) {
  return typeof s === 'string' ? s.trim() : ''
}

function hasOutcomePrices(m) {
  if (!m.outcome_prices) return false
  const op = m.outcome_prices
  const outcomes = op.outcomes || op.labels || op.choices || []
  const prices = op.outcomePrices || op.prices || op.probabilities || []
  return Array.isArray(outcomes) && outcomes.length > 0 && Array.isArray(prices) && prices.length > 0
}

function shouldHaveOutcomePrices(m) {
  // Market should have outcome prices if:
  // 1. Has winning_side (resolution data)
  // 2. Has resolved_outcome
  // 3. Status is 'resolved'
  // 4. Market is closed and has resolution indicators
  const hasWinningSide = m.winning_side && (
    (typeof m.winning_side === 'string' && trim(m.winning_side) !== '') ||
    (typeof m.winning_side === 'object' && m.winning_side !== null)
  )
  const hasResolvedOutcome = m.resolved_outcome && trim(m.resolved_outcome) !== ''
  const isResolvedStatus = m.status === 'resolved'
  const isClosed = m.closed === true
  
  return hasWinningSide || hasResolvedOutcome || isResolvedStatus || (isClosed && (hasWinningSide || hasResolvedOutcome))
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

  try {
    const res = await fetch(url.toString(), { headers })
    if (!res.ok) {
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') || 60)
        await sleep(retryAfter * 1000)
        return fetchMarketsByConditionIds(conditionIds)
      }
      throw new Error(`Dome API error: ${res.status}`)
    }
    return await res.json()
  } catch (error) {
    console.error(`Error fetching from Dome API: ${error.message}`)
    return []
  }
}

function extractOutcomePricesFromDome(market) {
  if (!market) return null

  // Try direct outcome_prices field
  if (market.outcome_prices || market.outcomePrices) {
    const op = market.outcome_prices || market.outcomePrices
    const outcomes = op.outcomes || op.labels || op.choices || []
    const prices = op.outcomePrices || op.prices || op.probabilities || []
    if (Array.isArray(outcomes) && outcomes.length > 0 && Array.isArray(prices) && prices.length > 0) {
      return { outcomes, outcomePrices: prices.map(String) }
    }
  }

  // Try from paths array
  if (market.paths && Array.isArray(market.paths)) {
    for (const path of market.paths) {
      if (path.outcomes && path.outcomePrices) {
        const outcomes = Array.isArray(path.outcomes) ? path.outcomes.map(String) : []
        const prices = Array.isArray(path.outcomePrices) ? path.outcomePrices.map(String) : []
        if (outcomes.length > 0 && prices.length > 0 && outcomes.length === prices.length) {
          return { outcomes, outcomePrices: prices }
        }
      }
    }
  }

  // Try to construct from winning_side and side_a/side_b
  if (market.winning_side && (market.side_a || market.side_b)) {
    const outcomes = []
    const prices = []
    
    const winningSideId = typeof market.winning_side === 'object' 
      ? (market.winning_side.id || market.winning_side.label)
      : market.winning_side
    
    if (market.side_a) {
      const label = market.side_a.label || market.side_a.id || 'Yes'
      outcomes.push(label)
      const isWinner = (market.side_a.id === winningSideId || market.side_a.label === winningSideId || label === winningSideId)
      prices.push(isWinner ? '1.0' : '0.0')
    }
    if (market.side_b) {
      const label = market.side_b.label || market.side_b.id || 'No'
      outcomes.push(label)
      const isWinner = (market.side_b.id === winningSideId || market.side_b.label === winningSideId || label === winningSideId)
      prices.push(isWinner ? '1.0' : '0.0')
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
    const res = await fetch(url, { timeout: 10000 })
    if (!res.ok) return null
    
    const json = await res.json()
    if (!json?.success || !json.market) return null
    
    const outcomes = Array.isArray(json.market.outcomes) ? json.market.outcomes.map(String) : []
    const prices = Array.isArray(json.market.outcomePrices) ? json.market.outcomePrices.map(String) : []
    
    if (outcomes.length > 0 && prices.length > 0) {
      return { outcomes, outcomePrices: prices }
    }
    
    return null
  } catch (error) {
    return null
  }
}

async function findMarketsMissingOutcomePrices() {
  console.log('🔍 Finding markets that should have outcome_prices but are missing them...\n')
  
  const markets = []
  let from = 0
  const PAGE = 1000
  
  while (true) {
    const { data, error } = await supabase
      .from('markets')
      .select('condition_id, closed, status, winning_side, resolved_outcome, outcome_prices, raw_dome, side_a, side_b')
      .order('condition_id')
      .range(from, from + PAGE - 1)
    
    if (error) throw error
    if (!data || !data.length) break
    
    markets.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  // Find markets that should have outcome prices but don't
  const needingPrices = markets.filter((m) => {
    if (hasOutcomePrices(m)) return false // Already has outcome_prices
    return shouldHaveOutcomePrices(m) // Should have them based on resolution data
  })

  console.log(`📊 Found ${needingPrices.length} markets that should have outcome_prices but are missing them\n`)
  
  return needingPrices.map((m) => ({
    condition_id: m.condition_id,
    raw_dome: m.raw_dome,
    side_a: m.side_a,
    side_b: m.side_b,
    winning_side: m.winning_side,
    resolved_outcome: m.resolved_outcome,
  })).filter((m) => m.condition_id)
}

async function processBatch(batchNumber, marketData) {
  const conditionIds = marketData.map((m) => m.condition_id)
  console.log(`📦 Batch ${batchNumber}: Processing ${conditionIds.length} markets...`)

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

      // Try to construct from winning_side and side_a/side_b
      if (!outcomePrices && (market.side_a || market.side_b) && market.winning_side) {
        const outcomes = []
        const prices = []
        
        const winningSideId = typeof market.winning_side === 'object' 
          ? (market.winning_side.id || market.winning_side.label)
          : market.winning_side
        
        if (market.side_a) {
          const label = market.side_a.label || market.side_a.id || 'Yes'
          outcomes.push(label)
          const isWinner = (market.side_a.id === winningSideId || market.side_a.label === winningSideId || label === winningSideId)
          prices.push(isWinner ? '1.0' : '0.0')
        }
        if (market.side_b) {
          const label = market.side_b.label || market.side_b.id || 'No'
          outcomes.push(label)
          const isWinner = (market.side_b.id === winningSideId || market.side_b.label === winningSideId || label === winningSideId)
          prices.push(isWinner ? '1.0' : '0.0')
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
      const domeMarkets = await fetchMarketsByConditionIds(needsDomeAPI)
      
      for (const domeMarket of domeMarkets) {
        if (!domeMarket.condition_id) continue
        
        let outcomePrices = extractOutcomePricesFromDome(domeMarket)
        
        if (!outcomePrices && domeMarket.winning_side) {
          // Try to construct from winning_side
          const outcomes = []
          const prices = []
          
          const winningSideId = typeof domeMarket.winning_side === 'object' 
            ? (domeMarket.winning_side.id || domeMarket.winning_side.label)
            : domeMarket.winning_side
          
          if (domeMarket.side_a) {
            const label = domeMarket.side_a.label || domeMarket.side_a.id || 'Yes'
            outcomes.push(label)
            const isWinner = (domeMarket.side_a.id === winningSideId || domeMarket.side_a.label === winningSideId || label === winningSideId)
            prices.push(isWinner ? '1.0' : '0.0')
          }
          if (domeMarket.side_b) {
            const label = domeMarket.side_b.label || domeMarket.side_b.id || 'No'
            outcomes.push(label)
            const isWinner = (domeMarket.side_b.id === winningSideId || domeMarket.side_b.label === winningSideId || label === winningSideId)
            prices.push(isWinner ? '1.0' : '0.0')
          }
          
          if (outcomes.length > 0 && prices.length > 0) {
            outcomePrices = { outcomes, outcomePrices: prices }
          }
        }

        if (outcomePrices) {
          updates.push({
            condition_id: domeMarket.condition_id,
            outcome_prices: outcomePrices,
            last_price_updated_at: new Date().toISOString(),
          })
        } else {
          needsPriceAPI.push(domeMarket.condition_id)
        }
      }
      
      await sleep(SLEEP_MS)
    }

    // Fetch from Price API as last resort
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

    const fromRawDome = updates.filter(u => !needsDomeAPI.includes(u.condition_id) && !needsPriceAPI.includes(u.condition_id)).length
    const fromDomeAPI = updates.filter(u => needsDomeAPI.includes(u.condition_id) && !needsPriceAPI.includes(u.condition_id)).length
    const fromPriceAPI = updates.filter(u => needsPriceAPI.includes(u.condition_id)).length
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
  console.log('='.repeat(60))
  console.log('🚀 Backfilling outcome_prices for all markets that should have them')
  console.log('='.repeat(60))
  console.log('')

  const markets = await findMarketsMissingOutcomePrices()

  if (markets.length === 0) {
    console.log('✅ All markets that should have outcome_prices already have them!')
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
      `📊 Progress: ${((i + batch.length) / markets.length * 100).toFixed(1)}% - ` +
      `updated=${totalUpdated} missing=${totalMissing} ` +
      `(raw_dome=${totalFromRawDome}, DomeAPI=${totalFromDome}, PriceAPI=${totalFromPriceAPI})`
    )
    
    // Small delay between batches
    if (i + BATCH_SIZE < markets.length) {
      await sleep(SLEEP_MS)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('✨ Backfill complete!')
  console.log('='.repeat(60))
  console.log(`✅ Updated ${totalUpdated} markets with outcome_prices`)
  console.log(`   - From existing raw_dome: ${totalFromRawDome}`)
  console.log(`   - From Dome API: ${totalFromDome}`)
  console.log(`   - From Price API (CLOB/Gamma): ${totalFromPriceAPI}`)
  console.log(`❌ Missing/not found: ${totalMissing}`)
  console.log('='.repeat(60))
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  if (error.stack) console.error(error.stack)
  process.exit(1)
})
