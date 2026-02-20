import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Use globalThis to survive Next.js hot-reloads in dev
const globalCache = globalThis as any;
if (!globalCache.__ftWalletsPublicCache) {
  globalCache.__ftWalletsPublicCache = null as { data: any; timestamp: number } | null;
}

/**
 * GET /api/ft/wallets/public
 *
 * Public endpoint — no auth required.
 * Returns a lightweight summary of bot wallets for the landing page
 * and public bots listing. Computes stats from orders (same as admin route)
 * but skips sensitive data like order details, price maps, etc.
 *
 * Results are cached in-memory for 5 minutes to avoid repeated
 * expensive pagination through ft_orders on every page load.
 */
export async function GET() {
  try {
    const cached = globalCache.__ftWalletsPublicCache;
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    const supabase = createAdminServiceClient();

    const { data: wallets, error } = await supabase
      .from('ft_wallets')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[ft/wallets/public] Wallets query error:', error.message);
      return NextResponse.json({ success: false, error: 'Failed to fetch bots' }, { status: 500 });
    }

    if (!wallets || wallets.length === 0) {
      const empty = { success: true, wallets: [] };
      globalCache.__ftWalletsPublicCache = { data: empty, timestamp: Date.now() };
      return NextResponse.json(empty);
    }

    // Try fast RPC aggregation first; if unavailable, use ft_wallets inline stats
    const statsMap = new Map<string, { total: number; won: number; lost: number }>();
    const { data: rpcStats, error: rpcError } = await supabase.rpc('ft_wallet_order_stats');

    if (!rpcError && rpcStats) {
      for (const row of rpcStats) {
        statsMap.set(row.wallet_id, {
          total: Number(row.total_orders) || 0,
          won: Number(row.won) || 0,
          lost: Number(row.lost) || 0,
        });
      }
    } else if (rpcError) {
      console.warn('[ft/wallets/public] RPC not available, using ft_wallets inline stats');
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
      const totalTrades = Number(w.total_trades) || 0;

      // Use RPC stats if available, otherwise estimate from inline columns
      const s = statsMap.get(w.wallet_id);
      const won = s?.won ?? 0;
      const lost = s?.lost ?? 0;
      const total = s?.total ?? totalTrades;

      return {
        wallet_id: w.wallet_id,
        display_name: w.display_name,
        description: w.description,
        starting_balance: startingBalance,
        current_balance: currentBalance,
        won,
        lost,
        total_trades: total,
        test_status,
        is_active: w.is_active ?? true,
        start_date: w.start_date,
      };
    });

    const result = {
      success: true,
      wallets: summary,
      fetched_at: new Date().toISOString(),
    };

    globalCache.__ftWalletsPublicCache = { data: result, timestamp: Date.now() };

    return NextResponse.json(result);
  } catch (err) {
    console.error('[ft/wallets/public] Uncaught error:', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
