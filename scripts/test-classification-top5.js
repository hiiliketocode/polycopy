#!/usr/bin/env node
'use strict'

/**
 * Clear all classifications and test on top 5 traders' markets (1000 markets)
 * Uses the best possible prompt based on all lessons learned
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')
const { GoogleGenerativeAI } = require('@google/generative-ai')

// Try both .env.local and .env
const envLocalPath = path.resolve(process.cwd(), '.env.local')
const envPath = path.resolve(process.cwd(), '.env')
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath })
} else if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

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

const BATCH_SIZE = 50
const SLEEP_MS = 2000
const PARALLEL_BATCHES = parseInt(process.env.PARALLEL_BATCHES) || 3 // Process 3 batches concurrently

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
 * BEST PROMPT - incorporating all lessons learned
 */
function buildPrompt(markets) {
  const marketsText = markets.map(formatMarketForPrompt).join('\n')
  
  return `Role: You are a Deterministic Heuristic Classifier for Prediction Markets. Your goal is to map Polymarket data to a standardized taxonomy with 95%+ accuracy.

Classification Schema:
market_type: [Crypto, Sports, Politics, Finance, Economics, Culture, Tech, Science, Weather]
market_subtype: [Specific League (e.g., NBA, EPL), Specific Asset (e.g., Bitcoin, AAPL), or Specific Domain (e.g., Geopolitics, Awards)]
bet_structure: [Binary, Spread, Over_Under, Moneyline, Up_Down, Price_Target, Mentions, Multi_Outcome, Prop]

Heuristic Logic (Precedence Rules - CHECK IN THIS EXACT ORDER):

1. Identify League/Entity First: If the title/tags contain leagues (NBA, NFL, NHL, EPL, UCL, La Liga, ATP, UFC, NCAA) or tickers (AAPL, TSLA, BTC, ETH), assign the subtype and type immediately.

2. Determine Bet Structure (CHECK IN THIS EXACT ORDER - most specific first):

   a) Up_Down: Title contains "up or down" or "up/down" (case insensitive).
      Examples: "Bitcoin Up or Down", "XRP Up or Down - January 26", "Solana Up or Down - November 26"
      CRITICAL: This is NEVER Spread, even if it has numbers or dates!
      CRITICAL: "Up or Down" markets are ALWAYS Up_Down bet_structure!

   b) Spread: Title explicitly contains "spread:" or "Spread:" (with colon) followed by a number with +/- 
      OR format "Team Name (X.X)" where X.X is a spread number with +/- (must have +/- sign).
      OR "1H Spread:", "2H Spread:", "First Half Spread:", "Second Half Spread:".
      Examples: "Spread: Hawks (-4.5)", "Spread: Padres (-1.5)", "1H Spread: Raptors (-4.5)", "Lakers (-7.5)"
      CRITICAL: If title says "Spread:" (with colon), it's ALWAYS Spread, regardless of other patterns!
      CRITICAL: Check this BEFORE Over_Under - "Spread:" takes precedence over "o/u" patterns!
      CRITICAL: "vs." alone is NOT Spread! Must explicitly say "spread:" or have (+/-X.X) format.
      CRITICAL: Numbers without +/- in parentheses are NOT spreads (e.g., "Team (227.5)" is Over_Under)

   c) Multi_Outcome: Title contains "between X and Y" (e.g., "between $220 and $230", "between 10 and 15", "between 84-85°F") 
      OR asks "which" with multiple named options OR "exactly X" OR "X or Y" (two specific options).
      Examples: "Will price be between $94,000 and $96,000?", "Which team will win?", "Will it be exactly 10?"
      Examples: "Will Bitcoin hit $90k or $100k first?" (two specific options = Multi_Outcome)
      Note: "between X and Y" is Multi_Outcome, NOT Binary or Yes/No!
      Note: "X or Y" with two specific named options is Multi_Outcome

   d) Price_Target: Title contains "hit $", "reach $", "close above", "close at", "settle over", "finish above", 
      "finish at", "be above", "be greater than", "crosses", "at least" with a dollar amount ($X, $X,XXX format).
      Examples: "Will Bitcoin reach $67,500?", "Will Ethereum close above $4000?", "Will AAPL close at $310?"
      Also includes: "Will [stock] finish week above $X?", "Will [crypto] hit $X before [date]?"
      CRITICAL: These are Price_Target, NOT Binary or Yes/No!

   e) Over_Under: Title contains "o/u", "over/under", "O/U", "total" with a number, OR team totals, OR "X+ [thing] scored?"
      OR "more than X" / "less than X" with a number, OR "X+ Goals", "X+ Points".
      Examples: "Lakers vs Warriors: O/U 227.5", "Total points o/u 50", "Total sets o/u 3.5"
      Examples: "3+ Goals Scored?", "Will there be more than 10 goals?", "Nets vs. Mavericks: 1H O/U 114.5"
      CRITICAL: If title says "Spread:" (with colon), Spread was already checked above - don't classify as Over_Under!
      CRITICAL: Team totals (Team A vs Team B: O/U X) are Over_Under, NOT Prop!
      CRITICAL: "[Team] vs [Team]: O/U X" format is ALWAYS Over_Under, even if it has a colon!
      CRITICAL: "X+ Goals/Points Scored?" is Over_Under, NOT Binary!
      Note: Half markets (1H, 2H) with O/U are still Over_Under

   f) Prop: Title format is "[Player Name]: [Stat] o/u" or "[Player Name]: [Stat] Over/Under" 
      OR contains a player name followed by a stat (points, rebounds, assists, yards, goals, etc.) with o/u.
      Examples: "Chet Holmgren: points o/u", "Zion Williamson: Rebounds O/U 5.5", "Player Name: Assists Over 6.5"
      CRITICAL: Must have format "[Player Name]: [Stat]" with a colon (:) separating player name from stat!
      CRITICAL: If it's a TEAM total (e.g., "Lakers vs Warriors: O/U 227.5"), it's Over_Under, NOT Prop!
      CRITICAL: If it says "Spread:" it's Spread, NOT Prop!
      CRITICAL: Player props are ONLY individual player statistics, NOT team totals or game outcomes!

   g) Moneyline: Title contains "vs." or "versus" but NO "spread", "o/u", "over/under", "O/U", or spread numbers.
      OR explicitly says "Moneyline" or "ML".
      Examples: "Lakers vs. Kings", "Devils vs. Canadiens", "Team A vs Team B"
      Examples: "Lakers vs. Kings: 1H Moneyline", "Team A vs Team B: ML"
      Special cases: "Will Team A vs Team B end in a draw?" is Binary (asks a question), NOT Moneyline
      Note: "vs." markets asking "will X win?" or "will X end in draw?" are Binary, NOT Moneyline

   h) Mentions: Title contains "say", "mention", "post", "tweet", "announce", "discuss", "speak" referring to someone speaking.
      Examples: "Will Trump say 'crypto'?", "Will Biden mention Bitcoin?", "Will X post about Y?"

   i) Binary: Title starts with "Will", "Is", "Does", "Can", "Could", "Should" and doesn't match any above.
      Examples: "Will Bitcoin reach $100k?", "Is the election called?", "Does the team win?"
      Examples: "Will Team A win?", "Will the match end in a draw?", "Is X the winner?"
      Note: "Will X reach $Y?" is Price_Target, NOT Binary!
      Note: "Will X be between Y and Z?" is Multi_Outcome, NOT Binary!
      Note: "Will X vs Y end in a draw?" is Binary (asks a question), NOT Moneyline!

CRITICAL RULES (MUST FOLLOW - IN ORDER OF PRECEDENCE):
1. "Up or Down" = ALWAYS Up_Down (highest priority for bet_structure, never Spread!)
2. "Spread:" (with colon) = ALWAYS Spread (second priority)
3. "vs." without "spread/o/u" = Moneyline (never Spread)
4. "vs." asking "will X win?" or "end in draw?" = Binary (not Moneyline)
5. "Will X reach $Y?" = Price_Target (not Binary/Yes/No)
6. "Will X be between Y and Z?" = Multi_Outcome (not Binary/Yes/No)
7. "[Player Name]: [Stat] o/u" = Prop (colon separates PLAYER NAME from STAT)
8. "[Team] vs [Team]: O/U X" = Over_Under (colon is between teams, NOT player:stat)
9. "X+ Goals/Points Scored?" = Over_Under (not Binary)
10. Numbers in parentheses with +/- = Spread (e.g., "(-4.5)")
11. Numbers in parentheses without +/- = Over_Under (e.g., "(227.5)")
12. "Which [thing]?" = Multi_Outcome (asks to choose from options)
13. "Will [person] say/mention/post?" = Mentions (not Binary)

Conflict Resolution:
- A "Trump" market about "Crypto" is Politics unless it specifically tracks a coin price (then Crypto).
- An "Elon Musk" market about "SpaceX" is Tech.
- An "Elon Musk" market about "Tweets" is Culture.
- Markets about "Netflix (NFLX)" are Finance (stock ticker), not Entertainment.
- Markets with stock tickers (AAPL, TSLA, MSFT, etc.) are Finance, not Tech (unless about tech products).
- Temperature/weather markets are Weather type.
- Economic data (jobs, inflation, unemployment) are Economics type.
- Markets asking "will X win [award]?" are Culture (Awards subtype).

Taxonomy Reference (Keywords):
Sports Subtypes: NBA, NFL, Soccer (EPL, UCL, MLS, AFCON, Bundesliga, La Liga), NHL, Tennis (ATP, WTA), MMA (UFC), NCAA_Basketball, NCAA_Football, Cricket (IPL, T20), F1, College Football (CFB), College Basketball.
Crypto Subtypes: Bitcoin, Ethereum, Solana, XRP, Airdrops, FDV, Meme_Coins, Base, Layer 2.
Politics Subtypes: US_Politics, Geopolitics (Conflict/War), World_Elections, Presidential, Congressional.
Finance Subtypes: Individual_Stocks (use ticker as subtype, e.g., AAPL, TSLA, MSFT), Market_Indices (SPX, RUT, NASDAQ), Commodities (Gold, Silver).
Economics Subtypes: Inflation, Unemployment, Jobs, GDP, Interest_Rates.
Culture Subtypes: Awards (Oscars, Grammys, Emmys), Box_Office, Social_Media, Entertainment_Rankings, Movies, TV, Music.
Tech Subtypes: AI, OpenAI, SpaceX, Tech_Companies (when about tech products, not stocks).
Weather Subtypes: Temperature, Precipitation, Storms, Climate.
Science Subtypes: Space, Medical, Research.

Task:
Analyze the provided markets data. Return a JSON array where each object contains:
{ "condition_id": "...", "market_type": "...", "market_subtype": "...", "bet_structure": "..." }

Markets Data (format: condition_id|Title: ... | Description: ... | Tags: ...):
${marketsText}

Return ONLY valid JSON array, no other text.`
}

