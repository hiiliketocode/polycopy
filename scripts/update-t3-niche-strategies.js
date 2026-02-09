#!/usr/bin/env node
/**
 * Update T3 category strategies with top traders from trader_profile_stats.
 * Uses analyze-top-traders-by-niche.js output. Run that first.
 * 
 * Usage: node scripts/update-t3-niche-strategies.js
 */

const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'top-traders-by-niche.json');
if (!fs.existsSync(dataPath)) {
  console.error('Run analyze-top-traders-by-niche.js first');
  process.exit(1);
}

const topTraders = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Strategy config: wallet_id -> { niche, description, market_categories }
// Include both T3_* and FT_T3_* (migration may have created FT_T3_*)
const STRATEGIES = [
  { wallet_id: 'FT_T3_SPORTS', niche: 'SPORTS', name: 'Sports (broad)',
    desc: 'Top SPORTS traders from trader_profile_stats. Markets: nfl, nba, mlb, nhl, soccer, ufc.',
    keywords: ['nfl', 'nba', 'mlb', 'nhl', 'soccer', 'ufc', 'boxing', 'tennis', 'championship', 'finals', 'football'] },
  { wallet_id: 'FT_T3_CRYPTO', niche: 'CRYPTO', name: 'Crypto',
    desc: 'Top CRYPTO traders from trader_profile_stats. Markets: bitcoin, ethereum, crypto, solana.',
    keywords: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'solana', 'sol', 'defi'] },
  { wallet_id: 'FT_T3_POLITICS', niche: 'POLITICS', name: 'Politics',
    desc: 'Top POLITICS traders from trader_profile_stats (by ROI+WR). Markets: trump, biden, election.',
    keywords: ['trump', 'biden', 'election', 'congress', 'senate', 'political', 'governor', 'vote', 'president'] },
  { wallet_id: 'FT_T3_FINANCE', niche: 'FINANCE', name: 'Finance',
    desc: 'Top FINANCE traders from trader_profile_stats. Markets: fed, rate, inflation, stocks.',
    keywords: ['fed', 'rate', 'inflation', 'gdp', 'cpi', 'stock', 'market', 'recession', 'treasury'] },
  { wallet_id: 'T3_POLITICS', niche: 'POLITICS', name: 'Politics', 
    desc: 'Top POLITICS traders from trader_profile_stats (by ROI+WR). Markets: trump, biden, election, congress.',
    keywords: ['trump', 'biden', 'election', 'congress', 'senate', 'political', 'governor', 'vote', 'president'] },
  { wallet_id: 'T3_CRYPTO', niche: 'CRYPTO', name: 'Crypto',
    desc: 'Top CRYPTO traders from trader_profile_stats. Markets: bitcoin, ethereum, crypto, solana.',
    keywords: ['bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'solana', 'sol', 'defi'] },
  { wallet_id: 'T3_SPORTS', niche: 'SPORTS', name: 'Sports (broad)',
    desc: 'Top SPORTS traders from trader_profile_stats. Markets: nfl, nba, mlb, nhl, soccer, ufc.',
    keywords: ['nfl', 'nba', 'mlb', 'nhl', 'soccer', 'ufc', 'boxing', 'tennis', 'championship', 'finals', 'football'] },
  { wallet_id: 'T3_FINANCE', niche: 'FINANCE', name: 'Finance',
    desc: 'Top FINANCE traders from trader_profile_stats. Markets: fed, rate, inflation, stocks.',
    keywords: ['fed', 'rate', 'inflation', 'gdp', 'cpi', 'stock', 'market', 'recession', 'treasury'] },
  { wallet_id: 'T3_ECON', niche: 'FINANCE', name: 'Economics',
    desc: 'Top FINANCE traders (economics). Same as T3_FINANCE niche.',
    keywords: ['fed', 'rate', 'inflation', 'gdp', 'cpi', 'recession', 'economy'] },
  { wallet_id: 'T3_NBA', niche: 'NBA', name: 'NBA',
    desc: 'Top NBA traders from trader_profile_stats (4.6%+ ROI). NBA markets only.',
    keywords: ['nba', 'basketball', 'lakers', 'celtics', 'warriors'] },
  { wallet_id: 'T3_NFL', niche: 'NFL', name: 'NFL',
    desc: 'Top NFL traders from trader_profile_stats. NFL markets only.',
    keywords: ['nfl', 'super bowl', 'superbowl', 'football'] },
  { wallet_id: 'T3_ELECTION', niche: 'ELECTION', name: 'Election',
    desc: 'Top ELECTION traders from trader_profile_stats. Election markets.',
    keywords: ['election', 'trump', 'biden', 'vote', 'president', 'primary'] },
  { wallet_id: 'T3_ESPORTS', niche: 'ESPORTS', name: 'Esports',
    desc: 'Top ESPORTS traders from trader_profile_stats (0.2%+ ROI). Esports markets.',
    keywords: ['esports', 'lol', 'league of legends', 'valorant', 'counter strike', 'cs2', 'dota'] },
  { wallet_id: 'T3_WEATHER', niche: 'WEATHER', name: 'Weather',
    desc: 'Top WEATHER traders from trader_profile_stats. Weather/temperature markets.',
    keywords: ['weather', 'temperature', 'hurricane', 'snow', 'rain'] },
  { wallet_id: 'T3_TECH', niche: 'TECH', name: 'Tech',
    desc: 'Top TECH traders from trader_profile_stats. Tech markets.',
    keywords: ['tech', 'apple', 'google', 'ai', 'nvidia', 'tesla'] },
  { wallet_id: 'T3_MLB', niche: 'MLB', name: 'MLB',
    desc: 'Top MLB traders from trader_profile_stats. Baseball only.',
    keywords: ['mlb', 'baseball', 'yankees', 'dodgers'] },
  { wallet_id: 'T3_SOCCER', niche: 'SOCCER', name: 'Soccer',
    desc: 'Top SOCCER traders from trader_profile_stats. Soccer/football markets.',
    keywords: ['soccer', 'premier league', 'champions league', 'football', 'fifa'] },
  { wallet_id: 'T3_TEMPERATURE', niche: 'TEMPERATURE', name: 'Temperature',
    desc: 'Top TEMPERATURE traders from trader_profile_stats. Temperature prediction markets.',
    keywords: ['temperature', 'degrees', 'fahrenheit', 'celsius'] },
];

async function updateStrategy(s) {
  const traders = topTraders[s.niche];
  if (!traders || traders.length === 0) {
    console.log(`  Skip ${s.wallet_id}: no data for niche ${s.niche}`);
    return;
  }
  
  const targetTraders = traders.slice(0, 5).map(t => t.wallet);
  
  const body = {
    wallet_id: s.wallet_id,
    display_name: `T3 ${s.name}`,
    description: s.desc,
    market_categories: s.keywords,
    target_traders: targetTraders,
    min_edge: 0.05,
    min_trader_resolved_count: 10,  // Niche traders may have fewer global trades
    min_bet: 8,
    max_bet: 8,
    bet_size: 8,
    allocation_method: 'FIXED',
  };
  
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const res = await fetch(`${base}/api/ft/add-wallet`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  const data = await res.json();
  if (data.success) {
    console.log(`  ✓ ${s.wallet_id}: ${targetTraders.length} traders from ${s.niche}`);
  } else {
    console.log(`  ✗ ${s.wallet_id}: ${data.error || 'failed'}`);
  }
}

async function main() {
  console.log('Updating T3 niche strategies with top traders from trader_profile_stats\n');
  console.log('Each strategy: top 5 traders by niche (ROI+WR score), market_categories for title match\n');
  
  for (const s of STRATEGIES) {
    await updateStrategy(s);
  }
  
  console.log('\nDone. Run reset-sync for new strategies to backfill.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
