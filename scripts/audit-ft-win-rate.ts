#!/usr/bin/env npx tsx
/**
 * Audit FT win rate - investigate low win rate by checking:
 * 1. WON orders: token_label should MATCH winning_label
 * 2. LOST orders: token_label should NOT match winning_label
 * 3. Any inversions or label format mismatches
 *
 * Run: npx tsx scripts/audit-ft-win-rate.ts
 */
import { config } from 'dotenv';
import path from 'path';
config({ path: path.resolve(process.cwd(), '.env.local') });
config();
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalize(s: string | null | undefined): string {
  return (s || '').trim().toUpperCase();
}

async function main() {
  console.log('\n=== FT Win Rate Audit ===\n');

  const { data: orders, error } = await supabase
    .from('ft_orders')
    .select('order_id, wallet_id, outcome, token_label, winning_label, side, entry_price, size, pnl, market_title')
    .in('outcome', ['WON', 'LOST']);

  if (error) {
    console.error('Error fetching orders:', error.message);
    process.exit(1);
  }

  if (!orders || orders.length === 0) {
    console.log('No resolved orders found.');
    return;
  }

  const won = orders.filter((o) => o.outcome === 'WON');
  const lost = orders.filter((o) => o.outcome === 'LOST');
  const total = orders.length;
  const winRate = total > 0 ? (won.length / total) * 100 : 0;

  console.log(`Total resolved: ${total} (${won.length} WON, ${lost.length} LOST)`);
  console.log(`Overall win rate: ${winRate.toFixed(1)}%\n`);

  // === Consistency check: do labels align with outcome? ===
  let wonLabelMismatch = 0; // WON but token_label !== winning_label (BUG)
  let lostLabelMatch = 0;    // LOST but token_label === winning_label (BUG - we'd have incorrectly marked as lost)
  const mismatchExamples: Array<{ outcome: string; token: string; winning: string; market: string }> = [];

  for (const o of orders) {
    const tok = normalize(o.token_label);
    const win = normalize(o.winning_label);
    const labelsMatch = tok === win;

    if (o.outcome === 'WON' && !labelsMatch) {
      wonLabelMismatch++;
      if (mismatchExamples.length < 5) {
        mismatchExamples.push({
          outcome: 'WON',
          token: o.token_label || '(null)',
          winning: o.winning_label || '(null)',
          market: (o.market_title || '').slice(0, 50),
        });
      }
    } else if (o.outcome === 'LOST' && labelsMatch) {
      lostLabelMatch++;
      if (mismatchExamples.length < 10) {
        mismatchExamples.push({
          outcome: 'LOST',
          token: o.token_label || '(null)',
          winning: o.winning_label || '(null)',
          market: (o.market_title || '').slice(0, 50),
        });
      }
    }
  }

  console.log('--- Label consistency ---');
  console.log(`WON orders where token_label !== winning_label (potential bug): ${wonLabelMismatch}`);
  console.log(`LOST orders where token_label === winning_label (potential bug): ${lostLabelMatch}`);

  if (wonLabelMismatch > 0 || lostLabelMatch > 0) {
    console.log('\nExample mismatches:');
    for (const ex of mismatchExamples) {
      console.log(`  ${ex.outcome}: token="${ex.token}" winning="${ex.winning}" | ${ex.market}`);
    }
  } else {
    console.log('✓ All resolved orders have consistent token_label vs winning_label (no obvious inversion).');
  }

  // === Label format distribution ===
  const tokenLabels = new Map<string, number>();
  const winningLabels = new Map<string, number>();
  for (const o of orders) {
    const t = o.token_label || '(null)';
    const w = o.winning_label || '(null)';
    tokenLabels.set(t, (tokenLabels.get(t) || 0) + 1);
    winningLabels.set(w, (winningLabels.get(w) || 0) + 1);
  }

  console.log('\n--- Token labels (what we bought) ---');
  const sortedTokens = [...tokenLabels.entries()].sort((a, b) => b[1] - a[1]);
  for (const [label, count] of sortedTokens.slice(0, 15)) {
    console.log(`  "${label}": ${count}`);
  }

  console.log('\n--- Winning labels (Polymarket resolution) ---');
  const sortedWinning = [...winningLabels.entries()].sort((a, b) => b[1] - a[1]);
  for (const [label, count] of sortedWinning.slice(0, 15)) {
    console.log(`  "${label}": ${count}`);
  }

  // === Win rate by entry price bucket ===
  const buckets: Record<string, { won: number; lost: number }> = {
    '0.01-0.20': { won: 0, lost: 0 },
    '0.21-0.40': { won: 0, lost: 0 },
    '0.41-0.60': { won: 0, lost: 0 },
    '0.61-0.80': { won: 0, lost: 0 },
    '0.81-0.99': { won: 0, lost: 0 },
  };

  for (const o of orders) {
    const p = Number(o.entry_price) || 0;
    let key: string;
    if (p <= 0.2) key = '0.01-0.20';
    else if (p <= 0.4) key = '0.21-0.40';
    else if (p <= 0.6) key = '0.41-0.60';
    else if (p <= 0.8) key = '0.61-0.80';
    else key = '0.81-0.99';

    if (o.outcome === 'WON') buckets[key].won++;
    else buckets[key].lost++;
  }

  console.log('\n--- Win rate by entry price ---');
  for (const [range, { won: w, lost: l }] of Object.entries(buckets)) {
    const t = w + l;
    const wr = t > 0 ? ((w / t) * 100).toFixed(0) : '-';
    console.log(`  ${range}: ${w}/${t} (${wr}% WR)`);
  }

  // === Win rate by wallet ===
  const byWallet = new Map<string, { won: number; lost: number }>();
  for (const o of orders) {
    const cur = byWallet.get(o.wallet_id) || { won: 0, lost: 0 };
    if (o.outcome === 'WON') cur.won++;
    else cur.lost++;
    byWallet.set(o.wallet_id, cur);
  }

  console.log('\n--- Win rate by wallet (top 15 by volume) ---');
  const walletRows = [...byWallet.entries()]
    .map(([id, v]) => ({ id, ...v, total: v.won + v.lost }))
    .filter((r) => r.total >= 3)
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  for (const r of walletRows) {
    const wr = ((r.won / r.total) * 100).toFixed(0);
    console.log(`  ${r.id}: ${r.won}/${r.total} (${wr}% WR)`);
  }

  // === PnL sanity: WON should have pnl > 0, LOST should have pnl < 0 ===
  let wonNegPnl = 0;
  let lostPosPnl = 0;
  for (const o of orders) {
    const pnl = Number(o.pnl) ?? 0;
    if (o.outcome === 'WON' && pnl < 0) wonNegPnl++;
    if (o.outcome === 'LOST' && pnl > 0) lostPosPnl++;
  }

  console.log('\n--- PnL sanity ---');
  console.log(`WON orders with negative PnL (bug): ${wonNegPnl}`);
  console.log(`LOST orders with positive PnL (bug): ${lostPosPnl}`);

  console.log('\n=== Audit complete ===\n');
}

main().catch(console.error);
