/**
 * POST /api/lt/cancel-stuck-orders
 * Cancel orders that have been OPEN for more than 5 minutes with no fills
 * These are likely GTC orders that won't fill due to price movement
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
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  try {
    console.log('[lt/cancel-stuck-orders] Starting stuck order cleanup at', now.toISOString());

    // Find orders that are:
    // 1. Status 'open' (not filled)
    // 2. Created more than 5 minutes ago
    // 3. Part of LT strategies (not manual trades)
    // 4. Order type is GTC (these can sit forever)
    const { data: stuckOrders, error: queryError } = await supabase
      .from('orders')
      .select('order_id, trader_id, lt_strategy_id, created_at, market_id, outcome, price, size')
      .eq('status', 'open')
      .eq('order_type', 'GTC')
      .lt('created_at', fiveMinutesAgo.toISOString())
      .not('lt_strategy_id', 'is', null)
      .limit(50);

    if (queryError) {
      console.error('[lt/cancel-stuck-orders] Query error:', queryError);
      return NextResponse.json({ error: queryError.message }, { status: 500 });
    }

    if (!stuckOrders || stuckOrders.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No stuck orders to cancel',
        cancelled: 0
      });
    }

    console.log(`[lt/cancel-stuck-orders] Found ${stuckOrders.length} stuck orders`);

    let cancelled = 0;
    let errors = 0;
    const results: any[] = [];

    // Group by user to reuse CLOB client
    const ordersByUser = new Map<string, any[]>();
    for (const order of stuckOrders) {
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

    // Cancel orders per user
    for (const [userId, orders] of ordersByUser) {
      try {
        const { client } = await getAuthedClobClientForUserAnyWallet(userId);

        const orderIds = orders.map(o => o.order_id);
        
        // Cancel multiple orders at once
        await client.cancelOrders(orderIds);
        
        console.log(`[lt/cancel-stuck-orders] Cancelled ${orderIds.length} orders for user ${userId}`);

        // Update database
        for (const order of orders) {
          await supabase
            .from('orders')
            .update({
              status: 'cancelled',
              updated_at: now.toISOString()
            })
            .eq('order_id', order.order_id);

          // Update lt_orders if exists
          if (order.lt_strategy_id) {
            await supabase
              .from('lt_orders')
              .update({
                status: 'CANCELLED',
                rejection_reason: 'Stuck order auto-cancelled after 5 minutes (GTC order)',
                updated_at: now.toISOString()
              })
              .eq('order_id', order.order_id);
          }

          cancelled++;
          results.push({
            order_id: order.order_id,
            age_minutes: Math.round((now.getTime() - new Date(order.created_at).getTime()) / (1000 * 60)),
            market: order.market_id?.substring(0, 20) + '...',
            outcome: order.outcome,
            price: order.price
          });
        }
      } catch (error: any) {
        console.error(`[lt/cancel-stuck-orders] Error cancelling for user ${userId}:`, error.message);
        errors++;
      }
    }

    console.log(`[lt/cancel-stuck-orders] Complete: ${cancelled} cancelled, ${errors} errors`);

    return NextResponse.json({
      success: true,
      cancelled,
      errors,
      cancelled_orders: results.slice(0, 10),
      message: `Cancelled ${cancelled} stuck GTC orders that were open for >5 minutes`,
      recommendation: 'Switch to IOC order type: UPDATE lt_strategies SET order_type = \'IOC\' WHERE is_active = true;'
    });
  } catch (error: any) {
    console.error('[lt/cancel-stuck-orders] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to cancel stuck orders',
        details: error.message
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to cancel stuck GTC orders',
    description: 'Cancels orders that have been OPEN for >5 minutes with no fills (likely stuck due to price movement)'
  });
}
