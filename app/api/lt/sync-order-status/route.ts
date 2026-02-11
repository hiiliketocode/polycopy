/**
 * POST /api/lt/sync-order-status
 *
 * Sync order fill status from CLOB for all PENDING/PARTIAL lt_orders.
 * Queries lt_orders (not the orders table) for pending fills,
 * then polls CLOB for each order and updates both lt_orders and orders tables.
 *
 * Called by cron every minute.
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client';
import { unlockCapital } from '@/lib/live-trading/capital-manager';

export async function POST(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    const supabase = createAdminServiceClient();
    const now = new Date();

    try {
        // Get PENDING or PARTIAL lt_orders that have an order_id
        const { data: pendingOrders, error: fetchError } = await supabase
            .from('lt_orders')
            .select('lt_order_id, strategy_id, user_id, order_id, signal_size_usd, executed_size_usd, shares_bought, status')
            .in('status', ['PENDING', 'PARTIAL'])
            .not('order_id', 'is', null)
            .order('created_at', { ascending: true })
            .limit(100);

        if (fetchError || !pendingOrders || pendingOrders.length === 0) {
            return NextResponse.json({
                success: true,
                message: pendingOrders?.length === 0 ? 'No orders to sync' : (fetchError?.message || 'No orders'),
                checked: 0,
                updated: 0,
            });
        }

        console.log(`[lt/sync-order-status] Checking ${pendingOrders.length} orders`);

        // Group by user_id for CLOB client reuse
        const byUser = new Map<string, typeof pendingOrders>();
        for (const order of pendingOrders) {
            const uid = order.user_id;
            if (!byUser.has(uid)) byUser.set(uid, []);
            byUser.get(uid)!.push(order);
        }

        let updated = 0;
        let errors = 0;

        for (const [userId, orders] of byUser) {
            let client: any;
            try {
                const result = await getAuthedClobClientForUserAnyWallet(userId);
                client = result.client;
            } catch (err: any) {
                console.error(`[lt/sync-order-status] CLOB client error for ${userId}: ${err.message}`);
                errors++;
                continue;
            }

            for (const order of orders) {
                try {
                    const clobOrder = await client.getOrder(order.order_id) as any;
                    if (!clobOrder) continue;

                    const sizeMatched = parseFloat(clobOrder.size_matched || '0') || 0;
                    const originalSize = parseFloat(clobOrder.original_size || clobOrder.size || '0') || 0;
                    const currentShares = Number(order.shares_bought) || 0;
                    const clobStatus = String(clobOrder.status || '').toLowerCase();

                    // Only update if something changed
                    if (sizeMatched === currentShares && !['cancelled', 'canceled'].includes(clobStatus)) {
                        continue;
                    }

                    const remainingSize = Math.max(0, originalSize - sizeMatched);
                    const fillRate = originalSize > 0 ? sizeMatched / originalSize : 0;

                    const isTerminal = ['cancelled', 'canceled', 'expired'].includes(clobStatus);
                    let newStatus: string;
                    if (sizeMatched >= originalSize && sizeMatched > 0) {
                        newStatus = 'FILLED';
                    } else if (isTerminal && sizeMatched > 0) {
                        // Expired/cancelled with partial fill — treat as PARTIAL (terminal)
                        newStatus = 'PARTIAL';
                    } else if (isTerminal && sizeMatched === 0) {
                        newStatus = 'CANCELLED';
                    } else if (sizeMatched > 0) {
                        newStatus = 'PARTIAL';
                    } else {
                        newStatus = 'PENDING';
                    }

                    // Update lt_orders
                    const executedPrice = Number(clobOrder.price || 0) || undefined;
                    const executedSizeUsd = executedPrice ? +(sizeMatched * executedPrice).toFixed(2) : undefined;

                    await supabase
                        .from('lt_orders')
                        .update({
                            shares_bought: sizeMatched,
                            shares_remaining: sizeMatched,
                            executed_size_usd: executedSizeUsd,
                            fill_rate: +fillRate.toFixed(4),
                            status: newStatus,
                            fully_filled_at: newStatus === 'FILLED' ? now.toISOString() : null,
                            outcome: newStatus === 'CANCELLED' ? 'CANCELLED' : undefined,
                            updated_at: now.toISOString(),
                        })
                        .eq('lt_order_id', order.lt_order_id);

                    // Update orders table
                    await supabase
                        .from('orders')
                        .update({
                            filled_size: sizeMatched,
                            remaining_size: remainingSize,
                            status: newStatus.toLowerCase(),
                            updated_at: now.toISOString(),
                        })
                        .eq('order_id', order.order_id);

                    // Unlock capital for unfilled portion on terminal states (cancelled, expired, partial+terminal)
                    if (isTerminal) {
                        const totalLocked = Number(order.signal_size_usd) || 0;
                        const filledValue = executedSizeUsd || 0;
                        const unfilledToUnlock = Math.max(0, totalLocked - filledValue);
                        if (unfilledToUnlock > 0.01) {
                            await unlockCapital(supabase, order.strategy_id, unfilledToUnlock);
                            console.log(`[lt/sync-order-status] Unlocked $${unfilledToUnlock.toFixed(2)} for ${newStatus} order ${order.order_id}`);
                        }
                    }

                    updated++;
                    console.log(`[lt/sync-order-status] ${order.order_id}: ${order.status} → ${newStatus} (${sizeMatched}/${originalSize} filled)`);
                } catch (err: any) {
                    console.error(`[lt/sync-order-status] Error syncing ${order.order_id}: ${err.message}`);
                    errors++;
                }
            }
        }

        return NextResponse.json({
            success: true,
            checked: pendingOrders.length,
            updated,
            errors,
            timestamp: now.toISOString(),
        });
    } catch (error: any) {
        console.error('[lt/sync-order-status] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to sync LT order fill status from CLOB',
        description: 'V2: Checks PENDING/PARTIAL lt_orders and updates fill status. Unlocks capital for cancelled orders.',
    });
}
