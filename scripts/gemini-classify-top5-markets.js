#!/usr/bin/env node
'use strict'

/**
 * Classify top 5 traders' markets using Google Gemini API
 * with the best prompt based on all learnings
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
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-001' })

const BATCH_SIZE = 50
const SLEEP_MS = 2000
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 5000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatMarketForPrompt(market) {
  const tags = Array.isArray(market.tags) ? market.tags : []
  return {
    condition_id: market.condition_id,
    title: market.title || '',
    description: (market.description || '').substring(0, 500),
    tags: tags.join(', ')
  }
}

function buildPrompt(markets) {
  const marketList = markets.map((m, i) => {
    const formatted = formatMarketForPrompt(m)
    return `${i + 1}. ID: ${formatted.condition_id}
   Title: ${formatted.title}
   Description: ${formatted.description}
   Tags: ${formatted.tags}`
  }).join('\n\n')

  return `You are a Deterministic Heuristic Classifier for Prediction Markets. Your goal is to map Polymarket data to a standardized taxonomy with 95%+ accuracy.

CLASSIFICATION SCHEMA:
- market_type: [Crypto, Sports, Politics, Finance, Economics, Culture, Tech, Science, Weather]
- market_subtype: [Specific League (e.g., NBA, EPL), Specific Asset (e.g., Bitcoin, AAPL), or Specific Domain (e.g., Geopolitics, Awards)]
- bet_structure: [Binary, Spread, Over_Under, Moneyline, Up_Down, Price_Target, Mentions, Multi_Outcome, Prop]

BET_STRUCTURE PRECEDENCE RULES (MOST SPECIFIC FIRST):

1. **Up_Down** (HIGHEST PRIORITY):
   - ALWAYS if title contains: "Up or Down", "Up/Down", "UpDown"
   - Example: "Solana Up or Down - November 26" → Up_Down
   - CRITICAL: "Up or Down" is NEVER Spread, NEVER Over_Under

2. **Spread**:
   - Title explicitly says "spread:" or "Spread:"
   - Outcome/description has point spreads like "+3.5" or "-7.5"
   - Example: "Lakers -5.5 spread" → Spread
   - CRITICAL: "vs." alone is NOT Spread (it's Moneyline)

3. **Multi_Outcome**:
   - Title says "between X and Y" or "exactly X"
   - Example: "Price between $50-$60" → Multi_Outcome

4. **Price_Target**:
   - Title has: "hit $", "reach $", "close above $", "settle over $"
   - Example: "Will BTC hit $100k?" → Price_Target

5. **Over_Under**:
   - Title has: "o/u", "over/under", "total [goals/points/sets]"
   - Team or game total (NOT player stats)
   - Example: "Lakers-Celtics o/u 220.5 points" → Over_Under
   - CRITICAL: Player stats are Prop, not Over_Under

6. **Prop**:
   - Player stat line format: "[Player Name]: [stat] o/u [number]"
   - Example: "LeBron: points o/u 25.5" → Prop
   - Individual player performance, NOT team totals

7. **Moneyline**:
   - Title has "vs." or "versus" but NO "spread" or "o/u"
   - Straight winner prediction
   - Example: "Lakers vs Celtics" → Moneyline
   - Also applies to: "X vs Y" in any domain (politics, finance, etc.)

8. **Mentions**:
   - Title has: "say", "mention", "post", "tweet", "announce"
   - Example: "Will Trump mention Bitcoin in speech?" → Mentions

9. **Binary** (DEFAULT):
   - Questions starting with: "Will", "Is", "Does", "Can"
   - Yes/No outcomes
   - Example: "Will it snow tomorrow?" → Binary

MARKET_TYPE & SUBTYPE RULES:

**Sports**:
- Keywords: NBA, NFL, NHL, EPL, UCL, La Liga, ATP, UFC, NCAA, MLB, Soccer, Basketball, Football, Hockey, Tennis, MMA, Cricket, Rugby, Formula 1, F1, Darts
- Subtypes: NBA, NFL, NHL, Soccer (EPL, UCL, MLS), Tennis (ATP, WTA), UFC, NCAA_Basketball, NCAA_Football, Cricket, Darts, F1
- Example: "Lakers vs Celtics" → Sports / NBA / Moneyline

**Crypto**:
- Keywords: Bitcoin, BTC, Ethereum, ETH, Solana, SOL, Crypto, Coin, Token, Blockchain, DeFi, NFT, Airdrop
- Subtypes: Bitcoin, Ethereum, Solana, Altcoins, DeFi, Meme_Coins
- Example: "BTC Up or Down" → Crypto / Bitcoin / Up_Down

**Politics**:
- Keywords: Trump, Biden, Election, President, Congress, Senate, Vote, Poll, Geopolitics, War, Conflict
- Subtypes: US_Politics, Geopolitics, World_Elections
- Example: "Will Trump win 2024?" → Politics / US_Politics / Binary

**Finance**:
- Keywords: Stock, AAPL, TSLA, SPX, S&P, Nasdaq, Market, Trading, Stock Market
- Subtypes: Individual_Stocks (AAPL, TSLA), Market_Indices (SPX, NASDAQ), Commodities (Gold, Oil)
- Example: "AAPL close above $200?" → Finance / Individual_Stocks / Price_Target

**Culture**:
- Keywords: Oscars, Grammys, Emmy, Awards, Box Office, Movie, Music, Entertainment
- Subtypes: Awards (Oscars, Grammys), Box_Office, Entertainment
- Example: "Best Picture Oscar winner?" → Culture / Awards / Binary

**Economics**:
- Keywords: GDP, Inflation, Jobs, Unemployment, Fed, Interest Rate, CPI, Economic Data
- Subtypes: US_Economy, Global_Economy
- Example: "Will Fed cut rates?" → Economics / US_Economy / Binary

**Tech**:
- Keywords: AI, Apple, Tesla (if about company), SpaceX, Tech Company, Product Launch
- Subtypes: AI, Tech_Companies
- Example: "Will Apple launch Vision Pro 2?" → Tech / Tech_Companies / Binary

**Weather**:
- Keywords: Weather, Temperature, Snow, Rain, Hurricane, Climate
- Example: "Will it snow in NYC?" → Weather / Weather / Binary

CRITICAL CONFLICT RESOLUTION:
- A "Trump" market about "Crypto" is Politics unless it specifically tracks a coin price
- An "Elon Musk" market about "SpaceX" is Tech
- An "Elon Musk" market about "Tweets" is Culture
- "vs." with NO bet structure indicators = Moneyline
- Player stats with "o/u" = Prop (NOT Over_Under)
- "Up or Down" = Up_Down (NEVER anything else)

TASK:
Analyze the following ${markets.length} markets. Return ONLY a JSON array (no markdown, no explanation) where each object contains:
{ "condition_id": "...", "market_type": "...", "market_subtype": "...", "bet_structure": "..." }

MARKETS:
${marketList}

RETURN ONLY THE JSON ARRAY (no \`\`\`json wrapper):
`
}

function parseGeminiResponse(result) {
  let text = result.response.text().trim()
  
  // Remove markdown code blocks if present
  if (text.startsWith('```')) {
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  }
  
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch (err) {
    console.error('Failed to parse Gemini response:', text.substring(0, 200))
    throw new Error(`JSON parse error: ${err.message}`)
  }
}

async function classifyBatch(markets, retryCount = 0) {
  const prompt = buildPrompt(markets)
  
  try {
    const result = await model.generateContent(prompt)
    const classifications = parseGeminiResponse(result)
    
    if (classifications.length !== markets.length) {
      console.warn(`⚠️  Warning: Expected ${markets.length} classifications, got ${classifications.length}`)
    }
    
    return classifications
  } catch (error) {
    if (retryCount < MAX_RETRIES && (error.status === 429 || error.message?.includes('429'))) {
      const delay = RETRY_DELAY_MS * Math.pow(2, retryCount)
      console.warn(`⚠️  Rate limit hit, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`)
      await sleep(delay)
      return classifyBatch(markets, retryCount + 1)
    }
    throw error
  }
}

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

async function main() {
  console.log('🚀 Starting Gemini classification for top 5 traders markets')
  console.log('📊 Using best prompt based on all learnings\n')
  
  // Load market data
  const marketsData = JSON.parse(fs.readFileSync('top5_trader_markets_data.json', 'utf8'))
  console.log(`✅ Loaded ${marketsData.length} markets from top 5 traders\n`)
  
  let processed = 0
  let updated = 0
  const allClassifications = []
  
  // Process in batches
  for (let i = 0; i < marketsData.length; i += BATCH_SIZE) {
    const batch = marketsData.slice(i, i + BATCH_SIZE)
    const batchNum = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(marketsData.length / BATCH_SIZE)
    
    console.log(`📦 Batch ${batchNum}/${totalBatches}: Processing ${batch.length} markets...`)
    console.log(`   [${new Date().toISOString()}] Starting API call...`)
    
    try {
      const classifications = await classifyBatch(batch)
      console.log(`   [${new Date().toISOString()}] API call completed`)
      
      // Update database
      await updateMarketClassifications(classifications)
      
      processed += batch.length
      updated += classifications.length
      allClassifications.push(...classifications)
      
      console.log(`✅ Updated ${classifications.length} markets (${processed}/${marketsData.length} total)\n`)
      
      if (i + BATCH_SIZE < marketsData.length) {
        console.log(`⏱️  Sleeping ${SLEEP_MS}ms...`)
        await sleep(SLEEP_MS)
      }
    } catch (error) {
      console.error(`❌ Error processing batch ${batchNum}:`, error.message)
      throw error
    }
  }
  
  // Save results
  fs.writeFileSync('top5_classifications.json', JSON.stringify(allClassifications, null, 2))
  
  console.log('\n' + '='.repeat(60))
  console.log('✨ Classification Complete')
  console.log('='.repeat(60))
  console.log(`📊 Total processed: ${processed} markets`)
  console.log(`✅ Total updated: ${updated} markets`)
  console.log(`💾 Results saved to: top5_classifications.json`)
  console.log('='.repeat(60))
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  console.error(error.stack)
  process.exit(1)
})
