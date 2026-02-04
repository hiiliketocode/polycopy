/**
 * Test script to check if trades should pass fire feed thresholds
 * Tests the actual API logic against current database state
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing Supabase configuration');
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', !!serviceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Current thresholds from fire-feed API
const FIRE_WIN_RATE_THRESHOLD = 0.55;
const FIRE_ROI_THRESHOLD = 0.15;
const FIRE_CONVICTION_MULTIPLIER_THRESHOLD = 2.5;
const FIRE_TRADES_PER_TRADER = 10;

function normalizeWinRateValue(raw) {
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value > 1.01) return value / 100;
  if (value < 0) return null;
  return value;
}

function normalizeRoiValue(raw) {
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) > 10) return value / 100;
  return value;
}

function pickNumber(...values) {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'number') {
      if (Number.isFinite(v) && v > 0) return v;
      continue;
    }
    if (typeof v === 'string') {
      const num = Number(v);
      if (Number.isFinite(num) && num > 0) return num;
      continue;
    }
  }
  return null;
}

function deriveCategoryFromTrade(trade) {
  const candidates = [
    trade.category,
    trade.market_category,
    trade.marketCategory,
    trade.market?.category,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase();
    }
  }
  return undefined;
}

function winRateForTradeType(stats, category) {
  if (!stats) return null;
  
  if (category && stats.profiles && stats.profiles.length > 0) {
    const normalizedCategory = category.toLowerCase();
    const matchingProfile = stats.profiles.find((profile) => {
      const niche = (profile.final_niche || '').toLowerCase();
      if (!niche) return false;
      if (niche === normalizedCategory) return true;
      return niche.includes(normalizedCategory) || normalizedCategory.includes(niche);
    });

    if (matchingProfile) {
      const profileWinRate =
        normalizeWinRateValue(matchingProfile?.d30_win_rate) ??
        normalizeWinRateValue(matchingProfile?.win_rate);
      if (profileWinRate !== null) {
        return profileWinRate;
      }
    }
  }

  const globalWinRate = normalizeWinRateValue(stats.globalWinRate);
  return globalWinRate;
}

function roiForTradeType(stats, category) {
  if (!stats) return null;
  const normalizedCategory = category?.toLowerCase() ?? '';
  if (stats.profiles && stats.profiles.length > 0 && normalizedCategory) {
    const match = stats.profiles.find((profile) => {
      const niche = (profile.final_niche || '').toLowerCase();
      if (!niche) return false;
      if (niche === normalizedCategory) return true;
      return niche.includes(normalizedCategory);
    });
    const roi =
      match?.d30_roi_pct ??
      match?.roi_pct ??
      null;
    if (roi !== null && roi !== undefined) {
      return normalizeRoiValue(roi);
    }
  }
  if (stats.globalRoiPct !== null && stats.globalRoiPct !== undefined) {
    return normalizeRoiValue(stats.globalRoiPct);
  }
  return null;
}

function convictionMultiplierForTrade(trade, stats) {
  const size = Number(trade.shares_normalized ?? trade.size ?? trade.amount ?? 0);
  const price = Number(trade.price ?? 0);
  if (!Number.isFinite(size) || !Number.isFinite(price)) return null;
  const tradeValue = size * price;
  
  const avgBetSize = pickNumber(
    stats?.d30_avg_trade_size_usd,
    stats?.avgBetSizeUsd,
    stats?.l_avg_trade_size_usd
  );
  
  if (!avgBetSize || !Number.isFinite(avgBetSize) || avgBetSize <= 0) return null;
  
  const MAX_REASONABLE_MULTIPLIER = 5.0;
  const cappedAvgBetSize = avgBetSize > tradeValue * MAX_REASONABLE_MULTIPLIER
    ? tradeValue * MAX_REASONABLE_MULTIPLIER
    : avgBetSize;
  
  const conviction = tradeValue / cappedAvgBetSize;
  
  if (!Number.isFinite(conviction) || conviction <= 0) return null;
  
  return conviction;
}

async function main() {
  console.log('🔥 Testing Fire Feed Thresholds\n');
  console.log('Thresholds:');
  console.log(`  Win Rate: ≥ ${(FIRE_WIN_RATE_THRESHOLD * 100).toFixed(0)}%`);
  console.log(`  ROI: ≥ ${(FIRE_ROI_THRESHOLD * 100).toFixed(0)}%`);
  console.log(`  Conviction: ≥ ${FIRE_CONVICTION_MULTIPLIER_THRESHOLD}x\n`);

  // 1. Get trades from last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
  
  console.log(`📅 Querying trades since: ${thirtyDaysAgoISO}\n`);

  // Check total trades
  const { count: totalTradesCount } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true })
    .eq('side', 'BUY');
  
  console.log(`📊 Total BUY trades in database: ${totalTradesCount ?? 'unknown'}`);

  const { count: recentTradesCount } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true })
    .gte('timestamp', thirtyDaysAgoISO)
    .eq('side', 'BUY');
  
  console.log(`📊 BUY trades in last 30 days: ${recentTradesCount ?? 'unknown'}\n`);

  // Get unique wallets
  const { data: allTradesData, error: allTradesError } = await supabase
    .from('trades')
    .select('wallet_address')
    .gte('timestamp', thirtyDaysAgoISO)
    .eq('side', 'BUY')
    .limit(10000);
  
  if (allTradesError) {
    console.error('❌ Error fetching trades:', allTradesError);
    return;
  }

  const walletsSet = new Set();
  (allTradesData || []).forEach((trade) => {
    const wallet = (trade.wallet_address || '').toLowerCase();
    if (wallet) {
      walletsSet.add(wallet);
    }
  });
  
  const wallets = Array.from(walletsSet);
  console.log(`👥 Found ${wallets.length} unique traders with trades in last 30 days\n`);

  if (wallets.length === 0) {
    console.log('⚠️  No traders found. Cannot test thresholds.');
    return;
  }

  // 2. Fetch stats
  console.log('📈 Fetching trader stats...');
  const [globalsRes, profilesRes] = await Promise.all([
    supabase
      .from('trader_global_stats')
      .select('wallet_address, l_win_rate, d30_win_rate, l_total_roi_pct, d30_total_roi_pct, l_avg_trade_size_usd, d30_avg_trade_size_usd, l_avg_pos_size_usd, global_win_rate, recent_win_rate, global_roi_pct, avg_bet_size_usdc')
      .in('wallet_address', wallets),
    supabase
      .from('trader_profile_stats')
      .select('wallet_address, final_niche, bet_structure, price_bracket, win_rate, d30_win_rate, roi_pct, d30_roi_pct, d30_count, trade_count')
      .in('wallet_address', wallets),
  ]);

  const globals = globalsRes.error ? [] : globalsRes.data || [];
  const profiles = profilesRes.error ? [] : profilesRes.data || [];

  console.log(`  Global stats: ${globals.length} traders`);
  console.log(`  Profile stats: ${profiles.length} records\n`);

  // Build stats map
  const statsMap = new Map();
  const profilesByWallet = new Map();
  
  profiles.forEach((row) => {
    const wallet = (row.wallet_address || '').toLowerCase();
    if (!wallet) return;
    const list = profilesByWallet.get(wallet) ?? [];
    list.push(row);
    profilesByWallet.set(wallet, list);
  });

  globals.forEach((row) => {
    const wallet = (row.wallet_address || '').toLowerCase();
    if (!wallet) return;
    statsMap.set(wallet, {
      globalWinRate:
        normalizeWinRateValue(row.d30_win_rate) ??
        normalizeWinRateValue(row.l_win_rate) ??
        normalizeWinRateValue(row.recent_win_rate) ??
        normalizeWinRateValue(row.global_win_rate),
      globalRoiPct:
        normalizeRoiValue(row.d30_total_roi_pct) ??
        normalizeRoiValue(row.l_total_roi_pct) ??
        normalizeRoiValue(row.global_roi_pct),
      avgBetSizeUsd: pickNumber(
        row.avg_bet_size_usdc,
        row.d30_avg_trade_size_usd,
        row.l_avg_trade_size_usd,
        row.l_avg_pos_size_usd
      ),
      d30_avg_trade_size_usd: pickNumber(row.d30_avg_trade_size_usd),
      l_avg_trade_size_usd: pickNumber(row.l_avg_trade_size_usd),
      l_avg_pos_size_usd: pickNumber(row.l_avg_pos_size_usd),
      profiles: profilesByWallet.get(wallet) || [],
    });
  });

  console.log(`✅ Stats available for ${statsMap.size} traders\n`);

  // 3. Fetch trades
  const { data: tradesData, error: tradesError } = await supabase
    .from('trades')
    .select('*')
    .in('wallet_address', wallets)
    .gte('timestamp', thirtyDaysAgoISO)
    .eq('side', 'BUY')
    .order('timestamp', { ascending: false })
    .limit(5000);

  if (tradesError) {
    console.error('❌ Error fetching trades:', tradesError);
    return;
  }

  console.log(`📦 Fetched ${tradesData?.length || 0} trades\n`);

  // Group trades by wallet
  const tradesByWallet = new Map();
  (tradesData || []).forEach((trade) => {
    const wallet = (trade.wallet_address || '').toLowerCase();
    if (!wallet) return;
    const list = tradesByWallet.get(wallet) ?? [];
    if (list.length < FIRE_TRADES_PER_TRADER) {
      list.push(trade);
      tradesByWallet.set(wallet, list);
    }
  });

  console.log(`📊 Processing ${tradesByWallet.size} traders with trades\n`);

  // 4. Test thresholds
  const debugStats = {
    tradersWithoutStats: 0,
    tradesChecked: 0,
    tradesPassed: 0,
    passedByWinRate: 0,
    passedByRoi: 0,
    passedByConviction: 0,
    tradesWithNullWinRate: 0,
    tradesWithNullRoi: 0,
    tradesWithNullConviction: 0,
    tradesWithAllNull: 0,
    sampleRejectedTrade: null,
    samplePassingTrade: null,
  };

  const passingTrades = [];

  for (const [wallet, trades] of tradesByWallet.entries()) {
    const stats = statsMap.get(wallet);
    if (!stats) {
      debugStats.tradersWithoutStats++;
      continue;
    }

    for (const trade of trades) {
      debugStats.tradesChecked++;
      const category = deriveCategoryFromTrade(trade);
      const winRate = winRateForTradeType(stats, category);
      const roiPct = roiForTradeType(stats, category);
      const conviction = convictionMultiplierForTrade(trade, stats);
      
      if (winRate === null) debugStats.tradesWithNullWinRate++;
      if (roiPct === null) debugStats.tradesWithNullRoi++;
      if (conviction === null) debugStats.tradesWithNullConviction++;
      if (winRate === null && roiPct === null && conviction === null) {
        debugStats.tradesWithAllNull++;
        if (!debugStats.sampleRejectedTrade) {
          debugStats.sampleRejectedTrade = {
            wallet: wallet.slice(0, 10) + '...',
            category: category || 'undefined',
            winRate,
            roiPct,
            conviction,
          };
        }
      }
      
      const meetsWinRate = winRate !== null && winRate >= FIRE_WIN_RATE_THRESHOLD;
      const meetsRoi = roiPct !== null && roiPct >= FIRE_ROI_THRESHOLD;
      const meetsConviction = conviction !== null && conviction >= FIRE_CONVICTION_MULTIPLIER_THRESHOLD;
      
      if (meetsWinRate || meetsRoi || meetsConviction) {
        debugStats.tradesPassed++;
        if (meetsWinRate) debugStats.passedByWinRate++;
        if (meetsRoi) debugStats.passedByRoi++;
        if (meetsConviction) debugStats.passedByConviction++;
        
        if (!debugStats.samplePassingTrade) {
          debugStats.samplePassingTrade = {
            wallet: wallet.slice(0, 10) + '...',
            category: category || 'undefined',
            winRate: winRate !== null ? `${(winRate * 100).toFixed(1)}%` : 'null',
            roiPct: roiPct !== null ? `${(roiPct * 100).toFixed(1)}%` : 'null',
            conviction: conviction !== null ? `${conviction.toFixed(2)}x` : 'null',
            reasons: [],
          };
          if (meetsWinRate) debugStats.samplePassingTrade.reasons.push('winRate');
          if (meetsRoi) debugStats.samplePassingTrade.reasons.push('roi');
          if (meetsConviction) debugStats.samplePassingTrade.reasons.push('conviction');
        }
        
        passingTrades.push({
          wallet,
          trade,
          winRate,
          roiPct,
          conviction,
          meetsWinRate,
          meetsRoi,
          meetsConviction,
        });
      }
    }
  }

  // Print results
  console.log('='.repeat(80));
  console.log('RESULTS');
  console.log('='.repeat(80));
  console.log();
  console.log(`✅ Trades checked: ${debugStats.tradesChecked}`);
  console.log(`✅ Trades passed: ${debugStats.tradesPassed}`);
  console.log(`✅ Unique traders with stats: ${statsMap.size}`);
  console.log(`⚠️  Traders without stats: ${debugStats.tradersWithoutStats}`);
  console.log();
  console.log('Passed by:');
  console.log(`  Win Rate (≥${(FIRE_WIN_RATE_THRESHOLD * 100).toFixed(0)}%): ${debugStats.passedByWinRate}`);
  console.log(`  ROI (≥${(FIRE_ROI_THRESHOLD * 100).toFixed(0)}%): ${debugStats.passedByRoi}`);
  console.log(`  Conviction (≥${FIRE_CONVICTION_MULTIPLIER_THRESHOLD}x): ${debugStats.passedByConviction}`);
  console.log();
  console.log('Stats issues:');
  console.log(`  Trades with null winRate: ${debugStats.tradesWithNullWinRate}`);
  console.log(`  Trades with null ROI: ${debugStats.tradesWithNullRoi}`);
  console.log(`  Trades with null conviction: ${debugStats.tradesWithNullConviction}`);
  console.log(`  Trades with all null stats: ${debugStats.tradesWithAllNull}`);
  console.log();

  if (debugStats.samplePassingTrade) {
    console.log('✅ Sample passing trade:');
    console.log(JSON.stringify(debugStats.samplePassingTrade, null, 2));
    console.log();
  }

  if (debugStats.sampleRejectedTrade) {
    console.log('❌ Sample rejected trade (all null stats):');
    console.log(JSON.stringify(debugStats.sampleRejectedTrade, null, 2));
    console.log();
  }

  if (passingTrades.length > 0) {
    console.log(`\n🎉 Found ${passingTrades.length} trades that should appear in fire feed!`);
    console.log('\nTop 10 passing trades:');
    passingTrades.slice(0, 10).forEach((pt, i) => {
      console.log(`\n${i + 1}. Wallet: ${pt.wallet.slice(0, 10)}...`);
      console.log(`   Win Rate: ${pt.winRate !== null ? `${(pt.winRate * 100).toFixed(1)}%` : 'null'} ${pt.meetsWinRate ? '✅' : ''}`);
      console.log(`   ROI: ${pt.roiPct !== null ? `${(pt.roiPct * 100).toFixed(1)}%` : 'null'} ${pt.meetsRoi ? '✅' : ''}`);
      console.log(`   Conviction: ${pt.conviction !== null ? `${pt.conviction.toFixed(2)}x` : 'null'} ${pt.meetsConviction ? '✅' : ''}`);
    });
  } else {
    console.log('\n⚠️  No trades passed the thresholds!');
    console.log('\nPossible reasons:');
    console.log('  1. No traders have stats in trader_global_stats');
    console.log('  2. Stats values are below thresholds');
    console.log('  3. Stats are stored in wrong format (check normalization)');
  }
}

main().catch(console.error);
