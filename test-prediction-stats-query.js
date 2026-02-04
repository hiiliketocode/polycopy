/**
 * Test the exact query that PredictionStats uses
 * This will help identify if it's an RLS issue or data issue
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // Use anon key like browser client
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // For comparison

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

// Test with anon key (like browser client)
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Test with service key (bypasses RLS)
const supabaseService = SUPABASE_SERVICE_KEY 
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function testQuery(wallet) {
  console.log(`\n🔍 Testing wallet: ${wallet}\n`);
  
  // Test with anon key (like browser)
  console.log('📱 Testing with ANON key (browser client):');
  const { data: gAnon, error: gErrAnon } = await supabaseAnon
    .from('trader_global_stats')
    .select('*')
    .eq('wallet_address', wallet.toLowerCase())
    .maybeSingle();
  
  console.log('   Result:', {
    hasData: !!gAnon,
    error: gErrAnon ? {
      code: gErrAnon.code,
      message: gErrAnon.message,
      details: gErrAnon.details,
      hint: gErrAnon.hint,
    } : null,
    dataKeys: gAnon ? Object.keys(gAnon) : [],
    sampleData: gAnon ? {
      l_win_rate: gAnon.l_win_rate,
      d30_win_rate: gAnon.d30_win_rate,
      l_count: gAnon.l_count,
      d30_count: gAnon.d30_count,
    } : null,
  });
  
  if (gErrAnon) {
    console.log('   ❌ ANON key query FAILED - likely RLS issue');
  } else if (!gAnon) {
    console.log('   ⚠️  ANON key query returned NULL - no data or RLS blocking');
  } else {
    console.log('   ✅ ANON key query SUCCESS');
  }
  
  // Test with service key (bypasses RLS)
  if (supabaseService) {
    console.log('\n🔑 Testing with SERVICE key (bypasses RLS):');
    const { data: gService, error: gErrService } = await supabaseService
      .from('trader_global_stats')
      .select('*')
      .eq('wallet_address', wallet.toLowerCase())
      .maybeSingle();
    
    console.log('   Result:', {
      hasData: !!gService,
      error: gErrService ? {
        code: gErrService.code,
        message: gErrService.message,
      } : null,
      dataKeys: gService ? Object.keys(gService) : [],
      sampleData: gService ? {
        l_win_rate: gService.l_win_rate,
        d30_win_rate: gService.d30_win_rate,
        l_count: gService.l_count,
        d30_count: gService.d30_count,
      } : null,
    });
    
    if (gService && !gAnon) {
      console.log('   ✅ SERVICE key has data but ANON key does not → RLS POLICY ISSUE');
    } else if (gService && gAnon) {
      console.log('   ✅ Both keys work → RLS is fine');
    } else if (!gService) {
      console.log('   ❌ SERVICE key also returns NULL → No data in DB for this wallet');
    }
  }
}

async function main() {
  // Get a wallet from follows
  const { data: follows } = await supabaseAnon
    .from('follows')
    .select('trader_wallet')
    .limit(1);
  
  if (!follows || follows.length === 0) {
    console.error('❌ No followed traders');
    return;
  }
  
  const wallet = follows[0].trader_wallet;
  await testQuery(wallet);
  
  // Also test with a known wallet from the test-global-stats-query.js
  console.log('\n\n🔍 Testing with known wallet from previous test:');
  await testQuery('0xa2cced8bfae7d645f7f437fb76becf2fcbb70cbc');
}

main().catch(console.error);
