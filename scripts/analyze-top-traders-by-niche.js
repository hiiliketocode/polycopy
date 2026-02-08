#!/usr/bin/env node
/**
 * Analyze trader_profile_stats to find top traders per niche.
 * Aggregates across bet_structure/price_bracket (per user: don't worry about those).
 * Output: top traders by ROI and win rate for each niche, for FT category strategy config.
 * 
 * Usage: node scripts/analyze-top-traders-by-niche.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Niche mapping: trader_profile_stats final_niche -> our T3 strategy + market_categories
// Some niches may not exist - we'll discover what we have
const NICHE_CONFIG = {
  NFL: { strategy: 'T3_NFL', keywords: ['nfl', 'super bowl', 'superbowl'], name: 'NFL' },
  NBA: { strategy: 'T3_NBA', keywords: ['nba'], name: 'NBA' },
  NHL: { strategy: 'T3_NHL', keywords: ['nhl', 'hockey'], name: 'NHL' },
  MLB: { strategy: 'T3_MLB', keywords: ['mlb', 'baseball'], name: 'MLB' },
  SOCCER: { strategy: 'T3_SOCCER', keywords: ['soccer', 'football', 'premier league', 'champions league'], name: 'Soccer' },
  SPORTS: { strategy: 'T3_SPORTS', keywords: ['nfl', 'nba', 'mlb', 'nhl', 'soccer', 'ufc', 'boxing', 'tennis', 'championship', 'finals'], name: 'Sports (broad)' },
  BITCOIN: { strategy: 'T3_BITCOIN', keywords: ['bitcoin', 'btc'], name: 'Bitcoin' },
  ETHEREUM: { strategy: 'T3_ETHEREUM', keywords: ['ethereum', 'eth'], name: 'Ethereum' },
  CRYPTO: { strategy: 'T3_CRYPTO', keywords: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'solana', 'sol'], name: 'Crypto' },
  ELECTION: { strategy: 'T3_ELECTION', keywords: ['election', 'trump', 'biden', 'vote', 'president'], name: 'Election' },
  POLITICS: { strategy: 'T3_POLITICS', keywords: ['trump', 'biden', 'election', 'congress', 'senate', 'political', 'governor'], name: 'Politics' },
};

async function main() {
  console.log('Fetching trader_profile_stats...');
  
  const { data: rows, error } = await supabase
    .from('trader_profile_stats')
    .select('wallet_address, final_niche, l_win_rate, l_total_roi_pct, l_count');
  
  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  
  if (!rows || rows.length === 0) {
    console.log('No rows in trader_profile_stats. Run stats sync first.');
    process.exit(0);
  }
  
  const wrCol = 'l_win_rate';
  const roiCol = 'l_total_roi_pct';
  const countCol = 'l_count';
  
  // Aggregate by wallet + niche (ignore structure/bracket per user request)
  const byNiche = {};
  
  for (const r of rows) {
    const niche = (r.final_niche || 'OTHER').toUpperCase();
    const wallet = (r.wallet_address || '').toLowerCase();
    if (!wallet) continue;
    
    const wr = parseFloat(r[wrCol]) || 0.5;
    const roi = parseFloat(r[roiCol]) || 0;
    const cnt = parseInt(r[countCol]) || 0;
    
    if (cnt < 5) continue; // Min 5 trades for reliability
    
    if (!byNiche[niche]) byNiche[niche] = [];
    
    // Check if we already have this wallet in this niche (from another structure/bracket)
    const existing = byNiche[niche].find(x => x.wallet === wallet);
    if (existing) {
      // Aggregate: weighted avg by count
      const tot = existing.count + cnt;
      existing.win_rate = (existing.win_rate * existing.count + wr * cnt) / tot;
      existing.roi_pct = (existing.roi_pct * existing.count + roi * cnt) / tot;
      existing.count = tot;
    } else {
      byNiche[niche].push({ wallet, win_rate: wr, roi_pct: roi, count: cnt });
    }
  }
  
  // For each niche, sort by composite score: ROI matters most, then win rate
  // Score = roi_pct * 0.7 + (win_rate - 0.5) * 100 * 0.3 (so 55% WR = +1.5, 60% = +3)
  const MIN_TRADES = 10; // Require at least 10 for "best" designation
  
  const topByNiche = {};
  for (const [niche, traders] of Object.entries(byNiche)) {
    const filtered = traders.filter(t => t.count >= MIN_TRADES);
    if (filtered.length === 0) continue;
    
    const scored = filtered.map(t => ({
      ...t,
      score: (t.roi_pct || 0) * 0.7 + ((t.win_rate || 0.5) - 0.5) * 100 * 0.3
    }));
    scored.sort((a, b) => b.score - a.score);
    
    topByNiche[niche] = scored.slice(0, 5); // Top 5 per niche
  }
  
  // Output for FT config
  console.log('\n=== TOP TRADERS BY NICHE (from trader_profile_stats, aggregated across bet structure/price bracket) ===\n');
  console.log('Min 10 trades, ranked by: 70% ROI + 30% win-rate premium\n');
  
  const sortedNiches = Object.keys(topByNiche).sort();
  
  for (const niche of sortedNiches) {
    const cfg = NICHE_CONFIG[niche];
    const name = cfg?.name || niche;
    console.log(`\n## ${niche} (${name})`);
    const tops = topByNiche[niche];
    for (let i = 0; i < tops.length; i++) {
      const t = tops[i];
      console.log(`  ${i + 1}. ${t.wallet}  WR:${(t.win_rate * 100).toFixed(1)}%  ROI:${(t.roi_pct || 0).toFixed(1)}%  trades:${t.count}`);
    }
  }
  
  // Output JSON for programmatic use
  const output = {};
  for (const niche of sortedNiches) {
    output[niche] = topByNiche[niche].map(t => ({
      wallet: t.wallet,
      win_rate: t.win_rate,
      roi_pct: t.roi_pct,
      count: t.count
    }));
  }
  
  const outPath = path.join(__dirname, 'top-traders-by-niche.json');
  require('fs').writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log('\n\nWritten to', outPath);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
