/**
 * GET /api/lt/monitor-live
 * Real-time monitoring of LT execution - shows recent activity and what's coming next
 * Use this to verify bot is executing new trades as they happen
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';

export async function GET(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const supabase = createAdminServiceClient();
  const now = new Date();

  try {
    // Get recent LT orders (last 30 minutes)
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const { data: recentOrders } = await supabase
      .from('lt_orders')
      .select('*')
      .gte('order_placed_at', thirtyMinutesAgo.toISOString())
      .order('order_placed_at', { ascending: false });

    // Get very recent FT orders (last 30 minutes) - these are the NEW trades
    const { data: recentFtOrders } = await supabase
      .from('ft_orders')
      .select('order_id, wallet_id, market_title, entry_price, size, order_time')
      .eq('outcome', 'OPEN')
      .gte('order_time', thirtyMinutesAgo.toISOString())
      .order('order_time', { ascending: false });

    // Get active strategies with sync times
    const { data: strategies } = await supabase
      .from('lt_strategies')
      .select('strategy_id, ft_wallet_id, last_sync_time, is_active, is_paused')
      .eq('is_active', true)
      .eq('is_paused', false);

    // Analyze what should execute next
    const nextToExecute: any[] = [];
    
    if (strategies && recentFtOrders) {
      for (const strategy of strategies) {
        const lastSync = strategy.last_sync_time ? new Date(strategy.last_sync_time) : new Date(0);
        
        const pendingFtOrders = recentFtOrders.filter((fo: any) => 
          fo.wallet_id === strategy.ft_wallet_id &&
          new Date(fo.order_time) > lastSync
        );

        if (pendingFtOrders.length > 0) {
          nextToExecute.push({
            strategy_id: strategy.strategy_id,
            pending_count: pendingFtOrders.length,
            next_orders: pendingFtOrders.slice(0, 3).map((fo: any) => ({
              market: fo.market_title?.substring(0, 50),
              price: fo.entry_price,
              size_usd: fo.size,
              order_time: fo.order_time,
              age_minutes: Math.round((now.getTime() - new Date(fo.order_time).getTime()) / (1000 * 60))
            }))
          });
        }
      }
    }

    // Calculate execution metrics
    const ftOrdersByWallet: Record<string, number> = {};
    if (recentFtOrders) {
      recentFtOrders.forEach((fo: any) => {
        ftOrdersByWallet[fo.wallet_id] = (ftOrdersByWallet[fo.wallet_id] || 0) + 1;
      });
    }

    const ltOrdersByStrategy: Record<string, number> = {};
    if (recentOrders) {
      recentOrders.forEach((lo: any) => {
        ltOrdersByStrategy[lo.strategy_id] = (ltOrdersByStrategy[lo.strategy_id] || 0) + 1;
      });
    }

    return NextResponse.json({
      timestamp: now.toISOString(),
      time_window: 'Last 30 minutes',
      
      activity: {
        new_ft_orders: recentFtOrders?.length || 0,
        new_lt_orders: recentOrders?.length || 0,
        execution_rate: recentFtOrders && recentFtOrders.length > 0 
          ? `${Math.round(((recentOrders?.length || 0) / recentFtOrders.length) * 100)}%`
          : 'N/A'
      },

      recent_lt_orders: (recentOrders || []).slice(0, 10).map((o: any) => ({
        strategy_id: o.strategy_id,
        market: o.market_title?.substring(0, 50),
        price: o.executed_price,
        size: o.executed_size,
        status: o.status,
        placed: o.order_placed_at,
        age_minutes: Math.round((now.getTime() - new Date(o.order_placed_at).getTime()) / (1000 * 60))
      })),

      recent_ft_orders: (recentFtOrders || []).slice(0, 10).map((fo: any) => ({
        wallet_id: fo.wallet_id,
        market: fo.market_title?.substring(0, 50),
        price: fo.entry_price,
        size_usd: fo.size,
        order_time: fo.order_time,
        age_minutes: Math.round((now.getTime() - new Date(fo.order_time).getTime()) / (1000 * 60))
      })),

      next_to_execute: nextToExecute,

      by_strategy: (strategies || []).map((s: any) => ({
        strategy_id: s.strategy_id,
        ft_wallet_id: s.ft_wallet_id,
        last_sync: s.last_sync_time,
        minutes_since_sync: s.last_sync_time 
          ? Math.round((now.getTime() - new Date(s.last_sync_time).getTime()) / (1000 * 60))
          : null,
        new_ft_orders: ftOrdersByWallet[s.ft_wallet_id] || 0,
        new_lt_orders: ltOrdersByStrategy[s.strategy_id] || 0
      })),

      health_check: {
        cron_frequency: '2 minutes',
        last_execution_window: 'Within last 2 minutes if cron is healthy',
        expected_behavior: 'New FT orders should appear as LT orders within 2-4 minutes',
        current_status: nextToExecute.length > 0 
          ? `⚠️ ${nextToExecute.reduce((sum, s) => sum + s.pending_count, 0)} orders waiting to execute`
          : '✅ No pending orders (all caught up or no new FT orders)'
      }
    });
  } catch (error: any) {
    console.error('[lt/monitor-live] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Monitoring failed',
        details: error.message
      },
      { status: 500 }
    );
  }
}
