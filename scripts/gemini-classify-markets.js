#!/usr/bin/env node
'use strict'

/**
 * Classify markets using Google Gemini API
 * 
 * This script uses Gemini 1.5 Flash to classify all markets in the database,
 * overwriting any existing classifications. The results are stored in the
 * markets table and also saved to a JSON file for analysis.
 * 
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   GEMINI_API_KEY
 * 
 * Optional env:
 *   BATCH_SIZE (default 50, number of markets per Gemini API call)
 *   DB_BATCH_SIZE (default 100, number of markets to fetch from DB at once)
 *   SLEEP_MS (default 1000, sleep between API calls to respect rate limits)
 *   LIMIT (optional, limit number of markets to process)
 *   OUTPUT_FILE (default ./gemini-classifications.json, where to save raw results)
 * 
 * Usage:
 *   node scripts/gemini-classify-markets.js
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
// Use gemini-2.0-flash-001 (cost-efficient) or gemini-2.5-flash-lite for even lower cost
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.0-flash-001'
const model = genAI.getGenerativeModel({ model: MODEL_NAME })

const GEMINI_BATCH_SIZE = Math.max(1, parseInt(process.env.BATCH_SIZE) || 50) // Back to 50 - was working reliably
const DB_BATCH_SIZE = Math.max(1, parseInt(process.env.DB_BATCH_SIZE) || 100) // Back to 100 - was working reliably
const SLEEP_MS = Math.max(0, parseInt(process.env.SLEEP_MS) || 2000) // Increased to 2s to avoid rate limits
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT) : null
const SKIP_EXISTING = process.env.SKIP_EXISTING !== 'false' // Default to true - skip markets with existing classifications
const OUTPUT_FILE = process.env.OUTPUT_FILE || path.resolve(process.cwd(), 'gemini-classifications.json')
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 5000 // 5 seconds for rate limit retries

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Format tags for display in prompt
 */
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

/**
 * Format market data for Gemini prompt
 */
function formatMarketForPrompt(market) {
  const parts = []
  if (market.title) parts.push(`Title: ${market.title}`)
  if (market.description) parts.push(`Description: ${market.description}`)
  const tagsStr = formatTags(market.tags)
  if (tagsStr) parts.push(`Tags: ${tagsStr}`)
  return `${market.condition_id}|${parts.join(' | ')}`
}

/**
 * Build the classification prompt
 */
