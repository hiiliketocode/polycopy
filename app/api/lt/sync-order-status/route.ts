/**
 * POST /api/lt/sync-order-status
 *
 * Sync order fill status from CLOB for all PENDING/PARTIAL lt_orders,
 * then ALWAYS run capital reconciliation for every active strategy.
 *
 * Capital reconciliation ensures:
 *   equity = initial_capital + realized_pnl
 *   locked_capital = sum of open filled + pending orders
 *   available_cash = equity - locked - cooldown
 *   daily_spent_usd = sum of today's actually-filled order values
 *   drawdown = correct % based on equity vs initial
 *
 * Called by cron every minute.
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client';
import { unlockCapital } from '@/lib/live-trading/capital-manager';
import { runCapitalReconciliation } from '@/lib/live-trading/capital-reconciliation';
import { fetchAllRows } from '@/lib/live-trading/paginated-query';
import { getActualFillPrice } from '@/lib/polymarket/fill-price';
import { emitOrderEvent } from '@/lib/live-trading/event-bus';

const LOST_ORDER_THRESHOLD = 3;
/** Max PENDING/PARTIAL orders to fetch per batch. Larger = faster backlog clear, more work per run. */
const PENDING_BATCH_SIZE = 500;
/** Max time (ms) to spend in Phase 1 so we leave room for Phase 2 (reconciliation). Cron runs every 2 min. */
const PHASE1_MAX_MS = 55_000;

