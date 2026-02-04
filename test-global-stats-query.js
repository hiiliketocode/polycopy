/**
 * Test what's actually in trader_global_stats table
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

async function testGlobalStats() {
  console.log('🔍 Testing trader_global_stats table\n');
  
  // Get a wallet from follows
  const { data: follows } = await supabase
    .from('follows')
    .select('trader_wallet')
    .limit(1);
  
  if (!follows || follows.length === 0) {
    console.error('❌ No followed traders');
    return;
  }
  
  const wallet = follows[0].trader_wallet.toLowerCase();
  console.log(`Testing wallet: ${wallet}\n`);
  
  // Query exactly like the component does
  const { data: globalStats, error } = await supabase
    .from('trader_global_stats')
    .select('*')
    .eq('wallet_address', wallet)
    .maybeSingle();
  
  if (error) {
    console.error('❌ Query error:', error);
    return;
  }
  
  if (!globalStats) {
    console.log('❌ No global stats found for this wallet');
    console.log('   This trader needs stats synced from BigQuery');
    return;
  }
  
  console.log('✅ Global stats found:');
  console.log('   All fields:', Object.keys(globalStats));
  console.log('\n   Field values:');
  Object.keys(globalStats).forEach(key => {
    const value = globalStats[key];
    console.log(`      ${key}: ${value} (type: ${typeof value})`);
  });
  
  // Test what pickNumber would extract
  const pickNumber = (...values) => {
    for (const v of values) {
      const n = typeof v === 'string' ? Number(v) : v;
      if (n !== null && n !== undefined && Number.isFinite(n)) return n;
    }
    return null;
  };
  
  console.log('\n📊 What component would extract:');
  const globalWinRate = pickNumber(
    globalStats.d30_win_rate, globalStats.D30_win_rate,
    globalStats.l_win_rate, globalStats.L_win_rate,
    globalStats.recent_win_rate,
    globalStats.global_win_rate,
  );
  console.log(`   globalWinRate: ${globalWinRate}`);
  
  const globalRoiPct = pickNumber(
    globalStats.d30_total_roi_pct, globalStats.D30_total_roi_pct,
    globalStats.l_total_roi_pct, globalStats.L_total_roi_pct,
    globalStats.global_roi_pct,
  );
  console.log(`   globalRoiPct: ${globalRoiPct}`);
  
  const globalTradeCount = pickNumber(
    globalStats.d30_count, globalStats.D30_count,
    globalStats.l_count, globalStats.L_count,
    globalStats.total_lifetime_trades,
  );
  console.log(`   globalTradeCount: ${globalTradeCount}`);
  
  const globalAvgTradeSizeUsd = pickNumber(
    globalStats.d30_avg_trade_size_usd, globalStats.D30_avg_trade_size_usd,
    globalStats.l_avg_trade_size_usd, globalStats.L_avg_trade_size_usd,
    globalStats.avg_bet_size_usdc,
  );
  console.log(`   globalAvgTradeSizeUsd: ${globalAvgTradeSizeUsd}`);
  
  console.log('\n✅ Summary:');
  if (globalWinRate !== null || globalRoiPct !== null || globalTradeCount !== null) {
    console.log('   ✅ Component CAN extract data');
  } else {
    console.log('   ❌ Component CANNOT extract data - all fields are null/missing');
    console.log('   → Trader needs stats synced from BigQuery');
  }
}

testGlobalStats().catch(console.error);
