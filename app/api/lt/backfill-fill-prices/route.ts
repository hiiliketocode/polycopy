/**
 * POST /api/lt/backfill-fill-prices
 *
 * One-time backfill: queries the CLOB for every FILLED/PARTIAL lt_order
 * and corrects executed_price / executed_size_usd with the actual trade
 * fill price (not the limit price).
 *
 * The CLOB order `price` field is the LIMIT price. When a BUY limit at 10¢
 * fills at 0.1¢ (price improvement), the old code recorded 10¢. This
 * endpoint fixes all historical orders.
 *
 * Also corrects the `orders` table `price` column for quick trades.
 *
 * Rate-limited: processes orders in batches to avoid CLOB API throttling.
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client';
import { getActualFillPriceWithClient } from '@/lib/polymarket/fill-price';

export const maxDuration = 300; // 5 minutes

const BATCH_SIZE = 20;
const DELAY_BETWEEN_ORDERS_MS = 200; // Be nice to the CLOB API

function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
}

export async function POST(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    const supabase = createAdminServiceClient();
    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dry_run') === 'true';
    const limitParam = parseInt(url.searchParams.get('limit') || '0', 10);
    const offsetParam = parseInt(url.searchParams.get('offset') || '0', 10);

    const stats = {
        checked: 0,
        corrected: 0,
        unchanged: 0,
        errors: 0,
        skipped: 0,
        corrections: [] as Array<{
            lt_order_id: string;
            order_id: string;
            market_title: string;
            old_price: number;
            new_price: number;
            old_size_usd: number;
            new_size_usd: number;
            shares: number;
            method: string;
        }>,
    };

    try {
        // Fetch all FILLED/PARTIAL orders with CLOB order IDs
        let query = supabase
            .from('lt_orders')
            .select('lt_order_id, order_id, user_id, executed_price, executed_size_usd, shares_bought, market_title, status')
            .in('status', ['FILLED', 'PARTIAL'])
            .not('order_id', 'is', null)
            .order('created_at', { ascending: true });

        if (limitParam > 0) {
            query = query.range(offsetParam, offsetParam + limitParam - 1);
        }

        const { data: orders, error: fetchError } = await query;

        if (fetchError) {
            return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
        }

        if (!orders?.length) {
            return NextResponse.json({ success: true, message: 'No orders to backfill', stats });
        }

        // Group by user_id to reuse CLOB clients
        const byUser = new Map<string, typeof orders>();
        for (const order of orders) {
            if (!byUser.has(order.user_id)) byUser.set(order.user_id, []);
            byUser.get(order.user_id)!.push(order);
        }

        for (const [userId, userOrders] of byUser) {
            let client: any;
            try {
                const result = await getAuthedClobClientForUserAnyWallet(userId);
                client = result.client;
            } catch (err: any) {
                console.error(`[backfill] Failed to get CLOB client for ${userId}: ${err.message}`);
                stats.errors += userOrders.length;
                continue;
            }

            // Process in batches
            for (let i = 0; i < userOrders.length; i += BATCH_SIZE) {
                const batch = userOrders.slice(i, i + BATCH_SIZE);

                for (const order of batch) {
                    stats.checked++;
                    const oldPrice = Number(order.executed_price) || 0;
                    const shares = Number(order.shares_bought) || 0;

                    if (!order.order_id || oldPrice <= 0 || shares <= 0) {
                        stats.skipped++;
                        continue;
                    }

                    try {
                        const result = await getActualFillPriceWithClient(
                            client,
                            order.order_id,
                            oldPrice,
                        );

                        const newPrice = result.fillPrice;
                        const priceDiff = Math.abs(oldPrice - newPrice);
                        const priceDiffPct = oldPrice > 0 ? (priceDiff / oldPrice) * 100 : 0;

                        // Only correct if there's a meaningful difference (> 1%)
                        if (priceDiffPct < 1) {
                            stats.unchanged++;
                            continue;
                        }

                        const newSizeUsd = +(shares * newPrice).toFixed(2);
                        const oldSizeUsd = Number(order.executed_size_usd) || 0;

                        stats.corrections.push({
                            lt_order_id: order.lt_order_id,
                            order_id: order.order_id,
                            market_title: order.market_title || '',
                            old_price: oldPrice,
                            new_price: newPrice,
                            old_size_usd: oldSizeUsd,
                            new_size_usd: newSizeUsd,
                            shares,
                            method: result.method,
                        });

                        if (!dryRun) {
                            // Update lt_orders
                            await supabase
                                .from('lt_orders')
                                .update({
                                    executed_price: newPrice,
                                    executed_size_usd: newSizeUsd,
                                    updated_at: new Date().toISOString(),
                                })
                                .eq('lt_order_id', order.lt_order_id);

                            // Also update the orders table
                            await supabase
                                .from('orders')
                                .update({
                                    price: newPrice,
                                    updated_at: new Date().toISOString(),
                                })
                                .eq('order_id', order.order_id);
                        }

                        stats.corrected++;
                    } catch (err: any) {
                        console.error(`[backfill] Error for order ${order.order_id}: ${err.message}`);
                        stats.errors++;
                    }

                    await sleep(DELAY_BETWEEN_ORDERS_MS);
                }
            }
        }

        return NextResponse.json({
            success: true,
            dry_run: dryRun,
            stats: {
                checked: stats.checked,
                corrected: stats.corrected,
                unchanged: stats.unchanged,
                errors: stats.errors,
                skipped: stats.skipped,
            },
            corrections: stats.corrections,
        });

    } catch (err: any) {
        console.error('[backfill] Fatal error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
