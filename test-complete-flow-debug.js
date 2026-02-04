/**
 * Complete step-by-step flow test to identify where it breaks
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testCompleteFlow() {
  console.log('🔍 COMPLETE FLOW DEBUG TEST\n');
  console.log('='.repeat(80));
  
  // STEP 1: Get a trade from API (simulating feed)
  console.log('\n📊 STEP 1: Fetching trade from API (feed simulation)...');
  const { data: follows } = await supabase
    .from('follows')
    .select('trader_wallet')
    .limit(1);
  
  if (!follows || follows.length === 0) {
    console.error('❌ No followed traders');
    return;
  }
  
  const wallet = follows[0].trader_wallet;
  const response = await fetch(
    `https://data-api.polymarket.com/trades?limit=1&user=${wallet}`,
    { cache: 'no-store' }
  );
  
  const trades = await response.json();
  if (!trades || trades.length === 0) {
    console.error('❌ No trades returned');
    return;
  }
  
  const trade = trades[0];
  const conditionId = trade.conditionId || trade.condition_id;
  console.log(`✅ Got trade with conditionId: ${conditionId}`);
  
  // STEP 2: Feed queries markets table (exact query from feed page)
  console.log('\n📊 STEP 2: Feed queries markets table...');
  const { data: markets, error: marketError } = await supabase
    .from('markets')
    .select('condition_id, tags, market_subtype, final_niche, bet_structure, market_type, title, raw_dome')
    .eq('condition_id', conditionId)
    .maybeSingle();
  
  if (marketError) {
    console.error('❌ Market query error:', marketError);
    return;
  }
  
  if (!markets) {
    console.log('⚠️  Market NOT in DB - feed would call ensure API');
    console.log('   This is OK - ensure API will fetch and classify');
  } else {
    console.log('✅ Market found in DB');
    console.log(`   Tags: ${JSON.stringify(markets.tags)}`);
    console.log(`   Tags type: ${typeof markets.tags}`);
    console.log(`   Tags is array: ${Array.isArray(markets.tags)}`);
    console.log(`   Tags length: ${Array.isArray(markets.tags) ? markets.tags.length : 'N/A'}`);
    console.log(`   market_subtype: ${markets.market_subtype || 'NULL'}`);
    console.log(`   final_niche: ${markets.final_niche || 'NULL'}`);
    console.log(`   bet_structure: ${markets.bet_structure || 'NULL'}`);
    
    // Check if market needs ensuring
    const hasTags = markets.tags && Array.isArray(markets.tags) && markets.tags.length > 0;
    const hasClassification = !!(markets.market_subtype || markets.final_niche);
    
    if (hasTags && !hasClassification) {
      console.log('\n⚠️  Market has tags but NO classification - feed would call ensure API');
    } else if (!hasTags) {
      console.log('\n⚠️  Market has NO tags - feed would call ensure API');
    } else {
      console.log('\n✅ Market already has classification');
    }
  }
  
  // STEP 3: Test ensure API (if market missing or unclassified)
  if (!markets || !markets.market_subtype) {
    console.log('\n📊 STEP 3: Testing ensure API...');
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    console.log(`   Calling: ${baseUrl}/api/markets/ensure?conditionId=${conditionId}`);
    
    try {
      const ensureResponse = await fetch(`${baseUrl}/api/markets/ensure?conditionId=${conditionId}`, {
        cache: 'no-store',
      });
      
      if (!ensureResponse.ok) {
        const errorText = await ensureResponse.text();
        console.error(`   ❌ Ensure API failed: ${ensureResponse.status} - ${errorText.substring(0, 200)}`);
        return;
      }
      
      const ensureData = await ensureResponse.json();
      console.log(`   ✅ Ensure API response:`);
      console.log(`      found: ${ensureData.found}`);
      console.log(`      source: ${ensureData.source}`);
      console.log(`      market.market_subtype: ${ensureData.market?.market_subtype || 'NULL'}`);
      console.log(`      market.final_niche: ${ensureData.market?.final_niche || 'NULL'}`);
      console.log(`      market.bet_structure: ${ensureData.market?.bet_structure || 'NULL'}`);
      console.log(`      market.tags: ${JSON.stringify(ensureData.market?.tags || [])}`);
      
      // Wait and check DB
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const { data: afterMarket } = await supabase
        .from('markets')
        .select('market_subtype, final_niche, bet_structure, tags')
        .eq('condition_id', conditionId)
        .maybeSingle();
      
      console.log(`\n   📋 Database AFTER ensure API:`);
      console.log(`      market_subtype: ${afterMarket?.market_subtype || 'NULL'}`);
      console.log(`      final_niche: ${afterMarket?.final_niche || 'NULL'}`);
      console.log(`      bet_structure: ${afterMarket?.bet_structure || 'NULL'}`);
      console.log(`      tags: ${JSON.stringify(afterMarket?.tags || [])}`);
      
      if (afterMarket?.market_subtype || afterMarket?.final_niche) {
        console.log(`   ✅ SUCCESS: Market was classified in DB!`);
      } else {
        console.log(`   ❌ FAILURE: Market still not classified in DB`);
        console.log(`      API said: ${ensureData.market?.market_subtype || 'NULL'}`);
        console.log(`      DB has: ${afterMarket?.market_subtype || 'NULL'}`);
      }
    } catch (err) {
      console.error(`   ❌ Ensure API error:`, err.message);
    }
  }
  
  // STEP 4: Simulate feed passing data to TradeCard
  console.log('\n📊 STEP 4: Simulating feed → TradeCard data flow...');
  const dbMarketData = markets || (await supabase.from('markets').select('*').eq('condition_id', conditionId).maybeSingle()).data;
  
  if (dbMarketData) {
    const marketSubtype = dbMarketData.market_subtype || dbMarketData.final_niche || undefined;
    const betStructure = dbMarketData.bet_structure || undefined;
    const tags = Array.isArray(dbMarketData.tags) ? dbMarketData.tags : undefined;
    
    console.log(`   Feed would pass to TradeCard:`);
    console.log(`      marketSubtype: ${marketSubtype || 'undefined'}`);
    console.log(`      betStructure: ${betStructure || 'undefined'}`);
    console.log(`      tags: ${tags ? JSON.stringify(tags) : 'undefined'}`);
    
    if (marketSubtype) {
      console.log(`   ✅ Feed has classification to pass`);
    } else {
      console.log(`   ❌ Feed has NO classification to pass`);
    }
  } else {
    console.log(`   ❌ Market not in DB - feed would pass undefined`);
  }
  
  // STEP 5: Simulate PredictionStats receiving props
  console.log('\n📊 STEP 5: Simulating PredictionStats receiving props...');
  const propMarketSubtype = dbMarketData?.market_subtype || dbMarketData?.final_niche || undefined;
  const propBetStructure = dbMarketData?.bet_structure || undefined;
  
  if (propMarketSubtype) {
    console.log(`   ✅ PredictionStats would receive:`);
    console.log(`      propMarketSubtype: ${propMarketSubtype}`);
    console.log(`      propBetStructure: ${propBetStructure || 'undefined'}`);
    console.log(`   → Would use immediately, skip DB query`);
    console.log(`   → finalNiche would be: ${propMarketSubtype.toUpperCase()}`);
  } else {
    console.log(`   ❌ PredictionStats would receive:`);
    console.log(`      propMarketSubtype: undefined`);
    console.log(`      propBetStructure: ${propBetStructure || 'undefined'}`);
    console.log(`   → Would fallback to DB query/semantic_mapping`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('🔍 FLOW ANALYSIS COMPLETE');
  console.log('='.repeat(80));
}

testCompleteFlow().catch(console.error);
