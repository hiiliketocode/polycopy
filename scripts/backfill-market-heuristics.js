#!/usr/bin/env node
'use strict'

/**
 * Backfill market heuristics classifications (market_type, market_subtype, bet_structure)
 * using the combined heuristics model.
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   HEURISTICS_MODEL_PATH (optional, defaults to ./combined_heuristics_model.json)
 *
 * Optional env:
 *   BATCH_SIZE (default 100)
 *   SLEEP_MS (default 50)
 *   LIMIT (optional, limit number of markets to process)
 *   SKIP_EXISTING (default false, skip markets that already have classifications)
 *
 * Usage:
 *   node scripts/backfill-market-heuristics.js
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const HEURISTICS_MODEL_PATH = process.env.HEURISTICS_MODEL_PATH || path.resolve(process.cwd(), 'combined_heuristics_model.json')

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

if (!fs.existsSync(HEURISTICS_MODEL_PATH)) {
  throw new Error(`Heuristics model file not found: ${HEURISTICS_MODEL_PATH}`)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// Load heuristics model
const heuristicsModel = JSON.parse(fs.readFileSync(HEURISTICS_MODEL_PATH, 'utf8'))

const BATCH_SIZE = Math.max(1, parseInt(process.env.BATCH_SIZE) || 100)
const SLEEP_MS = Math.max(0, parseInt(process.env.SLEEP_MS) || 50)
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : null
const SKIP_EXISTING = process.env.SKIP_EXISTING === 'true'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Normalize text for matching (lowercase, trim)
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return ''
  return text.toLowerCase().trim()
}

/**
 * Extract all text from a market for keyword matching
 */
function extractMarketText(market) {
  const texts = []
  
  if (market.title) texts.push(normalizeText(market.title))
  if (market.description) texts.push(normalizeText(market.description))
  
  // Extract tags if they're an array or object
  if (market.tags) {
    if (Array.isArray(market.tags)) {
      market.tags.forEach(tag => {
        if (typeof tag === 'string') {
          texts.push(normalizeText(tag))
        } else if (tag && typeof tag === 'object') {
          Object.values(tag).forEach(val => {
            if (typeof val === 'string') {
              texts.push(normalizeText(val))
            }
          })
        }
      })
    } else if (typeof market.tags === 'object') {
      Object.values(market.tags).forEach(val => {
        if (typeof val === 'string') {
          texts.push(normalizeText(val))
        } else if (Array.isArray(val)) {
          val.forEach(v => {
            if (typeof v === 'string') {
              texts.push(normalizeText(v))
            }
          })
        }
      })
    }
  }
  
  return texts.join(' ')
}

/**
 * Classify market type based on heuristics
 */
function classifyMarketType(marketText) {
  const marketTypeRules = heuristicsModel.market_type_and_subtype.market_type_rules
  
  // Score each market type based on keyword matches
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
  
  // Return the market type with the highest score
  if (Object.keys(scores).length === 0) {
    return null
  }
  
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]
}

/**
 * Classify market subtype based on market type
 */
function classifyMarketSubtype(marketType, marketText) {
  if (!marketType) return null
  
  const subtypeKeywords = heuristicsModel.market_type_and_subtype.subtype_keywords[marketType]
  if (!subtypeKeywords) return null
  
  // Find the first matching subtype keyword
  for (const [keyword, subtype] of Object.entries(subtypeKeywords)) {
    const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (regex.test(marketText)) {
      return subtype
    }
  }
  
  return null
}

/**
 * Classify bet structure based on heuristics
 */
