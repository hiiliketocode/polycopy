import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/lt/strategies/[id]/orders
 * Returns open orders, closed orders, pending orders, failed orders, and execution stats.
 * V2: Uses new lt_orders schema with correct column names.
 */
export async function GET(request: Request, { params }: RouteParams) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const { id: strategyId } = await params;
        const supabase = createAdminServiceClient();

        const { data: strategy } = await supabase
            .from('lt_strategies')
            .select('strategy_id')
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .maybeSingle();

        if (!strategy) {
            return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
        }

        // V2 schema columns on lt_orders
        const { data: orders, error } = await supabase
            .from('lt_orders')
            .select(`
                lt_order_id,
                ft_order_id,
                ft_wallet_id,
                ft_trader_wallet,
                order_id,
                source_trade_id,
                condition_id,
                token_id,
                token_label,
                market_title,
                market_slug,
                side,
                signal_price,
                signal_size_usd,
                executed_price,
                executed_size_usd,
                shares_bought,
                shares_remaining,
                slippage_bps,
                fill_rate,
                execution_latency_ms,
                risk_check_passed,
                risk_check_reason,
                rejection_reason,
                status,
                outcome,
                winning_label,
                pnl,
                ft_pnl,
                performance_diff_pct,
                order_placed_at,
                fully_filled_at,
                resolved_at,
                created_at,
                is_force_test,
                is_shadow
            `)
            .eq('strategy_id', strategyId)
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const all = orders || [];

        // Add current_price for open positions
        const openForPriceFetch = all.filter((o: any) => o.outcome === 'OPEN' && (o.status === 'FILLED' || o.status === 'PARTIAL'));
        const openConditionIds = [...new Set(openForPriceFetch.map((o: any) => o.condition_id).filter(Boolean))];

        const priceMap = new Map<string, Record<string, number>>();
        if (openConditionIds.length > 0) {
            const { data: marketsData } = await supabase
                .from('markets')
                .select('condition_id, outcome_prices, outcomes')
                .in('condition_id', openConditionIds);

            if (marketsData) {
                marketsData.forEach((m: any) => {
                    let prices = m.outcome_prices;
                    let outcomes = m.outcomes;

                    if (typeof prices === 'string') {
                        try { prices = JSON.parse(prices); } catch { prices = null; }
                    }
                    if (typeof outcomes === 'string') {
                        try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; }
                    }

                    if (Array.isArray(prices) && Array.isArray(outcomes)) {
                        const priceObj: Record<string, number> = {};
                        outcomes.forEach((outcome: string, idx: number) => {
                            priceObj[outcome.toUpperCase()] = prices[idx] || 0;
                        });
                        priceMap.set(m.condition_id, priceObj);
                    }
                });
            }
        }

        // Enrich orders with current_price and normalized field names for frontend
        const enrichedOrders = all.map((o: any) => {
            const currentPrice = o.outcome === 'OPEN' && o.condition_id
                ? (priceMap.get(o.condition_id)?.[((o.token_label || 'YES') as string).toUpperCase()] ?? null)
                : null;

            return {
                ...o,
                current_price: currentPrice,
                // Aliases for backward-compatible frontend rendering
                executed_size: o.executed_size_usd,
                trader_address: o.ft_trader_wallet,
                slippage_pct: o.slippage_bps != null ? o.slippage_bps / 10000 : null,
            };
        });

        // Split into categories
        const openOrders = enrichedOrders.filter((o: any) => o.outcome === 'OPEN' && (o.status === 'FILLED' || o.status === 'PARTIAL'));
        const closedOrders = enrichedOrders.filter((o: any) => o.outcome === 'WON' || o.outcome === 'LOST' || o.outcome === 'SOLD');
        const failedOrders = enrichedOrders.filter((o: any) => o.status === 'REJECTED' || o.status === 'CANCELLED');
        const pendingOrders = enrichedOrders.filter((o: any) => o.status === 'PENDING');

        // Execution stats
        const filled = enrichedOrders.filter((o: any) => o.status === 'FILLED');
        const totalSignalUsd = enrichedOrders.reduce((s: number, o: any) => s + (Number(o.signal_size_usd) || 0), 0);
        const totalExecutedUsd = enrichedOrders.reduce((s: number, o: any) => s + (Number(o.executed_size_usd) || 0), 0);

        // Slippage stats (bps → pct for display)
        const withSlippage = filled.filter((o: any) => o.slippage_bps != null);
        const avgSlippagePct = withSlippage.length > 0
            ? withSlippage.reduce((s: number, o: any) => s + Math.abs(Number(o.slippage_bps)), 0) / withSlippage.length / 10000
            : null;
        const maxSlippagePct = withSlippage.length > 0
            ? Math.max(...withSlippage.map((o: any) => Math.abs(Number(o.slippage_bps)))) / 10000
            : null;

        // Fill rate stats
        const withFillRate = enrichedOrders.filter((o: any) => o.fill_rate != null);
        const avgFillRate = withFillRate.length > 0
            ? withFillRate.reduce((s: number, o: any) => s + Number(o.fill_rate), 0) / withFillRate.length
            : null;

        // Latency stats
        const withLatency = enrichedOrders.filter((o: any) => o.execution_latency_ms != null);
        const avgLatencyMs = withLatency.length > 0
            ? Math.round(withLatency.reduce((s: number, o: any) => s + Number(o.execution_latency_ms), 0) / withLatency.length)
            : null;

        // P&L stats
        const won = closedOrders.filter((o: any) => o.outcome === 'WON').length;
        const lost = closedOrders.filter((o: any) => o.outcome === 'LOST').length;
        const realizedPnl = closedOrders.reduce((s: number, o: any) => s + (Number(o.pnl) || 0), 0);

        // Unrealized P&L
        const unrealizedPnl = openOrders.reduce((s: number, o: any) => {
            if (o.current_price != null && o.executed_price != null && o.shares_bought != null) {
                return s + ((Number(o.current_price) - Number(o.executed_price)) * Number(o.shares_bought));
            }
            return s;
        }, 0);

        // Avg trade size
        const avgTradeSize = filled.length > 0
            ? filled.reduce((s: number, o: any) => s + (Number(o.executed_size_usd) || 0), 0) / filled.length
            : 0;

        return NextResponse.json({
            success: true,
            open_orders: openOrders,
            closed_orders: closedOrders,
            failed_orders: failedOrders,
            pending_orders: pendingOrders,
            stats: {
                total_trades: filled.length,
                total_attempts: all.length,
                attempts: all.length,
                filled: filled.length,
                failed: failedOrders.length,
                pending: pendingOrders.length,
                open_positions: openOrders.length,
                closed_positions: closedOrders.length,
                won,
                lost,
                win_rate: (won + lost) > 0 ? Math.round((won / (won + lost)) * 10000) / 100 : null,
                realized_pnl: Math.round(realizedPnl * 100) / 100,
                unrealized_pnl: Math.round(unrealizedPnl * 100) / 100,
                total_pnl: Math.round((realizedPnl + unrealizedPnl) * 100) / 100,
                avg_trade_size: Math.round(avgTradeSize * 100) / 100,
                total_signal_usd: Math.round(totalSignalUsd * 100) / 100,
                total_executed_usd: Math.round(totalExecutedUsd * 100) / 100,
                fill_rate_pct: all.length > 0 ? Math.round((filled.length / all.length) * 10000) / 100 : null,
                dollar_fill_rate_pct: totalSignalUsd > 0 ? Math.round((totalExecutedUsd / totalSignalUsd) * 10000) / 100 : null,
                avg_fill_rate: avgFillRate != null ? Math.round(avgFillRate * 10000) / 10000 : null,
                avg_slippage_pct: avgSlippagePct != null ? Math.round(avgSlippagePct * 10000) / 10000 : null,
                max_slippage_pct: maxSlippagePct != null ? Math.round(maxSlippagePct * 10000) / 10000 : null,
                avg_latency_ms: avgLatencyMs,
            },
        });
    } catch (err: unknown) {
        console.error('[LT Orders] Error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
