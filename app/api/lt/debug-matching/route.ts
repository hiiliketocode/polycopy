/**
 * GET /api/lt/debug-matching
 * Debug why LT isn't finding FT orders after reset
 * Shows exactly what LT sees when it queries for orders
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getActiveStrategies } from '@/lib/live-trading/executor';

export async function GET(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const supabase = createAdminServiceClient();
  const now = new Date();

  try {
    const strategies = await getActiveStrategies(supabase);
    const debug: any = {
      timestamp: now.toISOString(),
      strategies: []
    };

    for (const strategy of strategies) {
      const lastSyncTime = strategy.last_sync_time
        ? new Date(strategy.last_sync_time)
        : (strategy.launched_at ? new Date(strategy.launched_at) : new Date(0));

      // Query EXACTLY like executor does
      const { data: ftOrders, error: ftOrdersError } = await supabase
        .from('ft_orders')
        .select('order_id, condition_id, market_title, entry_price, size, order_time, outcome')
        .eq('wallet_id', strategy.ft_wallet_id)
        .eq('outcome', 'OPEN')
        .gt('order_time', lastSyncTime.toISOString())
        .order('order_time', { ascending: true });

      // Also check what orders exist BEFORE sync time
      const { data: beforeSync } = await supabase
        .from('ft_orders')
        .select('order_id, order_time')
        .eq('wallet_id', strategy.ft_wallet_id)
        .eq('outcome', 'OPEN')
        .lte('order_time', lastSyncTime.toISOString())
        .limit(5);

      // Check if FT wallet exists
      const { data: ftWallet } = await supabase
        .from('ft_wallets')
        .select('wallet_id, display_name, is_active')
        .eq('wallet_id', strategy.ft_wallet_id)
        .single();

      debug.strategies.push({
        strategy_id: strategy.strategy_id,
        ft_wallet_id: strategy.ft_wallet_id,
        ft_wallet_exists: !!ftWallet,
        ft_wallet_active: ftWallet?.is_active || false,
        last_sync_time: lastSyncTime.toISOString(),
        minutes_since_sync: Math.round((now.getTime() - lastSyncTime.getTime()) / (1000 * 60)),
        query_error: ftOrdersError?.message || null,
        found_after_sync: ftOrders?.length || 0,
        found_before_sync: beforeSync?.length || 0,
        sample_after_sync: ftOrders?.slice(0, 3).map(o => ({
          market: o.market_title?.substring(0, 50),
          order_time: o.order_time,
          minutes_after_sync: Math.round((new Date(o.order_time).getTime() - lastSyncTime.getTime()) / (1000 * 60))
        })),
        sample_before_sync: beforeSync?.map(o => ({
          order_time: o.order_time,
          minutes_before_sync: Math.round((lastSyncTime.getTime() - new Date(o.order_time).getTime()) / (1000 * 60))
        }))
      });
    }

    // Check recent FT activity overall
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const { data: recentFtOrders } = await supabase
      .from('ft_orders')
      .select('wallet_id, order_time, market_title')
      .gte('order_time', fiveMinutesAgo.toISOString())
      .order('order_time', { ascending: false })
      .limit(10);

    debug.recent_ft_activity = {
      last_5_minutes: recentFtOrders?.length || 0,
      by_wallet: recentFtOrders?.reduce((acc: any, o: any) => {
        acc[o.wallet_id] = (acc[o.wallet_id] || 0) + 1;
        return acc;
      }, {}),
      samples: recentFtOrders?.slice(0, 3).map(o => ({
        wallet_id: o.wallet_id,
        market: o.market_title?.substring(0, 50),
        order_time: o.order_time,
        minutes_ago: Math.round((now.getTime() - new Date(o.order_time).getTime()) / (1000 * 60))
      }))
    };

    return NextResponse.json(debug);
  } catch (error: any) {
    console.error('[lt/debug-matching] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Debug failed',
        details: error.message
      },
      { status: 500 }
    );
  }
}
