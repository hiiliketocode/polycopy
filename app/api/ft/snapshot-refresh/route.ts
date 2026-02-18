import { NextRequest, NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';

/**
 * POST /api/ft/snapshot-refresh
 *
 * Computes and upserts a fresh FT performance snapshot for a specific wallet.
 * Called on-demand when an admin opens a bot detail page or clicks "Refresh".
 * Uses the current timestamp (not rounded to the hour) so it doesn't overwrite
 * the hourly cron snapshots.
 *
 * Body: { wallet_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get('authorization');
    const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

    if (!isCronAuth) {
      const cookie = req.headers.get('cookie');
      if (!cookie) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json().catch(() => ({}));
    const walletId = body.wallet_id;
    if (!walletId) {
      return NextResponse.json({ error: 'wallet_id required' }, { status: 400 });
    }

    const supabase = createAdminServiceClient();

    const { data: wallet, error: walletErr } = await supabase
      .from('ft_wallets')
      .select('wallet_id, starting_balance, total_pnl, total_trades, open_positions')
      .eq('wallet_id', walletId)
      .single();

    if (walletErr || !wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }

    const startingBalance = Number(wallet.starting_balance) || 1000;
    const realizedPnl = Number(wallet.total_pnl) || 0;

    const { data: openOrders } = await supabase
      .from('ft_orders')
      .select('size, condition_id, token_label, entry_price')
      .eq('wallet_id', walletId)
      .eq('outcome', 'OPEN')
      .limit(500);

    const openExposure = (openOrders || []).reduce((s, o) => s + (o.size || 0), 0);

    let unrealizedPnl = 0;
    if (openOrders && openOrders.length > 0) {
      const conditionIds = [
        ...new Set(openOrders.map((o: { condition_id?: string }) => o.condition_id).filter(Boolean)),
      ];
      const { data: markets } = await supabase
        .from('markets')
        .select('condition_id, outcome_prices, outcomes')
        .in('condition_id', conditionIds);

      const priceByCondition = new Map<string, { outcomes: string[]; prices: number[] }>();
      for (const m of markets || []) {
        const op = m.outcome_prices as
          | { outcomes?: string[]; outcomePrices?: number[]; labels?: string[]; prices?: number[] }
          | number[]
          | null;
        const mOutcomes = (m as { outcomes?: string[] | string }).outcomes;
        const toStrArr = (x: unknown): string[] => {
          if (Array.isArray(x)) return x.map(String);
          if (typeof x === 'string') {
            try {
              const j = JSON.parse(x);
              return Array.isArray(j) ? j.map(String) : [];
            } catch {
              return [];
            }
          }
          return [];
        };
        let outcomes: string[] = [];
        let prices: number[] = [];
        if (op && typeof op === 'object' && !Array.isArray(op)) {
          outcomes = toStrArr(op.outcomes ?? op.labels ?? mOutcomes);
          prices = (op.outcomePrices ?? op.prices ?? []).map((p: unknown) => Number(p) || 0);
        } else if (Array.isArray(op) && op.length > 0) {
          prices = op.map((p: unknown) => Number(p) || 0);
          outcomes = toStrArr(mOutcomes).length
            ? toStrArr(mOutcomes)
            : prices.length === 2
              ? ['Yes', 'No']
              : prices.map((_, i) => `Outcome ${i}`);
        }
        if (outcomes?.length && prices?.length)
          priceByCondition.set(m.condition_id, { outcomes, prices });
      }

      const outcomeLabel = (o: unknown) =>
        (typeof o === 'string'
          ? o
          : ((o as { LABEL?: string; label?: string })?.LABEL ??
            (o as { label?: string })?.label ??
            '')) || '';

      for (const o of openOrders) {
        const market = priceByCondition.get(o.condition_id || '');
        if (!market || !o.entry_price || !o.size) continue;
        const tokenLabel = (o.token_label || 'YES').toLowerCase().trim();
        let idx = market.outcomes.findIndex(
          (out: string) => outcomeLabel(out).toLowerCase().trim() === tokenLabel,
        );
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
    const returnPct =
      startingBalance > 0 ? Number(((totalPnl / startingBalance) * 100).toFixed(2)) : 0;

    const now = new Date();
    const { error: insertErr } = await supabase.from('ft_performance_snapshots').upsert(
      {
        wallet_id: walletId,
        snapshot_at: now.toISOString(),
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
      { onConflict: 'wallet_id,snapshot_at' },
    );

    if (insertErr) {
      console.error('[ft/snapshot-refresh] Upsert error:', insertErr.message);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      snapshot: {
        wallet_id: walletId,
        snapshot_at: now.toISOString(),
        realized_pnl: realizedPnl,
        unrealized_pnl: unrealizedPnl,
        total_pnl: totalPnl,
        return_pct: returnPct,
        cash,
        open_exposure: openExposure,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ft/snapshot-refresh] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
