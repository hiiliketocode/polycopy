#!/usr/bin/env node
'use strict'

/**
 * Real-time monitoring worker for top 5 traders (30D window)
 * 
 * This worker:
 * 1. Monitors top 5 traders by 30D realized PnL rank
 * 2. Polls for new trades every few seconds
 * 3. When a new trade is detected:
 *    - Captures trade in trades table
 *    - Fetches/updates market data with:
 *      - Current prices (outcome_prices)
 *      - ESPN URL (if applicable)
 *      - Classifications (market_type, market_subtype, bet_structure)
 * 
 * Usage:
 *   node workers/worker-top5-traders.js
 * 
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   DOME_API_KEY
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOME_API_KEY = process.env.DOME_API_KEY || null
const DOME_BASE_URL = process.env.DOME_BASE_URL || 'https://api.domeapi.io/v1'
const PRICE_API_BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const HEURISTICS_MODEL_PATH = path.resolve(__dirname, '../combined_heuristics_model.json')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Load heuristics model for classifications
let heuristicsModel = null
if (fs.existsSync(HEURISTICS_MODEL_PATH)) {
  try {
    heuristicsModel = JSON.parse(fs.readFileSync(HEURISTICS_MODEL_PATH, 'utf8'))
    console.log('✅ Loaded heuristics model for classifications')
  } catch (e) {
    console.warn('⚠️  Could not load heuristics model:', e.message)
  }
}

const POLL_INTERVAL_MS = 5000 // Poll every 5 seconds
const RATE_LIMIT_MS = 200 // Delay between API calls

// Top 5 traders (30D window) - will be refreshed periodically
let top5Wallets = []
let lastTop5Refresh = 0
const TOP5_REFRESH_INTERVAL_MS = 3600000 // Refresh list every hour

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getTop5Traders() {
  const { data, error } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address')
    .eq('window_key', '30D')
    .order('rank', { ascending: true })
    .limit(5)
  
  if (error) throw error
  return (data || []).map(r => r.wallet_address?.toLowerCase()).filter(Boolean)
}

async function fetchTradesPage(wallet, limit = 200, offset = 0) {
  const url = `https://data-api.polymarket.com/trades?user=${wallet.toLowerCase()}&limit=${limit}&offset=${offset}`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Polycopy Top5 Worker' },
    signal: AbortSignal.timeout(15000)
  })
  
  if (!res.ok) {
    throw new Error(`Trades API returned ${res.status}: ${await res.text()}`)
  }
  
  return await res.json()
}

function parseTradeTimestamp(ts) {
  if (!ts) return null
  const d = new Date(ts * 1000)
  return isNaN(d.getTime()) ? null : d
}

function buildTradeRow(trade, wallet) {
  if (!trade.conditionId) return null
  
  const tradeTs = parseTradeTimestamp(trade.timestamp)
  if (!tradeTs) return null
  
  // Calculate shares_normalized - required field
  // Polymarket Data API provides 'size' which is already normalized
  let sharesNormalized = null
  if (trade.size !== undefined && trade.size !== null) {
    sharesNormalized = Number(trade.size)
  } else if (trade.shares !== undefined && trade.shares !== null) {
    // If shares is provided (raw), normalize it
    sharesNormalized = Number(trade.shares) / 1000000
  }
  
  // Skip if we can't determine shares (required field)
  if (sharesNormalized === null || !Number.isFinite(sharesNormalized) || sharesNormalized <= 0) {
    return null
  }
  
  // Price is also required
  const price = trade.price ? Number(trade.price) : null
  if (price === null || !Number.isFinite(price)) {
    return null
  }
  
  return {
    wallet_address: wallet.toLowerCase(),
    timestamp: tradeTs.toISOString(),
    side: (trade.side || '').toUpperCase(),
    shares_normalized: sharesNormalized,
    price: price,
    token_id: trade.tokenId || null,
    token_label: trade.tokenLabel || null,
    condition_id: trade.conditionId || null,
    market_slug: trade.slug || trade.marketSlug || null,
    title: trade.title || null,
    tx_hash: trade.transactionHash || trade.txHash || '',
    order_hash: trade.orderHash || null,
    taker: trade.taker || null,
    source: 'polymarket_data_api',
    raw: trade || {},
  }
}

async function getLatestTradeTimestamp(wallet) {
  const { data, error } = await supabase
    .from('trades')
    .select('timestamp')
    .eq('wallet_address', wallet)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single()
  
  if (error && error.code !== 'PGRST116') throw error
  return data ? new Date(data.timestamp) : null
}

async function upsertTrades(trades) {
  if (trades.length === 0) return 0
  
  // Remove trade_uid (generated column) - it will be auto-generated
  const tradesToInsert = trades.map(t => {
    const { trade_uid, ...rest } = t
    return rest
  })
  
  // The unique constraint is on (wallet_address, trade_uid) where trade_uid is generated
  // Since trade_uid = COALESCE(order_hash, 'tx:' || tx_hash), we can't use it directly
  // Instead, we'll use ignoreDuplicates which will respect all unique constraints
  // Batch upsert to handle large sets efficiently
  const BATCH_SIZE = 500
  let totalUpserted = 0
  
  for (let i = 0; i < tradesToInsert.length; i += BATCH_SIZE) {
    const batch = tradesToInsert.slice(i, i + BATCH_SIZE)
    
    const { error, count } = await supabase
      .from('trades')
      .upsert(batch, {
        ignoreDuplicates: true,  // Will skip duplicates based on unique constraint (wallet_address, trade_uid)
        count: 'exact'
      })
    
    if (error) throw error
    totalUpserted += count || 0
  }
  
  return totalUpserted
}

async function fetchMarketFromDome(conditionId) {
  if (!conditionId) return null
  
  const url = new URL(`${DOME_BASE_URL}/polymarket/markets`)
  url.searchParams.set('condition_id', conditionId)
  url.searchParams.set('limit', '1')
  
  const headers = { Accept: 'application/json' }
  if (DOME_API_KEY) {
    headers.Authorization = `Bearer ${DOME_API_KEY}`
  }
  
  try {
    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) && data.length > 0 ? data[0] : null
  } catch (e) {
    return null
  }
}

async function fetchCurrentPrices(conditionId) {
  try {
    const url = `${PRICE_API_BASE_URL}/api/polymarket/price?conditionId=${conditionId}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
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

function getEspnUrl(market) {
  if (!market) return null
  
  // Use existing getFallbackEspnUrl logic
  const { getFallbackEspnUrl } = require('../lib/espn/scores')
  
  try {
    return getFallbackEspnUrl({
      title: market.title,
      category: market.category,
      slug: market.market_slug || market.slug,
      eventSlug: market.event_slug || market.eventSlug,
      tags: market.tags,
      dateHint: market.game_start_time || market.gameStartTime || market.end_time || market.endTime,
    })
  } catch (e) {
    return null
  }
}

function extractMarketText(market) {
  const texts = []
  if (market.title) texts.push(market.title.toLowerCase().trim())
  if (market.description) texts.push(market.description.toLowerCase().trim())
  if (market.tags) {
    if (Array.isArray(market.tags)) {
      market.tags.forEach(t => {
        if (typeof t === 'string') texts.push(t.toLowerCase().trim())
        else if (t && typeof t === 'object') {
          Object.values(t).forEach(v => {
            if (typeof v === 'string') texts.push(v.toLowerCase().trim())
          })
        }
      })
    } else if (typeof market.tags === 'object') {
      Object.values(market.tags).forEach(v => {
        if (typeof v === 'string') texts.push(v.toLowerCase().trim())
        else if (Array.isArray(v)) {
          v.forEach(vv => {
            if (typeof vv === 'string') texts.push(vv.toLowerCase().trim())
          })
        }
      })
    }
  }
  return texts.join(' ')
}

function classifyMarketType(marketText) {
  if (!heuristicsModel?.market_type_and_subtype?.market_type_rules) return null
  
  const marketTypeRules = heuristicsModel.market_type_and_subtype.market_type_rules
  const scores = {}
  
  for (const [marketType, keywords] of Object.entries(marketTypeRules)) {
    let score = 0
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (regex.test(marketText)) {
        score++
      }
    }
    if (score > 0) {
      scores[marketType] = score
    }
  }
  
  if (Object.keys(scores).length === 0) return null
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]
}

function classifyMarketSubtype(marketType, marketText) {
  if (!marketType || !heuristicsModel?.market_type_and_subtype?.subtype_keywords) return null
  
  const subtypeKeywords = heuristicsModel.market_type_and_subtype.subtype_keywords[marketType]
  if (!subtypeKeywords) return null
  
  for (const [keyword, subtype] of Object.entries(subtypeKeywords)) {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (regex.test(marketText)) {
      return subtype
    }
  }
  
  return null
}

function classifyBetStructure(marketText) {
  if (!heuristicsModel?.bet_structure?.classification_rules) return 'Other'
  
  const classificationRules = heuristicsModel.bet_structure.classification_rules
  const order = ['Prop', 'Yes/No', 'Over/Under', 'Spread', 'Head-to-Head', 'Multiple Choice', 'Up_Down', 'Price_Target', 'Mentions', 'Moneyline', 'Multi_Outcome']
  
  for (const betType of order) {
    const rules = classificationRules[betType]
    if (!rules) continue
    
    if (rules.must_contain && Array.isArray(rules.must_contain)) {
      const hasAll = rules.must_contain.some(keyword => {
        const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        return regex.test(marketText)
      })
      if (hasAll) {
        if (rules.must_not_contain && Array.isArray(rules.must_not_contain)) {
          const hasExcluded = rules.must_not_contain.some(keyword => {
            const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
            return regex.test(marketText)
          })
          if (hasExcluded) continue
        }
        return betType
      }
    }
    
    if (rules.starts_with && Array.isArray(rules.starts_with)) {
      const matches = rules.starts_with.some(prefix => {
        return marketText.toLowerCase().startsWith(prefix.toLowerCase())
      })
      if (matches) return betType
    }
    
    if (rules.contains && Array.isArray(rules.contains)) {
      const matches = rules.contains.some(keyword => {
        const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        return regex.test(marketText)
      })
      if (matches) return betType
    }
  }
  
  return 'Other'
}

function classifyMarket(market) {
  if (!heuristicsModel || !market) {
    return { market_type: null, market_subtype: null, bet_structure: 'Other' }
  }
  
  const marketText = extractMarketText(market)
  if (!marketText) {
    return { market_type: null, market_subtype: null, bet_structure: 'Other' }
  }
  
  const marketType = classifyMarketType(marketText)
  const marketSubtype = classifyMarketSubtype(marketType, marketText)
  const betStructure = classifyBetStructure(marketText)
  
  return { market_type: marketType, market_subtype: marketSubtype, bet_structure: betStructure }
}

async function enrichMarketData(conditionId) {
  if (!conditionId) return null
  
  console.log(`  🔄 Enriching market: ${conditionId.substring(0, 20)}...`)
  
  // Fetch from Dome API
  const domeMarket = await fetchMarketFromDome(conditionId)
  if (!domeMarket) {
    console.log(`  ⚠️  Market not found in Dome API`)
    return null
  }
  
  // Map Dome market to row format
  const { mapDomeMarketToRow } = require('../lib/markets/dome')
  const marketRow = mapDomeMarketToRow(domeMarket)
  
  // Fetch current prices
  await sleep(RATE_LIMIT_MS)
  const outcomePrices = await fetchCurrentPrices(conditionId)
  if (outcomePrices) {
    marketRow.outcome_prices = outcomePrices
    marketRow.last_price_updated_at = new Date().toISOString()
  }
  
  // Get ESPN URL
  const espnUrl = getEspnUrl(domeMarket)
  if (espnUrl) {
    marketRow.espn_url = espnUrl
  }
  
  // Get classifications
  const classifications = classifyMarket(domeMarket)
  marketRow.market_type = classifications.market_type
  marketRow.market_subtype = classifications.market_subtype
  marketRow.bet_structure = classifications.bet_structure
  
  // Upsert to markets table
  const { error } = await supabase
    .from('markets')
    .upsert(marketRow, { onConflict: 'condition_id' })
  
  if (error) {
    console.error(`  ❌ Error upserting market: ${error.message}`)
    return null
  }
  
  console.log(`  ✅ Market enriched: ${domeMarket.title?.substring(0, 50) || conditionId}`)
  return marketRow
}

async function processWallet(wallet) {
  try {
    const watermark = await getLatestTradeTimestamp(wallet)
    
    let offset = 0
    const limit = 200
    let newTrades = []
    const conditionIds = new Set()
    
    while (true) {
      await sleep(RATE_LIMIT_MS)
      const trades = await fetchTradesPage(wallet, limit, offset)
      
      if (trades.length === 0) break
      
      for (const trade of trades) {
        const tradeTs = parseTradeTimestamp(trade.timestamp)
        if (!tradeTs) continue
        
        if (watermark && tradeTs <= watermark) {
          continue
        }
        
        const row = buildTradeRow(trade, wallet)
        if (row) {
          newTrades.push(row)
          if (row.condition_id) {
            conditionIds.add(row.condition_id)
          }
        }
      }
      
      if (trades.length < limit) break
      if (watermark && trades.some(t => {
        const ts = parseTradeTimestamp(t.timestamp)
        return ts && ts <= watermark
      })) break
      
      offset += limit
    }
    
    if (newTrades.length === 0) {
      return { tradesInserted: 0, marketsEnriched: 0 }
    }
    
    // Upsert trades
    const tradesInserted = await upsertTrades(newTrades)
    console.log(`  ✅ Inserted ${tradesInserted} new trades`)
    
    // Enrich markets for new condition_ids
    let marketsEnriched = 0
    for (const conditionId of conditionIds) {
      await sleep(RATE_LIMIT_MS)
      const enriched = await enrichMarketData(conditionId)
      if (enriched) marketsEnriched++
    }
    
    return { tradesInserted, marketsEnriched }
  } catch (err) {
    console.error(`  ❌ Error processing wallet ${wallet}:`, err.message)
    return { tradesInserted: 0, marketsEnriched: 0 }
  }
}

async function refreshTop5Wallets() {
  try {
    const wallets = await getTop5Traders()
    if (wallets.length > 0) {
      top5Wallets = wallets
      lastTop5Refresh = Date.now()
      console.log(`📊 Top 5 traders (30D): ${wallets.length} wallets`)
      wallets.forEach((w, i) => console.log(`  ${i + 1}. ${w}`))
    }
  } catch (err) {
    console.error('❌ Error refreshing top 5 wallets:', err.message)
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('🚀 Top 5 Traders Real-Time Monitor')
  console.log('='.repeat(60))
  console.log('')
  
  // Initial refresh
  await refreshTop5Wallets()
  
  if (top5Wallets.length === 0) {
    console.error('❌ No top 5 traders found')
    process.exit(1)
  }
  
  console.log(`\n🔄 Starting monitoring loop (polling every ${POLL_INTERVAL_MS / 1000}s)...\n`)
  
  while (true) {
    try {
      // Refresh top 5 list periodically
      if (Date.now() - lastTop5Refresh > TOP5_REFRESH_INTERVAL_MS) {
        await refreshTop5Wallets()
      }
      
      const cycleStart = Date.now()
      let totalTrades = 0
      let totalMarkets = 0
      
      for (const wallet of top5Wallets) {
        console.log(`\n👤 Processing ${wallet.substring(0, 10)}...`)
        const result = await processWallet(wallet)
        totalTrades += result.tradesInserted
        totalMarkets += result.marketsEnriched
        await sleep(RATE_LIMIT_MS)
      }
      
      const cycleTime = Date.now() - cycleStart
      if (totalTrades > 0 || totalMarkets > 0) {
        console.log(`\n📊 Cycle complete: ${totalTrades} trades, ${totalMarkets} markets enriched (${cycleTime}ms)`)
      }
      
      await sleep(POLL_INTERVAL_MS)
    } catch (err) {
      console.error('❌ Cycle error:', err.message)
      await sleep(POLL_INTERVAL_MS)
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down gracefully...')
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down gracefully...')
  process.exit(0)
})

main().catch((err) => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
