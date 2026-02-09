#!/usr/bin/env npx tsx
/**
 * Data audit: verify FT Realized P&L and Recent Trades consistency against the DB.
 * Run: npx tsx scripts/audit-ft-realized-pnl-data.ts [wallet_id]
 * If wallet_id is omitted, audits all wallets with resolved orders.
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

const PAGE_SIZE = 1000;

type FTOrder = {
  order_id: string;
  wallet_id: string;
  outcome: string | null;
  pnl: number | null;
  size: number | null;
  order_time: string;
};

async function fetchAllOrdersForWallet(walletId: string): Promise<FTOrder[]> {
  const out: FTOrder[] = [];
  let offset = 0;
  while (true) {
    const { data: page, error } = await supabase
      .from('ft_orders')
      .select('order_id, wallet_id, outcome, pnl, size, order_time')
      .eq('wallet_id', walletId)
      .order('order_time', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!page?.length) break;
    out.push(...(page as FTOrder[]));
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

async function run() {
  const singleWallet = process.argv[2] || null;
  console.log('\n=== FT Realized P&L data audit ===\n');
  if (singleWallet) {
    console.log(`Auditing wallet: ${singleWallet}\n`);
  } else {
    console.log('Auditing all wallets with resolved orders.\n');
  }

  // Get wallet list
  let walletIds: string[] = [];
  if (singleWallet) {
    const { data: w, error } = await supabase
      .from('ft_wallets')
      .select('wallet_id')
      .eq('wallet_id', singleWallet)
      .single();
    if (error || !w) {
      console.error('Wallet not found:', singleWallet, error?.message);
      process.exit(1);
    }
    walletIds = [w.wallet_id];
  } else {
    const { data: wallets, error } = await supabase
      .from('ft_wallets')
      .select('wallet_id')
      .order('wallet_id');
    if (error) {
      console.error('Error fetching wallets:', error.message);
      process.exit(1);
    }
    walletIds = (wallets || []).map((r) => r.wallet_id);
  }

  let totalIssues = 0;

  for (const walletId of walletIds) {
    const orders = await fetchAllOrdersForWallet(walletId);
    const resolved = orders.filter((o) => o.outcome !== 'OPEN' && o.outcome != null);
    if (resolved.length === 0) {
      console.log(`[${walletId}] No resolved orders — skip\n`);
      continue;
    }

    const won = orders.filter((o) => o.outcome === 'WON').length;
    const lost = orders.filter((o) => o.outcome === 'LOST').length;
    const otherOutcome = orders.filter((o) => o.outcome && o.outcome !== 'OPEN' && o.outcome !== 'WON' && o.outcome !== 'LOST');
    const openCount = orders.filter((o) => o.outcome === 'OPEN').length;

    const realizedPnlFromDb = resolved.reduce((sum, o) => sum + (Number(o.pnl) || 0), 0);
    const first50 = resolved.slice(0, 50);
    const sumFirst50 = first50.reduce((sum, o) => sum + (Number(o.pnl) || 0), 0);

    const nullPnl = resolved.filter((o) => o.pnl == null);
    const nullSize = resolved.filter((o) => o.size == null);

    console.log(`--- ${walletId} ---`);
    console.log(`  Total orders: ${orders.length} (open: ${openCount}, resolved: ${resolved.length})`);
    console.log(`  Resolved breakdown: WON=${won}, LOST=${lost}`);
    if (otherOutcome.length > 0) {
      console.log(`  ⚠ Unexpected outcome values: ${otherOutcome.length} (${[...new Set(otherOutcome.map((o) => o.outcome))].join(', ')})`);
      totalIssues++;
    }
    console.log(`  Realized PnL (sum of all resolved pnl): ${realizedPnlFromDb.toFixed(2)}`);
    console.log(`  Sum of first 50 resolved (by order_time desc): ${sumFirst50.toFixed(2)}`);
    if (resolved.length > 50) {
      const diff = realizedPnlFromDb - sumFirst50;
      console.log(`  Difference (total - first 50): ${diff.toFixed(2)} (expected ≠ 0 when resolved > 50)`);
    } else {
      const match = Math.abs(realizedPnlFromDb - sumFirst50) < 0.02;
      console.log(`  First 50 = all resolved; sum matches total: ${match ? '✓' : '✗ MISMATCH'}`);
      if (!match) totalIssues++;
    }
    if (nullPnl.length > 0) {
      console.log(`  ⚠ Resolved orders with null pnl: ${nullPnl.length}`);
      totalIssues++;
    }
    if (nullSize.length > 0) {
      console.log(`  ⚠ Resolved orders with null size: ${nullSize.length}`);
      totalIssues++;
    }
    console.log('');
  }

  console.log('=== Summary ===');
  if (totalIssues > 0) {
    console.log(`Found ${totalIssues} potential issue(s). Review above.`);
  } else {
    console.log('No data issues found. Realized PnL is sum of all resolved; "Recent Trades" = first 50 only.');
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
