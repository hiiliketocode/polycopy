/**
 * GET /api/lt/activity-logs
 * Returns recent activity logs for live trading execution
 * Shows FT sync, LT execution, order placement, fills, and errors
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';

interface LogEntry {
  id: string;
  timestamp: string;
  category: 'FT_SYNC' | 'LT_EXECUTE' | 'ORDER_PLACED' | 'ORDER_FILLED' | 'ORDER_REJECTED' | 'SYSTEM';
  status: 'SUCCESS' | 'ERROR' | 'INFO' | 'WARNING';
  message: string;
  details?: any;
}

export async function GET(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const supabase = createAdminServiceClient();
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  // Get strategy filter from query params
  const url = new URL(request.url);
  const strategyFilter = url.searchParams.get('strategy');

  try {
    const logs: LogEntry[] = [];

    // 1. Get recent FT orders (shows FT sync activity)
    const { data: recentFtOrders } = await supabase
      .from('ft_orders')
      .select('order_id, wallet_id, market_title, entry_price, size, order_time')
      .gte('order_time', oneHourAgo.toISOString())
      .order('order_time', { ascending: false })
      .limit(50);

    if (recentFtOrders) {
      recentFtOrders.forEach((fo: any) => {
        logs.push({
          id: `ft-${fo.order_id}`,
          timestamp: fo.order_time,
          category: 'FT_SYNC',
          status: 'SUCCESS',
          message: `FT Sync created order: ${fo.market_title?.substring(0, 60)}`,
          details: {
            wallet_id: fo.wallet_id,
            price: fo.entry_price,
            size_usd: fo.size
          }
        });
      });
    }

    // 2. Get recent LT orders (shows LT execution activity)
    let ltOrdersQuery = supabase
      .from('lt_orders')
      .select('lt_order_id, strategy_id, market_title, executed_price, executed_size, status, order_placed_at, fully_filled_at, rejection_reason')
      .gte('order_placed_at', oneHourAgo.toISOString());
    
    if (strategyFilter) {
      ltOrdersQuery = ltOrdersQuery.eq('strategy_id', strategyFilter);
    }
    
    const { data: recentLtOrders } = await ltOrdersQuery
      .order('order_placed_at', { ascending: false })
      .limit(50);

    if (recentLtOrders) {
      recentLtOrders.forEach((lo: any) => {
        // LT Execute log
        logs.push({
          id: `lt-exec-${lo.lt_order_id}`,
          timestamp: lo.order_placed_at,
          category: 'LT_EXECUTE',
          status: 'SUCCESS',
          message: `LT Execute triggered order for ${lo.strategy_id}`,
          details: {
            market: lo.market_title?.substring(0, 60),
            strategy: lo.strategy_id
          }
        });

        // Order Placed log
        logs.push({
          id: `lt-placed-${lo.lt_order_id}`,
          timestamp: lo.order_placed_at,
          category: 'ORDER_PLACED',
          status: lo.rejection_reason ? 'ERROR' : 'SUCCESS',
          message: lo.rejection_reason 
            ? `Order rejected: ${lo.market_title?.substring(0, 60)}`
            : `Order placed: ${lo.market_title?.substring(0, 60)}`,
          details: {
            price: lo.executed_price,
            size: lo.executed_size,
            status: lo.status,
            rejection_reason: lo.rejection_reason
          }
        });

        // Order Filled log (if filled)
        if (lo.status === 'FILLED' && lo.fully_filled_at) {
          logs.push({
            id: `lt-filled-${lo.lt_order_id}`,
            timestamp: lo.fully_filled_at,
            category: 'ORDER_FILLED',
            status: 'SUCCESS',
            message: `✅ Order filled: ${lo.market_title?.substring(0, 60)}`,
            details: {
              price: lo.executed_price,
              size: lo.executed_size
            }
          });
        }
      });
    }

    // 3. Get order events log (shows rejections and errors)
    const { data: orderEvents } = await supabase
      .from('order_events_log')
      .select('id, created_at, status, condition_id, error_code, error_message, token_id')
      .gte('created_at', oneHourAgo.toISOString())
      .eq('status', 'rejected')
      .order('created_at', { ascending: false })
      .limit(30);

    if (orderEvents) {
      orderEvents.forEach((event: any) => {
        logs.push({
          id: `event-${event.id}`,
          timestamp: event.created_at,
          category: 'ORDER_REJECTED',
          status: 'ERROR',
          message: `Order rejected: ${event.error_message || event.error_code || 'Unknown error'}`,
          details: {
            error_code: event.error_code,
            condition_id: event.condition_id?.substring(0, 20),
            token_id: event.token_id?.substring(0, 20)
          }
        });
      });
    }

    // Sort all logs by timestamp (most recent first)
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Calculate stats
    const ordersLastHour = recentLtOrders?.length || 0;
    const fillsLastHour = recentLtOrders?.filter((o: any) => o.status === 'FILLED').length || 0;
    const executionRate = ordersLastHour > 0 ? Math.round((fillsLastHour / ordersLastHour) * 100) : 0;

    // Get last sync times from strategies
    const { data: strategies } = await supabase
      .from('lt_strategies')
      .select('last_sync_time')
      .eq('is_active', true)
      .order('last_sync_time', { ascending: false })
      .limit(1);

    const lastLtExecute = strategies && strategies.length > 0 ? strategies[0].last_sync_time : null;

    // Estimate last FT sync from most recent FT order
    const lastFtSync = recentFtOrders && recentFtOrders.length > 0 
      ? recentFtOrders[0].order_time 
      : null;

    return NextResponse.json({
      success: true,
      logs: logs.slice(0, 100), // Return last 100 logs
      stats: {
        last_ft_sync: lastFtSync,
        last_lt_execute: lastLtExecute,
        orders_last_hour: ordersLastHour,
        fills_last_hour: fillsLastHour,
        execution_rate: executionRate
      },
      timestamp: now.toISOString()
    });
  } catch (error: any) {
    console.error('[lt/activity-logs] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch activity logs',
        details: error.message
      },
      { status: 500 }
    );
  }
}
