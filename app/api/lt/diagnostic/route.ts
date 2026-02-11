/**
 * GET /api/lt/diagnostic
 * Comprehensive diagnostic endpoint for live trading system
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getActiveStrategies } from '@/lib/live-trading/executor';
import { getRiskState } from '@/lib/live-trading/risk-manager';

interface DiagnosticResult {
  category: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
  details?: any;
}

export async function GET(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const results: DiagnosticResult[] = [];
  const supabase = createAdminServiceClient();

  try {
    // 1. Check LT Strategies
    const { data: allStrategies } = await supabase
      .from('lt_strategies')
      .select('*');
    
    if (!allStrategies || allStrategies.length === 0) {
      results.push({
        category: 'LT Strategies',
        status: 'FAIL',
        message: 'NO LIVE TRADING STRATEGIES FOUND',
        details: {
          solution: 'Create a live trading strategy at /lt page or via POST /api/lt/strategies'
        }
      });
    } else {
      results.push({
        category: 'LT Strategies',
        status: 'PASS',
        message: `Found ${allStrategies.length} total strategies`
      });

      // Check active strategies
      const activeStrategies = await getActiveStrategies(supabase);
      
      if (activeStrategies.length === 0) {
        results.push({
          category: 'Active Strategies',
          status: 'FAIL',
          message: 'No active strategies (all paused or inactive)',
          details: {
            total: allStrategies.length,
            paused: allStrategies.filter((s: any) => s.is_paused).length,
            inactive: allStrategies.filter((s: any) => !s.is_active).length
          }
        });
      } else {
        results.push({
          category: 'Active Strategies',
          status: 'PASS',
          message: `Found ${activeStrategies.length} active strategies`,
          details: activeStrategies.map((s: any) => ({
            strategy_id: s.strategy_id,
            ft_wallet_id: s.ft_wallet_id,
            last_sync_time: s.last_sync_time,
            launched_at: s.launched_at
          }))
        });

        // 2. Check FT Orders
        const ftWalletIds = [...new Set(activeStrategies.map(s => s.ft_wallet_id))];
        
        const { data: openFtOrders } = await supabase
          .from('ft_orders')
          .select('wallet_id, order_id, market_title, order_time, outcome')
          .in('wallet_id', ftWalletIds)
          .eq('outcome', 'OPEN')
          .order('order_time', { ascending: false })
          .limit(100);
        
        if (!openFtOrders || openFtOrders.length === 0) {
          results.push({
            category: 'FT Orders',
            status: 'FAIL',
            message: 'NO OPEN FT ORDERS FOUND',
            details: {
              problem: 'LT executor reads from ft_orders to find trades to execute',
              solution: 'Ensure FT sync cron is running: /api/cron/ft-sync'
            }
          });
        } else {
          results.push({
            category: 'FT Orders',
            status: 'PASS',
            message: `Found ${openFtOrders.length} OPEN FT orders`,
            details: {
              by_wallet: ftWalletIds.map(wid => ({
                wallet_id: wid,
                count: openFtOrders.filter((o: any) => o.wallet_id === wid).length
              }))
            }
          });

          // Check pending execution
          for (const strategy of activeStrategies) {
            const lastSync = strategy.last_sync_time ? new Date(strategy.last_sync_time) : new Date(0);
            const ordersForWallet = openFtOrders.filter((o: any) => o.wallet_id === strategy.ft_wallet_id);
            const newOrders = ordersForWallet.filter((o: any) => new Date(o.order_time) > lastSync);
            
            if (newOrders.length > 0) {
              results.push({
                category: 'Pending Execution',
                status: 'WARN',
                message: `Strategy ${strategy.strategy_id} has ${newOrders.length} FT orders since last sync`,
                details: {
                  last_sync_time: strategy.last_sync_time,
                  action: 'These should execute on next cron run or via POST /api/lt/execute'
                }
              });
            }
          }
        }

        // 3. Check LT Orders
        const strategyIds = activeStrategies.map(s => s.strategy_id);
        const { data: ltOrders } = await supabase
          .from('lt_orders')
          .select('*')
          .in('strategy_id', strategyIds)
          .order('order_placed_at', { ascending: false })
          .limit(50);
        
        if (!ltOrders || ltOrders.length === 0) {
          results.push({
            category: 'LT Orders',
            status: 'WARN',
            message: 'NO LT ORDERS FOUND - No trades have been executed yet',
            details: {
              possible_causes: [
                'LT execution cron has not run yet',
                'No new FT orders since strategies were created',
                'Execution is failing (check logs)',
                'Risk checks are rejecting all trades'
              ]
            }
          });
        } else {
          const byStatus: Record<string, number> = {};
          ltOrders.forEach((order: any) => {
            byStatus[order.status] = (byStatus[order.status] || 0) + 1;
          });

          results.push({
            category: 'LT Orders',
            status: 'PASS',
            message: `Found ${ltOrders.length} LT orders`,
            details: { by_status: byStatus }
          });

          // Check for failed orders
          const failed = ltOrders.filter((o: any) => o.status === 'REJECTED' || o.rejection_reason);
          if (failed.length > 0) {
            const reasons: Record<string, number> = {};
            failed.forEach((o: any) => {
              const reason = o.rejection_reason || o.risk_check_reason || 'unknown';
              reasons[reason] = (reasons[reason] || 0) + 1;
            });

            results.push({
              category: 'Failed Orders',
              status: 'WARN',
              message: `Found ${failed.length} failed/rejected orders`,
              details: { reasons }
            });
          }
        }

        // 4. Check Risk State
        for (const strategy of activeStrategies) {
          const riskState = await getRiskState(supabase, strategy.strategy_id);
          
          if (!riskState) {
            results.push({
              category: 'Risk State',
              status: 'WARN',
              message: `No risk state found for ${strategy.strategy_id}`
            });
            continue;
          }

          const issues: string[] = [];
          if (riskState.is_paused) issues.push('PAUSED');
          if (riskState.circuit_breaker_active) issues.push('CIRCUIT BREAKER ACTIVE');
          if (riskState.current_drawdown_pct > 0.05) issues.push(`High drawdown: ${(riskState.current_drawdown_pct * 100).toFixed(2)}%`);

          if (issues.length > 0) {
            results.push({
              category: 'Risk State',
              status: 'WARN',
              message: `Strategy ${strategy.strategy_id} has risk issues: ${issues.join(', ')}`,
              details: {
                current_equity: riskState.current_equity,
                drawdown_pct: riskState.current_drawdown_pct,
                consecutive_losses: riskState.consecutive_losses
              }
            });
          } else {
            results.push({
              category: 'Risk State',
              status: 'PASS',
              message: `Strategy ${strategy.strategy_id} risk state is healthy`
            });
          }
        }
      }
    }

    // 5. Check Order Events Log
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentEvents } = await supabase
      .from('order_events_log')
      .select('status, error_code, error_message')
      .gte('created_at', oneDayAgo)
      .limit(100);
    
    if (!recentEvents || recentEvents.length === 0) {
      results.push({
        category: 'Order Events',
        status: 'WARN',
        message: 'No order events in last 24 hours'
      });
    } else {
      const byStatus: Record<string, number> = {};
      recentEvents.forEach((event: any) => {
        byStatus[event.status] = (byStatus[event.status] || 0) + 1;
      });

      results.push({
        category: 'Order Events',
        status: 'PASS',
        message: `Found ${recentEvents.length} order events in last 24h`,
        details: { by_status: byStatus }
      });
    }

    // Generate summary
    const failed = results.filter(r => r.status === 'FAIL');
    const warnings = results.filter(r => r.status === 'WARN');
    const passed = results.filter(r => r.status === 'PASS');

    // Prioritized actions
    const actions: string[] = [];
    
    if (results.some(r => r.category === 'LT Strategies' && r.status === 'FAIL')) {
      actions.push('CREATE LIVE TRADING STRATEGIES at /lt page or POST /api/lt/strategies');
    }
    
    if (results.some(r => r.category === 'Active Strategies' && r.status === 'FAIL')) {
      actions.push('ACTIVATE YOUR STRATEGIES via UI at /lt or POST /api/lt/strategies/{id}/resume');
    }
    
    if (results.some(r => r.category === 'FT Orders' && r.status === 'FAIL')) {
      actions.push('FIX FORWARD TESTING SYNC - Trigger: POST /api/ft/sync');
    }
    
    if (results.some(r => r.category === 'Pending Execution' && r.status === 'WARN')) {
      actions.push('TRIGGER MANUAL EXECUTION: POST /api/lt/execute');
    }
    
    if (results.some(r => r.category === 'Risk State' && r.message.includes('PAUSED'))) {
      actions.push('CHECK RISK MANAGEMENT - Strategies are paused due to risk limits');
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      summary: {
        total: results.length,
        passed: passed.length,
        warnings: warnings.length,
        failed: failed.length
      },
      health: failed.length === 0 ? (warnings.length === 0 ? 'HEALTHY' : 'DEGRADED') : 'CRITICAL',
      results,
      recommended_actions: actions
    });
  } catch (error: any) {
    console.error('[lt/diagnostic] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Diagnostic failed',
        details: error.message
      },
      { status: 500 }
    );
  }
}
