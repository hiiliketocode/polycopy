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
import { recordDailySpend } from '@/lib/live-trading/risk-manager-v2';

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

                    // Record daily spend when a pending order fills (not recorded at placement time)
                    if ((newStatus === 'FILLED' || (newStatus === 'PARTIAL' && sizeMatched > 0)) && order.status === 'PENDING') {
                        const spendAmount = executedSizeUsd || 0;
                        if (spendAmount > 0) {
                            await recordDailySpend(supabase, order.strategy_id, spendAmount);
                            console.log(`[lt/sync-order-status] Recorded daily spend $${spendAmount.toFixed(2)} for filled order ${order.order_id}`);
                        }
                    }

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

        // ── Capital reconciliation: fix stranded locked capital ──
        // If locked_capital > sum of (open filled + pending) orders, release the excess
        const strategyIds = [...new Set(pendingOrders.map(o => o.strategy_id))];
        let capitalReconciled = 0;

        // Also check all active strategies, not just ones with pending orders
        const { data: activeStrategies } = await supabase
            .from('lt_strategies')
            .select('strategy_id, locked_capital, available_cash, initial_capital, cooldown_capital')
            .eq('is_active', true)
            .gt('locked_capital', 0);

        for (const strat of (activeStrategies || [])) {
            // Sum capital that SHOULD be locked: open filled + pending orders
            const { data: lockedOrders } = await supabase
                .from('lt_orders')
                .select('signal_size_usd, executed_size_usd, status')
                .eq('strategy_id', strat.strategy_id)
                .eq('outcome', 'OPEN')
                .in('status', ['FILLED', 'PARTIAL', 'PENDING']);

            const shouldBeLocked = (lockedOrders || []).reduce((sum: number, o: any) => {
                if (o.status === 'PENDING') return sum + (Number(o.signal_size_usd) || 0);
                return sum + (Number(o.executed_size_usd) || 0);
            }, 0);

            const actualLocked = Number(strat.locked_capital) || 0;
            const initialCapital = Number(strat.initial_capital) || 0;
            const cooldown = Number(strat.cooldown_capital) || 0;
            const currentAvailable = Number(strat.available_cash) || 0;

            // What available cash SHOULD be: initial - locked_for_orders - cooldown - realized_losses
            // For simplicity: if no orders are open, all capital should be available (minus realized P&L)
            const { data: resolvedOrders } = await supabase
                .from('lt_orders')
                .select('pnl')
                .eq('strategy_id', strat.strategy_id)
                .in('outcome', ['WON', 'LOST']);

            const realizedPnl = (resolvedOrders || []).reduce((sum: number, o: any) => sum + (Number(o.pnl) || 0), 0);

            // Correct equity = initial_capital + realized_pnl
            const correctEquity = +(initialCapital + realizedPnl).toFixed(2);
            const correctLocked = +shouldBeLocked.toFixed(2);
            const correctAvailable = +(correctEquity - correctLocked - cooldown).toFixed(2);

            const equityDrift = Math.abs((currentAvailable + actualLocked + cooldown) - correctEquity);

            if (equityDrift > 0.01 || Math.abs(actualLocked - correctLocked) > 0.01) {
                await supabase
                    .from('lt_strategies')
                    .update({
                        locked_capital: Math.max(0, correctLocked),
                        available_cash: Math.max(0, correctAvailable),
                        current_drawdown_pct: correctEquity < initialCapital
                            ? +((initialCapital - correctEquity) / initialCapital).toFixed(4)
                            : 0,
                        updated_at: now.toISOString(),
                    })
                    .eq('strategy_id', strat.strategy_id);

                capitalReconciled += Math.abs(correctAvailable - currentAvailable);
                console.log(`[lt/sync-order-status] Reconciled ${strat.strategy_id}: equity $${(currentAvailable + actualLocked).toFixed(2)} → $${correctEquity.toFixed(2)} (available: $${currentAvailable.toFixed(2)} → $${correctAvailable.toFixed(2)}, locked: $${actualLocked.toFixed(2)} → $${correctLocked.toFixed(2)}, realized P&L: $${realizedPnl.toFixed(2)})`);
            }
        }

        return NextResponse.json({
            success: true,
            checked: pendingOrders.length,
            updated,
            errors,
            capital_reconciled: capitalReconciled,
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