function parseGeminiResponse(result) {
  try {
    const text = result.response.text()
    let jsonText = text.trim()
    
    if (jsonText.includes('```')) {
      const codeBlockRegex = /```(?:json)?\s*\n?/g
      jsonText = jsonText.replace(codeBlockRegex, '')
    }
    
    jsonText = jsonText.trim()
    
    const jsonStart = jsonText.indexOf('[')
    const jsonEnd = jsonText.lastIndexOf(']') + 1
    
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      jsonText = jsonText.substring(jsonStart, jsonEnd)
    } else {
      const braceStart = jsonText.indexOf('{')
      if (braceStart >= 0) {
        const lastBrace = jsonText.lastIndexOf('}')
        if (lastBrace > braceStart) {
          jsonText = '[' + jsonText.substring(braceStart, lastBrace + 1) + ']'
        }
      }
    }
    
    const parsed = JSON.parse(jsonText)
    if (!Array.isArray(parsed)) {
      return [parsed]
    }
    return parsed
  } catch (error) {
    console.error('Failed to parse Gemini response:', error.message)
    throw error
  }
}

async function classifyBatch(markets, retryCount = 0) {
  if (markets.length === 0) return []
  
  const prompt = buildPrompt(markets)
  
  try {
    console.log(`  [${new Date().toISOString()}] Starting API call...`)
    const result = await model.generateContent(prompt)
    console.log(`  [${new Date().toISOString()}] API call completed`)
    const classifications = parseGeminiResponse(result)
    
    if (classifications.length !== markets.length) {
      console.warn(`  ⚠️  Warning: Expected ${markets.length} classifications, got ${classifications.length}`)
    }
    
    return classifications
  } catch (error) {
    if (error.message.includes('429') && retryCount < 3) {
      const delay = 5000 * (retryCount + 1)
      console.warn(`  ⚠️  Rate limit hit, retrying in ${delay}ms... (attempt ${retryCount + 1}/3)`)
      await sleep(delay)
      return classifyBatch(markets, retryCount + 1)
    }
    throw error
  }
}

async function updateMarketClassifications(updates) {
  if (updates.length === 0) return
  
  // Remove duplicates - keep last occurrence of each condition_id
  const seen = new Map()
  updates.forEach(update => {
    if (update.condition_id) {
      seen.set(update.condition_id, update)
    }
  })
  
  const uniqueUpdates = Array.from(seen.values())
  
  if (uniqueUpdates.length === 0) return
  
  const now = new Date().toISOString()
  const updateRows = uniqueUpdates.map(update => ({
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
  console.log('🚀 Starting Classification Test for Top 5 Traders\' Markets')
  console.log('='.repeat(60))
  
  // Step 1: NEVER clear classifications unless explicitly requested
  const SKIP_EXISTING = process.env.SKIP_EXISTING === 'true' || process.env.SKIP_EXISTING === '1'
  const CLEAR_ALL = process.env.CLEAR_ALL === 'true' || process.env.CLEAR_ALL === '1'
  
  // NEVER clear if SKIP_EXISTING is set
  if (SKIP_EXISTING) {
    console.log('⏭️  SKIP_EXISTING=true - Will NOT clear existing classifications')
    console.log('⏭️  Will only classify markets that are missing classifications')
  } else if (CLEAR_ALL) {
    console.log('\n🗑️  Step 1: Clearing all classifications (CLEAR_ALL=true)...')
    // Clear in two steps to avoid complex OR logic
    const { error: clearError1 } = await supabase
      .from('markets')
      .update({
        market_type: null,
        market_subtype: null,
        bet_structure: null
      })
      .not('market_type', 'is', null)
    
    const { error: clearError2 } = await supabase
      .from('markets')
      .update({
        market_type: null,
        market_subtype: null,
        bet_structure: null
      })
      .not('market_subtype', 'is', null)
    
    const { error: clearError3 } = await supabase
      .from('markets')
      .update({
        market_type: null,
        market_subtype: null,
        bet_structure: null
      })
      .not('bet_structure', 'is', null)
    
    const clearError = clearError1 || clearError2 || clearError3
    
    if (clearError) {
      console.error('Error clearing:', clearError.message)
    } else {
      console.log('✅ All classifications cleared')
    }
  } else {
    console.log('\n⏭️  Step 1: Skipping clear (SKIP_EXISTING=true)')
  }
  
  // Step 2: Get top 5 traders
  console.log('\n📊 Step 2: Finding top 5 traders by PnL...')
  const { data: topTraders, error: tradersError } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address, rank, pnl_sum')
    .eq('window_key', '30D')
    .order('rank', { ascending: true })
    .limit(5)
  
  if (tradersError) {
    throw new Error(`Failed to get top traders: ${tradersError.message}`)
  }
  
  console.log(`✅ Found ${topTraders.length} top traders:`)
  topTraders.forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.wallet_address.substring(0, 10)}... (Rank: ${t.rank}, PnL: ${t.pnl_sum})`)
  })
  
  const traderWallets = topTraders.map(t => t.wallet_address.toLowerCase())
  
  // Step 3: Get markets from top5_traders_trades table
  console.log('\n📈 Step 3: Getting markets from top5_traders_trades table...')
  
  // Use the top5_traders_trades table directly (more comprehensive)
  // Paginate to get ALL trades (not just first 1000)
  let allTrades = []
  let offset = 0
  const batchSize = 1000
  
  while (true) {
    const { data: trades, error: tradesError } = await supabase
      .from('top5_traders_trades')
      .select('condition_id')
      .not('condition_id', 'is', null)
      .range(offset, offset + batchSize - 1)
    
    if (tradesError) {
      // Fallback to trades table if top5_traders_trades doesn't exist
      console.warn('⚠️  top5_traders_trades table not found, using trades table...')
      const { data: fallbackTrades, error: fallbackError } = await supabase
        .from('trades')
        .select('condition_id')
        .in('wallet_address', traderWallets)
        .not('condition_id', 'is', null)
      
      if (fallbackError) {
        throw new Error(`Failed to get trades: ${fallbackError.message}`)
      }
      
      const conditionIds = [...new Set((fallbackTrades || []).map(t => t.condition_id).filter(Boolean))]
      console.log(`✅ Found ${conditionIds.length} unique markets from trades table (from ${fallbackTrades.length} total trades)`)
      break
    }
    
    if (!trades || trades.length === 0) break
    
    allTrades = allTrades.concat(trades)
    offset += batchSize
    
    if (trades.length < batchSize) break
  }
  
  const conditionIds = [...new Set(allTrades.map(t => t.condition_id).filter(Boolean))]
  console.log(`✅ Found ${conditionIds.length} unique markets from top5_traders_trades table (from ${allTrades.length} total trades)`)
  
  // Use ALL condition_ids from top5_traders_trades (not just first 1000)
  // We want to classify all markets related to these trades
  const selectedConditionIds = conditionIds
  console.log(`📋 Will classify all ${selectedConditionIds.length} unique markets from top5_traders_trades`)
  
  // Step 4: Get market data (batch query to handle large arrays)
  console.log(`📥 Fetching market data in batches...`)
  let allMarkets = []
  const queryBatchSize = 200
  
  // First, get markets from top traders' condition_ids
  for (let i = 0; i < selectedConditionIds.length; i += queryBatchSize) {
    const batch = selectedConditionIds.slice(i, i + queryBatchSize)
    let query = supabase
      .from('markets')
      .select('condition_id, title, description, tags')
      .in('condition_id', batch)
    
    // If SKIP_EXISTING, only get unclassified markets
    if (SKIP_EXISTING) {
      query = query.or('market_type.is.null,market_subtype.is.null,bet_structure.is.null')
    }
    
    const { data: markets, error: marketsError } = await query
    
    if (marketsError) {
      throw new Error(`Failed to get markets batch ${Math.floor(i/queryBatchSize) + 1}: ${marketsError.message}`)
    }
    
    if (markets) {
      allMarkets = allMarkets.concat(markets)
    }
  }
  
  console.log(`✅ Retrieved ${allMarkets.length} markets from top traders' trades`)
  
  // If SKIP_EXISTING, filter out already classified markets
  if (SKIP_EXISTING) {
    const unclassifiedMarkets = allMarkets.filter(m => 
      !m.market_type || !m.market_subtype || !m.market_structure
    )
    console.log(`⏭️  Filtered to ${unclassifiedMarkets.length} unclassified markets (skipping ${allMarkets.length - unclassifiedMarkets.length} already classified)`)
    allMarkets = unclassifiedMarkets
  }
  
  const markets = allMarkets
  console.log(`✅ Total markets for classification: ${markets.length} (all markets from top5_traders_trades that exist in markets table)`)
  
  // Step 5: Classify in batches (with parallel processing)
  console.log(`\n🔍 Step 4: Classifying ${markets.length} markets using Gemini...`)
  console.log(`📦 Batch size: ${BATCH_SIZE}, Parallel batches: ${PARALLEL_BATCHES}, Sleep: ${SLEEP_MS}ms`)
  
  let processed = 0
  let updated = 0
  const allClassifications = []
  const totalBatches = Math.ceil(markets.length / BATCH_SIZE)
  
  // Process batches in parallel groups
  for (let i = 0; i < markets.length; i += BATCH_SIZE * PARALLEL_BATCHES) {
    const parallelGroup = []
    
    // Create parallel batch group
    for (let j = 0; j < PARALLEL_BATCHES && (i + j * BATCH_SIZE) < markets.length; j++) {
      const batchStart = i + j * BATCH_SIZE
      const batch = markets.slice(batchStart, batchStart + BATCH_SIZE)
      const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1
      
      if (batch.length > 0) {
        parallelGroup.push({ batch, batchNum, batchStart })
      }
    }
    
    if (parallelGroup.length === 0) break
    
    console.log(`\n📦 Processing ${parallelGroup.length} batches in parallel (batches ${parallelGroup[0].batchNum}-${parallelGroup[parallelGroup.length - 1].batchNum}/${totalBatches})...`)
    
    // Process all batches in this group concurrently
    const results = await Promise.allSettled(
      parallelGroup.map(async ({ batch, batchNum }) => {
        try {
          const classifications = await classifyBatch(batch)
          
          // Validate classifications match batch size
          if (classifications.length !== batch.length) {
            console.warn(`  ⚠️  Batch ${batchNum}: Expected ${batch.length} classifications, got ${classifications.length}`)
            const batchConditionIds = new Set(batch.map(m => m.condition_id))
            const validClassifications = classifications.filter(c => batchConditionIds.has(c.condition_id))
            
            if (validClassifications.length === 0) {
              throw new Error(`No valid classifications for batch ${batchNum}`)
            }
            
            return { batchNum, classifications: validClassifications, batch }
          }
          
          return { batchNum, classifications, batch }
        } catch (error) {
          console.error(`  ❌ Batch ${batchNum} failed:`, error.message)
          throw { batchNum, error }
        }
      })
    )
    
    // Process results and update database
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { batchNum, classifications, batch } = result.value
        
        try {
          await updateMarketClassifications(classifications)
          allClassifications.push(...classifications)
          processed += batch.length
          updated += classifications.length
          console.log(`  ✅ Batch ${batchNum}: Updated ${classifications.length} markets`)
        } catch (error) {
          console.error(`  ❌ Batch ${batchNum} database update failed:`, error.message)
        }
      } else {
        const { batchNum, error } = result.reason
        console.error(`  ❌ Batch ${batchNum} failed:`, error?.message || result.reason)
      }
    }
    
    // Small delay between parallel groups to avoid overwhelming the API
    if (i + BATCH_SIZE * PARALLEL_BATCHES < markets.length) {
      await sleep(SLEEP_MS)
    }
  }
  
  // Save results
  const outputFile = path.resolve(process.cwd(), 'top5_traders_classifications.json')
  fs.writeFileSync(outputFile, JSON.stringify(allClassifications, null, 2))
  
  console.log('\n' + '='.repeat(60))
  console.log('✨ Classification Test Complete')
  console.log('='.repeat(60))
  console.log(`📊 Processed: ${processed} markets`)
  console.log(`✅ Updated: ${updated} markets`)
  console.log(`💾 Results saved to: ${outputFile}`)
  console.log('='.repeat(60))
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  console.error(error.stack)
  process.exit(1)
})
