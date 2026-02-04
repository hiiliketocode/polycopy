/**
 * Test if ensure API actually updates the database
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

async function testEnsureUpdate() {
  console.log('🧪 Testing ensure API update functionality\n');
  
  // Find a market with tags but no classification
  const { data: markets } = await supabase
    .from('markets')
    .select('condition_id, tags, market_subtype, bet_structure, market_type, title')
    .not('tags', 'is', null)
    .is('market_subtype', null)
    .limit(1);
  
  if (!markets || markets.length === 0) {
    console.log('✅ No markets found without classification');
    return;
  }
  
  const market = markets[0];
  console.log(`📊 Testing market: ${market.title?.substring(0, 60) || 'N/A'}`);
  console.log(`   conditionId: ${market.condition_id}`);
  console.log(`   Tags: ${JSON.stringify(market.tags)}`);
  console.log(`   market_subtype BEFORE: ${market.market_subtype || 'NULL'}`);
  console.log(`   bet_structure BEFORE: ${market.bet_structure || 'NULL'}`);
  
  // Call ensure API
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  console.log(`\n🔧 Calling ensure API...`);
  
  const ensureResponse = await fetch(`${baseUrl}/api/markets/ensure?conditionId=${market.condition_id}`, {
    cache: 'no-store',
  });
  
  if (!ensureResponse.ok) {
    const errorText = await ensureResponse.text();
    console.error(`❌ Ensure API returned ${ensureResponse.status}:`, errorText);
    return;
  }
  
  const ensureData = await ensureResponse.json();
  console.log(`\n📦 Ensure API Response:`);
  console.log(`   market_subtype: ${ensureData.market?.market_subtype || 'NULL'}`);
  console.log(`   bet_structure: ${ensureData.market?.bet_structure || 'NULL'}`);
  console.log(`   market_type: ${ensureData.market?.market_type || 'NULL'}`);
  console.log(`   source: ${ensureData.source}`);
  
  // Wait a moment for DB to update
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Check database directly
  const { data: after } = await supabase
    .from('markets')
    .select('condition_id, market_subtype, bet_structure, market_type, tags')
    .eq('condition_id', market.condition_id)
    .maybeSingle();
  
  console.log(`\n📋 Database AFTER ensure API:`);
  console.log(`   market_subtype: ${after?.market_subtype || 'NULL'}`);
  console.log(`   bet_structure: ${after?.bet_structure || 'NULL'}`);
  console.log(`   market_type: ${after?.market_type || 'NULL'}`);
  
  if (after?.market_subtype) {
    console.log(`\n✅ SUCCESS: Market was updated in database!`);
  } else {
    console.log(`\n❌ FAILURE: Market still not updated in database`);
    console.log(`   API said: ${ensureData.market?.market_subtype || 'NULL'}`);
    console.log(`   DB has: ${after?.market_subtype || 'NULL'}`);
  }
}

testEnsureUpdate().catch(console.error);
