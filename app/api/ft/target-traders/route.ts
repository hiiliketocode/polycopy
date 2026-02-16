/**
 * GET /api/ft/target-traders
 *
 * Returns the set of trader wallet addresses that the polymarket-trade-stream
 * worker should forward to sync-trade.
 *
 * 1. Explicit targets: target_trader / target_traders from active FT wallets.
 * 2. Leaderboard mode: When any active FT wallet has NO target_trader/target_traders,
 *    it is a "leaderboard-style" strategy that should see all trades from tracked
 *    traders. We include the traders table (leaderboard-synced wallets) so those
 *    FTs can evaluate trades by their rules (market category, edge, etc.).
 *
 * Auth: CRON_SECRET or admin.
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import {
  parseExtendedFilters,
  type FTWallet,
} from '@/lib/ft-sync/shared-logic';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const supabase = createAdminServiceClient();
  const now = new Date();

  try {
    const { data: wallets, error } = await supabase
      .from('ft_wallets')
      .select('wallet_id, start_date, end_date, is_active, detailed_description')
      .eq('is_active', true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const traders = new Set<string>();
    let hasLeaderboardWallets = false;

    for (const w of wallets || []) {
      const start = new Date(w.start_date);
      const end = new Date(w.end_date);
      if (start > now || end < now) continue;

      const ext = parseExtendedFilters(w as FTWallet);
      if (ext.target_trader) {
        traders.add(ext.target_trader.toLowerCase().trim());
      }
      for (const t of ext.target_traders || []) {
        if (t?.trim()) traders.add(t.toLowerCase().trim());
      }
      // Leaderboard-style: no target_trader and no target_traders
      if (!ext.target_trader && (!ext.target_traders || ext.target_traders.length === 0)) {
        hasLeaderboardWallets = true;
      }
    }

    // When leaderboard-style FTs exist, include traders from our traders table
    // (synced from Polymarket leaderboard) so they can evaluate trades by rules
    if (hasLeaderboardWallets) {
      const { data: traderRows } = await supabase
        .from('traders')
        .select('wallet_address');
      for (const row of traderRows || []) {
        const addr = (row.wallet_address || '').toLowerCase().trim();
        if (addr) traders.add(addr);
      }
    }

    return NextResponse.json({
      traders: Array.from(traders),
      count: traders.size,
      has_leaderboard_wallets: hasLeaderboardWallets,
      updated_at: now.toISOString(),
    });
  } catch (err) {
    console.error('[ft/target-traders] Error:', err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
