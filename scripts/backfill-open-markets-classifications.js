#!/usr/bin/env node
'use strict'

/**
 * Backfill market classifications for open markets using semantic_mapping
 * 
 * This script:
 * 1. Finds open markets missing classifications (market_subtype, bet_structure)
 * 2. Uses semantic_mapping table to classify markets by tags
 * 3. Updates markets table with classifications
 * 
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 * 
 * Optional env:
 *   BATCH_SIZE (default 50)
 *   SLEEP_MS (default 100)
 *   LIMIT (optional, limit number of markets to process)
 *   SKIP_EXISTING (default true, skip markets that already have classifications)
 *   OPEN_ONLY (default true, only process open markets)
 * 
 * Usage:
 *   node scripts/backfill-open-markets-classifications.js
 */

const dotenv = require('dotenv')
const path = require('path')
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const BATCH_SIZE = Math.max(1, parseInt(process.env.BATCH_SIZE) || 50)
const SLEEP_MS = Math.max(0, parseInt(process.env.SLEEP_MS) || 100)
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : null
const SKIP_EXISTING = process.env.SKIP_EXISTING !== 'false' // Default true
const OPEN_ONLY = process.env.OPEN_ONLY !== 'false' // Default true

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Normalize tags coming from a variety of shapes (JSON string, array of strings, etc.)
 */
function normalizeTags(rawTags) {
  if (!rawTags) return []
  if (Array.isArray(rawTags)) {
    return rawTags
      .map((t) => (typeof t === 'string' ? t : String(t)))
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
  }

  if (typeof rawTags === 'string') {
    try {
      const parsed = JSON.parse(rawTags)
      if (Array.isArray(parsed)) {
        return parsed
          .map((t) => (typeof t === 'string' ? t : String(t)))
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      }
    } catch {
      // Not JSON, treat as a single tag string
    }

    const single = rawTags.trim()
    return single.length > 0 ? [single] : []
  }

  return []
}

/**
 * Infer niche from tags using semantic_mapping table
 */
async function inferNicheFromTags(tags) {
  const cleanTags = tags
    .map((t) => t.toLowerCase().trim())
    .filter((t) => t.length > 0)

  if (cleanTags.length === 0) return { niche: null, source: 'no_tags' }

  const { data: mappings, error } = await supabase
    .from('semantic_mapping')
    .select('clean_niche, type, specificity_score, original_tag')
    .in('original_tag', cleanTags)

  if (error) {
    console.error('Error querying semantic_mapping:', error)
    return { niche: null, source: 'semantic_mapping_error', error }
  }

  if (mappings && mappings.length > 0) {
    mappings.sort((a, b) => (a.specificity_score || 99) - (b.specificity_score || 99))
    const best = mappings[0]
    const cleanNiche = (best?.clean_niche || '').toUpperCase()
    const marketType = (best?.type || '').toUpperCase()
    return {
      niche: cleanNiche || null,
      marketType: marketType || null,
      source: 'semantic_mapping',
      fromTag: best?.original_tag,
      specificity: best?.specificity_score,
    }
  }

  return { niche: null, source: 'no_match' }
}

/**
 * Infer bet structure from title
 */
function inferBetStructure(title) {
  if (!title) return null
  const t = title.toLowerCase()
  if (t.includes('over') || t.includes('under') || t.includes('o/u')) return 'OVER_UNDER'
  if (t.includes('spread') || t.includes('handicap')) return 'SPREAD'
  if (t.includes('will') || t.includes('winner')) return 'WINNER'
  return 'STANDARD'
}

/**
 * Classify a single market
 */
async function classifyMarket(market) {
  const normalizedTags = normalizeTags(market.tags)
  const nicheResult = await inferNicheFromTags(normalizedTags)
  const betStructure = inferBetStructure(market.title)

  return {
    condition_id: market.condition_id,
    market_type: nicheResult.marketType,
    market_subtype: nicheResult.niche,
    bet_structure: betStructure,
    tags: normalizedTags, // Ensure tags are normalized
    classificationSource: nicheResult.source,
    fromTag: nicheResult.fromTag,
  }
}

/**
 * Update markets with classifications (batched)
 */
