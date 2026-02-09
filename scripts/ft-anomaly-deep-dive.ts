#!/usr/bin/env npx tsx
/**
 * FT Anomaly Deep Dive
 * Investigates specific red flags found in the main analysis.
 */
import { config } from 'dotenv';
import path from 'path';
import os from 'os';

const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(os.homedir(), 'PolyCopy', '.env.local'),
  path.resolve(process.cwd(), '..', '.env.local'),
];
for (const p of envPaths) {
  config({ path: p });
}
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const fmt = (n: number, d = 2) => n.toFixed(d);
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const fmtDollar = (n: number) => `$${n.toFixed(2)}`;

function printSection(title: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(80)}`);
}

// Paginated fetch
async function fetchAllOrders(): Promise<any[]> {
  const allOrders: any[] = [];
  let offset = 0;
  const PAGE = 1000;
  let more = true;
  while (more) {
    const { data } = await supabase
      .from('ft_orders')
      .select('*')
      .order('order_time', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (data && data.length > 0) { allOrders.push(...data); offset += data.length; more = data.length === PAGE; }
    else more = false;
  }
  return allOrders;
}

async function main() {
  console.log('\n█ FT ANOMALY DEEP DIVE █\n');
  const allOrders = await fetchAllOrders();
  const resolved = allOrders.filter((o: any) => o.outcome !== 'OPEN');
  console.log(`Total orders: ${allOrders.length}, Resolved: ${resolved.length}\n`);

  // ======================================================================
  // ANOMALY 1: 100% WR trader (0xa49becb6)
  // ======================================================================
  printSection('ANOMALY 1: Trader 0xa49becb6 with 100% WR (149 trades)');
  const suspectTrader = allOrders.filter((o: any) => o.trader_address?.startsWith('0xa49becb6'));
  const suspectResolved = suspectTrader.filter((o: any) => o.outcome !== 'OPEN');
  const suspectWon = suspectTrader.filter((o: any) => o.outcome === 'WON');
  const suspectLost = suspectTrader.filter((o: any) => o.outcome === 'LOST');
  const suspectOpen = suspectTrader.filter((o: any) => o.outcome === 'OPEN');

  console.log(`  Total orders: ${suspectTrader.length}`);
  console.log(`  Resolved: ${suspectResolved.length} (Won: ${suspectWon.length}, Lost: ${suspectLost.length})`);
  console.log(`  Open: ${suspectOpen.length}`);
  console.log(`  Total PnL: ${fmtDollar(suspectResolved.reduce((s: number, o: any) => s + (o.pnl ?? 0), 0))}`);

  // What markets is this trader in?
  const traderMarkets = new Map<string, { title: string; count: number; won: number; lost: number; open: number }>();
  suspectTrader.forEach((o: any) => {
    const slug = o.market_slug || o.condition_id;
    if (!traderMarkets.has(slug)) traderMarkets.set(slug, { title: o.market_title || slug, count: 0, won: 0, lost: 0, open: 0 });
    const m = traderMarkets.get(slug)!;
    m.count++;
    if (o.outcome === 'WON') m.won++;
    else if (o.outcome === 'LOST') m.lost++;
    else m.open++;
  });

  console.log(`  Unique markets: ${traderMarkets.size}`);
  console.log(`  Market breakdown:`);
  Array.from(traderMarkets.entries()).forEach(([slug, m]) => {
    console.log(`    ${m.title?.slice(0, 60)} | ${m.count} orders | W:${m.won} L:${m.lost} O:${m.open}`);
  });

  // Entry price distribution
  const avgEntry = suspectTrader.reduce((s: number, o: any) => s + (o.entry_price ?? 0), 0) / suspectTrader.length;
  console.log(`  Avg entry price: ${fmt(avgEntry, 3)}`);
  console.log(`  Avg trader WR at trade time: ${suspectTrader[0]?.trader_win_rate ? fmtPct(suspectTrader[0].trader_win_rate) : 'N/A'}`);

  // ======================================================================
  // ANOMALY 2: Negative edge trades winning at 77.5%
  // ======================================================================
  printSection('ANOMALY 2: Negative edge trades have 77.5% WR');
  const negEdge = resolved.filter((o: any) => o.edge_pct !== null && o.edge_pct < 0);
  console.log(`  Negative edge resolved trades: ${negEdge.length}`);
  console.log(`  Won: ${negEdge.filter((o: any) => o.outcome === 'WON').length}`);
  console.log(`  Lost: ${negEdge.filter((o: any) => o.outcome === 'LOST').length}`);
  console.log(`  WR: ${fmtPct(negEdge.filter((o: any) => o.outcome === 'WON').length / negEdge.length)}`);

  // What are these trades?
  console.log(`\n  Sample negative edge WON trades:`);
  negEdge.filter((o: any) => o.outcome === 'WON').slice(0, 10).forEach((o: any) => {
    console.log(`    wallet=${o.wallet_id} | entry=${fmt(o.entry_price, 3)} | trader_wr=${o.trader_win_rate ? fmtPct(o.trader_win_rate) : 'N/A'} | edge=${fmtPct(o.edge_pct)} | market=${(o.market_title || '').slice(0, 50)} | side=${o.side} | token=${o.token_label}`);
  });

  // Edge calculation: edge_pct = trader_win_rate - entry_price
  // If edge is negative, it means trader_win_rate < entry_price
  // But if these are winning at 77.5%, the traders are MUCH better than their historical WR suggests
  console.log(`\n  Avg entry price of neg edge trades: ${fmt(negEdge.reduce((s: number, o: any) => s + (o.entry_price ?? 0), 0) / negEdge.length, 3)}`);
  console.log(`  Avg trader WR of neg edge trades: ${fmtPct(negEdge.reduce((s: number, o: any) => s + (o.trader_win_rate ?? 0), 0) / negEdge.length)}`);

  // Check if these are mostly favorites
  const negEdgeFavorites = negEdge.filter((o: any) => o.entry_price >= 0.6);
  const negEdgeUnderdogs = negEdge.filter((o: any) => o.entry_price < 0.4);
  console.log(`  Neg edge favorites (>=60¢): ${negEdgeFavorites.length} (WR: ${negEdgeFavorites.length > 0 ? fmtPct(negEdgeFavorites.filter((o: any) => o.outcome === 'WON').length / negEdgeFavorites.length) : 'N/A'})`);
  console.log(`  Neg edge underdogs (<40¢): ${negEdgeUnderdogs.length} (WR: ${negEdgeUnderdogs.length > 0 ? fmtPct(negEdgeUnderdogs.filter((o: any) => o.outcome === 'WON').length / negEdgeUnderdogs.length) : 'N/A'})`);

  // ======================================================================
  // ANOMALY 3: ML confidence inversion (55-60% worse than 50-55%, 70%+ losing)
  // ======================================================================
  printSection('ANOMALY 3: ML Confidence Inversion');
  const modelOrders = resolved.filter((o: any) => o.model_probability !== null && o.model_probability > 0);

  // Check what wallets contribute to 70%+ ML bucket
  const highML = modelOrders.filter((o: any) => o.model_probability >= 0.70);
  console.log(`  70%+ ML trades: ${highML.length}`);
  console.log(`  Won: ${highML.filter((o: any) => o.outcome === 'WON').length}, Lost: ${highML.filter((o: any) => o.outcome === 'LOST').length}`);
  console.log(`  WR: ${fmtPct(highML.filter((o: any) => o.outcome === 'WON').length / highML.length)}`);
  console.log(`  Total PnL: ${fmtDollar(highML.reduce((s: number, o: any) => s + (o.pnl ?? 0), 0))}`);

  // Wallet distribution of 70%+ ML trades
  const highMLByWallet = new Map<string, { count: number; won: number; pnl: number }>();
  highML.forEach((o: any) => {
    if (!highMLByWallet.has(o.wallet_id)) highMLByWallet.set(o.wallet_id, { count: 0, won: 0, pnl: 0 });
    const w = highMLByWallet.get(o.wallet_id)!;
    w.count++;
    if (o.outcome === 'WON') w.won++;
    w.pnl += o.pnl ?? 0;
  });

  console.log(`\n  70%+ ML trades by wallet:`);
  Array.from(highMLByWallet.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([wid, s]) => {
      console.log(`    ${wid}: ${s.count} trades, ${s.won} won (${fmtPct(s.won / s.count)}), PnL ${fmtDollar(s.pnl)}`);
    });

  // What are the losses? Are they big?
  const highMLLosses = highML.filter((o: any) => o.outcome === 'LOST');
  const avgLoss = highMLLosses.length > 0 ? highMLLosses.reduce((s: number, o: any) => s + (o.pnl ?? 0), 0) / highMLLosses.length : 0;
  const maxLoss = highMLLosses.length > 0 ? Math.min(...highMLLosses.map((o: any) => o.pnl ?? 0)) : 0;
  console.log(`\n  70%+ ML losses: avg ${fmtDollar(avgLoss)}, max ${fmtDollar(maxLoss)}`);
  console.log(`  70%+ ML loss sample:`);
  highMLLosses.sort((a: any, b: any) => (a.pnl ?? 0) - (b.pnl ?? 0)).slice(0, 5).forEach((o: any) => {
    console.log(`    wallet=${o.wallet_id} | ml=${fmtPct(o.model_probability)} | entry=${fmt(o.entry_price, 3)} | size=${fmtDollar(o.size)} | pnl=${fmtDollar(o.pnl)} | market=${(o.market_title || '').slice(0, 50)}`);
  });

  // ======================================================================
  // ANOMALY 4: T1 Pure ML 91.7% WR - skewed sample?
  // ======================================================================
  printSection('ANOMALY 4: T1 Pure ML has 91.7% WR (24 resolved of 161)');
  const pureML = allOrders.filter((o: any) => o.wallet_id === 'FT_T1_PURE_ML');
  const pureMLResolved = pureML.filter((o: any) => o.outcome !== 'OPEN');
  const pureMLOpen = pureML.filter((o: any) => o.outcome === 'OPEN');

  console.log(`  Total: ${pureML.length}, Open: ${pureMLOpen.length}, Resolved: ${pureMLResolved.length}`);
  console.log(`  Won: ${pureMLResolved.filter((o: any) => o.outcome === 'WON').length}, Lost: ${pureMLResolved.filter((o: any) => o.outcome === 'LOST').length}`);
  console.log(`  PnL: ${fmtDollar(pureMLResolved.reduce((s: number, o: any) => s + (o.pnl ?? 0), 0))}`);

  // Check what resolved early - are they all favorites?
  console.log(`\n  Resolved trades entry price distribution:`);
  const priceRanges = [
    { label: '<20¢', min: 0, max: 0.2 },
    { label: '20-40¢', min: 0.2, max: 0.4 },
    { label: '40-60¢', min: 0.4, max: 0.6 },
    { label: '60-80¢', min: 0.6, max: 0.8 },
    { label: '80-100¢', min: 0.8, max: 1.0 },
  ];
  priceRanges.forEach(r => {
    const inRange = pureMLResolved.filter((o: any) => o.entry_price >= r.min && o.entry_price < r.max);
    if (inRange.length === 0) return;
    const won = inRange.filter((o: any) => o.outcome === 'WON').length;
    console.log(`    ${r.label}: ${inRange.length} trades, WR ${fmtPct(won / inRange.length)}`);
  });

  // Compare vs open trades price distribution
  console.log(`\n  OPEN trades entry price distribution:`);
  priceRanges.forEach(r => {
    const inRange = pureMLOpen.filter((o: any) => o.entry_price >= r.min && o.entry_price < r.max);
    if (inRange.length > 0) console.log(`    ${r.label}: ${inRange.length} trades`);
  });

  // ======================================================================
  // ANOMALY 5: Massive BTC/ETH market losses
  // ======================================================================
  printSection('ANOMALY 5: BTC/ETH markets dominating PnL');
  const cryptoKeywords = ['bitcoin', 'btc', 'ethereum', 'eth'];
  const cryptoOrders = resolved.filter((o: any) => {
    const title = (o.market_title || '').toLowerCase();
    return cryptoKeywords.some(k => title.includes(k));
  });
  const nonCryptoOrders = resolved.filter((o: any) => {
    const title = (o.market_title || '').toLowerCase();
    return !cryptoKeywords.some(k => title.includes(k));
  });

  const cryptoPnl = cryptoOrders.reduce((s: number, o: any) => s + (o.pnl ?? 0), 0);
  const nonCryptoPnl = nonCryptoOrders.reduce((s: number, o: any) => s + (o.pnl ?? 0), 0);
  const cryptoWR = cryptoOrders.filter((o: any) => o.outcome === 'WON').length / cryptoOrders.length;
  const nonCryptoWR = nonCryptoOrders.filter((o: any) => o.outcome === 'WON').length / nonCryptoOrders.length;

  console.log(`  Crypto trades: ${cryptoOrders.length}, PnL: ${fmtDollar(cryptoPnl)}, WR: ${fmtPct(cryptoWR)}`);
  console.log(`  Non-crypto trades: ${nonCryptoOrders.length}, PnL: ${fmtDollar(nonCryptoPnl)}, WR: ${fmtPct(nonCryptoWR)}`);
  console.log(`  Crypto orders are ${fmt((cryptoOrders.length / resolved.length) * 100, 1)}% of resolved trades`);
  console.log(`  Crypto PnL is ${fmt(Math.abs(cryptoPnl) / (Math.abs(cryptoPnl) + Math.abs(nonCryptoPnl)) * 100, 1)}% of total PnL impact`);

  // Sports
  const sportsKeywords = ['win on', 'fc ', 'match', 'game'];
  const sportsOrders = resolved.filter((o: any) => {
    const title = (o.market_title || '').toLowerCase();
    return sportsKeywords.some(k => title.includes(k));
  });
  const sportsPnl = sportsOrders.reduce((s: number, o: any) => s + (o.pnl ?? 0), 0);
  const sportsWR = sportsOrders.length > 0 ? sportsOrders.filter((o: any) => o.outcome === 'WON').length / sportsOrders.length : 0;
  console.log(`\n  Sports trades: ${sportsOrders.length}, PnL: ${fmtDollar(sportsPnl)}, WR: ${fmtPct(sportsWR)}`);

  // ======================================================================
  // ANOMALY 6: Open orders past market end time
  // ======================================================================
  printSection('ANOMALY 6: 481 open orders past market_end_time');
  const now = new Date();
  const pastEnd = allOrders.filter((o: any) => o.outcome === 'OPEN' && o.market_end_time && new Date(o.market_end_time) < now);

  // How old are these?
  const ages = pastEnd.map((o: any) => (now.getTime() - new Date(o.market_end_time).getTime()) / (1000 * 60 * 60));
  const avgAge = ages.length > 0 ? ages.reduce((s, a) => s + a, 0) / ages.length : 0;
  const maxAge = ages.length > 0 ? Math.max(...ages) : 0;

  console.log(`  Count: ${pastEnd.length}`);
  console.log(`  Avg hours past end: ${fmt(avgAge, 1)}`);
  console.log(`  Max hours past end: ${fmt(maxAge, 1)}`);

  // Market titles
  const pastEndMarkets = new Map<string, number>();
  pastEnd.forEach((o: any) => {
    const t = o.market_title || o.condition_id;
    pastEndMarkets.set(t, (pastEndMarkets.get(t) ?? 0) + 1);
  });

  console.log(`\n  Top markets still open past end_time:`);
  Array.from(pastEndMarkets.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([t, c]) => console.log(`    ${c} orders | ${t?.slice(0, 65)}`));

  // ======================================================================
  // ANOMALY 7: Wallet-stored PnL vs calculated PnL mismatch
  // ======================================================================
  printSection('ANOMALY 7: Wallet total_pnl vs order-derived PnL');
  const { data: wallets } = await supabase.from('ft_wallets').select('wallet_id, display_name, total_pnl, starting_balance, current_balance');

  if (wallets) {
    const orderPnlByWallet = new Map<string, number>();
    resolved.forEach((o: any) => {
      orderPnlByWallet.set(o.wallet_id, (orderPnlByWallet.get(o.wallet_id) ?? 0) + (o.pnl ?? 0));
    });

    let mismatches = 0;
    wallets.forEach((w: any) => {
      const orderPnl = orderPnlByWallet.get(w.wallet_id) ?? 0;
      const walletPnl = Number(w.total_pnl ?? 0);
      const diff = Math.abs(orderPnl - walletPnl);
      if (diff > 1.0) {
        mismatches++;
        console.log(`  ${w.display_name}: wallet_pnl=${fmtDollar(walletPnl)}, order_pnl=${fmtDollar(orderPnl)}, diff=${fmtDollar(diff)}`);
      }
    });

    if (mismatches === 0) {
      console.log('  No significant mismatches (all within $1).');
    } else {
      console.log(`\n  ${mismatches} wallets with PnL mismatch > $1`);
    }
  }

  // ======================================================================
  // ANOMALY 8: BUY side and SIDE distribution
  // ======================================================================
  printSection('ANOMALY 8: Side and Token Label Distribution');
  const sideDistribution = new Map<string, number>();
  const tokenDistribution = new Map<string, number>();
  allOrders.forEach((o: any) => {
    const side = (o.side || 'NULL').toUpperCase();
    const token = (o.token_label || 'NULL').toUpperCase();
    sideDistribution.set(side, (sideDistribution.get(side) ?? 0) + 1);
    tokenDistribution.set(token, (tokenDistribution.get(token) ?? 0) + 1);
  });

  console.log('  Side distribution:');
  sideDistribution.forEach((c, s) => console.log(`    ${s}: ${c}`));
  console.log('  Token label distribution:');
  tokenDistribution.forEach((c, t) => console.log(`    ${t}: ${c}`));

  // Check: are there SELL side orders? BUY of YES vs BUY of NO?
  const buyYes = resolved.filter((o: any) => o.side?.toUpperCase() === 'BUY' && o.token_label?.toUpperCase() === 'YES');
  const buyNo = resolved.filter((o: any) => o.side?.toUpperCase() === 'BUY' && o.token_label?.toUpperCase() === 'NO');
  console.log(`\n  Resolved BUY YES: ${buyYes.length}, WR ${buyYes.length > 0 ? fmtPct(buyYes.filter((o: any) => o.outcome === 'WON').length / buyYes.length) : 'N/A'}`);
  console.log(`  Resolved BUY NO: ${buyNo.length}, WR ${buyNo.length > 0 ? fmtPct(buyNo.filter((o: any) => o.outcome === 'WON').length / buyNo.length) : 'N/A'}`);

  // PnL formula check: for WON BUY, pnl should be size * (1 - entry_price) / entry_price
  // For LOST BUY, pnl should be -size
  printSection('ANOMALY 9: PnL Formula Verification');
  const wonBuys = resolved.filter((o: any) => o.outcome === 'WON' && o.side?.toUpperCase() === 'BUY');
  const lostBuys = resolved.filter((o: any) => o.outcome === 'LOST' && o.side?.toUpperCase() === 'BUY');

  console.log(`  Checking WON BUY PnL formula: expected = size * (1 - entry_price) / entry_price`);
  let formulaErrors = 0;
  wonBuys.slice(0, 100).forEach((o: any) => {
    const expected = o.size * (1 - o.entry_price) / o.entry_price;
    const actual = o.pnl ?? 0;
    const diff = Math.abs(expected - actual);
    if (diff > 0.05) {
      formulaErrors++;
      if (formulaErrors <= 3) {
        console.log(`    MISMATCH: expected=${fmtDollar(expected)}, actual=${fmtDollar(actual)}, entry=${fmt(o.entry_price, 3)}, size=${fmtDollar(o.size)}`);
      }
    }
  });
  console.log(`  WON BUY formula mismatches: ${formulaErrors}/${Math.min(wonBuys.length, 100)} checked`);

  console.log(`\n  Checking LOST BUY PnL formula: expected = -size`);
  let lossFormulaErrors = 0;
  lostBuys.slice(0, 100).forEach((o: any) => {
    const expected = -o.size;
    const actual = o.pnl ?? 0;
    const diff = Math.abs(expected - actual);
    if (diff > 0.05) {
      lossFormulaErrors++;
      if (lossFormulaErrors <= 3) {
        console.log(`    MISMATCH: expected=${fmtDollar(expected)}, actual=${fmtDollar(actual)}, entry=${fmt(o.entry_price, 3)}, size=${fmtDollar(o.size)}`);
      }
    }
  });
  console.log(`  LOST BUY formula mismatches: ${lossFormulaErrors}/${Math.min(lostBuys.length, 100)} checked`);

  // ======================================================================
  // TIMING ANALYSIS
  // ======================================================================
  printSection('TIMING: When were orders placed?');
  const orderDates = allOrders.map((o: any) => new Date(o.order_time).toISOString().slice(0, 10));
  const dateMap = new Map<string, number>();
  orderDates.forEach(d => dateMap.set(d, (dateMap.get(d) ?? 0) + 1));

  console.log('  Orders by date:');
  Array.from(dateMap.entries()).sort().forEach(([d, c]) => {
    console.log(`    ${d}: ${c} orders`);
  });

  console.log('\n█ DEEP DIVE COMPLETE █\n');
}

main().catch(err => { console.error(err); process.exit(1); });
