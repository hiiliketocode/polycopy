#!/usr/bin/env node
'use strict'

/**
 * Test Gemini classification on markets from top 5 traders by PnL
 * 
 * This script:
 * 1. Clears all existing classifications
 * 2. Gets top 5 traders by realized PnL
 * 3. Gets markets from their trades
 * 4. Tests Gemini prompt on 1000 of those markets
 * 
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GEMINI_API_KEY
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')
const { GoogleGenerativeAI } = require('@google/generative-ai')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

if (!GEMINI_API_KEY) {
  throw new Error('Missing GEMINI_API_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.0-flash-001'
const model = genAI.getGenerativeModel({ model: MODEL_NAME })

const GEMINI_BATCH_SIZE = 50
const SLEEP_MS = 2000
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 5000
const TEST_LIMIT = 1000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatTags(tags) {
  if (!tags) return ''
  if (Array.isArray(tags)) {
    return tags.join(', ')
  }
  if (typeof tags === 'object') {
    return Object.values(tags).flat().join(', ')
  }
  return String(tags)
}

function formatMarketForPrompt(market) {
  const parts = []
  if (market.title) parts.push(`Title: ${market.title}`)
  if (market.description) parts.push(`Description: ${market.description}`)
  const tagsStr = formatTags(market.tags)
  if (tagsStr) parts.push(`Tags: ${tagsStr}`)
  return `${market.condition_id}|${parts.join(' | ')}`
}

/**
 * Build the BEST classification prompt based on all learnings
 */
function buildPrompt(markets) {
  const marketsText = markets.map(formatMarketForPrompt).join('\n')
  
  return `You are a Deterministic Heuristic Classifier for Prediction Markets. Your goal is to map Polymarket data to a standardized taxonomy with 95%+ accuracy.

## Classification Schema

### market_type
One of: Crypto, Sports, Politics, Finance, Economics, Culture, Tech, Science, Weather

### market_subtype
- **Sports**: Specific league (NBA, NFL, NHL, EPL, UCL, La Liga, ATP, WTA, UFC, NCAA_Basketball, NCAA_Football, Cricket, F1, Bundesliga, Serie_A, Ligue_1, MLS, etc.)
- **Crypto**: Specific asset (Bitcoin, Ethereum, Solana, XRP, etc.) or category (Airdrops, FDV, Meme_Coins)
- **Politics**: US_Politics, Geopolitics, World_Elections
- **Finance**: Individual_Stocks (AAPL, TSLA, etc.), Market_Indices (SPX, RUT), Commodities (Gold, Silver)
- **Culture**: Awards (Oscars, Grammys), Box_Office, Social_Media, Entertainment_Rankings
- **Tech**: AI, Space, Social_Media, Hardware
- **Economics**: Employment, Inflation, GDP, Interest_Rates
- **Science**: Health, Climate, Space
- **Weather**: Regional or general weather events

### bet_structure
One of: Binary, Spread, Over_Under, Moneyline, Up_Down, Price_Target, Mentions, Multi_Outcome, Prop

## Heuristic Logic (CRITICAL - Follow Precedence Order)

### Step 1: Identify League/Entity First
- If title/tags contain leagues (NBA, NFL, NHL, EPL, UCL, La Liga, ATP, UFC, NCAA) → Sports + subtype
- If title/tags contain tickers (AAPL, TSLA, BTC, ETH, SOL) → Finance/Crypto + subtype
- If title/tags contain "Bitcoin", "Ethereum", "Solana", etc. → Crypto + subtype

### Step 2: Determine bet_structure (MOST SPECIFIC FIRST)

**1. Up_Down (HIGHEST PRIORITY)**
- Title contains "up or down", "up/down", "upordown" (case insensitive)
- Title format: "[Asset] Up or Down - [Time Range]"
- Examples: "Bitcoin Up or Down - December 9", "Solana Up or Down - November 26"
- CRITICAL: "Up or Down" is NEVER Spread, NEVER Over_Under, NEVER Prop

**2. Spread**
- Title contains "spread:" (with colon)
- Outcome labels contain (+/- X.X) format
- Examples: "Team A spread: -3.5", "Player points spread: +5.5"
- CRITICAL: "Spread:" (with colon) is ALWAYS Spread

**3. Multi_Outcome**
- Title contains "between X and Y" or "exactly X"
- Title contains "which" with multiple options listed
- Examples: "Will X be between 100-200?", "Which team will win?"

**4. Price_Target**
- Title contains "hit $", "reach $", "close above", "settle over", "exceed $"
- Examples: "Will Bitcoin hit $100k?", "Will AAPL close above $200?"

**5. Over_Under**
- Title contains "o/u", "over/under", "total [sets/goals/points]"
- Title format: "Total [metric] o/u [number]"
- Examples: "Total goals o/u 2.5", "Total points over/under 220"
- CRITICAL: Player stats with "o/u" are Props, NOT Over_Under (team totals are Over_Under)

**6. Prop**
- Title format: "[Name]: [Stat] o/u [number]"
- Examples: "LeBron James: points o/u 25.5", "Player X: assists o/u 10"
- Player-specific statistics
- CRITICAL: Player props are Props, team totals are Over_Under

**7. Moneyline**
- Title contains "vs." or "versus" but NO "spread" or "o/u"
- Examples: "Team A vs. Team B", "Player X vs. Player Y"
- CRITICAL: If "vs." appears but also has "spread" or "o/u", it's NOT Moneyline

**8. Mentions**
- Title contains "say", "mention", "post", "tweet", "announce"
- Examples: "Will X mention Y?", "Will X tweet about Y?"

**9. Binary (DEFAULT)**
- "Will/Is/Does" questions without other indicators
- Yes/No questions
- Default fallback for unclear cases

## Conflict Resolution

- "Trump" + "Crypto" → Politics (unless specifically tracking coin price)
- "Elon Musk" + "SpaceX" → Tech
- "Elon Musk" + "Tweets" → Culture
- "Up or Down" → ALWAYS Up_Down, NEVER Spread
- "Spread:" → ALWAYS Spread
- Player stats + "o/u" → Prop
- Team totals + "o/u" → Over_Under

## Task

Analyze the provided market data. Return a JSON array where each object contains:
{ "condition_id": "...", "market_type": "...", "market_subtype": "...", "bet_structure": "..." }

Return ONLY valid JSON, no markdown, no explanations.

Market Data:
${marketsText}`
}

