import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';

/**
 * GET /api/ft/wallets/public
 *
 * Public endpoint — no auth required.
 * Returns a lightweight summary of bot wallets for the landing page
 * and public bots listing. Computes stats from orders (same as admin route)
 * but skips sensitive data like order details, price maps, etc.
 */
export async function GET() {
  try {
    const supabase = createAdminServiceClient();

    // Fetch all wallets (select all columns to avoid guessing schema)
    const { data: wallets, error } = await supabase
      .from('ft_wallets')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[ft/wallets/public] Wallets query error:', error.message);
      return NextResponse.json({ success: false, error: 'Failed to fetch bots' }, { status: 500 });
    }

    if (!wallets || wallets.length === 0) {
      return NextResponse.json({ success: true, wallets: [] });
    }

    // For each wallet, count won/lost/total from ft_orders
    const walletIds = wallets.map((w: any) => w.wallet_id);

    // Build per-wallet stats
    const statsMap = new Map<string, { total: number; won: number; lost: number }>();
    for (const wid of walletIds) {
      statsMap.set(wid, { total: 0, won: 0, lost: 0 });
    }

    // Paginate through all orders (Supabase caps at 1000 rows per request)
    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from('ft_orders')
        .select('wallet_id, outcome')
        .in('wallet_id', walletIds)
        .range(offset, offset + PAGE_SIZE - 1);

      if (pageError) {
        console.error('[ft/wallets/public] Orders page error:', pageError.message);
        break;
      }
      if (!page || page.length === 0) break;

      for (const o of page) {
        const s = statsMap.get(o.wallet_id);
        if (!s) continue;
        s.total++;
        if (o.outcome === 'WON') s.won++;
        else if (o.outcome === 'LOST') s.lost++;
      }

      hasMore = page.length === PAGE_SIZE;
      offset += PAGE_SIZE;
    }

    const now = new Date();
    const summary = wallets.map((w: any) => {
      const startDate = new Date(w.start_date);
      const endDate = new Date(w.end_date);
      let test_status: 'ACTIVE' | 'ENDED' | 'SCHEDULED';
      if (endDate < now) test_status = 'ENDED';
      else if (startDate > now) test_status = 'SCHEDULED';
      else test_status = 'ACTIVE';

      const startingBalance = Number(w.starting_balance) || 1000;
      const currentBalance = Number(w.current_balance) || startingBalance;
      const s = statsMap.get(w.wallet_id) || { total: 0, won: 0, lost: 0 };

      return {
        wallet_id: w.wallet_id,
        display_name: w.display_name,
        description: w.description,
        starting_balance: startingBalance,
        current_balance: currentBalance,
        won: s.won,
        lost: s.lost,
        total_trades: s.total,
        test_status,
        is_active: w.is_active ?? true,
      };
    });

    return NextResponse.json({
      success: true,
      wallets: summary,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[ft/wallets/public] Uncaught error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
