/**
 * POST /api/ft/sync-trade
 *
 * Process a single trade from the Polymarket WebSocket stream (activity/trades).
 * Called by the polymarket-trade-stream worker for real-time copy-trading.
 *
 * Body: { trade: { proxyWallet, conditionId, price, side, size, timestamp, outcome, asset, transactionHash, title, slug, ... } }
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { isTraderExcluded } from '@/lib/ft-excluded-traders';
import {
  calculateBetSize,
  FT_SLIPPAGE_PCT,
  getSourceTradeId,
  parseExtendedFilters,
  parseTimestamp,
  evaluateTrade,
  type EnrichedTrade,
  type FTWallet,
  type MarketInfo,
} from '@/lib/ft-sync/shared-logic';
export const maxDuration = 60;

/** Map WebSocket trade payload to our EnrichedTrade shape */
function wsTradeToEnriched(
  payload: Record<string, unknown>,
  stats: { winRate: number; tradeCount: number; avgTradeSize: number }
): EnrichedTrade {
  const w = String(payload.proxyWallet || payload.proxy_wallet || '').toLowerCase();
  const size = Number(payload.size ?? 0);
  const price = Number(payload.price ?? 0);
  const tradeValue = size * price;
  const conviction = stats.avgTradeSize > 0 ? tradeValue / stats.avgTradeSize : 1;

  return {
    id: payload.id as string | undefined,
    transactionHash: (payload.transactionHash || payload.transaction_hash) as string | undefined,
    asset: payload.asset as string | undefined,
    conditionId: (payload.conditionId || payload.condition_id) as string | undefined,
    title: payload.title as string | undefined,
    slug: payload.slug as string | undefined,
    outcome: (payload.outcome || 'YES') as string,
    side: (payload.side || 'BUY') as string,
    size,
    price,
    timestamp: payload.timestamp as string | number | undefined,
    proxyWallet: w,
    traderWallet: w,
    traderWinRate: stats.winRate,
    traderTradeCount: stats.tradeCount,
    traderAvgTradeSize: stats.avgTradeSize,
    tradeValue,
    conviction,
  };
}