function classifyBetStructure(marketText) {
  const classificationRules = heuristicsModel.bet_structure.classification_rules
  
  // Check rules in order of specificity (most specific first)
  const order = ['Prop', 'Yes/No', 'Over/Under', 'Spread', 'Head-to-Head', 'Multiple Choice']
  
  for (const betType of order) {
    const rules = classificationRules[betType]
    if (!rules) continue
    
    // Check must_contain (for Prop)
    if (rules.must_contain && Array.isArray(rules.must_contain)) {
      const hasAll = rules.must_contain.some(keyword => {
        const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        return regex.test(marketText)
      })
      
      if (hasAll) {
        // Check must_not_contain
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
    
    // Check starts_with (for Yes/No)
    if (rules.starts_with && Array.isArray(rules.starts_with)) {
      const matches = rules.starts_with.some(prefix => {
        return marketText.toLowerCase().startsWith(prefix.toLowerCase())
      })
      if (matches) return betType
    }
    
    // Check contains
    if (rules.contains && Array.isArray(rules.contains)) {
      const matches = rules.contains.some(keyword => {
        const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        return regex.test(marketText)
      })
      if (matches) return betType
    }
  }
  
  // Fallback to "Other"
  return 'Other'
}

/**
 * Classify a single market
 */
function classifyMarket(market) {
  const marketText = extractMarketText(market)
  if (!marketText) {
    return {
      market_type: null,
      market_subtype: null,
      bet_structure: 'Other'
    }
  }
  
  const marketType = classifyMarketType(marketText)
  const marketSubtype = classifyMarketSubtype(marketType, marketText)
  const betStructure = classifyBetStructure(marketText)
  
  return {
    market_type: marketType,
    market_subtype: marketSubtype,
    bet_structure: betStructure
  }
}

/**
 * Update markets with classifications (batched)
 */
async function updateMarketClassifications(updates) {
  if (updates.length === 0) return
  
  // Prepare updates with updated_at timestamp
  const now = new Date().toISOString()
  const updateRows = updates.map(update => ({
    condition_id: update.condition_id,
    market_type: update.market_type,
    market_subtype: update.market_subtype,
    bet_structure: update.bet_structure,
    updated_at: now
  }))
  
  // Use upsert to batch update
  const { error } = await supabase
    .from('markets')
    .upsert(updateRows, { onConflict: 'condition_id' })
  
  if (error) {
    console.error('Error updating markets:', error.message)
    throw error
  }
}

/**
 * Main backfill function
 */
async function main() {
  console.log('🚀 Starting market heuristics backfill')
  console.log(`📄 Using heuristics model: ${HEURISTICS_MODEL_PATH}`)
  console.log(`⚙️  Batch size: ${BATCH_SIZE}, Sleep: ${SLEEP_MS}ms`)
  if (LIMIT) console.log(`📊 Limit: ${LIMIT} markets`)
  if (SKIP_EXISTING) console.log(`⏭️  Skipping markets with existing classifications`)
  
  let processed = 0
  let updated = 0
  let skipped = 0
  let errors = 0
  let offset = 0
  
  while (true) {
    if (LIMIT && processed >= LIMIT) {
      console.log(`🛑 Reached limit of ${LIMIT} markets`)
      break
    }
    
    // Fetch batch of markets
    let query = supabase
      .from('markets')
      .select('condition_id, title, description, tags, market_type, market_subtype, bet_structure')
      .order('condition_id')
      .range(offset, offset + BATCH_SIZE - 1)
    
    // Filter for unclassified markets at DB level if SKIP_EXISTING is true
    if (SKIP_EXISTING) {
      query = query.or('market_type.is.null,market_subtype.is.null,bet_structure.is.null')
    }
    
    let markets, error
    let retries = 3
    while (retries > 0) {
      const result = await query
      markets = result.data
      error = result.error
      if (!error) break
      
      // Retry on network errors
      if (error.message && (error.message.includes('fetch failed') || error.message.includes('ECONNRESET'))) {
        retries--
        console.warn(`⚠️  Network error, retrying... (${retries} retries left)`)
        await sleep(2000)
        continue
      }
      break
    }
    
    if (error) {
      console.error('❌ Error fetching markets:', error.message)
      errors++
      // If it's a network error and we've exhausted retries, wait longer and continue
      if (error.message && (error.message.includes('fetch failed') || error.message.includes('ECONNRESET'))) {
        console.warn('⚠️  Network error, waiting 5 seconds before continuing...')
        await sleep(5000)
        continue
      }
      throw error
    }
    
    if (!markets || markets.length === 0) {
      console.log('✅ No more markets to process')
      break
    }
    
    console.log(`\n📦 Processing batch: ${markets.length} markets (offset: ${offset})`)
    
    // Filter out markets that already have classifications if SKIP_EXISTING is true
    const marketsToProcess = SKIP_EXISTING
      ? markets.filter(m => !m.market_type || !m.market_subtype || !m.bet_structure)
      : markets
    
    if (SKIP_EXISTING && marketsToProcess.length === 0) {
      console.log(`⏭️  All markets in this batch already have classifications, skipping...`)
      skipped += markets.length
      offset += BATCH_SIZE
      // If we got fewer markets than requested, we've reached the end
      if (markets.length < BATCH_SIZE) {
        console.log('✅ Reached end of markets')
        break
      }
      continue
    }
    
    // Classify each market
    const updates = []
    for (const market of marketsToProcess) {
      try {
        const classification = classifyMarket(market)
        updates.push({
          condition_id: market.condition_id,
          ...classification
        })
        processed++
      } catch (err) {
        console.error(`Error classifying market ${market.condition_id}:`, err.message)
        errors++
      }
    }
    
    if (SKIP_EXISTING) {
      skipped += (markets.length - marketsToProcess.length)
    }
    
    // Update markets
    if (updates.length > 0) {
      await updateMarketClassifications(updates)
      updated += updates.length
      console.log(`✅ Updated ${updates.length} markets in this batch`)
    }
    
    if (markets.length < BATCH_SIZE) {
      console.log('✅ Reached end of markets')
      break
    }
    
    offset += BATCH_SIZE
    
    if (SLEEP_MS > 0) {
      await sleep(SLEEP_MS)
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('✨ Market heuristics backfill complete')
  console.log('='.repeat(60))
  console.log(`📊 Processed: ${processed} markets`)
  console.log(`✅ Updated: ${updated} markets`)
  if (SKIP_EXISTING) {
    console.log(`⏭️  Skipped: ${skipped} markets (already classified)`)
  }
  console.log(`❌ Errors: ${errors} markets`)
  console.log('='.repeat(60))
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  console.error(error.stack)
  process.exit(1)
})
