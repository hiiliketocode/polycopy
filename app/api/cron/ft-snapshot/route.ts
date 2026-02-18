import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';

/**
 * Cron: GET /api/cron/ft-snapshot
 * Runs every hour to record performance snapshots for active FT wallets.
 * Enables line charts for PnL %, cash, and cumulative return over time.
 * Requires CRON_SECRET when set.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const supabase = createAdminServiceClient();
    const now = new Date();
    // Truncate to hour boundary (e.g. 14:30 -> 14:00)
    const snapshotAt = new Date(now);
    snapshotAt.setMinutes(0, 0, 0);

    // 1. Get active wallets (in test period)
    const { data: wallets, error: walletsErr } = await supabase
      .from('ft_wallets')
      .select('wallet_id, starting_balance, total_pnl, total_trades, open_positions, start_date, end_date')
      .eq('is_active', true);

    if (walletsErr || !wallets?.length) {
      return NextResponse.json({
        success: true,
        snapshots_recorded: 0,
        message: 'No active wallets',
      });
    }

    const activeWallets = wallets.filter((w) => {
      const wAny = w as { start_date?: string; end_date?: string };
      if (!wAny.start_date || !wAny.end_date) return true;
      const start = new Date(wAny.start_date);
      const end = new Date(wAny.end_date);
      return start <= now && end >= now;
    });

    if (activeWallets.length === 0) {
      return NextResponse.json({
        success: true,
        snapshots_recorded: 0,
        message: 'No wallets in active test period',
      });
    }

    let recorded = 0;
    for (const wallet of activeWallets) {
      const walletId = wallet.wallet_id;
      const startingBalance = Number(wallet.starting_balance) || 1000;

      // wallet.total_pnl already tracks realized PnL — no need to re-sum all resolved orders.
      // Only fetch OPEN orders (typically dozens, not thousands).
      const realizedPnl = Number(wallet.total_pnl) || 0;

      const { data: openOrders } = await supabase
        .from('ft_orders')
        .select('size, condition_id, token_label, entry_price')
        .eq('wallet_id', walletId)
        .eq('outcome', 'OPEN')
        .limit(500);

      const openExposure = (openOrders || []).reduce((s, o) => s + (o.size || 0), 0);

      // Compute unrealized PnL from open positions (wallet.total_pnl only has realized)
      let unrealizedPnl = 0;
      if (openOrders && openOrders.length > 0) {
        const conditionIds = [...new Set(openOrders.map((o: { condition_id?: string }) => o.condition_id).filter(Boolean))];
        const { data: markets } = await supabase
          .from('markets')
          .select('condition_id, outcome_prices, outcomes')
          .in('condition_id', conditionIds);
        const priceByCondition = new Map<string, { outcomes: string[]; prices: number[] }>();
        for (const m of markets || []) {
          const op = m.outcome_prices as { outcomes?: string[]; outcomePrices?: number[]; labels?: string[]; prices?: number[] } | number[] | null;
          const mOutcomes = (m as { outcomes?: string[] | string }).outcomes;
          const toStrArr = (x: unknown): string[] => {
            if (Array.isArray(x)) return x.map(String);
            if (typeof x === 'string') { try { const j = JSON.parse(x); return Array.isArray(j) ? j.map(String) : []; } catch { return []; } }
            return [];
          };
          let outcomes: string[] = [];
          let prices: number[] = [];
          if (op && typeof op === 'object' && !Array.isArray(op)) {
            outcomes = toStrArr(op.outcomes ?? op.labels ?? mOutcomes);
            prices = (op.outcomePrices ?? op.prices ?? []).map((p: unknown) => Number(p) || 0);
          } else if (Array.isArray(op) && op.length > 0) {
            prices = op.map((p: unknown) => Number(p) || 0);
            outcomes = toStrArr(mOutcomes).length ? toStrArr(mOutcomes) : (prices.length === 2 ? ['Yes', 'No'] : prices.map((_, i) => `Outcome ${i}`));
          }
          if (outcomes?.length && prices?.length) priceByCondition.set(m.condition_id, { outcomes, prices });
        }
        const outcomeLabel = (o: unknown) => (typeof o === 'string' ? o : (o as { LABEL?: string; label?: string })?.LABEL ?? (o as { label?: string })?.label ?? '') || '';
        for (const o of openOrders) {
          const market = priceByCondition.get(o.condition_id || '');
          if (!market || !o.entry_price || !o.size) continue;
          const tokenLabel = (o.token_label || 'YES').toLowerCase().trim();
          let idx = market.outcomes.findIndex((out: string) => outcomeLabel(out).toLowerCase().trim() === tokenLabel);
          if (idx < 0 && market.outcomes.length === 2) idx = tokenLabel === 'yes' ? 0 : 1;
          if (idx >= 0 && market.prices[idx] != null) {
            const currentPrice = market.prices[idx];
            const shares = o.size / o.entry_price;
            unrealizedPnl += shares * currentPrice - o.size;
          }
        }
      }
      const totalPnl = realizedPnl + unrealizedPnl;
      const cash = Math.max(0, startingBalance + realizedPnl - openExposure);
      const returnPct = startingBalance > 0
        ? Number(((totalPnl / startingBalance) * 100).toFixed(2))
        : 0;

      const { error: insertErr } = await supabase
        .from('ft_performance_snapshots')
        .upsert(
          {
            wallet_id: walletId,
            snapshot_at: snapshotAt.toISOString(),
            starting_balance: startingBalance,
            cash,
            realized_pnl: realizedPnl,
            unrealized_pnl: unrealizedPnl,
            total_pnl: totalPnl,
            return_pct: returnPct,
            open_exposure: openExposure,
            total_trades: wallet.total_trades ?? 0,
            open_positions: wallet.open_positions ?? (openOrders?.length ?? 0),
          },
          { onConflict: 'wallet_id,snapshot_at' }
        );

      if (!insertErr) recorded++;
    }

    return NextResponse.json({
      success: true,
      snapshots_recorded: recorded,
      snapshot_at: snapshotAt.toISOString(),
    });
  } catch (err: unknown) {
    console.error('[cron/ft-snapshot] Error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
