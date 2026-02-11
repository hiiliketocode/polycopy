/**
 * POST /api/lt/cancel-stuck-orders
 * Cancel orders that have been PENDING/OPEN for too long.
 * V2: Finds stuck orders via lt_orders table (not orders.lt_strategy_id).
 * Unlocks capital for cancelled orders.
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
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    try {
        // Find stuck lt_orders: PENDING status with an order_id, older than 5 minutes
        const { data: stuckOrders, error: queryError } = await supabase
            .from('lt_orders')
            .select('lt_order_id, strategy_id, user_id, order_id, signal_size_usd, created_at, condition_id')
            .eq('status', 'PENDING')
            .not('order_id', 'is', null)
            .lt('created_at', fiveMinutesAgo)
            .limit(50);

        if (queryError || !stuckOrders || stuckOrders.length === 0) {
            return NextResponse.json({
                success: true,
                message: stuckOrders?.length === 0 ? 'No stuck orders' : (queryError?.message || 'No orders'),
                cancelled: 0,
            });
        }

        console.log(`[lt/cancel-stuck-orders] Found ${stuckOrders.length} stuck orders`);

        // Group by user_id
        const byUser = new Map<string, typeof stuckOrders>();
        for (const order of stuckOrders) {
            if (!byUser.has(order.user_id)) byUser.set(order.user_id, []);
            byUser.get(order.user_id)!.push(order);
        }

        let cancelled = 0;
        let errors = 0;

        for (const [userId, orders] of byUser) {
            try {
                const { client } = await getAuthedClobClientForUserAnyWallet(userId);
                const orderIds = orders.map(o => o.order_id).filter(Boolean);

                if (orderIds.length > 0) {
                    await client.cancelOrders(orderIds);
                }

                for (const order of orders) {
                    // Update lt_orders
                    await supabase.from('lt_orders').update({
                        status: 'CANCELLED',
                        outcome: 'CANCELLED',
                        rejection_reason: 'Auto-cancelled: stuck for >5 minutes',
                        updated_at: now.toISOString(),
                    }).eq('lt_order_id', order.lt_order_id);

                    // Update orders table
                    if (order.order_id) {
                        await supabase.from('orders').update({
                            status: 'cancelled',
                            updated_at: now.toISOString(),
                        }).eq('order_id', order.order_id);
                    }

                    // Unlock capital
                    const amount = Number(order.signal_size_usd) || 0;
                    if (amount > 0) {
                        await unlockCapital(supabase, order.strategy_id, amount);
                    }

                    cancelled++;
                }
            } catch (err: any) {
                console.error(`[lt/cancel-stuck-orders] Error for user ${userId}: ${err.message}`);
                errors++;
            }
        }

        return NextResponse.json({
            success: true,
            cancelled,
            errors,
            message: `Cancelled ${cancelled} stuck orders`,
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to cancel stuck orders',
        description: 'V2: Cancels PENDING lt_orders older than 5 minutes. Unlocks capital.',
    });
}