export async function POST(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    const supabase = createAdminServiceClient();
    const now = new Date();

    // Today's midnight UTC for daily spend recomputation
    const todayMidnight = new Date(now);
    todayMidnight.setUTCHours(0, 0, 0, 0);
    const todayMidnightIso = todayMidnight.toISOString();

    let checked = 0;
    let updated = 0;
    let errors = 0;

    try {
        // ═══════════════════════════════════════════════════════════════
        // PHASE 1: Sync pending/partial orders from CLOB (time-bounded, scalable)
        // Process batches until none left or we hit the time budget. Reconciliation (Phase 2) always runs after.
        // ═══════════════════════════════════════════════════════════════
        const phase1Start = Date.now();

        while (Date.now() - phase1Start < PHASE1_MAX_MS) {
            const { data: pendingOrders, error: fetchError } = await supabase
                .from('lt_orders')
                .select('lt_order_id, strategy_id, user_id, order_id, signal_size_usd, executed_size_usd, shares_bought, status, order_not_found_count')
                .in('status', ['PENDING', 'PARTIAL'])
                .not('order_id', 'is', null)
                .order('created_at', { ascending: true })
                .limit(PENDING_BATCH_SIZE);

            if (fetchError) {
                console.error(`[lt/sync-order-status] Fetch error: ${fetchError.message}`);
                break;
            }
            if (!pendingOrders || pendingOrders.length === 0) break;

            checked += pendingOrders.length;
            console.log(`[lt/sync-order-status] Batch: checking ${pendingOrders.length} pending/partial (total this run: ${checked})`);

            // Group by user_id for CLOB client reuse
            const byUser = new Map<string, typeof pendingOrders>();
            for (const order of pendingOrders) {
                const uid = order.user_id;
                if (!byUser.has(uid)) byUser.set(uid, []);
                byUser.get(uid)!.push(order);
            }

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
                        let clobOrder: any;
                        try {
                            clobOrder = await client.getOrder(order.order_id);
                        } catch (clobErr: any) {
                            clobOrder = null;
                        }

                        if (!clobOrder) {
                            const currentCount = (order.order_not_found_count ?? 0) + 1;
                            await supabase
                                .from('lt_orders')
                                .update({
                                    order_not_found_count: currentCount,
                                    updated_at: now.toISOString(),
                                })
                                .eq('lt_order_id', order.lt_order_id);

                            if (currentCount >= LOST_ORDER_THRESHOLD) {
                                const toUnlock = Number(order.signal_size_usd) || 0;
                                if (toUnlock > 0.01) {
                                    await unlockCapital(supabase, order.strategy_id, toUnlock);
                                }
                                await supabase
                                    .from('lt_orders')
                                    .update({
                                        status: 'LOST',
                                        outcome: 'CANCELLED',
                                        updated_at: now.toISOString(),
                                    })
                                    .eq('lt_order_id', order.lt_order_id);
                                emitOrderEvent('OrderLost', {
                                    lt_order_id: order.lt_order_id,
                                    strategy_id: order.strategy_id,
                                    order_id: order.order_id,
                                    status: 'LOST',
                                    signal_size_usd: toUnlock,
                                    timestamp: now.toISOString(),
                                    order_not_found_count: currentCount,
                                });
                                console.log(`[lt/sync-order-status] LOST order ${order.order_id} (not found ${currentCount}x) — unlocked $${toUnlock.toFixed(2)}`);
                            }
                            continue;
                        }

                        const sizeMatched = parseFloat(clobOrder.size_matched || '0') || 0;
                        const originalSize = parseFloat(clobOrder.original_size || clobOrder.size || '0') || 0;
                        const currentShares = Number(order.shares_bought) || 0;
                        const clobStatus = String(clobOrder.status || '').toLowerCase();

                        // Only update if something changed
                        if (sizeMatched === currentShares && !['cancelled', 'canceled', 'expired'].includes(clobStatus)) {
                            continue;
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

                        // Update lt_orders — use ACTUAL fill price from CLOB trades
                        const limitPrice = Number(clobOrder.price || 0) || 0;
                        let executedPrice: number | undefined;
                        if (sizeMatched > 0 && limitPrice > 0) {
                            executedPrice = await getActualFillPrice(userId, order.order_id, limitPrice);
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

                        // Unlock capital for unfilled portion on terminal states
                        if (isTerminal) {
                            const totalLocked = Number(order.signal_size_usd) || 0;
                            const filledValue = executedSizeUsd || 0;
                            const unfilledToUnlock = Math.max(0, totalLocked - filledValue);
                            if (unfilledToUnlock > 0.01) {
                                await unlockCapital(supabase, order.strategy_id, unfilledToUnlock);
                                console.log(`[lt/sync-order-status] Unlocked $${unfilledToUnlock.toFixed(2)} for ${newStatus} order ${order.order_id}`);
                            }
                        }

                        const eventType = newStatus === 'FILLED' ? 'OrderFilled' : newStatus === 'CANCELLED' ? 'OrderCancelled' : 'OrderPartialFill';
                        emitOrderEvent(eventType, {
                            lt_order_id: order.lt_order_id,
                            strategy_id: order.strategy_id,
                            order_id: order.order_id,
                            status: newStatus,
                            signal_size_usd: Number(order.signal_size_usd) || 0,
                            executed_size_usd: executedSizeUsd,
                            shares_bought: sizeMatched,
                            fill_rate: +fillRate.toFixed(4),
                            timestamp: now.toISOString(),
                        });

                        updated++;
                        console.log(`[lt/sync-order-status] ${order.order_id}: ${order.status} → ${newStatus} (${sizeMatched}/${originalSize} filled)`);
                    } catch (err: any) {
                        console.error(`[lt/sync-order-status] Error syncing ${order.order_id}: ${err.message}`);
                        errors++;
                    }
                }
            }
        }

        if (checked === 0) console.log('[lt/sync-order-status] No pending/partial orders to sync');

        // ═══════════════════════════════════════════════════════════════
        // PHASE 2: Capital reconciliation — ALWAYS runs (shared with execute)
        // ═══════════════════════════════════════════════════════════════
        const { strategiesReconciled, capitalReconciled } = await runCapitalReconciliation(supabase, { now, log: true });

        return NextResponse.json({
            success: true,
            checked,
            updated,
            errors,
            capital_reconciled: +capitalReconciled.toFixed(2),
            strategies_reconciled: strategiesReconciled,
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
        description: 'V2: Syncs PENDING/PARTIAL orders with CLOB, then reconciles capital for ALL active strategies every run.',
    });
}
