/**
 * POST /api/lt/resolve
 *
 * Resolve live trading positions when markets settle.
 * Same logic as ft/resolve: checks Polymarket gamma API for outcome prices,
 * marks positions as WON/LOST, calculates P&L, and releases capital to cooldown.
 *
 * Called by cron every 10 minutes.
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { releaseCapitalFromTrade } from '@/lib/live-trading/capital-manager';
import { updateRiskStateAfterResolution } from '@/lib/live-trading/risk-manager-v2';
import { createLTLogger } from '@/lib/live-trading/lt-logger';

const WIN_THRESHOLD = 0.99;
const LOSE_THRESHOLD = 0.01;
const BATCH_SIZE = 20;

function normalize(s: string | null | undefined): string {
    return (s || '').trim().toUpperCase();
}

function outcomeLabel(o: unknown): string {
    if (typeof o === 'string') return o.trim().toUpperCase();
    if (o && typeof o === 'object') {
        const obj = o as { LABEL?: string; label?: string };
        return (obj.LABEL || obj.label || '').trim().toUpperCase();
    }
    return '';
}

export async function POST(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    const supabase = createAdminServiceClient();
    const logger = createLTLogger(supabase);
    const now = new Date();

    try {
        await logger.info('RESOLVE', `Starting LT resolution at ${now.toISOString()}`);

        // 1. Get all OPEN lt_orders (only FILLED ones are eligible for resolution)
        const { data: openOrders, error: fetchError } = await supabase
            .from('lt_orders')
            .select('*')
            .eq('outcome', 'OPEN')
            .in('status', ['FILLED', 'PARTIAL'])
            .order('order_placed_at', { ascending: true })
            .limit(500);

        if (fetchError) {
            await logger.error('RESOLVE', `Error fetching open orders: ${fetchError.message}`);
            return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
        }

        if (!openOrders || openOrders.length === 0) {
            return NextResponse.json({ success: true, message: 'No open orders to resolve', open_orders: 0 });
        }

        await logger.info('RESOLVE', `Checking ${openOrders.length} open orders`);

        // 2. Get unique condition_ids and check market resolution
        const conditionIds = [...new Set(openOrders.map(o => o.condition_id).filter(Boolean))];
        const resolutionMap = new Map<string, { winningLabel: string; outcomes: string[]; prices: number[] }>();

        for (let i = 0; i < conditionIds.length; i += BATCH_SIZE) {
            const batch = conditionIds.slice(i, i + BATCH_SIZE);
            try {
                const params = batch.map(id => `condition_ids=${id}`).join('&');
                const resp = await fetch(`https://gamma-api.polymarket.com/markets?${params}`, {
                    headers: { Accept: 'application/json' },
                });

                if (resp.ok) {
                    const markets = await resp.json();
                    for (const market of markets) {
                        const cid = market.conditionId || market.condition_id;
                        if (!cid) continue;

                        let outcomes: unknown[] = [];
                        let prices: number[] = [];
                        try {
                            outcomes = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes || [];
                            const rawPrices = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : market.outcomePrices || [];
                            prices = rawPrices.map((p: unknown) => parseFloat(String(p)));
                        } catch { continue; }

                        if (outcomes.length === 0 || prices.length === 0) continue;

                        // Normalize prices (some are 0-100, some 0-1)
                        if (Math.max(...prices) > 1) prices = prices.map(p => p / 100);

                        const maxPrice = Math.max(...prices);
                        const minPrice = Math.min(...prices);
                        if (maxPrice < WIN_THRESHOLD || minPrice > LOSE_THRESHOLD) continue;

                        const maxIdx = prices.indexOf(maxPrice);
                        resolutionMap.set(cid, {
                            winningLabel: outcomeLabel(outcomes[maxIdx]),
                            outcomes: outcomes.map(outcomeLabel),
                            prices,
                        });
                    }
                }
            } catch (err: any) {
                await logger.warn('RESOLVE', `Batch fetch error: ${err.message}`);
            }
        }

        await logger.info('RESOLVE', `Found ${resolutionMap.size} markets with clear resolution`);

        // 3. Resolve each order
        let resolved = 0, won = 0, lost = 0;

        for (const order of openOrders) {
            const cid = order.condition_id;
            if (!cid) continue;

            const marketData = resolutionMap.get(cid);
            if (!marketData) continue;

            const { winningLabel, outcomes, prices } = marketData;

            // Find our outcome index
            let ourIdx = outcomes.findIndex(l => normalize(l) === normalize(order.token_label));
            if (ourIdx < 0 && outcomes.length === 2) {
                const tok = normalize(order.token_label || 'YES');
                if (tok === 'YES') ourIdx = outcomes.findIndex(l => normalize(l) === 'YES');
                if (tok === 'NO') ourIdx = outcomes.findIndex(l => normalize(l) === 'NO');
                if (ourIdx < 0) ourIdx = tok === 'YES' ? 0 : 1;
            }
            if (ourIdx < 0) continue;

            const ourPrice = prices[ourIdx] ?? -1;
            let outcome: 'WON' | 'LOST';
            if (ourPrice >= WIN_THRESHOLD) outcome = 'WON';
            else if (ourPrice <= LOSE_THRESHOLD) outcome = 'LOST';
            else continue;

            // P&L Calculation (same as FT):
            //   BUY WON:  pnl = shares × (1 - entry_price)  [paid shares×price, each share pays $1]
            //   BUY LOST: pnl = -cost (lost everything)
            const sharesBought = Number(order.shares_bought) || 0;
            const executedPrice = Number(order.executed_price) || Number(order.signal_price) || 0;
            const costUsd = Number(order.executed_size_usd) || sharesBought * executedPrice;

            let pnl: number;
            if (outcome === 'WON') {
                // Each share pays $1. Cost was shares × price. Profit = shares × (1 - price).
                pnl = sharesBought > 0 ? +(sharesBought * (1 - executedPrice)).toFixed(2) : 0;
            } else {
                // Lost everything invested
                pnl = -(+costUsd.toFixed(2));
            }

            // Exit value: what we get back
            const exitValue = outcome === 'WON' ? +(sharesBought * 1).toFixed(2) : 0;

            // FT PnL comparison
            let ftPnl: number | null = null;
            if (order.ft_order_id) {
                const { data: ftOrder } = await supabase
                    .from('ft_orders')
                    .select('pnl')
                    .eq('order_id', order.ft_order_id)
                    .maybeSingle();
                if (ftOrder?.pnl != null) ftPnl = Number(ftOrder.pnl);
            }

            const perfDiff = ftPnl !== null && ftPnl !== 0 ? +((pnl - ftPnl) / Math.abs(ftPnl) * 100).toFixed(2) : null;

            // Update lt_orders
            const { error: updateError } = await supabase
                .from('lt_orders')
                .update({
                    outcome,
                    winning_label: winningLabel,
                    pnl,
                    ft_pnl: ftPnl,
                    performance_diff_pct: perfDiff,
                    resolved_at: now.toISOString(),
                    shares_remaining: 0,
                    updated_at: now.toISOString(),
                })
                .eq('lt_order_id', order.lt_order_id);

            if (updateError) {
                await logger.error('RESOLVE', `Failed to update order ${order.lt_order_id}: ${updateError.message}`);
                continue;
            }

            resolved++;
            if (outcome === 'WON') won++;
            else lost++;

            // Release capital: invested amount leaves locked, exit value goes to cooldown
            await releaseCapitalFromTrade(
                supabase,
                order.strategy_id,
                costUsd,
                exitValue,
                order.lt_order_id,
            );

            // Update risk state
            await updateRiskStateAfterResolution(
                supabase,
                order.strategy_id,
                costUsd,
                outcome === 'WON',
            );

            await logger.info('RESOLVE', `Resolved ${order.lt_order_id}: ${outcome} pnl=$${pnl.toFixed(2)} (FT pnl=$${ftPnl?.toFixed(2) ?? 'N/A'})`, {
                lt_order_id: order.lt_order_id,
                strategy_id: order.strategy_id,
                outcome,
                pnl,
                ft_pnl: ftPnl,
                cost_usd: costUsd,
                exit_value: exitValue,
            });
        }

        await logger.info('RESOLVE', `Resolution complete: ${resolved} resolved (${won} won, ${lost} lost) out of ${openOrders.length} checked`);

        return NextResponse.json({
            success: true,
            resolved_at: now.toISOString(),
            open_orders_checked: openOrders.length,
            markets_resolved: resolutionMap.size,
            orders_resolved: resolved,
            won,
            lost,
        });
    } catch (error: any) {
        await logger.error('RESOLVE', `Fatal error: ${error.message}`);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to resolve LT positions',
        description: 'V2: Resolves LT positions, calculates P&L (same formula as FT), releases capital to cooldown.',
    });
}
