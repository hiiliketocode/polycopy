/**
 * POST /api/lt/sync-order-status
 * Manually sync order fill status from CLOB for all PENDING/OPEN orders
 * This should be run as a cron job every 30-60 seconds
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client';

export async function POST(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const supabase = createAdminServiceClient();
  const now = new Date();

  try {
    console.log('[lt/sync-order-status] Starting order status sync at', now.toISOString());

    // Get all orders that need status update (PENDING or open with 0 fills)
    const { data: ordersToCheck, error: ordersError } = await supabase
      .from('orders')
      .select('order_id, trader_id, lt_strategy_id, lt_order_id, filled_size, size, status')
      .or('status.eq.open,status.eq.pending')
      .not('lt_strategy_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (ordersError) {
      console.error('[lt/sync-order-status] Error fetching orders:', ordersError);
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    if (!ordersToCheck || ordersToCheck.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No orders to sync',
        checked: 0,
        updated: 0
      });
    }

    console.log(`[lt/sync-order-status] Checking ${ordersToCheck.length} orders`);

    let updated = 0;
    let errors = 0;
    const updates: any[] = [];

    // Group orders by user (to reuse CLOB client)
    const ordersByUser = new Map<string, any[]>();
    for (const order of ordersToCheck) {
      // Get user_id from strategy
      const { data: strategy } = await supabase
        .from('lt_strategies')
        .select('user_id')
        .eq('strategy_id', order.lt_strategy_id)
        .single();

      if (strategy) {
        const userId = strategy.user_id;
        if (!ordersByUser.has(userId)) {
          ordersByUser.set(userId, []);
        }
        ordersByUser.get(userId)!.push(order);
      }
    }

    // Check each user's orders
    for (const [userId, orders] of ordersByUser) {
      try {
        const { client } = await getAuthedClobClientForUserAnyWallet(userId);

        for (const order of orders) {
          try {
            // Get order status from CLOB
            const clobOrder = await client.getOrder(order.order_id);

            if (clobOrder) {
              const sizeMatched = parseFloat(clobOrder.size_matched || '0');
              const originalSize = parseFloat(clobOrder.original_size || order.size || '0');
              const currentFilledSize = parseFloat(order.filled_size || '0');

              // Only update if fill status changed
              if (sizeMatched !== currentFilledSize) {
                console.log(`[lt/sync-order-status] Order ${order.order_id}: ${currentFilledSize} → ${sizeMatched} filled`);

                const remainingSize = Math.max(0, originalSize - sizeMatched);
                let newStatus = order.status;

                if (sizeMatched >= originalSize) {
                  newStatus = 'filled';
                } else if (sizeMatched > 0) {
                  newStatus = 'partial';
                } else if (clobOrder.status === 'CANCELLED') {
                  newStatus = 'cancelled';
                }

                // Update orders table
                await supabase
                  .from('orders')
                  .update({
                    filled_size: sizeMatched,
                    remaining_size: remainingSize,
                    status: newStatus,
                    updated_at: now.toISOString()
                  })
                  .eq('order_id', order.order_id);

                // Update lt_orders table if exists
                if (order.lt_order_id) {
                  const ltStatus = newStatus === 'filled' ? 'FILLED' : newStatus === 'partial' ? 'PARTIAL' : 'PENDING';
                  
                  await supabase
                    .from('lt_orders')
                    .update({
                      executed_size: sizeMatched,
                      status: ltStatus,
                      fill_rate: originalSize > 0 ? sizeMatched / originalSize : 0,
                      fully_filled_at: newStatus === 'filled' ? now.toISOString() : null,
                      updated_at: now.toISOString()
                    })
                    .eq('lt_order_id', order.lt_order_id);
                }

                updated++;
                updates.push({
                  order_id: order.order_id,
                  old_filled: currentFilledSize,
                  new_filled: sizeMatched,
                  status: newStatus
                });
              }
            }
          } catch (orderError: any) {
            console.error(`[lt/sync-order-status] Error checking order ${order.order_id}:`, orderError.message);
            errors++;
          }
        }
      } catch (clientError: any) {
        console.error(`[lt/sync-order-status] Error getting CLOB client for user ${userId}:`, clientError.message);
        errors++;
      }
    }

    console.log(`[lt/sync-order-status] Complete: ${updated} orders updated, ${errors} errors`);

    return NextResponse.json({
      success: true,
      checked: ordersToCheck.length,
      updated,
      errors,
      updates: updates.slice(0, 10), // Return first 10 for visibility
      timestamp: now.toISOString()
    });
  } catch (error: any) {
    console.error('[lt/sync-order-status] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Sync failed',
        details: error.message
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to sync order fill status from CLOB',
    description: 'Checks all PENDING/OPEN orders and updates fill status from Polymarket CLOB API'
  });
}