function buildPrompt(markets) {
  const marketsText = markets.map(formatMarketForPrompt).join('\n')
  
  return `Role: You are a Deterministic Heuristic Classifier for Prediction Markets. Your goal is to map Polymarket data to a standardized taxonomy with 95%+ accuracy.

Classification Schema:
market_type: [Crypto, Sports, Politics, Finance, Economics, Culture, Tech, Science, Weather]
market_subtype: [Specific League (e.g., NBA, EPL), Specific Asset (e.g., Bitcoin, AAPL), or Specific Domain (e.g., Geopolitics, Awards)]
bet_structure: [Binary, Spread, Over_Under, Moneyline, Up_Down, Price_Target, Mentions, Multi_Outcome, Prop]

Heuristic Logic (Precedence Rules - CHECK IN THIS ORDER):
1. Identify League/Entity First: If the title/tags contain leagues (NBA, NFL, NHL, EPL, UCL, La Liga, ATP, UFC, NCAA) or tickers (AAPL, TSLA, BTC, ETH), assign the subtype and type immediately.

2. Determine Bet Structure (CHECK IN THIS EXACT ORDER - most specific first):
   
   a) Up_Down: Title contains "up or down" or "up/down" (case insensitive).
      Examples: "Bitcoin Up or Down", "XRP Up or Down - January 26", "Ethereum up or down"
      CRITICAL: This is NEVER Spread, even if it has numbers or dates!
   
   b) Spread: Title explicitly contains "spread:" or "Spread:" (with colon) followed by a number with +/- 
      OR format "Team Name (X.X)" where X.X is a spread number with +/- (must have +/- sign).
      OR "1H Spread:", "2H Spread:", "First Half Spread:", "Second Half Spread:".
      Examples: "Spread: Hawks (-4.5)", "Spread: Padres (-1.5)", "1H Spread: Raptors (-4.5)", "Lakers (-7.5)"
      CRITICAL: If title says "Spread:" (with colon), it's ALWAYS Spread, regardless of other patterns!
      CRITICAL: Check this BEFORE Over_Under - "Spread:" takes precedence over "o/u" patterns!
      CRITICAL: "vs." alone is NOT Spread! Must explicitly say "spread:" or have (+/-X.X) format.
      CRITICAL: Numbers without +/- in parentheses are NOT spreads (e.g., "Team (227.5)" is Over_Under)
      CRITICAL: "Spread: Team (X.X)" where X.X has +/- is Spread, even if it also mentions other bet types
   
   c) Multi_Outcome: Title contains "between X and Y" (e.g., "between $220 and $230", "between 10 and 15", "between 84-85°F") 
      OR asks "which" with multiple named options OR "exactly X" OR "X or Y" (two specific options).
      Examples: "Will price be between $94,000 and $96,000?", "Which team will win?", "Will it be exactly 10?"
      Note: "between X and Y" is Multi_Outcome, NOT Binary or Yes/No!
      Note: "X or Y" with two specific named options is Multi_Outcome (e.g., "Will Bitcoin hit $90k or $100k first?")
   
   d) Price_Target: Title contains "hit $", "reach $", "close above", "close at", "settle over", "finish above", 
      "finish at", "be above", "be greater than", "crosses", "at least" with a dollar amount ($X, $X,XXX format).
      Examples: "Will Bitcoin reach $67,500?", "Will Ethereum close above $4000?", "Will AAPL close at $310?"
      Also includes: "Will [stock] finish week above $X?", "Will [crypto] hit $X before [date]?"
      CRITICAL: These are Price_Target, NOT Binary or Yes/No!
   
   e) Over_Under: Title contains "o/u", "over/under", "O/U", "total" with a number, OR team totals, OR "X+ [thing] scored?"
      OR "more than X" / "less than X" with a number, OR "X+ Goals", "X+ Points".
      Examples: "Lakers vs Warriors: O/U 227.5", "Total points o/u 50", "Total sets o/u 3.5"
      Examples: "3+ Goals Scored?", "Will there be more than 10 goals?", "Nets vs. Mavericks: 1H O/U 114.5"
      Examples: "Timberwolves vs. Warriors: O/U 227.5", "Pistons vs. 76ers: O/U 233.5"
      CRITICAL: If title says "Spread:" (with colon), Spread was already checked above - don't classify as Over_Under!
      CRITICAL: Team totals (Team A vs Team B: O/U X) are Over_Under, NOT Prop!
      CRITICAL: "[Team] vs [Team]: O/U X" format is ALWAYS Over_Under, even if it has a colon!
      CRITICAL: "X+ Goals/Points Scored?" is Over_Under, NOT Binary!
      CRITICAL: Check this BEFORE Prop - team totals take precedence over player props!
      Note: Half markets (1H, 2H) with O/U are still Over_Under
      Note: The colon (:) in "[Team] vs [Team]: O/U" is NOT the same as "[Player]: [Stat]" - team vs team is Over_Under!
   
   f) Prop: Title format is "[Player Name]: [Stat] o/u" or "[Player Name]: [Stat] Over/Under" 
      OR contains a player name followed by a stat (points, rebounds, assists, yards, goals, etc.) with o/u.
      Examples: "Chet Holmgren: points o/u", "Zion Williamson: Rebounds O/U 5.5", "Player Name: Assists Over 6.5"
      Examples: "Bam Adebayo: Points O/U 18.5", "Isaiah Collier: Assists Over 6.5"
      CRITICAL: Must have format "[Player Name]: [Stat]" with a colon (:) separating player name from stat!
      CRITICAL: If it's a TEAM total (e.g., "Lakers vs Warriors: O/U 227.5"), it's Over_Under, NOT Prop!
      CRITICAL: If it says "Spread:" it's Spread, NOT Prop!
      CRITICAL: If it starts with "Will" and doesn't have "[Player]: [Stat]" format, it's Binary, NOT Prop!
      CRITICAL: Player props are ONLY individual player statistics, NOT team totals or game outcomes!
      Note: Player props have a colon (:) separating player name from stat
      Note: Common stats: points, rebounds, assists, yards, goals, saves, strikeouts, home runs, etc.
   
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
1. "Spread:" (with colon) = ALWAYS Spread (highest priority, even if other patterns present)
2. "Up or Down" = ALWAYS Up_Down (never Spread, even with numbers/dates)
3. "vs." without "spread/o/u" = Moneyline (never Spread)
4. "vs." asking "will X win?" or "end in draw?" = Binary (not Moneyline)
5. "Will X reach $Y?" = Price_Target (not Binary/Yes/No)
6. "Will X be between Y and Z?" = Multi_Outcome (not Binary/Yes/No)
7. "[Player Name]: [Stat] o/u" = Prop (colon separates PLAYER NAME from STAT, e.g., "Zion Williamson: Points O/U")
8. "[Team] vs [Team]: O/U X" = Over_Under (colon is between teams, NOT player:stat - this is team total, NOT Prop!)
9. "Spread:" = Spread (not Prop, not Over_Under)
10. "Will [anything]?" without "[Player]: [Stat]" = Binary (not Prop)
9. "X+ Goals/Points Scored?" = Over_Under (not Binary)
10. "1H/2H" with O/U = Over_Under (half markets are still Over_Under)
11. Numbers in parentheses with +/- = Spread (e.g., "(-4.5)")
12. Numbers in parentheses without +/- = Over_Under (e.g., "(227.5)")
13. "Which [thing]?" = Multi_Outcome (asks to choose from options)
14. "Will [person] say/mention/post?" = Mentions (not Binary)
3. Conflict Resolution:
   - A "Trump" market about "Crypto" is Politics unless it specifically tracks a coin price (then Crypto).
   - An "Elon Musk" market about "SpaceX" is Tech.
   - An "Elon Musk" market about "Tweets" is Culture.
   - Markets about "Netflix (NFLX)" are Finance (stock ticker), not Entertainment.
   - Markets with stock tickers (AAPL, TSLA, MSFT, etc.) are Finance, not Tech (unless about tech products).
   - Temperature/weather markets are Weather type.
   - Economic data (jobs, inflation, unemployment) are Economics type.
   - Markets asking "will X win [award]?" are Culture (Awards subtype).

Taxonomy Reference (Keywords):
Sports Subtypes: NBA, NFL, Soccer (EPL, UCL, MLS, AFCON), NHL, Tennis (ATP, WTA), MMA (UFC), NCAA_Basketball, NCAA_Football, Cricket (IPL, T20), F1, College Football (CFB), College Basketball.
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

/**
 * Parse Gemini response and extract JSON
 */
function parseGeminiResponse(result) {
  try {
    const text = result.response.text()
    // Try to extract JSON from the response (might have markdown code blocks)
    let jsonText = text.trim()
    
    // Remove markdown code blocks if present (handle ```json or just ```)
    if (jsonText.includes('```')) {
      // Find all code block markers
      const codeBlockRegex = /```(?:json)?\s*\n?/g
      jsonText = jsonText.replace(codeBlockRegex, '')
    }
    
    // Remove leading/trailing whitespace
    jsonText = jsonText.trim()
    
    // Find the JSON array (might have text before/after)
    const jsonStart = jsonText.indexOf('[')
    const jsonEnd = jsonText.lastIndexOf(']') + 1
    
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      jsonText = jsonText.substring(jsonStart, jsonEnd)
    } else {
      // Try to find any JSON structure
      const braceStart = jsonText.indexOf('{')
      if (braceStart >= 0) {
        // Might be a single object, wrap in array
        const lastBrace = jsonText.lastIndexOf('}')
        if (lastBrace > braceStart) {
          jsonText = '[' + jsonText.substring(braceStart, lastBrace + 1) + ']'
        }
      }
    }
    
    const parsed = JSON.parse(jsonText)
    if (!Array.isArray(parsed)) {
      // If it's a single object, wrap it
      return [parsed]
    }
    return parsed
  } catch (error) {
    console.error('Failed to parse Gemini response:', error.message)
    try {
      const text = result.response?.text() || 'No response text available'
      console.error('Response preview (first 1000 chars):', text.substring(0, 1000))
      console.error('Response length:', text.length)
    } catch (e) {
      console.error('Could not extract response text')
    }
    throw error
  }
}

/**
 * Classify a batch of markets using Gemini with retry logic
 */
async function classifyBatch(markets, retryCount = 0) {
  if (markets.length === 0) return []
  
  const prompt = buildPrompt(markets)
  
  try {
    const result = await model.generateContent(prompt)
    const classifications = parseGeminiResponse(result)
    
    // Validate that we got classifications for all markets
    if (classifications.length !== markets.length) {
      console.warn(`⚠️  Warning: Expected ${markets.length} classifications, got ${classifications.length}`)
    }
    
    // Map classifications by condition_id
    const classificationMap = new Map()
    for (const classification of classifications) {
      if (classification.condition_id) {
        classificationMap.set(classification.condition_id, {
          condition_id: classification.condition_id,
          market_type: classification.market_type || null,
          market_subtype: classification.market_subtype || null,
          bet_structure: classification.bet_structure || null
        })
      }
    }
    
    // Return classifications in the same order as input markets
    return markets.map(market => {
      const classification = classificationMap.get(market.condition_id)
      if (classification) {
        return classification
      }
      // Fallback if Gemini didn't return a classification
      return {
        condition_id: market.condition_id,
        market_type: null,
        market_subtype: null,
        bet_structure: null
      }
    })
  } catch (error) {
    // Handle rate limiting with exponential backoff
    if (error.message && error.message.includes('429') && retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAY_MS * Math.pow(2, retryCount)
      console.warn(`⚠️  Rate limit hit, retrying in ${delay}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`)
      await sleep(delay)
      return classifyBatch(markets, retryCount + 1)
    }
    console.error('Error classifying batch:', error.message)
    throw error
  }
}

/**
 * Update markets with classifications (batched)
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
  
  // Use upsert to batch update (will overwrite existing classifications)
  const { error } = await supabase
    .from('markets')
    .upsert(updateRows, { onConflict: 'condition_id' })
  
  if (error) {
    console.error('Error updating markets:', error.message)
    throw error
  }
}

/**
 * Main classification function
 */
async function main() {
  console.log('🚀 Starting Gemini market classification')
  console.log(`📊 Gemini batch size: ${GEMINI_BATCH_SIZE} markets per API call`)
  console.log(`📦 DB batch size: ${DB_BATCH_SIZE} markets per fetch`)
  console.log(`⏱️  Sleep between API calls: ${SLEEP_MS}ms`)
  if (LIMIT) console.log(`📊 Limit: ${LIMIT} markets`)
  if (SKIP_EXISTING) console.log(`⏭️  Skipping markets with existing classifications`)
  else console.log(`⚠️  This will OVERWRITE existing classifications`)
  console.log(`💾 Output file: ${OUTPUT_FILE}\n`)
  
  let processed = 0
  let updated = 0
  let errors = 0
  let offset = 0
  const allClassifications = []
  const allMarketsData = [] // Store market data for heuristics analysis
  
  while (true) {
    if (LIMIT && processed >= LIMIT) {
      console.log(`🛑 Reached limit of ${LIMIT} markets`)
      break
    }
    
    // Fetch batch of markets from database
    // If SKIP_EXISTING, only fetch unclassified markets
    let query = supabase
      .from('markets')
      .select('condition_id, title, description, tags, market_type, market_subtype, bet_structure')
      .order('condition_id')
    
    if (SKIP_EXISTING) {
      // Only fetch markets that are missing at least one classification field
      query = query.or('market_type.is.null,market_subtype.is.null,bet_structure.is.null')
    }
    
    query = query.range(offset, offset + DB_BATCH_SIZE - 1)
    
    const { data: markets, error } = await query
    
    if (error) {
      console.error('❌ Error fetching markets:', error.message)
      throw error
    }
    
    if (!markets || markets.length === 0) {
      console.log('✅ No more markets to process')
      break
    }
    
    console.log(`\n📦 Fetched ${markets.length} markets from database (offset: ${offset})`)
    
    // Filter out markets that already have classifications if SKIP_EXISTING is true
    const marketsToProcess = SKIP_EXISTING
      ? markets.filter(m => !m.market_type || !m.market_subtype || !m.bet_structure)
      : markets
    
    if (SKIP_EXISTING && marketsToProcess.length === 0) {
      console.log(`⏭️  All markets in this batch already have classifications, skipping...`)
      offset += DB_BATCH_SIZE
      // If we got fewer markets than requested, we've reached the end
      if (markets.length < DB_BATCH_SIZE) {
        console.log('✅ Reached end of markets')
        break
      }
      continue
    }
    
    if (SKIP_EXISTING && marketsToProcess.length < markets.length) {
      console.log(`  ⏭️  Skipping ${markets.length - marketsToProcess.length} markets (already classified)`)
    }
    
    // Process markets in batches for Gemini API
    for (let i = 0; i < marketsToProcess.length; i += GEMINI_BATCH_SIZE) {
      const batch = marketsToProcess.slice(i, i + GEMINI_BATCH_SIZE)
      const batchNum = Math.floor(i / GEMINI_BATCH_SIZE) + 1
      const totalBatches = Math.ceil(markets.length / GEMINI_BATCH_SIZE)
      
      console.log(`  🔄 Processing Gemini batch ${batchNum}/${totalBatches} (${batch.length} markets)...`)
      console.log(`     [${new Date().toISOString()}] Starting API call...`)
      
      try {
        const classifications = await classifyBatch(batch)
        console.log(`     [${new Date().toISOString()}] API call completed`)
        allClassifications.push(...classifications)
        
        // Store market data for heuristics analysis
        allMarketsData.push(...batch.map(m => ({
          condition_id: m.condition_id,
          title: m.title,
          description: m.description,
          tags: m.tags
        })))
        
        // Update database immediately after each Gemini batch
        await updateMarketClassifications(classifications)
        updated += classifications.length
        processed += batch.length
        
        console.log(`  ✅ Classified and updated ${classifications.length} markets`)
        
        // Sleep between API calls to respect rate limits
        if (SLEEP_MS > 0 && i + GEMINI_BATCH_SIZE < markets.length) {
          await sleep(SLEEP_MS)
        }
      } catch (err) {
        console.error(`  ❌ Error processing batch:`, err.message)
        errors += batch.length
        // Continue with next batch instead of failing completely
      }
    }
    
    if (markets.length < DB_BATCH_SIZE) {
      console.log('✅ Reached end of markets')
      break
    }
    
    offset += DB_BATCH_SIZE
  }
  
  // Save all classifications to JSON file
  console.log(`\n💾 Saving classifications to ${OUTPUT_FILE}...`)
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allClassifications, null, 2), 'utf8')
  console.log(`✅ Saved ${allClassifications.length} classifications`)
  
  // Also save market data for heuristics analysis
  const marketsDataFile = path.resolve(process.cwd(), 'markets_data.json')
  console.log(`💾 Saving market data to ${marketsDataFile}...`)
  fs.writeFileSync(marketsDataFile, JSON.stringify(allMarketsData, null, 2), 'utf8')
  console.log(`✅ Saved ${allMarketsData.length} market records`)
  
  console.log('\n' + '='.repeat(60))
  console.log('✨ Gemini market classification complete')
  console.log('='.repeat(60))
  console.log(`📊 Processed: ${processed} markets`)
  console.log(`✅ Updated: ${updated} markets`)
  console.log(`❌ Errors: ${errors} markets`)
  console.log(`💾 Classifications saved to: ${OUTPUT_FILE}`)
  console.log('='.repeat(60))
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  console.error(error.stack)
  process.exit(1)
})
