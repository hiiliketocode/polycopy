/**
 * Test script to debug feed flow step by step
 * Run with: node test-feed-flow.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing Supabase credentials');
  console.error('SUPABASE_URL:', !!SUPABASE_URL);
  console.error('SUPABASE_SERVICE_ROLE_KEY:', !!SUPABASE_SERVICE_ROLE_KEY);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testStep1_FetchTrades() {
  console.log('\n=== STEP 1: Fetch trades from API ===');
  try {
    // Get a sample wallet from follows
    const { data: follows } = await supabase
      .from('follows')
      .select('trader_wallet')
      .limit(1);
    
    if (!follows || follows.length === 0) {
      console.log('❌ No followed traders found');
      return null;
    }
    
    const wallet = follows[0].trader_wallet;
    console.log(`Fetching trades for wallet: ${wallet}`);
    
    const response = await fetch(
      `https://data-api.polymarket.com/trades?limit=5&user=${wallet}`,
      { cache: 'no-store' }
    );
    
    if (!response.ok) {
      console.log(`❌ API returned ${response.status}`);
      return null;
    }
    
    const trades = await response.json();
    console.log(`✅ Fetched ${trades.length} trades`);
    
    const conditionIds = trades
      .map(t => t.conditionId || t.condition_id)
      .filter(id => id && typeof id === 'string' && id.startsWith('0x'));
    
    console.log(`Extracted ${conditionIds.length} conditionIds:`, conditionIds.slice(0, 3));
    
    return { trades, conditionIds };
  } catch (err) {
    console.error('❌ Error:', err);
    return null;
  }
}

async function testStep2_QueryMarkets(conditionIds) {
  console.log('\n=== STEP 2: Query markets table ===');
  if (!conditionIds || conditionIds.length === 0) {
    console.log('❌ No conditionIds to query');
    return null;
  }
  
  try {
    const { data: markets, error } = await supabase
      .from('markets')
      .select('condition_id, tags, market_subtype, bet_structure, market_type, title, raw_dome')
      .in('condition_id', conditionIds.slice(0, 10));
    
    if (error) {
      console.error('❌ Query error:', error);
      return null;
    }
    
    console.log(`✅ Found ${markets.length} markets in DB`);
    
    markets.forEach(market => {
      console.log(`\nMarket ${market.condition_id}:`, {
        hasTags: !!market.tags,
        tagsType: typeof market.tags,
        tagsIsArray: Array.isArray(market.tags),
        tagsLength: Array.isArray(market.tags) ? market.tags.length : 0,
        tags: market.tags,
        hasRawDome: !!market.raw_dome,
        market_subtype: market.market_subtype,
        bet_structure: market.bet_structure,
      });
    });
    
    const missing = conditionIds.filter(id => !markets.find(m => m.condition_id === id));
    console.log(`\nMissing markets: ${missing.length}`, missing.slice(0, 3));
    
    return { markets, missing };
  } catch (err) {
    console.error('❌ Error:', err);
    return null;
  }
}

async function testStep3_EnsureMarket(conditionId) {
  console.log(`\n=== STEP 3: Test /api/markets/ensure for ${conditionId} ===`);
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/markets/ensure?conditionId=${conditionId}`, {
      cache: 'no-store',
    });
    
    if (!response.ok) {
      console.error(`❌ Ensure API returned ${response.status}`);
      const text = await response.text();
      console.error('Response:', text);
      return null;
    }
    
    const data = await response.json();
    console.log('✅ Ensure API response:', {
      found: data.found,
      source: data.source,
      market: data.market ? {
        hasTags: !!data.market.tags,
        tagsType: typeof data.market.tags,
        tagsIsArray: Array.isArray(data.market.tags),
        tags: data.market.tags,
        market_subtype: data.market.market_subtype,
        bet_structure: data.market.bet_structure,
      } : null,
    });
    
    return data;
  } catch (err) {
    console.error('❌ Error:', err);
    return null;
  }
}

async function testStep4_SemanticMapping(tags) {
  console.log(`\n=== STEP 4: Test semantic_mapping lookup ===`);
  if (!tags || tags.length === 0) {
    console.log('❌ No tags to lookup');
    return null;
  }
  
  try {
    const { data: mappings, error } = await supabase
      .from('semantic_mapping')
      .select('clean_niche, type, specificity_score, original_tag')
      .in('original_tag', tags);
    
    if (error) {
      console.error('❌ Query error:', error);
      return null;
    }
    
    console.log(`✅ Found ${mappings.length} mappings for tags:`, tags);
    mappings.forEach(m => {
      console.log(`  ${m.original_tag} -> ${m.clean_niche} (${m.type})`);
    });
    
    return mappings;
  } catch (err) {
    console.error('❌ Error:', err);
    return null;
  }
}

async function testStep5_TraderStats(wallet, niche, betStructure, priceBracket) {
  console.log(`\n=== STEP 5: Test trader stats query ===`);
  try {
    const { data: globalStats } = await supabase
      .from('trader_global_stats')
      .select('*')
      .eq('wallet_address', wallet.toLowerCase())
      .maybeSingle();
    
    const { data: profileStats } = await supabase
      .from('trader_profile_stats')
      .select('*')
      .eq('wallet_address', wallet.toLowerCase());
    
    console.log('Global stats:', globalStats ? {
      hasData: true,
      win_rate: globalStats.l_win_rate || globalStats.d30_win_rate,
      roi_pct: globalStats.l_total_roi_pct || globalStats.d30_total_roi_pct,
      trade_count: globalStats.l_count || globalStats.d30_count,
    } : 'No data');
    
    console.log(`Profile stats: ${profileStats?.length || 0} profiles`);
    if (profileStats && profileStats.length > 0) {
      const matching = profileStats.filter(p => 
        p.final_niche === niche && 
        p.bet_structure === betStructure
      );
      console.log(`Matching profiles: ${matching.length}`);
    }
    
    return { globalStats, profileStats };
  } catch (err) {
    console.error('❌ Error:', err);
    return null;
  }
}

async function runAllTests() {
  console.log('🧪 Testing Feed Flow Step by Step\n');
  
  // Step 1: Fetch trades
  const step1Result = await testStep1_FetchTrades();
  if (!step1Result) {
    console.log('\n❌ Step 1 failed, stopping tests');
    return;
  }
  
  // Step 2: Query markets
  const step2Result = await testStep2_QueryMarkets(step1Result.conditionIds);
  
  // Step 3: Test ensure for a missing market
  if (step2Result && step2Result.missing.length > 0) {
    await testStep3_EnsureMarket(step2Result.missing[0]);
  } else if (step1Result.conditionIds.length > 0) {
    // Test with first conditionId even if it exists
    await testStep3_EnsureMarket(step1Result.conditionIds[0]);
  }
  
  // Step 4: Test semantic mapping
  if (step2Result && step2Result.markets.length > 0) {
    const market = step2Result.markets[0];
    if (market.tags && Array.isArray(market.tags) && market.tags.length > 0) {
      await testStep4_SemanticMapping(market.tags);
    }
  }
  
  // Step 5: Test trader stats
  if (step1Result.trades.length > 0) {
    const trade = step1Result.trades[0];
    const wallet = trade._followedWallet || trade.user || trade.wallet;
    await testStep5_TraderStats(wallet, 'NFL', 'OVER_UNDER', 'FAVORITE');
  }
  
  console.log('\n✅ All tests completed');
}

runAllTests().catch(console.error);
