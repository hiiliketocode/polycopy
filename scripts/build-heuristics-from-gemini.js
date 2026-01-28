#!/usr/bin/env node
'use strict'

/**
 * Build heuristics model from Gemini classifications
 * 
 * This script analyzes Gemini classifications to extract patterns and build
 * a deterministic heuristics model that can be used for future classifications
 * without API calls.
 * 
 * Env:
 *   GEMINI_CLASSIFICATIONS_FILE (default: ./gemini-classifications.json)
 *   OUTPUT_FILE (default: ./combined_heuristics_model.json)
 * 
 * Usage:
 *   node scripts/build-heuristics-from-gemini.js
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const INPUT_FILE = process.env.GEMINI_CLASSIFICATIONS_FILE || path.resolve(process.cwd(), 'gemini-classifications.json')
const MARKETS_DATA_FILE = process.env.MARKETS_DATA_FILE || path.resolve(process.cwd(), 'markets_data.json')
const OUTPUT_FILE = process.env.OUTPUT_FILE || path.resolve(process.cwd(), 'combined_heuristics_model.json')

/**
 * Normalize text for keyword extraction
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return ''
  return text.toLowerCase().trim()
}

/**
 * Extract keywords from text (simple word extraction)
 */
function extractKeywords(text, minLength = 3) {
  const normalized = normalizeText(text)
  // Split on whitespace and punctuation, filter short words
  const words = normalized
    .split(/[\s\W]+/)
    .filter(w => w.length >= minLength)
  return words
}

/**
 * Analyze classifications and extract patterns
 */
function analyzeClassifications(classifications, marketsData) {
  // Create a map of condition_id -> market data
  const marketsMap = new Map()
  if (marketsData) {
    marketsData.forEach(m => {
      if (m.condition_id) {
        marketsMap.set(m.condition_id, m)
      }
    })
  }
  
  // Group classifications by type, subtype, and bet_structure
  const byType = new Map()
  const bySubtype = new Map()
  const byBetStructure = new Map()
  
  for (const classification of classifications) {
    const market = marketsMap.get(classification.condition_id)
    if (!market) continue
    
    // Extract all text from market
    const allText = [
      market.title || '',
      market.description || '',
      formatTags(market.tags)
    ].join(' ').toLowerCase()
    
    const keywords = extractKeywords(allText)
    
    // Group by market_type
    if (classification.market_type) {
      if (!byType.has(classification.market_type)) {
        byType.set(classification.market_type, { keywords: new Map(), count: 0 })
      }
      const typeData = byType.get(classification.market_type)
      typeData.count++
      keywords.forEach(kw => {
        typeData.keywords.set(kw, (typeData.keywords.get(kw) || 0) + 1)
      })
    }
    
    // Group by market_subtype (within market_type)
    if (classification.market_type && classification.market_subtype) {
      const key = `${classification.market_type}::${classification.market_subtype}`
      if (!bySubtype.has(key)) {
        bySubtype.set(key, { keywords: new Map(), count: 0 })
      }
      const subtypeData = bySubtype.get(key)
      subtypeData.count++
      keywords.forEach(kw => {
        subtypeData.keywords.set(kw, (subtypeData.keywords.get(kw) || 0) + 1)
      })
    }
    
    // Group by bet_structure
    if (classification.bet_structure) {
      if (!byBetStructure.has(classification.bet_structure)) {
        byBetStructure.set(classification.bet_structure, { patterns: new Map(), count: 0 })
      }
      const betData = byBetStructure.get(classification.bet_structure)
      betData.count++
      keywords.forEach(kw => {
        betData.patterns.set(kw, (betData.patterns.get(kw) || 0) + 1)
      })
    }
  }
  
  return { byType, bySubtype, byBetStructure }
}

/**
 * Format tags for analysis
 */
function formatTags(tags) {
  if (!tags) return ''
  if (Array.isArray(tags)) {
    return tags.join(' ')
  }
  if (typeof tags === 'object') {
    return Object.values(tags).flat().join(' ')
  }
  return String(tags)
}

