import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * GET /api/ft/daily-stats?wallets=W1,W2,...
 *
 * Returns daily aggregated performance metrics per wallet for charting.
 * Computes from resolved ft_orders (WON, LOST, SOLD) grouped by resolved_time date.
 *
 * Returns: { wallet_id, date, won, lost, sold, pnl, cumulative_pnl, trades, win_rate, avg_pnl }[]
 */
export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const walletParam = searchParams.get('wallets');

  const supabase = createAdminServiceClient();

  // Get wallet list — either from param or all active
  let walletIds: string[];
  if (walletParam) {
    walletIds = walletParam.split(',').map(w => w.trim()).filter(Boolean);
  } else {
    const { data } = await supabase.from('ft_wallets').select('wallet_id').eq('is_active', true);
    walletIds = (data || []).map((w: { wallet_id: string }) => w.wallet_id);
  }

  if (walletIds.length === 0) {
    return NextResponse.json({ success: true, data: [], wallets: [] });
  }

  // Fetch resolved orders for selected wallets (paginated)
  type ResolvedOrder = { wallet_id: string; outcome: string; pnl: number; resolved_time: string };
  const allOrders: ResolvedOrder[] = [];
  const PAGE = 1000;

  for (const wid of walletIds) {
    let offset = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from('ft_orders')
        .select('wallet_id, outcome, pnl, resolved_time')
        .eq('wallet_id', wid)
        .in('outcome', ['WON', 'LOST', 'SOLD'])
        .not('resolved_time', 'is', null)
        .order('resolved_time', { ascending: true })
        .range(offset, offset + PAGE - 1);

      if (error || !page || page.length === 0) break;
      allOrders.push(...(page as ResolvedOrder[]));
      if (page.length < PAGE) break;
      offset += PAGE;
    }
  }

  // Aggregate by (wallet_id, date)
  type DayStats = { won: number; lost: number; sold: number; pnl: number; trades: number };
  const byWalletDay = new Map<string, Map<string, DayStats>>();

  for (const o of allOrders) {
    const date = o.resolved_time.slice(0, 10);
    if (!byWalletDay.has(o.wallet_id)) byWalletDay.set(o.wallet_id, new Map());
    const dayMap = byWalletDay.get(o.wallet_id)!;
    if (!dayMap.has(date)) dayMap.set(date, { won: 0, lost: 0, sold: 0, pnl: 0, trades: 0 });
    const d = dayMap.get(date)!;
    d.trades++;
    d.pnl += o.pnl || 0;
    if (o.outcome === 'WON') d.won++;
    else if (o.outcome === 'LOST') d.lost++;
    else if (o.outcome === 'SOLD') d.sold++;
  }

  // Build output with cumulative PnL
  const result: Array<{
    wallet_id: string;
    date: string;
    won: number;
    lost: number;
    sold: number;
    pnl: number;
    cumulative_pnl: number;
    trades: number;
    win_rate: number | null;
    avg_pnl: number;
  }> = [];

  for (const [wid, dayMap] of byWalletDay) {
    const dates = [...dayMap.keys()].sort();
    let cumPnl = 0;
    for (const date of dates) {
      const d = dayMap.get(date)!;
      cumPnl += d.pnl;
      const resolved = d.won + d.lost;
      result.push({
        wallet_id: wid,
        date,
        won: d.won,
        lost: d.lost,
        sold: d.sold,
        pnl: +d.pnl.toFixed(2),
        cumulative_pnl: +cumPnl.toFixed(2),
        trades: d.trades,
        win_rate: resolved > 0 ? +(d.won / resolved).toFixed(4) : null,
        avg_pnl: d.trades > 0 ? +(d.pnl / d.trades).toFixed(2) : 0,
      });
    }
  }

  // Get wallet display names
  const { data: walletNames } = await supabase
    .from('ft_wallets')
    .select('wallet_id, display_name, is_active')
    .in('wallet_id', walletIds);

  return NextResponse.json({
    success: true,
    data: result,
    wallets: (walletNames || []).map((w: { wallet_id: string; display_name: string; is_active: boolean }) => ({
      id: w.wallet_id,
      name: w.display_name,
      active: w.is_active,
    })),
  });
}
