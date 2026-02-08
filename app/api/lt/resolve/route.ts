import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { processRedemptions, createRedemptionRecord } from '@/lib/live-trading/redemption-service';
import { updateRiskStateAfterTrade } from '@/lib/live-trading/risk-manager';

const WIN_THRESHOLD = 0.99;   // $1 or 100¢ - outcome has won
const LOSE_THRESHOLD = 0.01;  // 1¢ or below - outcome has lost
const BATCH_SIZE = 20;

/**
 * Helper: extract label from outcome
 */
function outcomeLabel(o: unknown): string {
    if (typeof o === 'string') return o.trim().toUpperCase();
    if (o && typeof o === 'object') {
        const obj = o as { LABEL?: string; label?: string };
        return (obj.LABEL || obj.label || '').trim().toUpperCase();
    }
    return '';
}

/**
 * Helper: normalize for comparison
 */
function normalize(s: string | null | undefined) {
    return (s || '').trim().toUpperCase();
}

/**
 * Helper: do labels match?
 */
function labelsMatch(a: string, b: string) {
    return normalize(a) === normalize(b);
}

/**
 * POST /api/lt/resolve
 * Resolve live trading positions and process redemptions
 * Called by cron every 10 minutes (mirrors ft/resolve)
 */
export async function POST(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    try {
        const supabase = createAdminServiceClient();
        const now = new Date();

        console.log('[lt/resolve] Starting resolution at', now.toISOString());

        // 1. Get all OPEN LT orders
        const PAGE_SIZE = 1000;
        const openOrders: any[] = [];
        let offset = 0;

        while (true) {
            const { data: page, error } = await supabase
                .from('lt_orders')
                .select('*')
                .eq('outcome', 'OPEN')
                .order('order_placed_at', { ascending: true })
                .range(offset, offset + PAGE_SIZE - 1);

            if (error) {
                console.error('[lt/resolve] Error fetching orders:', error);
                break;
            }
            if (!page || page.length === 0) break;
            openOrders.push(...page);
            if (page.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
        }

        if (openOrders.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No open orders to resolve',
                open_orders: 0,
            });
        }

        console.log(`[lt/resolve] Found ${openOrders.length} open orders to check`);

        // 2. Get unique condition_ids
        const conditionIds = [...new Set(openOrders.map(o => o.condition_id).filter(Boolean))];

        // 3. Fetch markets from Polymarket API (same logic as ft/resolve)
        const resolutionMap = new Map<string, { winningLabel: string; outcomes: string[]; prices: number[] }>();

        console.log(`[lt/resolve] Checking ${conditionIds.length} unique condition IDs`);

        for (let i = 0; i < conditionIds.length; i += BATCH_SIZE) {
            const batch = conditionIds.slice(i, i + BATCH_SIZE);
            try {
                const params = batch.map(id => `condition_ids=${id}`).join('&');
                const url = `https://gamma-api.polymarket.com/markets?${params}`;
                const response = await fetch(url, { headers: { 'Accept': 'application/json' } });

                if (response.ok) {
                    const markets = await response.json();
                    for (const market of markets) {
                        const cid = market.conditionId || market.condition_id;
                        if (!cid) continue;

                        let outcomes: (string | { LABEL?: string; label?: string })[] = [];
                        let prices: number[] = [];
                        try {
                            outcomes = (typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : market.outcomes || []) as (string | { LABEL?: string; label?: string })[];
                            const rawPrices = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : market.outcomePrices || [];
                            prices = rawPrices.map((p: unknown) => parseFloat(String(p)));
                        } catch {
                            continue;
                        }
                        if (outcomes.length === 0 || prices.length === 0) continue;

                        // Handle prices in cents (0-100) vs 0-1
                        const maxRaw = Math.max(...prices);
                        if (maxRaw > 1) prices = prices.map(p => p / 100);

                        const maxPrice = Math.max(...prices);
                        const minPrice = Math.min(...prices);
                        const maxPriceIdx = prices.indexOf(maxPrice);

                        // Resolve only when prices show clear outcome
                        const hasClearWinner = maxPrice >= WIN_THRESHOLD;
                        const hasClearLoser = minPrice <= LOSE_THRESHOLD;
                        if (!hasClearWinner || !hasClearLoser) continue;

                        const winningLabel = outcomeLabel(outcomes[maxPriceIdx]);
                        const outcomeLabels = outcomes.map(outcomeLabel);
                        resolutionMap.set(cid, { winningLabel, outcomes: outcomeLabels, prices });
                    }
                }
            } catch (err) {
                console.error(`[lt/resolve] Error fetching batch:`, err);
            }
        }

        console.log(`[lt/resolve] Found ${resolutionMap.size} markets with clear resolution`);

        // 4. Update resolved orders
        let resolved = 0;
        let won = 0;
        let lost = 0;
        const errors: string[] = [];

        for (const order of openOrders) {
            const cid = order.condition_id;
            if (!cid) continue;

            const marketData = resolutionMap.get(cid);
            if (!marketData) continue; // Market not yet resolved

            const { winningLabel, outcomes: outcomeLabels, prices } = marketData;

            // Find our outcome's index
            let ourIdx = outcomeLabels.findIndex((l) => labelsMatch(l, order.token_label || 'YES'));
            if (ourIdx < 0 && outcomeLabels.length === 2) {
                const tok = normalize(order.token_label || 'YES');
                const yesIdx = outcomeLabels.findIndex((l) => normalize(l) === 'YES' || normalize(l) === 'Y');
                const noIdx = outcomeLabels.findIndex((l) => normalize(l) === 'NO' || normalize(l) === 'N');
                if (tok === 'YES' && yesIdx >= 0) ourIdx = yesIdx;
                else if (tok === 'NO' && noIdx >= 0) ourIdx = noIdx;
                else if (tok === 'YES' && yesIdx < 0) ourIdx = 0;
                else if (tok === 'NO' && noIdx < 0) ourIdx = 1;
            }
            if (ourIdx < 0) continue;

            const ourPrice = prices[ourIdx] ?? -1;

            // Determine outcome
            let outcome: 'WON' | 'LOST';
            if (ourPrice >= WIN_THRESHOLD) outcome = 'WON';
            else if (ourPrice <= LOSE_THRESHOLD) outcome = 'LOST';
            else continue; // Price in between, keep pending

            // Get actual fill price from orders table
            const { data: orderRecord } = await supabase
                .from('orders')
                .select('price, filled_size, size, status')
                .eq('order_id', order.order_id)
                .single();

            // Use actual fill price if available, otherwise use signal price
            const actualFillPrice = orderRecord?.price ? Number(orderRecord.price) : order.executed_price || order.signal_price;
            const actualFillSize = orderRecord?.filled_size ? Number(orderRecord.filled_size) : order.executed_size || order.signal_size_usd;

            // Calculate PnL using actual fill price
            const side = (order.side || 'BUY').toUpperCase();
            let pnl: number;

            if (side === 'BUY') {
                if (outcome === 'WON') {
                    // Won: profit = (1 - entry_price) / entry_price * size
                    pnl = actualFillPrice > 0 ? actualFillSize * (1 - actualFillPrice) / actualFillPrice : 0;
                } else {
                    // Lost: loss = -size
                    pnl = -actualFillSize;
                }
            } else {
                // SELL orders (less common)
                if (outcome === 'WON') {
                    pnl = actualFillSize * actualFillPrice;
                } else {
                    pnl = -actualFillSize * (1 - actualFillPrice);
                }
            }

            // Get FT PnL for comparison
            let ftPnl: number | null = null;
            if (order.ft_order_id) {
                const { data: ftOrder } = await supabase
                    .from('ft_orders')
                    .select('pnl')
                    .eq('order_id', order.ft_order_id)
                    .single();

                if (ftOrder?.pnl !== null && ftOrder?.pnl !== undefined) {
                    ftPnl = Number(ftOrder.pnl);
                }
            }

            // Calculate performance difference
            const performanceDiffPct = ftPnl !== null && ftPnl !== 0
                ? ((pnl - ftPnl) / Math.abs(ftPnl)) * 100
                : null;

            // Update the order
            const { error: updateError } = await supabase
                .from('lt_orders')
                .update({
                    outcome,
                    winning_label: winningLabel,
                    pnl,
                    ft_pnl: ftPnl,
                    performance_diff_pct: performanceDiffPct,
                    resolved_at: now.toISOString(),
                    executed_price: actualFillPrice,
                    executed_size: actualFillSize,
                })
                .eq('lt_order_id', order.lt_order_id);

            if (updateError) {
                errors.push(`Failed to update order ${order.lt_order_id}: ${updateError.message}`);
            } else {
                resolved++;
                if (outcome === 'WON') won++;
                if (outcome === 'LOST') lost++;

                // Update risk state
                await updateRiskStateAfterTrade(
                    supabase,
                    order.strategy_id,
                    actualFillSize,
                    outcome === 'WON'
                );

                // Create redemption record
                await createRedemptionRecord(supabase, {
                    lt_order_id: order.lt_order_id,
                    strategy_id: order.strategy_id,
                    order_id: order.order_id,
                    condition_id: cid,
                    market_resolved_at: now.toISOString(),
                    winning_outcome: winningLabel,
                    user_outcome: order.token_label || 'YES',
                });
            }
        }

        console.log(`[lt/resolve] Resolved ${resolved} orders (${won} won, ${lost} lost)`);

        // 5. Process redemptions (attempt to redeem winners)
        const redemptionResult = await processRedemptions(supabase);

        return NextResponse.json({
            success: true,
            resolved_at: now.toISOString(),
            open_orders_checked: openOrders.length,
            markets_resolved: resolutionMap.size,
            orders_resolved: resolved,
            won,
            lost,
            redemptions: redemptionResult,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (error: any) {
        console.error('[lt/resolve] Error:', error);
        return NextResponse.json(
            { success: false, error: 'Resolution failed', details: String(error) },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to this endpoint to resolve positions',
        description: 'Resolves LT positions and processes redemptions',
    });
}
