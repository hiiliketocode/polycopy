/**
 * Test if ensure API is saving tags correctly
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

async function testEnsureTags() {
  console.log('🧪 Testing ensure API tag saving\n');
  
  // Get a trade with a conditionId that might not be in DB
  const response = await fetch('https://data-api.polymarket.com/trades?limit=10', { cache: 'no-store' });
  const trades = await response.json();
  
  if (!trades || trades.length === 0) {
    console.error('❌ No trades');
    return;
  }
  
  // Find a market that's missing or has no tags
  for (const trade of trades) {
    const conditionId = trade.conditionId || trade.condition_id;
    if (!conditionId) continue;
    
    const { data: market } = await supabase
      .from('markets')
      .select('condition_id, tags, market_subtype')
      .eq('condition_id', conditionId)
      .maybeSingle();
    
    if (!market || !market.tags || (Array.isArray(market.tags) && market.tags.length === 0)) {
      console.log(`\n📊 Testing market: ${conditionId.substring(0, 30)}...`);
      console.log(`   Current tags in DB: ${market?.tags ? JSON.stringify(market.tags) : 'NULL'}`);
      
      // Call ensure API
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const ensureResponse = await fetch(`${baseUrl}/api/markets/ensure?conditionId=${conditionId}`, {
        cache: 'no-store',
      });
      
      if (!ensureResponse.ok) {
        console.error(`   ❌ Ensure API failed: ${ensureResponse.status}`);
        continue;
      }
      
      const ensureData = await ensureResponse.json();
      console.log(`   Ensure API response:`);
      console.log(`      tags: ${JSON.stringify(ensureData.market?.tags || [])}`);
      console.log(`      market_subtype: ${ensureData.market?.market_subtype || 'NULL'}`);
      
      // Check DB after
      await new Promise(resolve => setTimeout(resolve, 1000));
      const { data: after } = await supabase
        .from('markets')
        .select('tags, market_subtype')
        .eq('condition_id', conditionId)
        .maybeSingle();
      
      console.log(`   Database AFTER:`);
      console.log(`      tags: ${after?.tags ? JSON.stringify(after.tags) : 'NULL'}`);
      console.log(`      tags length: ${Array.isArray(after?.tags) ? after.tags.length : 'N/A'}`);
      console.log(`      market_subtype: ${after?.market_subtype || 'NULL'}`);
      
      if (after?.tags && Array.isArray(after.tags) && after.tags.length > 0) {
        console.log(`   ✅ SUCCESS: Tags were saved!`);
        break;
      } else {
        console.log(`   ❌ FAILURE: Tags were NOT saved`);
        console.log(`      API said: ${JSON.stringify(ensureData.market?.tags || [])}`);
        console.log(`      DB has: ${after?.tags ? JSON.stringify(after.tags) : 'NULL'}`);
      }
    }
  }
}

testEnsureTags().catch(console.error);
