/**
 * Test end-to-end: Feed -> Ensure -> PredictionStats flow
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

async function testEndToEnd() {
  console.log('🧪 Testing End-to-End Niche Flow\n');
  console.log('='.repeat(80));
  
  // Step 1: Get a trade from API (simulating feed page)
  console.log('\n📊 STEP 1: Fetching trade from API...');
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
  
  // Step 2: Check market in DB (simulating feed page STEP 2)
  console.log('\n📊 STEP 2: Checking market in database (feed page logic)...');
  const { data: market } = await supabase
    .from('markets')
    .select('condition_id, tags, market_subtype, bet_structure, market_type')
    .eq('condition_id', conditionId)
    .maybeSingle();
  
  if (!market) {
    console.log('⚠️  Market not in DB - feed would call ensure API');
  } else {
    console.log('✅ Market found in DB');
    console.log(`   Tags: ${JSON.stringify(market.tags)}`);
    console.log(`   market_subtype: ${market.market_subtype || 'NULL'}`);
    console.log(`   bet_structure: ${market.bet_structure || 'NULL'}`);
    
    // Step 2.5: Feed logic - if market exists but no classification, ensure it
    if (market.tags && (!market.market_subtype || market.market_subtype === null)) {
      console.log('\n📊 STEP 2.5: Market has tags but NO classification - feed would ensure...');
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const ensureResponse = await fetch(`${baseUrl}/api/markets/ensure?conditionId=${conditionId}`, {
        cache: 'no-store',
      });
      
      if (ensureResponse.ok) {
        const ensureData = await ensureResponse.json();
        console.log(`   ✅ Ensure API response:`, {
          market_subtype: ensureData.market?.market_subtype || 'NULL',
          bet_structure: ensureData.market?.bet_structure || 'NULL',
          source: ensureData.source,
        });
        
        // Check DB again
        await new Promise(resolve => setTimeout(resolve, 500));
        const { data: afterMarket } = await supabase
          .from('markets')
          .select('market_subtype, bet_structure')
          .eq('condition_id', conditionId)
          .maybeSingle();
        
        console.log(`   Database after ensure:`, {
          market_subtype: afterMarket?.market_subtype || 'NULL',
          bet_structure: afterMarket?.bet_structure || 'NULL',
        });
        
        if (afterMarket?.market_subtype) {
          console.log(`   ✅ SUCCESS: Market was classified!`);
        } else {
          console.log(`   ❌ FAILURE: Market still not classified in DB`);
        }
      } else {
        const errorText = await ensureResponse.text();
        console.error(`   ❌ Ensure API failed: ${ensureResponse.status} - ${errorText.substring(0, 100)}`);
      }
    } else if (!market.tags || market.tags.length === 0) {
      console.log('⚠️  Market has no tags - would trigger ensure');
    } else {
      console.log('✅ Market already has classification');
    }
  }
  
  // Step 3: Simulate PredictionStats reading (final check)
  console.log('\n📊 STEP 3: Simulating PredictionStats component...');
  const { data: finalMarket } = await supabase
    .from('markets')
    .select('market_subtype, bet_structure')
    .eq('condition_id', conditionId)
    .maybeSingle();
  
  console.log('PredictionStats would see:');
  console.log(`   market_subtype: ${finalMarket?.market_subtype || 'NULL'} (this becomes "niche")`);
  console.log(`   bet_structure: ${finalMarket?.bet_structure || 'NULL'}`);
  
  if (finalMarket?.market_subtype) {
    console.log(`\n✅ FINAL RESULT: Niche would show as "${finalMarket.market_subtype}" (not "other")`);
  } else {
    console.log(`\n❌ FINAL RESULT: Niche would show as "other" (market_subtype is NULL)`);
  }
  
  console.log('\n' + '='.repeat(80));
}

testEndToEnd().catch(console.error);
