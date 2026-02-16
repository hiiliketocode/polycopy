/**
 * GET /api/ft/target-traders
 *
 * Returns the set of trader wallet addresses that are explicitly targeted by any
 * active FT wallet (target_trader or target_traders in detailed_description).
 *
 * Used by the polymarket-trade-stream worker to filter trades BEFORE calling
 * sync-trade — only trades from these traders are forwarded, avoiding Supabase
 * overload from processing every trade on Polymarket.
 *
 * Auth: CRON_SECRET or admin.
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { parseExtendedFilters } from '@/lib/ft-sync/shared-logic';

export const dynamic = 'force-dynamic';
export const maxAge = 0;

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

    for (const w of wallets || []) {
      const start = new Date(w.start_date);
      const end = new Date(w.end_date);
      if (start > now || end < now) continue;

      const ext = parseExtendedFilters(w as { detailed_description?: string });
      if (ext.target_trader) {
        traders.add(ext.target_trader.toLowerCase().trim());
      }
      for (const t of ext.target_traders || []) {
        if (t?.trim()) traders.add(t.toLowerCase().trim());
      }
    }

    return NextResponse.json({
      traders: Array.from(traders),
      count: traders.size,
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
