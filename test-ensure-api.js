/**
 * Test the ensure API directly to see if it's classifying markets
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

async function testEnsureAPI() {
  console.log('🧪 Testing /api/markets/ensure API\n');
  
  // Get a real trade with conditionId
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
    `https://data-api.polymarket.com/trades?limit=5&user=${wallet}`,
    { cache: 'no-store' }
  );
  
  const trades = await response.json();
  if (!trades || trades.length === 0) {
    console.error('❌ No trades returned');
    return;
  }
  
  // Test first trade
  const trade = trades[0];
  const conditionId = trade.conditionId || trade.condition_id;
  
  console.log(`\n📊 Testing conditionId: ${conditionId}`);
  
  // Check BEFORE ensure
  const { data: before } = await supabase
    .from('markets')
    .select('condition_id, market_subtype, bet_structure, market_type, tags')
    .eq('condition_id', conditionId)
    .maybeSingle();
  
  console.log('\n📋 BEFORE ensure API call:');
  console.log('  market_subtype:', before?.market_subtype || 'NULL');
  console.log('  bet_structure:', before?.bet_structure || 'NULL');
  console.log('  market_type:', before?.market_type || 'NULL');
  console.log('  tags:', before?.tags || 'NULL');
  
  // Call ensure API
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  console.log(`\n🔧 Calling ensure API: ${baseUrl}/api/markets/ensure?conditionId=${conditionId}`);
  
  const ensureResponse = await fetch(`${baseUrl}/api/markets/ensure?conditionId=${conditionId}`, {
    cache: 'no-store',
  });
  
  if (!ensureResponse.ok) {
    console.error(`❌ Ensure API returned ${ensureResponse.status}:`, await ensureResponse.text());
    return;
  }
  
  const ensureData = await ensureResponse.json();
  console.log('\n📦 Ensure API Response:');
  console.log('  market_subtype:', ensureData.market?.market_subtype || 'NULL');
  console.log('  bet_structure:', ensureData.market?.bet_structure || 'NULL');
  console.log('  market_type:', ensureData.market?.market_type || 'NULL');
  console.log('  tags:', ensureData.market?.tags || 'NULL');
  
  // Check AFTER ensure
  const { data: after } = await supabase
    .from('markets')
    .select('condition_id, market_subtype, bet_structure, market_type, tags')
    .eq('condition_id', conditionId)
    .maybeSingle();
  
  console.log('\n📋 AFTER ensure API call (checking DB):');
  console.log('  market_subtype:', after?.market_subtype || 'NULL');
  console.log('  bet_structure:', after?.bet_structure || 'NULL');
  console.log('  market_type:', after?.market_type || 'NULL');
  console.log('  tags:', after?.tags || 'NULL');
  
  if (after?.market_subtype) {
    console.log('\n✅ SUCCESS: Market was classified!');
  } else {
    console.log('\n❌ FAILURE: Market still not classified in DB');
  }
  
  // Test a few more markets
  console.log('\n\n📊 Testing 5 more markets...\n');
  for (let i = 1; i < Math.min(5, trades.length); i++) {
    const testTrade = trades[i];
    const testConditionId = testTrade.conditionId || testTrade.condition_id;
    
    const { data: market } = await supabase
      .from('markets')
      .select('condition_id, market_subtype, bet_structure, market_type, tags, title')
      .eq('condition_id', testConditionId)
      .maybeSingle();
    
    if (market) {
      console.log(`Market ${i + 1}: ${market.title?.substring(0, 50) || 'N/A'}`);
      console.log(`  conditionId: ${testConditionId.substring(0, 20)}...`);
      console.log(`  market_subtype: ${market.market_subtype || 'NULL'}`);
      console.log(`  bet_structure: ${market.bet_structure || 'NULL'}`);
      console.log(`  tags: ${market.tags ? JSON.stringify(market.tags).substring(0, 50) : 'NULL'}`);
      console.log('');
    }
  }
}

testEnsureAPI().catch(console.error);
