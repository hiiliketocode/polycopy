#!/usr/bin/env node
'use strict'

/**
 * Diagnostic script to check market classification setup
 * 
 * Checks:
 * 1. Markets table schema (does it have classification columns?)
 * 2. Sample markets data (do they have tags? classifications?)
 * 3. semantic_mapping table (does it exist? has data?)
 * 4. Sample classification flow (test with real market)
 * 
 * Usage:
 *   node scripts/diagnose-market-classification.js [conditionId]
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

async function checkTableSchema() {
  console.log('\n' + '='.repeat(70))
  console.log('1. CHECKING MARKETS TABLE SCHEMA')
  console.log('='.repeat(70))
  
  // Check if classification columns exist
  const { data: columns, error } = await supabase.rpc('exec_sql', {
    query: `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'markets'
        AND column_name IN ('market_type', 'market_subtype', 'bet_structure', 'tags')
      ORDER BY column_name;
    `
  }).catch(async () => {
    // Fallback: use direct query
    const { data, error } = await supabase
      .from('markets')
      .select('condition_id')
      .limit(1)
    
    if (error) {
      console.error('❌ Error checking markets table:', error.message)
      return { data: null, error }
    }
    
    // Try to query classification columns directly
    const testQueries = [
      { name: 'market_type', query: supabase.from('markets').select('market_type').limit(1) },
      { name: 'market_subtype', query: supabase.from('markets').select('market_subtype').limit(1) },
      { name: 'bet_structure', query: supabase.from('markets').select('bet_structure').limit(1) },
      { name: 'tags', query: supabase.from('markets').select('tags').limit(1) },
    ]
    
    const results = {}
    for (const { name, query } of testQueries) {
      try {
        const { error: qError } = await query
        results[name] = !qError
      } catch {
        results[name] = false
      }
    }
    
    return { data: results, error: null }
  })
  
  if (error) {
    console.error('❌ Error checking schema:', error)
    return
  }
  
  // Check columns exist by trying to select them
  const columnChecks = {
    market_type: false,
    market_subtype: false,
    bet_structure: false,
    tags: false,
  }
  
  for (const col of Object.keys(columnChecks)) {
    try {
      const { error: selectError } = await supabase
        .from('markets')
        .select(col)
        .limit(1)
      columnChecks[col] = !selectError
    } catch {
      columnChecks[col] = false
    }
  }
  
  console.log('\nColumn existence check:')
  for (const [col, exists] of Object.entries(columnChecks)) {
    console.log(`  ${exists ? '✅' : '❌'} ${col}: ${exists ? 'EXISTS' : 'MISSING'}`)
  }
  
  return columnChecks
}

async function checkSampleMarkets() {
  console.log('\n' + '='.repeat(70))
  console.log('2. CHECKING SAMPLE MARKETS DATA')
  console.log('='.repeat(70))
  
  const { data: markets, error } = await supabase
    .from('markets')
    .select('condition_id, title, tags, market_type, market_subtype, bet_structure')
    .limit(10)
  
  if (error) {
    console.error('❌ Error fetching markets:', error.message)
    return
  }
  
  if (!markets || markets.length === 0) {
    console.log('⚠️  No markets found in database')
    return
  }
  
  console.log(`\nFound ${markets.length} sample markets:\n`)
  
  let withTags = 0
  let withSubtype = 0
  let withType = 0
  let withBetStructure = 0
  
  for (const market of markets) {
    const hasTags = market.tags && (Array.isArray(market.tags) ? market.tags.length > 0 : true)
    const hasSubtype = !!market.market_subtype
    const hasType = !!market.market_type
    const hasBetStructure = !!market.bet_structure
    
    if (hasTags) withTags++
    if (hasSubtype) withSubtype++
    if (hasType) withType++
    if (hasBetStructure) withBetStructure++
    
    console.log(`  ${market.condition_id.substring(0, 12)}...`)
    console.log(`    Title: ${(market.title || '').substring(0, 60)}`)
    console.log(`    Tags: ${hasTags ? JSON.stringify(Array.isArray(market.tags) ? market.tags.slice(0, 3) : market.tags) : 'NONE'}`)
    console.log(`    Type: ${market.market_type || 'NULL'}`)
    console.log(`    Subtype: ${market.market_subtype || 'NULL'}`)
    console.log(`    Bet Structure: ${market.bet_structure || 'NULL'}`)
    console.log()
  }
  
  console.log(`\nSummary:`)
  console.log(`  Markets with tags: ${withTags}/${markets.length}`)
  console.log(`  Markets with market_type: ${withType}/${markets.length}`)
  console.log(`  Markets with market_subtype: ${withSubtype}/${markets.length}`)
  console.log(`  Markets with bet_structure: ${withBetStructure}/${markets.length}`)
}

async function checkSemanticMapping() {
  console.log('\n' + '='.repeat(70))
  console.log('3. CHECKING SEMANTIC_MAPPING TABLE')
  console.log('='.repeat(70))
  
  const { data: mappings, error } = await supabase
    .from('semantic_mapping')
    .select('original_tag, clean_niche, type, specificity_score')
    .limit(20)
  
  if (error) {
    console.error('❌ Error querying semantic_mapping:', error.message)
    console.error('   Table may not exist!')
    return
  }
  
  if (!mappings || mappings.length === 0) {
    console.log('⚠️  semantic_mapping table is EMPTY!')
    console.log('   This is why classifications are failing.')
    return
  }
  
  console.log(`\nFound ${mappings.length} semantic mappings:\n`)
  
  for (const mapping of mappings.slice(0, 10)) {
    console.log(`  Tag: "${mapping.original_tag}"`)
    console.log(`    → Niche: ${mapping.clean_niche || 'NULL'}`)
    console.log(`    → Type: ${mapping.type || 'NULL'}`)
    console.log(`    → Score: ${mapping.specificity_score || 'NULL'}`)
    console.log()
  }
  
  // Check for common tags
  const commonTags = ['nba', 'nfl', 'bitcoin', 'crypto', 'politics', 'election']
  console.log('\nChecking common tags:')
  for (const tag of commonTags) {
    const { data: match } = await supabase
      .from('semantic_mapping')
      .select('clean_niche, type')
      .eq('original_tag', tag)
      .maybeSingle()
    
    console.log(`  ${tag}: ${match ? `✅ → ${match.clean_niche} (${match.type})` : '❌ NOT FOUND'}`)
  }
}

async function testClassificationFlow(conditionId) {
  if (!conditionId) {
    console.log('\n' + '='.repeat(70))
    console.log('4. SKIPPING CLASSIFICATION FLOW TEST (no conditionId provided)')
    console.log('='.repeat(70))
    return
  }
  
  console.log('\n' + '='.repeat(70))
  console.log('4. TESTING CLASSIFICATION FLOW')
  console.log('='.repeat(70))
  console.log(`\nTesting with conditionId: ${conditionId}\n`)
  
  // Fetch market from database
  const { data: market, error: marketError } = await supabase
    .from('markets')
    .select('condition_id, title, tags, market_type, market_subtype, bet_structure')
    .eq('condition_id', conditionId)
    .maybeSingle()
  
  if (marketError) {
    console.error('❌ Error fetching market:', marketError.message)
    return
  }
  
  if (!market) {
    console.log('⚠️  Market not found in database')
    console.log('   Try calling /api/markets/ensure first')
    return
  }
  
  console.log('Market data:')
  console.log(`  Title: ${market.title}`)
  console.log(`  Tags: ${JSON.stringify(market.tags)}`)
  console.log(`  Current Type: ${market.market_type || 'NULL'}`)
  console.log(`  Current Subtype: ${market.market_subtype || 'NULL'}`)
  console.log(`  Current Bet Structure: ${market.bet_structure || 'NULL'}`)
  
  // Normalize tags
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
        if (Array.isArray(parsed)) return parsed.map(t => String(t).trim()).filter(t => t.length > 0)
      } catch {}
      return rawTags.trim() ? [rawTags] : []
    }
    return []
  }
  
  const normalizedTags = normalizeTags(market.tags)
  console.log(`\nNormalized tags: ${JSON.stringify(normalizedTags)}`)
  
  if (normalizedTags.length === 0) {
    console.log('\n⚠️  No tags to classify with!')
    return
  }
  
  // Query semantic_mapping
  const cleanTags = normalizedTags.map(t => t.toLowerCase().trim())
  const { data: mappings, error: mappingError } = await supabase
    .from('semantic_mapping')
    .select('clean_niche, type, specificity_score, original_tag')
    .in('original_tag', cleanTags)
  
  if (mappingError) {
    console.error('❌ Error querying semantic_mapping:', mappingError.message)
    return
  }
  
  console.log(`\nSemantic mapping results: ${mappings?.length || 0} matches`)
  
  if (mappings && mappings.length > 0) {
    mappings.sort((a, b) => (a.specificity_score || 99) - (b.specificity_score || 99))
    const best = mappings[0]
    console.log(`\n✅ Best match:`)
    console.log(`   Tag: "${best.original_tag}"`)
    console.log(`   Niche: ${best.clean_niche}`)
    console.log(`   Type: ${best.type}`)
    console.log(`   Score: ${best.specificity_score}`)
  } else {
    console.log('\n❌ NO MATCHES FOUND in semantic_mapping!')
    console.log(`   Tags queried: ${JSON.stringify(cleanTags)}`)
    console.log('   This is why classification is failing.')
  }
}

async function main() {
  const conditionId = process.argv[2] || null
  
  console.log('🔍 MARKET CLASSIFICATION DIAGNOSTIC')
  console.log('='.repeat(70))
  
  const schemaCheck = await checkTableSchema()
  await checkSampleMarkets()
  await checkSemanticMapping()
  await testClassificationFlow(conditionId)
  
  console.log('\n' + '='.repeat(70))
  console.log('DIAGNOSTIC COMPLETE')
  console.log('='.repeat(70))
  
  if (schemaCheck) {
    const missingCols = Object.entries(schemaCheck)
      .filter(([_, exists]) => !exists)
      .map(([col]) => col)
    
    if (missingCols.length > 0) {
      console.log('\n⚠️  ACTION REQUIRED:')
      console.log(`   Run migration to add missing columns: ${missingCols.join(', ')}`)
      console.log('   File: supabase/migrations/20260125_add_market_classification_columns.sql')
    }
  }
  
  console.log('\nTo test with a specific market:')
  console.log('  node scripts/diagnose-market-classification.js <conditionId>')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ Diagnostic failed:', err)
    process.exit(1)
  })