/**
 * Parse Gemini response and extract JSON
 */
function parseGeminiResponse(result) {
  try {
    const text = result.response.text()
    
    // Remove markdown code blocks if present
    let jsonText = text.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/i, '').replace(/\s*```$/i, '')
    }
    
    // Parse JSON
    let classifications = JSON.parse(jsonText)
    
    // Ensure it's an array
    if (!Array.isArray(classifications)) {
      classifications = [classifications]
    }
    
    return classifications
  } catch (error) {
    console.error('Error parsing Gemini response:', error.message)
    console.error('Response text:', result.response.text().substring(0, 500))
    throw error
  }
}

/**
 * Classify a batch of markets
 */
async function classifyBatch(markets, retryCount = 0) {
  try {
    const prompt = buildPrompt(markets)
    
    console.log(`     [${new Date().toISOString()}] Starting API call...`)
    const result = await model.generateContent(prompt)
    console.log(`     [${new Date().toISOString()}] API call completed`)
    
    const classifications = parseGeminiResponse(result)
    
    if (classifications.length !== markets.length) {
      console.warn(`     ⚠️  Warning: Expected ${markets.length} classifications, got ${classifications.length}`)
    }
    
    return classifications
  } catch (error) {
    if (error.message.includes('429') && retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, retryCount)
      console.warn(`     ⚠️  Rate limit hit, retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`)
      await sleep(delay)
      return classifyBatch(markets, retryCount + 1)
    }
    throw error
  }
}

/**
 * Update market classifications
 */
async function updateMarketClassifications(updates) {
  if (updates.length === 0) return
  
  const now = new Date().toISOString()
  const updateRows = updates.map(update => ({
    condition_id: update.condition_id,
    market_type: update.market_type,
    market_subtype: update.market_subtype,
    bet_structure: update.bet_structure,
    updated_at: now
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
 * Main function
 */
async function main() {
  console.log('🚀 Starting Gemini Classification Test for Top 5 Traders')
  console.log('='.repeat(60))
  
  // Step 1: Clear all classifications
  console.log('\n📋 Step 1: Clearing all existing classifications...')
  const { error: clearError } = await supabase
    .from('markets')
    .update({
      market_type: null,
      market_subtype: null,
      bet_structure: null
    })
    .not('market_type', 'is', null)
  
  if (clearError) {
    console.error('❌ Error clearing classifications:', clearError.message)
    throw clearError
  }
  console.log('✅ All classifications cleared')
  
  // Step 2: Get top 5 traders by realized PnL
  console.log('\n📋 Step 2: Getting top 5 traders by realized PnL...')
  const { data: topTraders, error: tradersError } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address, rank, pnl_sum')
    .eq('window_key', '30D')
    .order('rank', { ascending: true })
    .limit(5)
  
  if (tradersError) {
    console.error('❌ Error fetching top traders:', tradersError.message)
    throw tradersError
  }
  
  if (!topTraders || topTraders.length === 0) {
    throw new Error('No top traders found')
  }
  
  console.log(`✅ Found ${topTraders.length} top traders:`)
  topTraders.forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.wallet_address.substring(0, 10)}... (Rank: ${t.rank}, PnL: ${t.pnl_sum})`)
  })
  
  const traderWallets = topTraders.map(t => t.wallet_address.toLowerCase())
  
  // Step 3: Get distinct markets from their trades
  console.log('\n📋 Step 3: Getting markets from top 5 traders\' trades...')
  
  // Get all trades to find unique condition_ids (fetch in batches to avoid limits)
  let allTrades = []
  let offset = 0
  const batchSize = 10000
  
  while (true) {
    const { data: trades, error: tradesError } = await supabase
      .from('trades')
      .select('condition_id')
      .in('wallet_address', traderWallets)
      .not('condition_id', 'is', null)
      .range(offset, offset + batchSize - 1)
    
    if (tradesError) {
      console.error('❌ Error fetching trades:', tradesError.message)
      throw tradesError
    }
    
    if (!trades || trades.length === 0) break
    
    allTrades = allTrades.concat(trades)
    console.log(`   Fetched ${allTrades.length} trades so far...`)
    
    if (trades.length < batchSize) break
    offset += batchSize
  }
  
  const trades = allTrades
  
  // Get unique condition_ids
  const conditionIds = [...new Set(trades.map(t => t.condition_id).filter(Boolean))]
  console.log(`✅ Found ${conditionIds.length} unique condition_ids from ${trades.length} trades`)
  
  // Step 4: Get market data for up to 1000 markets that exist in markets table
  console.log(`\n📋 Step 4: Fetching market data (up to ${TEST_LIMIT} markets)...`)
  
  // Fetch in batches to check which exist
  const { data: markets, error: marketsError } = await supabase
    .from('markets')
    .select('condition_id, title, description, tags')
    .in('condition_id', conditionIds.slice(0, TEST_LIMIT * 2)) // Check more to account for missing ones
    .limit(TEST_LIMIT)
  
  if (marketsError) {
    console.error('❌ Error fetching markets:', marketsError.message)
    throw marketsError
  }
  
  console.log(`✅ Fetched ${markets.length} markets from top 5 traders' trades`)
  
  if (markets.length < TEST_LIMIT) {
    console.log(`⚠️  Note: Only ${markets.length} markets available (requested ${TEST_LIMIT})`)
    console.log(`   This is because top 5 traders have ${conditionIds.length} unique markets,`)
    console.log(`   and ${markets.length} of them exist in the markets table.`)
  }
  
  // Step 5: Classify markets in batches
  console.log(`\n📋 Step 5: Classifying ${markets.length} markets using Gemini...`)
  console.log(`📊 Batch size: ${GEMINI_BATCH_SIZE} markets per API call`)
  console.log(`⏱️  Sleep between calls: ${SLEEP_MS}ms`)
  
  let processed = 0
  let updated = 0
  let errors = 0
  
  for (let i = 0; i < markets.length; i += GEMINI_BATCH_SIZE) {
    const batch = markets.slice(i, i + GEMINI_BATCH_SIZE)
    const batchNum = Math.floor(i / GEMINI_BATCH_SIZE) + 1
    const totalBatches = Math.ceil(markets.length / GEMINI_BATCH_SIZE)
    
    console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} markets)...`)
    
    try {
      const classifications = await classifyBatch(batch)
      
      // Update database
      await updateMarketClassifications(classifications)
      
      processed += batch.length
      updated += classifications.length
      
      console.log(`✅ Updated ${classifications.length} markets in this batch`)
      
      // Sleep between batches (except last)
      if (i + GEMINI_BATCH_SIZE < markets.length) {
        await sleep(SLEEP_MS)
      }
    } catch (error) {
      console.error(`❌ Error processing batch ${batchNum}:`, error.message)
      errors++
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('✨ Classification Test Complete')
  console.log('='.repeat(60))
  console.log(`📊 Processed: ${processed} markets`)
  console.log(`✅ Updated: ${updated} markets`)
  console.log(`❌ Errors: ${errors} markets`)
  console.log('='.repeat(60))
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  console.error(error.stack)
  process.exit(1)
})