/**
 * Extract top keywords with minimum frequency threshold
 */
function extractTopKeywords(keywordMap, minFrequency = 0.1, maxKeywords = 50) {
  const total = Array.from(keywordMap.values()).reduce((a, b) => a + b, 0)
  if (total === 0) return []
  
  const threshold = Math.max(1, Math.floor(total * minFrequency))
  
  const entries = Array.from(keywordMap.entries())
    .filter(([_, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([keyword, _]) => keyword)
  
  return entries
}

/**
 * Build heuristics model from analysis
 */
function buildHeuristicsModel(analysis) {
  const model = {
    market_type_and_subtype: {
      market_type_rules: {},
      subtype_keywords: {}
    },
    bet_structure: {
      classification_rules: {}
    }
  }
  
  // Build market_type_rules
  // Use lower threshold (0.03 = 3%) to catch more keywords, but still filter noise
  for (const [marketType, data] of analysis.byType.entries()) {
    const keywords = extractTopKeywords(data.keywords, 0.03, 50) // More keywords, lower threshold
    if (keywords.length > 0) {
      // Sort by frequency (already sorted in extractTopKeywords)
      model.market_type_and_subtype.market_type_rules[marketType] = keywords
    }
  }
  
  // Build subtype_keywords
  // Map multiple keywords to the same subtype (e.g., "btc" and "bitcoin" both → "Bitcoin")
  const subtypeMap = new Map()
  for (const [key, data] of analysis.bySubtype.entries()) {
    const [marketType, subtype] = key.split('::')
    if (!subtypeMap.has(marketType)) {
      subtypeMap.set(marketType, {})
    }
    // Get top keywords for this subtype (lower threshold to catch variations)
    const keywords = extractTopKeywords(data.keywords, 0.05, 30)
    if (keywords.length > 0) {
      // Map all significant keywords to this subtype
      keywords.forEach(keyword => {
        // Only add if not already mapped (prefer more specific subtypes)
        if (!subtypeMap.get(marketType)[keyword]) {
          subtypeMap.get(marketType)[keyword] = subtype
        }
      })
    }
  }
  
  for (const [marketType, subtypes] of subtypeMap.entries()) {
    if (Object.keys(subtypes).length > 0) {
      model.market_type_and_subtype.subtype_keywords[marketType] = subtypes
    }
  }
  
  // Build bet_structure rules
  for (const [betStructure, data] of analysis.byBetStructure.entries()) {
    const keywords = extractTopKeywords(data.patterns, 0.1, 30)
    if (keywords.length > 0) {
      // Determine rule type based on bet structure (matching your schema)
      if (betStructure === 'Binary') {
        model.bet_structure.classification_rules[betStructure] = {
          starts_with: ['will', 'is', 'does', 'can', 'could', 'should'],
          contains: keywords.filter(k => ['yes/no', 'will', 'is', 'does'].includes(k) || keywords.indexOf(k) < 10)
        }
      } else if (betStructure === 'Over_Under' || betStructure === 'Over/Under') {
        model.bet_structure.classification_rules['Over/Under'] = {
          contains: keywords.filter(k => ['over', 'under', 'o/u', 'total'].includes(k) || keywords.indexOf(k) < 10)
        }
      } else if (betStructure === 'Spread') {
        model.bet_structure.classification_rules[betStructure] = {
          contains: keywords.filter(k => ['spread', '+', '-', 'favored'].includes(k) || keywords.indexOf(k) < 10)
        }
      } else if (betStructure === 'Prop') {
        model.bet_structure.classification_rules[betStructure] = {
          must_contain: keywords.filter(k => 
            ['player', 'points', 'rebounds', 'assists', 'yards', 'goals', 'stat', 'o/u'].includes(k) || 
            keywords.indexOf(k) < 15
          ),
          must_not_contain: [' vs ']
        }
      } else if (betStructure === 'Up_Down') {
        model.bet_structure.classification_rules[betStructure] = {
          contains: ['up or down', 'up/down', 'upordown']
        }
      } else if (betStructure === 'Price_Target') {
        model.bet_structure.classification_rules[betStructure] = {
          contains: keywords.filter(k => ['hit', 'reach', 'close above', 'settle over', '$'].some(term => k.includes(term)) || keywords.indexOf(k) < 10)
        }
      } else if (betStructure === 'Mentions') {
        model.bet_structure.classification_rules[betStructure] = {
          contains: keywords.filter(k => ['say', 'mention', 'post', 'tweet'].includes(k) || keywords.indexOf(k) < 10)
        }
      } else if (betStructure === 'Moneyline') {
        model.bet_structure.classification_rules[betStructure] = {
          contains: keywords.filter(k => ['vs', 'versus'].includes(k) || keywords.indexOf(k) < 10),
          must_not_contain: ['spread', 'o/u', 'over/under']
        }
      } else if (betStructure === 'Multi_Outcome') {
        model.bet_structure.classification_rules[betStructure] = {
          contains: keywords.filter(k => ['between', 'exactly'].includes(k) || keywords.indexOf(k) < 10)
        }
      } else {
        // Generic rule
        model.bet_structure.classification_rules[betStructure] = {
          contains: keywords.slice(0, 15)
        }
      }
    }
  }
  
  // Add fallback
  model.bet_structure.classification_rules['Other'] = {
    fallback: true
  }
  
  return model
}

/**
 * Load markets data from file
 */
function loadMarketsData() {
  if (fs.existsSync(MARKETS_DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MARKETS_DATA_FILE, 'utf8'))
    } catch (err) {
      console.warn(`⚠️  Could not load markets data: ${err.message}`)
      return null
    }
  }
  return null
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Building heuristics model from Gemini classifications')
  console.log(`📄 Input file: ${INPUT_FILE}`)
  console.log(`💾 Output file: ${OUTPUT_FILE}\n`)
  
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error(`Input file not found: ${INPUT_FILE}`)
  }
  
  const classifications = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'))
  console.log(`✅ Loaded ${classifications.length} classifications`)
  
  if (classifications.length === 0) {
    throw new Error('No classifications found in input file')
  }
  
  // Load markets data for better keyword extraction
  const marketsData = loadMarketsData()
  if (marketsData) {
    console.log(`✅ Loaded ${marketsData.length} market records for analysis`)
  } else {
    console.warn(`⚠️  No market data file found. Analysis will be limited.`)
  }
  
  console.log('\n📊 Analyzing classifications...')
  const analysis = analyzeClassifications(classifications, marketsData)
  
  console.log(`  Found ${analysis.byType.size} market types`)
  console.log(`  Found ${analysis.bySubtype.size} market subtypes`)
  console.log(`  Found ${analysis.byBetStructure.size} bet structures`)
  
  console.log('\n🔨 Building heuristics model...')
  const model = buildHeuristicsModel(analysis)
  
  // Save model
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(model, null, 2), 'utf8')
  console.log(`✅ Heuristics model saved to ${OUTPUT_FILE}`)
  
  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('✨ Heuristics Model Summary')
  console.log('='.repeat(60))
  console.log(`Market Types: ${Object.keys(model.market_type_and_subtype.market_type_rules).length}`)
  console.log(`Subtype Mappings: ${Object.keys(model.market_type_and_subtype.subtype_keywords).length}`)
  console.log(`Bet Structure Rules: ${Object.keys(model.bet_structure.classification_rules).length}`)
  console.log('='.repeat(60))
  
  // Print some examples
  console.log('\n📋 Sample Market Type Rules:')
  for (const [type, keywords] of Object.entries(model.market_type_and_subtype.market_type_rules)) {
    console.log(`  ${type}: ${keywords.slice(0, 10).join(', ')}${keywords.length > 10 ? '...' : ''}`)
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  console.error(error.stack)
  process.exit(1)
})
