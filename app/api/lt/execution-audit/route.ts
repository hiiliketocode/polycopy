/**
 * GET /api/lt/execution-audit
 * Deep dive into why FT orders are not triggering LT orders
 * Shows exact skip reasons for each FT order
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getActiveStrategies } from '@/lib/live-trading/executor-v2';
import { fetchAllRows } from '@/lib/live-trading/paginated-query';

export async function GET(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const supabase = createAdminServiceClient();
  const now = new Date();

  try {
    // Get active strategies
    const strategies = await getActiveStrategies(supabase);
    
    if (strategies.length === 0) {
      return NextResponse.json({
        error: 'No active strategies found'
      });
    }

    const audit: any = {
      timestamp: now.toISOString(),
      strategies: []
    };

    for (const strategy of strategies) {
      const ftWalletId = strategy.ft_wallet_id;
      const lastSyncTime = strategy.last_sync_time
        ? new Date(strategy.last_sync_time)
        : (strategy.launched_at ? new Date(strategy.launched_at) : new Date(0));

      // Get ALL open FT orders for this wallet
      const { data: allFtOrders } = await supabase
        .from('ft_orders')
        .select('order_id, condition_id, market_title, entry_price, size, order_time, source_trade_id')
        .eq('wallet_id', ftWalletId)
        .eq('outcome', 'OPEN')
        .order('order_time', { ascending: false })
        .limit(100);

      // Get already executed LT orders (paginated — can exceed 1000 per strategy)
      const executedLtOrders = await fetchAllRows(supabase, 'lt_orders',
        'source_trade_id',
        [['strategy_id', 'eq', strategy.strategy_id]]);

      const executedSourceIds = new Set(
        executedLtOrders.map((o: any) => o.source_trade_id)
      );

      const analysis = {
        strategy_id: strategy.strategy_id,
        ft_wallet_id: ftWalletId,
        last_sync_time: lastSyncTime.toISOString(),
        total_ft_orders: allFtOrders?.length || 0,
        already_executed: executedSourceIds.size,
        breakdown: {
          too_old: 0,
          already_executed: 0,
          eligible: 0
        },
        sample_skipped: [] as any[],
        sample_eligible: [] as any[]
      };

      if (allFtOrders) {
        for (const fo of allFtOrders) {
          const orderTime = new Date(fo.order_time);
          const sourceTradeId = fo.source_trade_id || `${fo.condition_id}-${fo.order_time}`;
          
          // Check if already executed
          if (executedSourceIds.has(sourceTradeId)) {
            analysis.breakdown.already_executed++;
            continue;
          }

          // Check if too old
          if (orderTime <= lastSyncTime) {
            analysis.breakdown.too_old++;
            
            if (analysis.sample_skipped.length < 5) {
              analysis.sample_skipped.push({
                market: fo.market_title?.substring(0, 60),
                order_time: fo.order_time,
                hours_before_sync: Math.round((lastSyncTime.getTime() - orderTime.getTime()) / (1000 * 60 * 60)),
                reason: 'trade_too_old'
              });
            }
          } else {
            // Eligible for execution
            analysis.breakdown.eligible++;
            
            if (analysis.sample_eligible.length < 5) {
              analysis.sample_eligible.push({
                market: fo.market_title?.substring(0, 60),
                order_time: fo.order_time,
                price: fo.entry_price,
                size_usd: fo.size
              });
            }
          }
        }
      }

      audit.strategies.push(analysis);
    }

    // Summary
    const totals = {
      total_ft_orders: audit.strategies.reduce((sum: number, s: any) => sum + s.total_ft_orders, 0),
      already_executed: audit.strategies.reduce((sum: number, s: any) => sum + s.breakdown.already_executed, 0),
      too_old: audit.strategies.reduce((sum: number, s: any) => sum + s.breakdown.too_old, 0),
      eligible: audit.strategies.reduce((sum: number, s: any) => sum + s.breakdown.eligible, 0)
    };

    audit.summary = totals;
    audit.execution_rate = totals.total_ft_orders > 0 
      ? `${Math.round((totals.already_executed / totals.total_ft_orders) * 100)}%`
      : '0%';

    // Recommendations
    audit.recommendations = [];

    if (totals.too_old > totals.eligible) {
      audit.recommendations.push({
        priority: 'HIGH',
        issue: `${totals.too_old} FT orders are being skipped as "too old"`,
        solution: 'Reset last_sync_time to look back further',
        sql: `UPDATE lt_strategies SET last_sync_time = NOW() - INTERVAL '7 days' WHERE is_active = true;`
      });
    }

    if (totals.eligible > 10) {
      audit.recommendations.push({
        priority: 'MEDIUM',
        issue: `${totals.eligible} FT orders are eligible but not yet executed`,
        solution: 'Trigger manual execution or wait for next cron run',
        action: 'POST /api/lt/execute'
      });
    }

    if (totals.already_executed === 0) {
      audit.recommendations.push({
        priority: 'CRITICAL',
        issue: 'No orders have been executed yet',
        solution: 'Check CLOB connectivity, wallet setup, and order placement',
        action: 'POST /api/lt/force-test-trade with cancel_after: true'
      });
    }

    return NextResponse.json(audit);
  } catch (error: any) {
    console.error('[lt/execution-audit] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Audit failed',
        details: error.message
      },
      { status: 500 }
    );
  }
}
