#!/usr/bin/env node
'use strict'

/**
 * Validate heuristics model against Gemini classifications
 * 
 * This script compares the heuristics model predictions with Gemini classifications
 * to measure accuracy and identify areas for improvement.
 * 
 * Env:
 *   GEMINI_CLASSIFICATIONS_FILE (default: ./gemini-classifications.json)
 *   HEURISTICS_MODEL_PATH (default: ./combined_heuristics_model.json)
 *   MARKETS_DATA_FILE (default: ./markets_data.json)
 * 
 * Usage:
 *   node scripts/validate-heuristics.js
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const CLASSIFICATIONS_FILE = process.env.GEMINI_CLASSIFICATIONS_FILE || path.resolve(process.cwd(), 'gemini-classifications.json')
const HEURISTICS_MODEL_PATH = process.env.HEURISTICS_MODEL_PATH || path.resolve(process.cwd(), 'combined_heuristics_model.json')
const MARKETS_DATA_FILE = process.env.MARKETS_DATA_FILE || path.resolve(process.cwd(), 'markets_data.json')

// Load heuristics model functions (similar to backfill-market-heuristics.js)
function normalizeText(text) {
  if (!text || typeof text !== 'string') return ''
  return text.toLowerCase().trim()
}

function extractMarketText(market) {
  const texts = []
  
  if (market.title) texts.push(normalizeText(market.title))
  if (market.description) texts.push(normalizeText(market.description))
  
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

function classifyMarketType(marketText, heuristicsModel) {
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
  
  if (Object.keys(scores).length === 0) {
    return null
  }
  
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]
}

function classifyMarketSubtype(marketType, marketText, heuristicsModel) {
  if (!marketType) return null
  
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

function classifyBetStructure(marketText, heuristicsModel) {
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

function classifyMarket(market, heuristicsModel) {
  const marketText = extractMarketText(market)
  if (!marketText) {
    return {
      market_type: null,
      market_subtype: null,
      bet_structure: 'Other'
    }
  }
  
  const marketType = classifyMarketType(marketText, heuristicsModel)
  const marketSubtype = classifyMarketSubtype(marketType, marketText, heuristicsModel)
  const betStructure = classifyBetStructure(marketText, heuristicsModel)
  
  return {
    market_type: marketType,
    market_subtype: marketSubtype,
    bet_structure: betStructure
  }
}

async function main() {
  console.log('🔍 Validating heuristics model against Gemini classifications')
  console.log(`📄 Classifications: ${CLASSIFICATIONS_FILE}`)
  console.log(`📄 Heuristics Model: ${HEURISTICS_MODEL_PATH}`)
  console.log(`📄 Markets Data: ${MARKETS_DATA_FILE}\n`)
  
  if (!fs.existsSync(CLASSIFICATIONS_FILE)) {
    throw new Error(`Classifications file not found: ${CLASSIFICATIONS_FILE}`)
  }
  
  if (!fs.existsSync(HEURISTICS_MODEL_PATH)) {
    throw new Error(`Heuristics model file not found: ${HEURISTICS_MODEL_PATH}`)
  }
  
  const classifications = JSON.parse(fs.readFileSync(CLASSIFICATIONS_FILE, 'utf8'))
  const heuristicsModel = JSON.parse(fs.readFileSync(HEURISTICS_MODEL_PATH, 'utf8'))
  
  let marketsData = null
  if (fs.existsSync(MARKETS_DATA_FILE)) {
    marketsData = JSON.parse(fs.readFileSync(MARKETS_DATA_FILE, 'utf8'))
  }
  
  // Create markets map
  const marketsMap = new Map()
  if (marketsData) {
    marketsData.forEach(m => {
      if (m.condition_id) {
        marketsMap.set(m.condition_id, m)
      }
    })
  }
  
  console.log(`✅ Loaded ${classifications.length} classifications`)
  if (marketsData) {
    console.log(`✅ Loaded ${marketsData.length} market records`)
  }
  
  // Compare predictions
  let total = 0
  let correctType = 0
  let correctSubtype = 0
  let correctBetStructure = 0
  let allCorrect = 0
  
  const typeErrors = new Map()
  const subtypeErrors = new Map()
  const betStructureErrors = new Map()
  
  for (const geminiClassification of classifications) {
    const market = marketsMap.get(geminiClassification.condition_id)
    if (!market) {
      // Skip if we don't have market data
      continue
    }
    
    const heuristicsClassification = classifyMarket(market, heuristicsModel)
    
    total++
    
    // Compare market_type
    const geminiType = geminiClassification.market_type
    const heuristicsType = heuristicsClassification.market_type
    if (geminiType === heuristicsType || (!geminiType && !heuristicsType)) {
      correctType++
    } else {
      const key = `${geminiType || 'null'} -> ${heuristicsType || 'null'}`
      typeErrors.set(key, (typeErrors.get(key) || 0) + 1)
    }
    
    // Compare market_subtype
    const geminiSubtype = geminiClassification.market_subtype
    const heuristicsSubtype = heuristicsClassification.market_subtype
    if (geminiSubtype === heuristicsSubtype || (!geminiSubtype && !heuristicsSubtype)) {
      correctSubtype++
    } else {
      const key = `${geminiSubtype || 'null'} -> ${heuristicsSubtype || 'null'}`
      subtypeErrors.set(key, (subtypeErrors.get(key) || 0) + 1)
    }
    
    // Compare bet_structure
    const geminiBet = geminiClassification.bet_structure
    const heuristicsBet = heuristicsClassification.bet_structure
    if (geminiBet === heuristicsBet || (!geminiBet && !heuristicsBet)) {
      correctBetStructure++
    } else {
      const key = `${geminiBet || 'null'} -> ${heuristicsBet || 'null'}`
      betStructureErrors.set(key, (betStructureErrors.get(key) || 0) + 1)
    }
    
    // All correct
    if (geminiType === heuristicsType && 
        geminiSubtype === heuristicsSubtype && 
        geminiBet === heuristicsBet) {
      allCorrect++
    }
  }
  
  // Print results
  console.log('\n' + '='.repeat(60))
  console.log('📊 Validation Results')
  console.log('='.repeat(60))
  console.log(`Total Markets Compared: ${total}`)
  console.log(`\nMarket Type Accuracy: ${((correctType / total) * 100).toFixed(2)}% (${correctType}/${total})`)
  console.log(`Market Subtype Accuracy: ${((correctSubtype / total) * 100).toFixed(2)}% (${correctSubtype}/${total})`)
  console.log(`Bet Structure Accuracy: ${((correctBetStructure / total) * 100).toFixed(2)}% (${correctBetStructure}/${total})`)
  console.log(`Overall Accuracy (All Fields): ${((allCorrect / total) * 100).toFixed(2)}% (${allCorrect}/${total})`)
  console.log('='.repeat(60))
  
  // Print top errors
  if (typeErrors.size > 0) {
    console.log('\n🔴 Top Market Type Errors:')
    const sortedTypeErrors = Array.from(typeErrors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    sortedTypeErrors.forEach(([error, count]) => {
      console.log(`  ${error}: ${count}`)
    })
  }
  
  if (subtypeErrors.size > 0) {
    console.log('\n🔴 Top Market Subtype Errors:')
    const sortedSubtypeErrors = Array.from(subtypeErrors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    sortedSubtypeErrors.forEach(([error, count]) => {
      console.log(`  ${error}: ${count}`)
    })
  }
  
  if (betStructureErrors.size > 0) {
    console.log('\n🔴 Top Bet Structure Errors:')
    const sortedBetErrors = Array.from(betStructureErrors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    sortedBetErrors.forEach(([error, count]) => {
      console.log(`  ${error}: ${count}`)
    })
  }
  
  console.log('\n')
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  console.error(error.stack)
  process.exit(1)
})
