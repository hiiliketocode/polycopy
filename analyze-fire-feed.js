/**
 * Script to analyze FIRE feed filtering and find optimal thresholds
 * 
 * This script:
 * 1. Fetches top 100 traders from leaderboard
 * 2. Gets their stats and recent trades
 * 3. Analyzes which trades pass current filters
 * 4. Tests different threshold combinations
 */

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// Current thresholds
const CURRENT_THRESHOLDS = {
  WIN_RATE: 0.65,
  ROI: 0.25,
  CONVICTION: 5,
  TOP_TRADERS_LIMIT: 100,
  TRADES_PER_TRADER: 10,
};

// Test threshold combinations
const TEST_THRESHOLDS = [
  { name: 'Current', winRate: 0.65, roi: 0.25, conviction: 5 },
  { name: 'Relaxed Win Rate', winRate: 0.60, roi: 0.25, conviction: 5 },
  { name: 'Relaxed ROI', winRate: 0.65, roi: 0.20, conviction: 5 },
  { name: 'Relaxed Conviction', winRate: 0.65, roi: 0.25, conviction: 3 },
  { name: 'Moderate Relaxed', winRate: 0.60, roi: 0.20, conviction: 3 },
  { name: 'More Relaxed', winRate: 0.55, roi: 0.15, conviction: 2.5 },
  { name: 'Focus on ROI', winRate: 0.50, roi: 0.15, conviction: 2 },
];

