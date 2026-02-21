/**
 * Sync PENDING/PARTIAL lt_orders with CLOB (get fill status, update status, unlock when needed).
 *
 * Run this BEFORE capital reconciliation so that:
 * - PENDING orders that have filled or been cancelled on CLOB get updated
 * - Reconciliation then counts only real open orders, so locked_capital is correct
 * - available_cash is no longer inflated by phantom PENDING orders
 *
 * Used by: POST /api/lt/sync-order-status (Phase 1) and POST /api/lt/execute (before reconciliation).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client';
import { unlockCapital } from '@/lib/live-trading/capital-manager';
import { getActualFillPrice } from '@/lib/polymarket/fill-price';
import { emitOrderEvent } from '@/lib/live-trading/event-bus';

const LOST_ORDER_THRESHOLD = 3;
const PENDING_BATCH_SIZE = 500;

export interface SyncPendingOrdersOptions {
  /** Max time (ms) to spend syncing. Default 30_000 for execute, sync-order-status uses 55_000. */
  maxMs?: number;
  /** If true, log progress. Default true. */
  log?: boolean;
}

export interface SyncPendingOrdersResult {
  checked: number;
  updated: number;
  errors: number;
}

export async function syncPendingOrdersWithClob(
  supabase: SupabaseClient,
  options: SyncPendingOrdersOptions = {},
): Promise<SyncPendingOrdersResult> {
  const maxMs = options.maxMs ?? 30_000;
  const doLog = options.log !== false;
  const now = new Date();

  let checked = 0;
  let updated = 0;
  let errors = 0;
  const start = Date.now();

  while (Date.now() - start < maxMs) {
    const { data: pendingOrders, error: fetchError } = await supabase
      .from('lt_orders')
      .select('lt_order_id, strategy_id, user_id, order_id, signal_size_usd, executed_size_usd, shares_bought, status, order_not_found_count')
      .in('status', ['PENDING', 'PARTIAL'])
      .not('order_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(PENDING_BATCH_SIZE);

    if (fetchError) {
      if (doLog) console.error(`[sync-pending-orders] Fetch error: ${fetchError.message}`);
      break;
    }
    if (!pendingOrders || pendingOrders.length === 0) break;

    checked += pendingOrders.length;
    if (doLog) console.log(`[sync-pending-orders] Batch: checking ${pendingOrders.length} (total this run: ${checked})`);

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
        if (doLog) console.error(`[sync-pending-orders] CLOB client error for ${userId}: ${err.message}`);
        errors++;
        continue;
      }

      for (const order of orders) {
        try {
          let clobOrder: any;
          try {
            clobOrder = await client.getOrder(order.order_id);
          } catch {
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
              if (doLog) console.log(`[sync-pending-orders] LOST order ${order.order_id} — unlocked $${toUnlock.toFixed(2)}`);
            }
            continue;
          }

          const sizeMatched = parseFloat(clobOrder.size_matched || '0') || 0;
          const originalSize = parseFloat(clobOrder.original_size || clobOrder.size || '0') || 0;
          const currentShares = Number(order.shares_bought) || 0;
          const clobStatus = String(clobOrder.status || '').toLowerCase();

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

          await supabase
            .from('orders')
            .update({
              filled_size: sizeMatched,
              remaining_size: remainingSize,
              status: newStatus.toLowerCase(),
              updated_at: now.toISOString(),
            })
            .eq('order_id', order.order_id);

          if (isTerminal) {
            const totalLocked = Number(order.signal_size_usd) || 0;
            const filledValue = executedSizeUsd || 0;
            const unfilledToUnlock = Math.max(0, totalLocked - filledValue);
            if (unfilledToUnlock > 0.01) {
              await unlockCapital(supabase, order.strategy_id, unfilledToUnlock);
              if (doLog) console.log(`[sync-pending-orders] Unlocked $${unfilledToUnlock.toFixed(2)} for ${newStatus} order ${order.order_id}`);
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
        } catch (err: any) {
          if (doLog) console.error(`[sync-pending-orders] Error syncing ${order.order_id}: ${err.message}`);
          errors++;
        }
      }
    }
  }

  return { checked, updated, errors };
}