async function updateMarketClassifications(updates) {
  if (updates.length === 0) return

  const now = new Date().toISOString()
  const updateRows = updates.map((update) => ({
    condition_id: update.condition_id,
    market_type: update.market_type,
    market_subtype: update.market_subtype,
    bet_structure: update.bet_structure,
    tags: update.tags, // Update tags to ensure they're normalized
    updated_at: now,
  }))

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
  console.log('🚀 Starting open markets classification backfill')
  console.log(`📊 Using semantic_mapping table for classification`)
  console.log(`⚙️  Batch size: ${BATCH_SIZE}, Sleep: ${SLEEP_MS}ms`)
  if (LIMIT) console.log(`📊 Limit: ${LIMIT} markets`)
  if (SKIP_EXISTING) console.log(`⏭️  Skipping markets with existing classifications`)
  if (OPEN_ONLY) console.log(`🔓 Only processing open markets`)
  console.log()

  let processed = 0
  let updated = 0
  let skipped = 0
  let errors = 0
  let offset = 0

  // Check semantic_mapping table exists and has data
  const { data: mappingCheck, error: mappingError } = await supabase
    .from('semantic_mapping')
    .select('original_tag, clean_niche')
    .limit(1)

  if (mappingError) {
    console.error('❌ Error checking semantic_mapping table:', mappingError.message)
    console.error('   Make sure semantic_mapping table exists and has data!')
    process.exit(1)
  }

  if (!mappingCheck || mappingCheck.length === 0) {
    console.warn('⚠️  WARNING: semantic_mapping table appears to be empty!')
    console.warn('   Classifications will fail. Populate semantic_mapping table first.')
  } else {
    console.log(`✅ semantic_mapping table has data`)
  }
  console.log()

  while (true) {
    if (LIMIT && processed >= LIMIT) {
      console.log(`🛑 Reached limit of ${LIMIT} markets`)
      break
    }

    // Build query for markets needing classification
    let query = supabase
      .from('markets')
      .select('condition_id, title, tags, market_type, market_subtype, bet_structure, status')
      .order('condition_id')
      .range(offset, offset + BATCH_SIZE - 1)

    // Filter for open markets if OPEN_ONLY is true
    if (OPEN_ONLY) {
      query = query.or('status.is.null,status.eq.open,status.neq.closed,status.neq.resolved')
    }

    // Filter for unclassified markets if SKIP_EXISTING is true
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
      ? markets.filter((m) => !m.market_type || !m.market_subtype || !m.bet_structure)
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
        const classification = await classifyMarket(market)
        updates.push(classification)
        processed++

        if (classification.market_subtype) {
          const typeStr = classification.market_type ? `${classification.market_type}/` : ''
          console.log(`  ✅ ${market.condition_id.substring(0, 8)}... → ${typeStr}${classification.market_subtype} (${classification.classificationSource})`)
        } else {
          console.log(`  ⚠️  ${market.condition_id.substring(0, 8)}... → No match (${classification.classificationSource})`)
        }
      } catch (err) {
        console.error(`  ❌ Error classifying market ${market.condition_id}:`, err.message)
        errors++
      }
    }

    if (SKIP_EXISTING) {
      skipped += markets.length - marketsToProcess.length
    }

    // Update markets
    if (updates.length > 0) {
      try {
        await updateMarketClassifications(updates)
        const successfulUpdates = updates.filter((u) => u.market_subtype || u.market_type).length
        updated += successfulUpdates
        console.log(`  💾 Updated ${successfulUpdates} markets with classifications`)
      } catch (err) {
        console.error('  ❌ Error updating markets:', err.message)
        errors++
      }
    }

    offset += BATCH_SIZE

    // Sleep between batches
    if (markets.length === BATCH_SIZE) {
      await sleep(SLEEP_MS)
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log('📊 Backfill Summary')
  console.log('='.repeat(70))
  console.log(`✅ Processed: ${processed} markets`)
  console.log(`💾 Updated: ${updated} markets`)
  console.log(`⏭️  Skipped: ${skipped} markets`)
  console.log(`❌ Errors: ${errors} markets`)
  console.log('='.repeat(70))
}

// Run the script
main()
  .then(() => {
    console.log('\n✅ Backfill completed successfully')
    process.exit(0)
  })
  .catch((err) => {
    console.error('\n❌ Backfill failed:', err)
    process.exit(1)
  })
