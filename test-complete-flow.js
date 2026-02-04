/**
 * Complete end-to-end test of feed flow
 * Tests all steps and verifies tags/data flow correctly
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

// Helper to normalize tags (same as in feed page)
const normalizeTags = (source) => {
  if (!source) return [];
  if (Array.isArray(source)) {
    return source
      .map((t) => {
        if (typeof t === 'object' && t !== null) {
          return t.name || t.tag || t.value || String(t);
        }
        return String(t);
      })
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0 && t !== 'null' && t !== 'undefined');
  }
  return [];
};

async function testCompleteFlow() {
  console.log('🧪 Testing Complete Feed Flow\n');
  console.log('='.repeat(80));
  
  // STEP 1: Get a real trade
  console.log('\n📊 STEP 1: Fetching real trade from API...');
  const { data: follows } = await supabase
    .from('follows')
    .select('trader_wallet')
    .limit(1);
  
  if (!follows || follows.length === 0) {
    console.error('❌ No followed traders');
    return false;
  }
  
  const wallet = follows[0].trader_wallet;
  const response = await fetch(
    `https://data-api.polymarket.com/trades?limit=1&user=${wallet}`,
    { cache: 'no-store' }
  );
  
  if (!response.ok) {
    console.error(`❌ API returned ${response.status}`);
    return false;
  }
  
  const trades = await response.json();
  if (!trades || trades.length === 0) {
    console.error('❌ No trades returned');
    return false;
  }
  
  const trade = trades[0];
  const conditionId = trade.conditionId || trade.condition_id;
  
  if (!conditionId || !conditionId.startsWith('0x')) {
    console.error('❌ Invalid conditionId:', conditionId);
    return false;
  }
  
  console.log(`✅ Got trade with conditionId: ${conditionId}`);
  
  // STEP 2: Query markets table
  console.log('\n📊 STEP 2: Querying markets table...');
  const { data: markets, error: marketError } = await supabase
    .from('markets')
    .select('condition_id, tags, market_subtype, bet_structure, market_type, title, raw_dome')
    .eq('condition_id', conditionId)
    .maybeSingle();
  
  if (marketError) {
    console.error('❌ Market query error:', marketError);
    return false;
  }
  
  if (!markets) {
    console.log('⚠️  Market not in DB - will test ensure API');
  } else {
    console.log('✅ Market found in DB');
    console.log('  Tags:', markets.tags);
    console.log('  Tags type:', typeof markets.tags);
    console.log('  Tags is array:', Array.isArray(markets.tags));
  }
  
  // STEP 3: Normalize tags
  console.log('\n📊 STEP 3: Normalizing tags...');
  let normalizedTags = [];
  
  if (markets?.tags) {
    normalizedTags = normalizeTags(markets.tags);
    console.log(`✅ Normalized ${normalizedTags.length} tags:`, normalizedTags);
  } else if (markets?.raw_dome) {
    try {
      const rawDome = typeof markets.raw_dome === 'string' 
        ? JSON.parse(markets.raw_dome) 
        : markets.raw_dome;
      if (rawDome?.tags) {
        normalizedTags = normalizeTags(rawDome.tags);
        console.log(`✅ Normalized ${normalizedTags.length} tags from raw_dome:`, normalizedTags);
      }
    } catch (err) {
      console.warn('⚠️  Failed to parse raw_dome:', err.message);
    }
  }
  
  if (normalizedTags.length === 0) {
    console.log('⚠️  No tags found - testing ensure API...');
    
    // Test ensure API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const ensureResponse = await fetch(`${baseUrl}/api/markets/ensure?conditionId=${conditionId}`, {
      cache: 'no-store',
    });
    
    if (ensureResponse.ok) {
      const ensureData = await ensureResponse.json();
      if (ensureData?.market?.tags) {
        normalizedTags = normalizeTags(ensureData.market.tags);
        console.log(`✅ Got tags from ensure API:`, normalizedTags);
      }
    }
  }
  
  if (normalizedTags.length === 0) {
    console.error('❌ No tags available after all attempts');
    return false;
  }
  
  // STEP 4: Test semantic mapping
  console.log('\n📊 STEP 4: Testing semantic_mapping lookup...');
  const { data: mappings, error: mappingError } = await supabase
    .from('semantic_mapping')
    .select('clean_niche, type, specificity_score, original_tag')
    .in('original_tag', normalizedTags);
  
  if (mappingError) {
    console.error('❌ Semantic mapping query error:', mappingError);
    return false;
  }
  
  if (!mappings || mappings.length === 0) {
    // Try case-insensitive
    console.log('⚠️  No case-sensitive matches, trying case-insensitive...');
    const ciQueries = normalizedTags.map(tag =>
      supabase
        .from('semantic_mapping')
        .select('clean_niche, type, specificity_score, original_tag')
        .ilike('original_tag', tag)
    );
    const ciResults = await Promise.all(ciQueries);
    
    const allMappings = [];
    for (const result of ciResults) {
      if (!result.error && result.data && result.data.length > 0) {
        allMappings.push(...result.data);
      }
    }
    
    if (allMappings.length > 0) {
      console.log(`✅ Found ${allMappings.length} case-insensitive matches`);
      mappings = allMappings;
    }
  }
  
  if (!mappings || mappings.length === 0) {
    console.error('❌ No semantic_mapping matches found');
    console.error('  Tags tried:', normalizedTags);
    console.error('  Check semantic_mapping table has entries for these tags');
    return false;
  }
  
  mappings.sort((a, b) => (a.specificity_score || 99) - (b.specificity_score || 99));
  const niche = (mappings[0].clean_niche || '').toUpperCase();
  console.log(`✅ Found niche: ${niche} from tag: ${mappings[0].original_tag}`);
  
  // STEP 5: Test trader stats
  console.log('\n📊 STEP 5: Testing trader stats query...');
  const { data: globalStats } = await supabase
    .from('trader_global_stats')
    .select('*')
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle();
  
  const { data: profileStats } = await supabase
    .from('trader_profile_stats')
    .select('*')
    .eq('wallet_address', wallet.toLowerCase());
  
  console.log('Global stats:', globalStats ? '✅ Found' : '❌ Not found');
  console.log('Profile stats:', profileStats?.length || 0, 'profiles');
  
  if (profileStats && profileStats.length > 0 && niche) {
    const matching = profileStats.filter(p => 
      p.final_niche === niche
    );
    console.log(`Matching profiles for niche ${niche}:`, matching.length);
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('✅ FLOW TEST COMPLETE');
  console.log('='.repeat(80));
  console.log(`ConditionId: ${conditionId}`);
  console.log(`Tags: ${normalizedTags.join(', ')}`);
  console.log(`Niche: ${niche || 'NOT FOUND'}`);
  console.log(`Global Stats: ${globalStats ? 'Available' : 'Missing'}`);
  console.log(`Profile Stats: ${profileStats?.length || 0} profiles`);
  
  return true;
}

testCompleteFlow()
  .then(success => {
    if (success) {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    } else {
      console.log('\n❌ Tests failed - check errors above');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('\n❌ Test error:', err);
    process.exit(1);
  });
