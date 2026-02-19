/**
 * POST /api/lt/ws-fill
 *
 * Called by the trade-stream worker when a WebSocket `orders_matched` event
 * matches a pending LT order. Immediately syncs that single order's fill
 * status from CLOB, giving near-instant fill detection instead of waiting
 * for the 2-minute cron.
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client';
import { unlockCapital } from '@/lib/live-trading/capital-manager';
import { getActualFillPrice } from '@/lib/polymarket/fill-price';
import { emitOrderEvent } from '@/lib/live-trading/event-bus';

export async function POST(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    let body: { order_id?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const orderId = body?.order_id;
    if (!orderId || typeof orderId !== 'string') {
        return NextResponse.json({ error: 'order_id required' }, { status: 400 });
    }

    const supabase = createAdminServiceClient();
    const now = new Date();

    try {
        const { data: order, error: fetchErr } = await supabase
            .from('lt_orders')
            .select('lt_order_id, strategy_id, user_id, order_id, signal_size_usd, executed_size_usd, shares_bought, status')
            .eq('order_id', orderId)
            .in('status', ['PENDING', 'PARTIAL'])
            .maybeSingle();

        if (fetchErr) {
            console.error(`[ws-fill] DB lookup error: ${fetchErr.message}`);
            return NextResponse.json({ error: fetchErr.message }, { status: 500 });
        }

        if (!order) {
            return NextResponse.json({ skipped: true, reason: 'no matching pending order' });
        }

        let client: any;
        try {
            const result = await getAuthedClobClientForUserAnyWallet(order.user_id);
            client = result.client;
        } catch (err: any) {
            console.error(`[ws-fill] CLOB client error for ${order.user_id}: ${err.message}`);
            return NextResponse.json({ error: 'clob_client_failed' }, { status: 500 });
        }

        let clobOrder: any;
        try {
            clobOrder = await client.getOrder(orderId);
        } catch {
            clobOrder = null;
        }

        if (!clobOrder) {
            return NextResponse.json({ skipped: true, reason: 'order not found on CLOB' });
        }

        const sizeMatched = parseFloat(clobOrder.size_matched || '0') || 0;
        const originalSize = parseFloat(clobOrder.original_size || clobOrder.size || '0') || 0;
        const currentShares = Number(order.shares_bought) || 0;
        const clobStatus = String(clobOrder.status || '').toLowerCase();

        if (sizeMatched === currentShares && !['cancelled', 'canceled', 'expired'].includes(clobStatus)) {
            return NextResponse.json({ skipped: true, reason: 'no change' });
        }

        const remainingSize = Math.max(0, originalSize - sizeMatched);
        const fillRate = originalSize > 0 ? sizeMatched / originalSize : 0;
        const isTerminal = ['cancelled', 'canceled', 'expired'].includes(clobStatus);

        let newStatus: string;
        if (sizeMatched >= originalSize && sizeMatched > 0) {
            newStatus = 'FILLED';
        } else if (isTerminal && sizeMatched > 0) {
            newStatus = 'PARTIAL';
        } else if (isTerminal && sizeMatched === 0) {
            newStatus = 'CANCELLED';
        } else if (sizeMatched > 0) {
            newStatus = 'PARTIAL';
        } else {
            newStatus = 'PENDING';
        }

        const limitPrice = Number(clobOrder.price || 0) || 0;
        let executedPrice: number | undefined;
        if (sizeMatched > 0 && limitPrice > 0) {
            executedPrice = await getActualFillPrice(order.user_id, orderId, limitPrice);
        } else {
            executedPrice = limitPrice || undefined;
        }
        const executedSizeUsd = executedPrice ? +(sizeMatched * executedPrice).toFixed(2) : undefined;

        await supabase
            .from('lt_orders')
            .update({
                shares_bought: sizeMatched,
                shares_remaining: sizeMatched,
                executed_price: executedPrice,
                executed_size_usd: executedSizeUsd,
                fill_rate: +fillRate.toFixed(4),
                status: newStatus,
                fully_filled_at: newStatus === 'FILLED' ? now.toISOString() : null,
                outcome: newStatus === 'CANCELLED' ? 'CANCELLED' : undefined,
                order_not_found_count: 0,
                updated_at: now.toISOString(),
            })
            .eq('lt_order_id', order.lt_order_id);

        await supabase
            .from('orders')
            .update({
                filled_size: sizeMatched,
                remaining_size: remainingSize,
                status: newStatus.toLowerCase(),
                updated_at: now.toISOString(),
            })
            .eq('order_id', orderId);

        if (isTerminal) {
            const totalLocked = Number(order.signal_size_usd) || 0;
            const filledValue = executedSizeUsd || 0;
            const unfilledToUnlock = Math.max(0, totalLocked - filledValue);
            if (unfilledToUnlock > 0.01) {
                await unlockCapital(supabase, order.strategy_id, unfilledToUnlock);
            }
        }

        const eventType = newStatus === 'FILLED' ? 'OrderFilled' : newStatus === 'CANCELLED' ? 'OrderCancelled' : 'OrderPartialFill';
        emitOrderEvent(eventType, {
            lt_order_id: order.lt_order_id,
            strategy_id: order.strategy_id,
            order_id: orderId,
            status: newStatus,
            signal_size_usd: Number(order.signal_size_usd) || 0,
            executed_size_usd: executedSizeUsd,
            shares_bought: sizeMatched,
            fill_rate: +fillRate.toFixed(4),
            timestamp: now.toISOString(),
            source: 'ws-fill',
        });

        console.log(`[ws-fill] ${orderId}: ${order.status} → ${newStatus} (${sizeMatched}/${originalSize} filled) [real-time]`);

        return NextResponse.json({
            updated: true,
            order_id: orderId,
            previous_status: order.status,
            new_status: newStatus,
            fill_rate: +fillRate.toFixed(4),
        });
    } catch (error: any) {
        console.error('[ws-fill] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