function normalizeWinRateValue(raw) {
  if (raw === null || raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (value > 1.01) return value / 100;
  if (value < 0) return null;
  return value;
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
  const normalizedCategory = category?.toLowerCase() ?? '';

  if (stats.profiles && stats.profiles.length > 0 && normalizedCategory) {
    const matchingProfile = stats.profiles.find((profile) => {
      const niche = (profile.final_niche || '').toLowerCase();
      if (!niche) return false;
      if (niche === normalizedCategory) return true;
      return niche.includes(normalizedCategory);
    });

    const profileWinRate =
      normalizeWinRateValue(matchingProfile?.d30_win_rate) ??
      normalizeWinRateValue(matchingProfile?.win_rate);
    if (profileWinRate !== null) {
      return profileWinRate;
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
    if (roi !== null && roi !== undefined && Number.isFinite(Number(roi))) {
      return Number(roi);
    }
  }
  if (stats.globalRoiPct !== null && stats.globalRoiPct !== undefined && Number.isFinite(Number(stats.globalRoiPct))) {
    return Number(stats.globalRoiPct);
  }
  return null;
}

function convictionMultiplierForTrade(trade, stats) {
  const size = Number(trade.size ?? trade.amount ?? 0);
  const price = Number(trade.price ?? 0);
  if (!Number.isFinite(size) || !Number.isFinite(price)) return null;
  const tradeValue = size * price;
  const avgBetSize = stats?.avgBetSizeUsd ?? null;
  if (!avgBetSize || !Number.isFinite(avgBetSize) || avgBetSize <= 0) return null;
  return tradeValue / avgBetSize;
}

async function fetchLeaderboard() {
  const url = `${BASE_URL}/api/polymarket/leaderboard?limit=${CURRENT_THRESHOLDS.TOP_TRADERS_LIMIT}&orderBy=PNL&timePeriod=month&category=overall`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch leaderboard: ${response.status}`);
  }
  const data = await response.json();
  return data.traders || [];
}

async function fetchTraderStats(wallet) {
  try {
    const url = `${BASE_URL}/api/trader/stats?wallet=${wallet}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    
    const globalWinRate =
      normalizeWinRateValue(data?.global?.d30_win_rate) ??
      normalizeWinRateValue(data?.global?.win_rate) ??
      normalizeWinRateValue(data?.global?.global_win_rate) ??
      normalizeWinRateValue(data?.global?.recent_win_rate);
    
    const avgBetSizeRaw = data?.global?.avg_bet_size_usdc;
    const avgBetSize =
      typeof avgBetSizeRaw === 'number'
        ? avgBetSizeRaw
        : Number.isFinite(Number(avgBetSizeRaw))
        ? Number(avgBetSizeRaw)
        : null;
    
    const globalRoiPct =
      Number.isFinite(Number(data?.global?.d30_total_roi_pct)) ? Number(data?.global?.d30_total_roi_pct) :
      Number.isFinite(Number(data?.global?.global_roi_pct)) ? Number(data?.global?.global_roi_pct) :
      null;
    
    return {
      globalWinRate,
      avgBetSizeUsd: avgBetSize,
      globalRoiPct,
      profiles: Array.isArray(data?.profiles) ? data.profiles : [],
    };
  } catch (err) {
    console.warn(`Failed to fetch stats for ${wallet}:`, err.message);
    return null;
  }
}

async function fetchTraderTrades(wallet) {
  try {
    const url = `https://data-api.polymarket.com/trades?limit=${CURRENT_THRESHOLDS.TRADES_PER_TRADER}&user=${wallet}`;
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return [];
    return await response.json();
  } catch (err) {
    console.warn(`Failed to fetch trades for ${wallet}:`, err.message);
    return [];
  }
}

function analyzeTrade(trade, stats, thresholds) {
  const category = deriveCategoryFromTrade(trade);
  const winRate = winRateForTradeType(stats, category);
  const roiPct = roiForTradeType(stats, category);
  const conviction = convictionMultiplierForTrade(trade, stats);
  
  const meetsWinRate = winRate !== null && winRate >= thresholds.winRate;
  const meetsRoi = roiPct !== null && roiPct >= thresholds.roi;
  const meetsConviction = conviction !== null && conviction >= thresholds.conviction;
  
  const passes = meetsWinRate || meetsConviction || meetsRoi;
  
  return {
    passes,
    winRate,
    roiPct,
    conviction,
    meetsWinRate,
    meetsRoi,
    meetsConviction,
    category,
  };
}

async function main() {
  console.log('🔥 FIRE Feed Analysis\n');
  console.log('Fetching leaderboard...');
  
  const traders = await fetchLeaderboard();
  console.log(`Found ${traders.length} traders\n`);
  
  if (traders.length === 0) {
    console.log('No traders found. Exiting.');
    return;
  }
  
  const wallets = traders
    .map(t => (t.wallet || t.proxyWallet || '').toLowerCase())
    .filter(Boolean)
    .slice(0, CURRENT_THRESHOLDS.TOP_TRADERS_LIMIT);
  
  console.log(`Analyzing ${wallets.length} traders...\n`);
  
  // Fetch stats and trades for all traders
  const traderData = [];
  let processed = 0;
  
  for (const wallet of wallets) {
    processed++;
    if (processed % 10 === 0) {
      console.log(`  Processed ${processed}/${wallets.length} traders...`);
    }
    
    const [stats, trades] = await Promise.all([
      fetchTraderStats(wallet),
      fetchTraderTrades(wallet),
    ]);
    
    if (stats && trades.length > 0) {
      traderData.push({ wallet, stats, trades });
    }
  }
  
  console.log(`\nGot data for ${traderData.length} traders with trades\n`);
  
  // Analyze with different threshold combinations
  const results = {};
  
  for (const thresholdSet of TEST_THRESHOLDS) {
    const passingTrades = [];
    const tradeStats = {
      total: 0,
      passing: 0,
      byReason: { winRate: 0, roi: 0, conviction: 0 },
      winRateStats: [],
      roiStats: [],
      convictionStats: [],
    };
    
    for (const { wallet, stats, trades } of traderData) {
      for (const trade of trades) {
        tradeStats.total++;
        const analysis = analyzeTrade(trade, stats, thresholdSet);
        
        if (analysis.passes) {
          tradeStats.passing++;
          passingTrades.push({
            wallet,
            trade,
            analysis,
          });
          
          if (analysis.meetsWinRate) tradeStats.byReason.winRate++;
          if (analysis.meetsRoi) tradeStats.byReason.roi++;
          if (analysis.meetsConviction) tradeStats.byReason.conviction++;
        }
        
        if (analysis.winRate !== null) tradeStats.winRateStats.push(analysis.winRate);
        if (analysis.roiPct !== null) tradeStats.roiStats.push(analysis.roiPct);
        if (analysis.conviction !== null) tradeStats.convictionStats.push(analysis.conviction);
      }
    }
    
    // Sort passing trades by timestamp (most recent first)
    passingTrades.sort((a, b) => (b.trade.timestamp || 0) - (a.trade.timestamp || 0));
    
    results[thresholdSet.name] = {
      thresholds: thresholdSet,
      stats: tradeStats,
      passingTrades: passingTrades.slice(0, 50), // Top 50 for display
      uniqueTraders: new Set(passingTrades.map(t => t.wallet)).size,
    };
  }
  
  // Print results
  console.log('='.repeat(80));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(80));
  console.log();
  
  for (const [name, result] of Object.entries(results)) {
    console.log(`📊 ${name}`);
    console.log(`   Thresholds: Win Rate ≥${result.thresholds.winRate}, ROI ≥${result.thresholds.roi}, Conviction ≥${result.thresholds.conviction}`);
    console.log(`   Total trades analyzed: ${result.stats.total}`);
    console.log(`   Passing trades: ${result.stats.passing} (${((result.stats.passing / result.stats.total) * 100).toFixed(1)}%)`);
    console.log(`   Unique traders: ${result.uniqueTraders}`);
    console.log(`   Reasons: Win Rate=${result.stats.byReason.winRate}, ROI=${result.stats.byReason.roi}, Conviction=${result.stats.byReason.conviction}`);
    
    if (result.stats.winRateStats.length > 0) {
      const sorted = result.stats.winRateStats.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const p25 = sorted[Math.floor(sorted.length * 0.25)];
      const p75 = sorted[Math.floor(sorted.length * 0.75)];
      console.log(`   Win Rate distribution: median=${median.toFixed(2)}, p25=${p25.toFixed(2)}, p75=${p75.toFixed(2)}`);
    }
    
    if (result.stats.roiStats.length > 0) {
      const sorted = result.stats.roiStats.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const p25 = sorted[Math.floor(sorted.length * 0.25)];
      const p75 = sorted[Math.floor(sorted.length * 0.75)];
      console.log(`   ROI distribution: median=${median.toFixed(2)}, p25=${p25.toFixed(2)}, p75=${p75.toFixed(2)}`);
    }
    
    if (result.stats.convictionStats.length > 0) {
      const sorted = result.stats.convictionStats.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const p25 = sorted[Math.floor(sorted.length * 0.25)];
      const p75 = sorted[Math.floor(sorted.length * 0.75)];
      console.log(`   Conviction distribution: median=${median.toFixed(2)}, p25=${p25.toFixed(2)}, p75=${p75.toFixed(2)}`);
    }
    
    console.log();
  }
  
  // Detailed analysis of current threshold
  console.log('='.repeat(80));
  console.log('CURRENT THRESHOLD DETAILED ANALYSIS');
  console.log('='.repeat(80));
  console.log();
  
  const current = results['Current'];
  console.log(`Passing trades: ${current.stats.passing}`);
  console.log(`Unique traders: ${current.uniqueTraders}`);
  console.log();
  
  if (current.passingTrades.length > 0) {
    console.log('Sample passing trades:');
    current.passingTrades.slice(0, 10).forEach((pt, idx) => {
      const t = pt.trade;
      const a = pt.analysis;
      console.log(`\n${idx + 1}. Trader: ${pt.wallet.slice(0, 10)}...`);
      console.log(`   Market: ${t.market?.title || t.conditionId || 'unknown'}`);
      console.log(`   Category: ${a.category || 'unknown'}`);
      console.log(`   Win Rate: ${a.winRate !== null ? a.winRate.toFixed(2) : 'N/A'} (meets: ${a.meetsWinRate})`);
      console.log(`   ROI: ${a.roiPct !== null ? a.roiPct.toFixed(2) : 'N/A'} (meets: ${a.meetsRoi})`);
      console.log(`   Conviction: ${a.conviction !== null ? a.conviction.toFixed(2) : 'N/A'} (meets: ${a.meetsConviction})`);
      console.log(`   Timestamp: ${new Date(t.timestamp).toISOString()}`);
    });
  }
  
  // Recommendations
  console.log('\n' + '='.repeat(80));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(80));
  console.log();
  
  const recommendations = Object.entries(results)
    .filter(([name]) => name !== 'Current')
    .sort((a, b) => b[1].stats.passing - a[1].stats.passing)
    .slice(0, 3);
  
  console.log('Top 3 threshold combinations by trade count:');
  recommendations.forEach(([name, result], idx) => {
    console.log(`\n${idx + 1}. ${name}`);
    console.log(`   Win Rate ≥ ${result.thresholds.winRate}`);
    console.log(`   ROI ≥ ${result.thresholds.roi}`);
    console.log(`   Conviction ≥ ${result.thresholds.conviction}`);
    console.log(`   Result: ${result.stats.passing} trades from ${result.uniqueTraders} traders`);
  });
  
  console.log('\n' + '='.repeat(80));
}

main().catch(console.error);
