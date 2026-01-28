#!/usr/bin/env node
'use strict'

/**
 * Analyze market classifications to find potential misclassifications
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false }
  }
)

async function analyze() {
  console.log('🔍 Analyzing market classifications for potential issues...\n')
  
  // 1. Check bet_structure issues
  console.log('1️⃣  BET_STRUCTURE Analysis:')
  
  const { data: upDownAsSpread } = await supabase
    .from('markets')
    .select('title, bet_structure')
    .eq('bet_structure', 'Spread')
    .ilike('title', '%up or down%')
    .limit(5)
  
  const { data: vsAsSpread } = await supabase
    .from('markets')
    .select('title, bet_structure')
    .eq('bet_structure', 'Spread')
    .or('title.ilike.%vs.%,title.ilike.%versus%')
    .not('title', 'ilike', '%spread%')
    .limit(5)
  
  const { data: shouldBeUpDown } = await supabase
    .from('markets')
    .select('title, bet_structure')
    .ilike('title', '%up or down%')
    .neq('bet_structure', 'Up_Down')
    .limit(10)
  
  const { data: shouldBeMoneyline } = await supabase
    .from('markets')
    .select('title, bet_structure')
    .or('title.ilike.%vs.%,title.ilike.%versus%')
    .not('title', 'ilike', '%spread%')
    .not('title', 'ilike', '%o/u%')
    .not('title', 'ilike', '%over/under%')
    .neq('bet_structure', 'Moneyline')
    .limit(10)
  
  const { data: shouldBeOverUnder } = await supabase
    .from('markets')
    .select('title, bet_structure')
    .or('title.ilike.%o/u%,title.ilike.%over/under%,title.ilike.%total%')
    .not('bet_structure', 'in', '(Over_Under,Over/Under)')
    .limit(10)
  
  const { data: shouldBeProp } = await supabase
    .from('markets')
    .select('title, bet_structure')
    .or('title.ilike.%: points%,title.ilike.%: rebounds%,title.ilike.%: assists%,title.ilike.%: yards%')
    .neq('bet_structure', 'Prop')
    .limit(10)
  
  const { data: shouldBePriceTarget } = await supabase
    .from('markets')
    .select('title, bet_structure')
    .or('title.ilike.%hit $%,title.ilike.%reach $%,title.ilike.%close above%,title.ilike.%settle over%')
    .neq('bet_structure', 'Price_Target')
    .limit(10)
  
  console.log('  ❌ "Up or Down" classified as Spread:', upDownAsSpread?.length || 0)
  if (upDownAsSpread?.length > 0) {
    upDownAsSpread.forEach(m => console.log(`     - ${m.title.substring(0, 70)}`))
  }
  
  console.log('  ❌ "vs." (no spread) classified as Spread:', vsAsSpread?.length || 0)
  if (vsAsSpread?.length > 0) {
    vsAsSpread.forEach(m => console.log(`     - ${m.title.substring(0, 70)}`))
  }
  
  console.log('  ❌ "Up or Down" markets NOT classified as Up_Down:', shouldBeUpDown?.length || 0)
  if (shouldBeUpDown?.length > 0) {
    shouldBeUpDown.forEach(m => console.log(`     - ${m.title.substring(0, 70)} → ${m.bet_structure}`))
  }
  
  console.log('  ❌ "vs." markets NOT classified as Moneyline:', shouldBeMoneyline?.length || 0)
  if (shouldBeMoneyline?.length > 0) {
    shouldBeMoneyline.forEach(m => console.log(`     - ${m.title.substring(0, 70)} → ${m.bet_structure}`))
  }
  
  console.log('  ❌ "o/u" markets NOT classified as Over_Under:', shouldBeOverUnder?.length || 0)
  if (shouldBeOverUnder?.length > 0) {
    shouldBeOverUnder.forEach(m => console.log(`     - ${m.title.substring(0, 70)} → ${m.bet_structure}`))
  }
  
  console.log('  ❌ Player stat markets NOT classified as Prop:', shouldBeProp?.length || 0)
  if (shouldBeProp?.length > 0) {
    shouldBeProp.forEach(m => console.log(`     - ${m.title.substring(0, 70)} → ${m.bet_structure}`))
  }
  
  console.log('  ❌ Price target markets NOT classified as Price_Target:', shouldBePriceTarget?.length || 0)
  if (shouldBePriceTarget?.length > 0) {
    shouldBePriceTarget.forEach(m => console.log(`     - ${m.title.substring(0, 70)} → ${m.bet_structure}`))
  }
  
  // 2. Check market_type issues
  console.log('\n2️⃣  MARKET_TYPE Analysis:')
  
  const { data: cryptoAsOther } = await supabase
    .from('markets')
    .select('title, market_type')
    .or('title.ilike.%bitcoin%,title.ilike.%btc%,title.ilike.%ethereum%,title.ilike.%eth%,title.ilike.%crypto%')
    .not('market_type', 'eq', 'Crypto')
    .limit(10)
  
  const { data: sportsAsOther } = await supabase
    .from('markets')
    .select('title, market_type')
    .or('title.ilike.%nba%,title.ilike.%nfl%,title.ilike.%soccer%,title.ilike.%football%,title.ilike.%basketball%')
    .not('market_type', 'eq', 'Sports')
    .limit(10)
  
  console.log('  ❌ Crypto keywords NOT classified as Crypto:', cryptoAsOther?.length || 0)
  if (cryptoAsOther?.length > 0) {
    cryptoAsOther.forEach(m => console.log(`     - ${m.title.substring(0, 70)} → ${m.market_type}`))
  }
  
  console.log('  ❌ Sports keywords NOT classified as Sports:', sportsAsOther?.length || 0)
  if (sportsAsOther?.length > 0) {
    sportsAsOther.forEach(m => console.log(`     - ${m.title.substring(0, 70)} → ${m.market_type}`))
  }
  
  // 3. Get overall distribution
  console.log('\n3️⃣  Overall Distribution:')
  
  const { data: allMarkets } = await supabase
    .from('markets')
    .select('market_type, market_subtype, bet_structure')
    .not('market_type', 'is', null)
  
  const typeCounts = {}
  const betCounts = {}
  
  allMarkets.forEach(m => {
    typeCounts[m.market_type] = (typeCounts[m.market_type] || 0) + 1
    betCounts[m.bet_structure] = (betCounts[m.bet_structure] || 0) + 1
  })
  
  console.log('  Market Types:')
  Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`     ${type}: ${count}`)
  })
  
  console.log('  Bet Structures:')
  Object.entries(betCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`     ${type}: ${count}`)
  })
  
  // 4. Find markets with suspicious patterns
  console.log('\n4️⃣  Suspicious Classifications:')
  
  const { data: suspicious } = await supabase
    .from('markets')
    .select('title, market_type, bet_structure')
    .not('market_type', 'is', null)
    .not('bet_structure', 'is', null)
    .or('title.ilike.%will%,title.ilike.%is%,title.ilike.%does%')
    .neq('bet_structure', 'Binary')
    .limit(20)
  
  console.log('  Markets starting with "Will/Is/Does" but NOT Binary:', suspicious?.length || 0)
  if (suspicious?.length > 0) {
    suspicious.forEach(m => {
      console.log(`     - ${m.title.substring(0, 70)}`)
      console.log(`       Type: ${m.market_type}, Bet: ${m.bet_structure}`)
    })
  }
}

analyze().catch(console.error)
