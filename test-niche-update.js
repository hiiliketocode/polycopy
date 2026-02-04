/**
 * Test if niche (market_subtype) is being set correctly
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

async function testNicheUpdate() {
  console.log('🧪 Testing niche (market_subtype) update\n');
  
  // Find markets with tags but no niche
  const { data: markets } = await supabase
    .from('markets')
    .select('condition_id, tags, market_subtype, title')
    .not('tags', 'is', null)
    .is('market_subtype', null)
    .limit(5);
  
  if (!markets || markets.length === 0) {
    console.log('✅ No markets found without niche');
    return;
  }
  
  console.log(`Found ${markets.length} markets without niche\n`);
  
  for (const market of markets) {
    console.log(`\n📊 Market: ${market.title?.substring(0, 60) || 'N/A'}`);
    console.log(`   conditionId: ${market.condition_id.substring(0, 30)}...`);
    console.log(`   Tags: ${JSON.stringify(market.tags)}`);
    console.log(`   market_subtype BEFORE: ${market.market_subtype || 'NULL'}`);
    
    // Call ensure API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const ensureResponse = await fetch(`${baseUrl}/api/markets/ensure?conditionId=${market.condition_id}`, {
      cache: 'no-store',
    });
    
    if (!ensureResponse.ok) {
      const errorText = await ensureResponse.text();
      console.error(`   ❌ Ensure API returned ${ensureResponse.status}:`, errorText.substring(0, 100));
      continue;
    }
    
    const ensureData = await ensureResponse.json();
    console.log(`   API Response market_subtype: ${ensureData.market?.market_subtype || 'NULL'}`);
    
    // Wait for DB update
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check database
    const { data: after } = await supabase
      .from('markets')
      .select('market_subtype')
      .eq('condition_id', market.condition_id)
      .maybeSingle();
    
    console.log(`   Database market_subtype AFTER: ${after?.market_subtype || 'NULL'}`);
    
    if (after?.market_subtype) {
      console.log(`   ✅ SUCCESS: Niche was added!`);
    } else {
      console.log(`   ❌ FAILURE: Niche still NULL in database`);
      console.log(`      API said: ${ensureData.market?.market_subtype || 'NULL'}`);
      console.log(`      DB has: ${after?.market_subtype || 'NULL'}`);
    }
  }
}

testNicheUpdate().catch(console.error);