export async function POST(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  let body: { trade?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const tradePayload = body.trade;
  if (!tradePayload || typeof tradePayload !== 'object') {
    return NextResponse.json({ error: 'trade object required' }, { status: 400 });
  }

  const side = String(tradePayload.side || '').toUpperCase();
  if (side !== 'BUY') {
    return NextResponse.json({ inserted: 0, message: 'Ignoring non-BUY trade' });
  }

  const conditionId = tradePayload.conditionId || tradePayload.condition_id;
  const proxyWallet = String(tradePayload.proxyWallet || tradePayload.proxy_wallet || '').toLowerCase();
  if (!conditionId || !proxyWallet) {
    return NextResponse.json({ error: 'conditionId and proxyWallet required' }, { status: 400 });
  }

  if (isTraderExcluded(proxyWallet)) {
    return NextResponse.json({ inserted: 0, message: 'Trader excluded' });
  }

  const supabase = createAdminServiceClient();
  const now = new Date();

  try {
    // 1. Get trader stats
    const { data: statRow } = await supabase
      .from('trader_global_stats')
      .select('wallet_address, l_win_rate, d30_win_rate, l_count, d30_count, l_avg_trade_size_usd, d30_avg_trade_size_usd')
      .eq('wallet_address', proxyWallet)
      .maybeSingle();

    const stats = statRow
      ? {
          winRate: Number(statRow.d30_win_rate ?? statRow.l_win_rate ?? 0.5),
          tradeCount: Number(statRow.d30_count ?? statRow.l_count ?? 0),
          avgTradeSize: Number(statRow.d30_avg_trade_size_usd ?? statRow.l_avg_trade_size_usd ?? 0),
        }
      : { winRate: 0.5, tradeCount: 50, avgTradeSize: 0 };

    const trade = wsTradeToEnriched(tradePayload, stats);

    // 2. Get market info
    const { data: marketRow } = await supabase
      .from('markets')
      .select('condition_id, end_time, closed, resolved_outcome, winning_side, title, slug, outcome_prices, outcomes, tags, start_time, game_start_time, market_subtype, bet_structure')
      .eq('condition_id', conditionId)
      .maybeSingle();

    let market: MarketInfo | null = null;
    if (marketRow) {
      const isResolved =
        marketRow.closed ||
        marketRow.resolved_outcome !== null ||
        marketRow.winning_side !== null;
      market = {
        endTime: marketRow.end_time ? new Date(marketRow.end_time) : null,
        closed: marketRow.closed || false,
        resolved: isResolved,
        title: marketRow.title,
        slug: marketRow.slug,
        outcome_prices: marketRow.outcome_prices,
        outcomes: marketRow.outcomes,
        tags: marketRow.tags,
        end_time: marketRow.end_time,
        start_time: marketRow.start_time,
        game_start_time: marketRow.game_start_time ?? null,
      };
    }

    if (!market) {
      try {
        const res = await fetch(
          `https://gamma-api.polymarket.com/markets?condition_ids=${conditionId}`,
          { headers: { Accept: 'application/json' } }
        );
        if (res.ok) {
          const arr = await res.json();
          const m = Array.isArray(arr) ? arr[0] : arr;
          if (m) {
            const endTime = m.endDate || m.end_date ? new Date(m.endDate || m.end_date) : null;
            const closed = m.closed ?? false;
            market = {
              endTime,
              closed,
              resolved: closed,
              title: m.question || m.title,
              slug: m.slug,
              outcome_prices: m.outcomePrices,
              outcomes: m.outcomes || ['Yes', 'No'],
              tags: m.tags || [],
              end_time: m.endDate || m.end_date,
              start_time: m.startDate || m.start_date,
              game_start_time: (m.gameStartTime || m.game_start_time) ?? null,
            };
          }
        }
      } catch {
        // ignore
      }
    }

    if (!market) {
      return NextResponse.json({ inserted: 0, message: 'Market not found' });
    }

    // 3. Get active wallets that might want this trader
    const { data: wallets } = await supabase
      .from('ft_wallets')
      .select('*')
      .eq('is_active', true);

    const activeWallets = (wallets || []).filter((w: FTWallet) => {
      const start = new Date(w.start_date);
      const end = new Date(w.end_date);
      return start <= now && end >= now;
    }) as FTWallet[];

    // Filter to wallets that explicitly target this trader (target_trader or target_traders).
    // Leaderboard wallets (no target) are handled by the full cron sync for now.
    const walletsToCheck = activeWallets.filter((w) => {
      const ext = parseExtendedFilters(w);
      if (ext.target_trader && proxyWallet === ext.target_trader.toLowerCase()) return true;
      if (ext.target_traders?.some((t) => proxyWallet === (t || '').toLowerCase())) return true;
      return false;
    });

    if (walletsToCheck.length === 0) {
      return NextResponse.json({ inserted: 0, message: 'No wallets track this trader' });
    }

    // 4. For each wallet: evaluate and insert if qualifies
    let inserted = 0;
    const tradeTime = parseTimestamp(trade.timestamp);
    if (!tradeTime) {
      return NextResponse.json({ inserted: 0, message: 'Invalid timestamp' });
    }

    for (const wallet of walletsToCheck) {
      const lastSyncTime = wallet.last_sync_time ? new Date(wallet.last_sync_time) : new Date(wallet.start_date);
      const { data: walletOrders } = await supabase
        .from('ft_orders')
        .select('outcome, size, pnl, source_trade_id')
        .eq('wallet_id', wallet.wallet_id)
        .limit(5000);

      const existingSourceIds = new Set<string>();
      let openExposure = 0;
      let realizedPnl = 0;
      for (const o of walletOrders || []) {
        if (o.source_trade_id) existingSourceIds.add(o.source_trade_id);
        if (o.outcome === 'OPEN') openExposure += Number(o.size) || 0;
        if (o.outcome === 'WON' || o.outcome === 'LOST') realizedPnl += Number(o.pnl) || 0;
      }

      const sourceTradeId = getSourceTradeId(trade);
      if (existingSourceIds.has(sourceTradeId)) continue;

      const startingBalance = wallet.starting_balance || 1000;
      const effectiveBankroll = Math.max(0, startingBalance + realizedPnl - openExposure);

      const result = await evaluateTrade(
        trade,
        wallet,
        market,
        now,
        lastSyncTime,
        effectiveBankroll,
        undefined,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      if (!result.qualifies || !result.betSize) continue;

      const priceWithSlippage = result.priceWithSlippage ?? Math.min(0.9999, Number(trade.price) * (1 + FT_SLIPPAGE_PCT));
      const effectiveBetSize = result.betSize;

      const ftOrder = {
        wallet_id: wallet.wallet_id,
        order_type: 'FT',
        side: trade.side || 'BUY',
        market_slug: trade.slug || null,
        condition_id: trade.conditionId,
        market_title: trade.title || null,
        market_end_time: market.endTime?.toISOString() || null,
        token_label: trade.outcome || 'YES',
        source_trade_id: sourceTradeId,
        trader_address: trade.traderWallet,
        entry_price: priceWithSlippage,
        size: effectiveBetSize,
        trader_win_rate: trade.traderWinRate,
        trader_roi: null,
        trader_resolved_count: trade.traderTradeCount,
        model_probability: result.modelProbability,
        edge_pct: result.edge,
        conviction: trade.conviction ?? null,
        outcome: 'OPEN',
        order_time: tradeTime.toISOString(),
      };

      const { error } = await supabase.from('ft_orders').insert(ftOrder);
      if (!error) {
        inserted++;
      }
    }

    return NextResponse.json({ inserted, success: true });
  } catch (err) {
    console.error('[ft/sync-trade] Error:', err);
    return NextResponse.json(
      { error: 'Sync failed', details: String(err) },
      { status: 500 }
    );
  }
}
