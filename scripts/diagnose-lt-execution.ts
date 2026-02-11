/**
 * Comprehensive Live Trading Diagnostic Script
 * 
 * This script performs a complete health check and diagnostic of the live trading system:
 * 1. Checks database state (strategies, FT orders, LT orders)
 * 2. Verifies FT sync is generating orders
 * 3. Tests trade execution pathway
 * 4. Validates CLOB connectivity and wallet setup
 * 5. Checks risk management state
 * 6. Identifies specific failure points
 * 
 * Run: npx tsx scripts/diagnose-lt-execution.ts
 */

import { createAdminServiceClient } from '@/lib/admin';
import { getActiveStrategies } from '@/lib/live-trading/executor';
import { getRiskState } from '@/lib/live-trading/risk-manager';

interface DiagnosticResult {
  category: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  message: string;
  details?: any;
}

const results: DiagnosticResult[] = [];

function addResult(category: string, status: 'PASS' | 'WARN' | 'FAIL', message: string, details?: any) {
  results.push({ category, status, message, details });
  const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  console.log(`${icon} [${category}] ${message}`);
  if (details) {
    console.log('   Details:', JSON.stringify(details, null, 2));
  }
}

async function checkLTStrategies() {
  console.log('\n📊 Checking LT Strategies...');
  const supabase = createAdminServiceClient();
  
  try {
    // Check all strategies
    const { data: allStrategies, error: allError } = await supabase
      .from('lt_strategies')
      .select('*');
    
    if (allError) {
      addResult('LT Strategies', 'FAIL', 'Failed to query lt_strategies table', { error: allError.message });
      return;
    }

    if (!allStrategies || allStrategies.length === 0) {
      addResult('LT Strategies', 'FAIL', 'NO LIVE TRADING STRATEGIES FOUND - This is the primary issue!', {
        solution: 'Create a live trading strategy at /lt page or via POST /api/lt/strategies'
      });
      return;
    }

    addResult('LT Strategies', 'PASS', `Found ${allStrategies.length} total strategies`);

    // Check active strategies
    const activeStrategies = await getActiveStrategies(supabase);
    
    if (activeStrategies.length === 0) {
      addResult('Active Strategies', 'FAIL', 'No active strategies (all paused or inactive)', {
        total_strategies: allStrategies.length,
        paused: allStrategies.filter((s: any) => s.is_paused).length,
        inactive: allStrategies.filter((s: any) => !s.is_active).length,
        solution: 'Activate or resume strategies via UI at /lt or API'
      });
    } else {
      addResult('Active Strategies', 'PASS', `Found ${activeStrategies.length} active strategies`);
      
      // Check each active strategy
      for (const strategy of activeStrategies) {
        console.log(`\n  📌 Strategy: ${strategy.strategy_id}`);
        console.log(`     FT Wallet: ${strategy.ft_wallet_id}`);
        console.log(`     User: ${strategy.user_id}`);
        console.log(`     Wallet: ${strategy.wallet_address}`);
        console.log(`     Last Sync: ${strategy.last_sync_time || 'NEVER'}`);
        console.log(`     Launched: ${strategy.launched_at}`);
      }
    }

    return allStrategies;
  } catch (error: any) {
    addResult('LT Strategies', 'FAIL', 'Error checking strategies', { error: error.message });
  }
}

async function checkFTOrders(strategies: any[]) {
  console.log('\n📈 Checking FT Orders...');
  const supabase = createAdminServiceClient();
  
  try {
    // Get all FT wallet IDs from strategies
    const ftWalletIds = [...new Set(strategies.map(s => s.ft_wallet_id))];
    
    if (ftWalletIds.length === 0) {
      addResult('FT Orders', 'WARN', 'No FT wallet IDs found in strategies');
      return;
    }

    addResult('FT Wallets', 'PASS', `Checking ${ftWalletIds.length} FT wallets`, { ft_wallet_ids: ftWalletIds });

    // Check FT wallets exist
    const { data: ftWallets, error: ftWalletError } = await supabase
      .from('ft_wallets')
      .select('wallet_id, display_name, is_active, last_sync_time, total_trades')
      .in('wallet_id', ftWalletIds);
    
    if (ftWalletError || !ftWallets) {
      addResult('FT Wallets', 'FAIL', 'Failed to load FT wallets', { error: ftWalletError?.message });
      return;
    }

    console.log('\n  FT Wallets:');
    ftWallets.forEach((w: any) => {
      console.log(`    - ${w.wallet_id}: ${w.display_name} (active: ${w.is_active}, trades: ${w.total_trades}, last_sync: ${w.last_sync_time})`);
    });

    // Check for OPEN FT orders
    const { data: openFtOrders, error: ftOrderError } = await supabase
      .from('ft_orders')
      .select('wallet_id, order_id, condition_id, market_title, entry_price, size, order_time, outcome')
      .in('wallet_id', ftWalletIds)
      .eq('outcome', 'OPEN')
      .order('order_time', { ascending: false })
      .limit(100);
    
    if (ftOrderError) {
      addResult('FT Orders', 'FAIL', 'Failed to query ft_orders', { error: ftOrderError.message });
      return;
    }

    if (!openFtOrders || openFtOrders.length === 0) {
      addResult('FT Orders', 'FAIL', 'NO OPEN FT ORDERS FOUND - This is a critical issue!', {
        problem: 'LT executor reads from ft_orders to find trades to execute',
        solution: 'Ensure FT sync cron is running and generating orders. Check /api/cron/ft-sync logs'
      });
      
      // Check if there are ANY ft_orders
      const { data: anyOrders, error: anyError } = await supabase
        .from('ft_orders')
        .select('wallet_id, outcome, order_time', { count: 'exact' })
        .in('wallet_id', ftWalletIds)
        .limit(1);
      
      if (anyError || !anyOrders || anyOrders.length === 0) {
        addResult('FT Orders History', 'FAIL', 'No FT orders found AT ALL - FT sync has never run or failed', {
          action: 'Manually trigger FT sync: POST /api/ft/sync'
        });
      } else {
        addResult('FT Orders History', 'WARN', 'FT orders exist but none are OPEN', {
          info: 'All positions may be closed/resolved. Check if new trades are being generated.'
        });
      }
      return;
    }

    addResult('FT Orders', 'PASS', `Found ${openFtOrders.length} OPEN FT orders`);
    
    // Group by wallet
    const ordersByWallet: Record<string, any[]> = {};
    openFtOrders.forEach((order: any) => {
      if (!ordersByWallet[order.wallet_id]) {
        ordersByWallet[order.wallet_id] = [];
      }
      ordersByWallet[order.wallet_id].push(order);
    });

    console.log('\n  Open FT Orders by Wallet:');
    Object.entries(ordersByWallet).forEach(([walletId, orders]) => {
      console.log(`    ${walletId}: ${orders.length} orders`);
      orders.slice(0, 3).forEach((o: any) => {
        console.log(`      - ${o.market_title?.substring(0, 50)}... @ $${o.entry_price} ($${o.size}) - ${new Date(o.order_time).toLocaleString()}`);
      });
      if (orders.length > 3) {
        console.log(`      ... and ${orders.length - 3} more`);
      }
    });

    // Check last_sync_time vs order_time
    for (const strategy of strategies) {
      if (!strategy.is_active || strategy.is_paused) continue;
      
      const lastSync = strategy.last_sync_time ? new Date(strategy.last_sync_time) : new Date(0);
      const ordersForWallet = ordersByWallet[strategy.ft_wallet_id] || [];
      const newOrders = ordersForWallet.filter((o: any) => new Date(o.order_time) > lastSync);
      
      if (newOrders.length > 0) {
        addResult('Pending Execution', 'WARN', `Strategy ${strategy.strategy_id} has ${newOrders.length} FT orders since last sync`, {
          last_sync_time: strategy.last_sync_time,
          new_orders: newOrders.map((o: any) => ({
            order_id: o.order_id,
            market: o.market_title?.substring(0, 40),
            order_time: o.order_time
          })),
          action: 'These should be executed on next cron run (every 2 min) or via POST /api/lt/execute'
        });
      } else {
        addResult('Pending Execution', 'PASS', `Strategy ${strategy.strategy_id} has no new orders since last sync`);
      }
    }

    return openFtOrders;
  } catch (error: any) {
    addResult('FT Orders', 'FAIL', 'Error checking FT orders', { error: error.message });
  }
}

async function checkLTOrders(strategies: any[]) {
  console.log('\n📝 Checking LT Orders (Executed Trades)...');
  const supabase = createAdminServiceClient();
  
  try {
    const strategyIds = strategies.map(s => s.strategy_id);
    
    const { data: ltOrders, error: ltError } = await supabase
      .from('lt_orders')
      .select('*')
      .in('strategy_id', strategyIds)
      .order('order_placed_at', { ascending: false })
      .limit(50);
    
    if (ltError) {
      addResult('LT Orders', 'FAIL', 'Failed to query lt_orders', { error: ltError.message });
      return;
    }

    if (!ltOrders || ltOrders.length === 0) {
      addResult('LT Orders', 'WARN', 'NO LT ORDERS FOUND - No trades have been executed yet', {
        possible_causes: [
          'LT execution cron has not run yet',
          'No new FT orders since strategies were created',
          'Execution is failing (check logs)',
          'Risk checks are rejecting all trades'
        ],
        action: 'Check execution logs and risk state. Manually trigger: POST /api/lt/execute'
      });
      return;
    }

    addResult('LT Orders', 'PASS', `Found ${ltOrders.length} LT orders`);

    // Analyze orders
    const byStatus: Record<string, number> = {};
    const byOutcome: Record<string, number> = {};
    const forceTests = ltOrders.filter((o: any) => o.is_force_test);
    
    ltOrders.forEach((order: any) => {
      byStatus[order.status] = (byStatus[order.status] || 0) + 1;
      byOutcome[order.outcome] = (byOutcome[order.outcome] || 0) + 1;
    });

    console.log('\n  LT Order Status:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`    ${status}: ${count}`);
    });

    console.log('\n  LT Order Outcomes:');
    Object.entries(byOutcome).forEach(([outcome, count]) => {
      console.log(`    ${outcome}: ${count}`);
    });

    if (forceTests.length > 0) {
      addResult('Force Tests', 'PASS', `Found ${forceTests.length} force test trades`, {
        latest: forceTests.slice(0, 3).map((o: any) => ({
          market: o.market_title?.substring(0, 40),
          status: o.status,
          placed_at: o.order_placed_at
        }))
      });
    }

    // Check for failed orders
    const failed = ltOrders.filter((o: any) => o.status === 'REJECTED' || o.rejection_reason);
    if (failed.length > 0) {
      addResult('Failed Orders', 'WARN', `Found ${failed.length} failed/rejected orders`, {
        reasons: failed.reduce((acc: any, o: any) => {
          const reason = o.rejection_reason || o.risk_check_reason || 'unknown';
          acc[reason] = (acc[reason] || 0) + 1;
          return acc;
        }, {}),
        samples: failed.slice(0, 3).map((o: any) => ({
          market: o.market_title?.substring(0, 40),
          reason: o.rejection_reason || o.risk_check_reason,
          placed_at: o.order_placed_at
        }))
      });
    }

  } catch (error: any) {
    addResult('LT Orders', 'FAIL', 'Error checking LT orders', { error: error.message });
  }
}

async function checkRiskState(strategies: any[]) {
  console.log('\n🛡️  Checking Risk Management State...');
  const supabase = createAdminServiceClient();
  
  try {
    for (const strategy of strategies) {
      if (!strategy.is_active || strategy.is_paused) continue;
      
      const riskState = await getRiskState(supabase, strategy.strategy_id);
      
      if (!riskState) {
        addResult('Risk State', 'WARN', `No risk state found for ${strategy.strategy_id}`, {
          solution: 'Risk state should be auto-created. Check risk-manager initialization.'
        });
        continue;
      }

      const issues: string[] = [];
      if (riskState.is_paused) issues.push('PAUSED');
      if (riskState.circuit_breaker_active) issues.push('CIRCUIT BREAKER ACTIVE');
      if (riskState.current_drawdown_pct > 0.05) issues.push(`High drawdown: ${(riskState.current_drawdown_pct * 100).toFixed(2)}%`);
      if (riskState.consecutive_losses >= 3) issues.push(`${riskState.consecutive_losses} consecutive losses`);

      if (issues.length > 0) {
        addResult('Risk State', 'WARN', `Strategy ${strategy.strategy_id} has risk issues: ${issues.join(', ')}`, {
          risk_state: riskState,
          action: 'Check if risk limits are too restrictive or if strategy is underperforming'
        });
      } else {
        addResult('Risk State', 'PASS', `Strategy ${strategy.strategy_id} risk state is healthy`, {
          equity: `$${riskState.current_equity}`,
          drawdown: `${(riskState.current_drawdown_pct * 100).toFixed(2)}%`,
          daily_spent: `$${riskState.daily_spent_usd}`,
          daily_trades: riskState.daily_trades_count
        });
      }
    }
  } catch (error: any) {
    addResult('Risk State', 'FAIL', 'Error checking risk state', { error: error.message });
  }
}

async function checkCronConfiguration() {
  console.log('\n⏰ Checking Cron Configuration...');
  
  try {
    const fs = await import('fs/promises');
    const vercelJson = JSON.parse(await fs.readFile('vercel.json', 'utf-8'));
    
    const ltExecuteCron = vercelJson.crons?.find((c: any) => c.path === '/api/cron/lt-execute');
    const ftSyncCron = vercelJson.crons?.find((c: any) => c.path === '/api/cron/ft-sync');
    
    if (!ltExecuteCron) {
      addResult('Cron Config', 'FAIL', 'LT execute cron not configured in vercel.json!');
    } else {
      addResult('Cron Config', 'PASS', `LT execute cron configured: ${ltExecuteCron.schedule}`);
    }

    if (!ftSyncCron) {
      addResult('Cron Config', 'WARN', 'FT sync cron not configured in vercel.json!');
    } else {
      addResult('Cron Config', 'PASS', `FT sync cron configured: ${ftSyncCron.schedule}`);
    }
  } catch (error: any) {
    addResult('Cron Config', 'WARN', 'Could not read vercel.json', { error: error.message });
  }
}

async function checkOrderEventsLog() {
  console.log('\n📋 Checking Order Events Log...');
  const supabase = createAdminServiceClient();
  
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: recentEvents, error } = await supabase
      .from('order_events_log')
      .select('status, error_code, error_message, created_at')
      .gte('created_at', oneDayAgo)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) {
      addResult('Order Events', 'WARN', 'Could not query order_events_log', { error: error.message });
      return;
    }

    if (!recentEvents || recentEvents.length === 0) {
      addResult('Order Events', 'WARN', 'No order events in last 24 hours', {
        info: 'This means no orders have been attempted (not necessarily a problem if no signals)'
      });
      return;
    }

    const byStatus: Record<string, number> = {};
    const errors: any[] = [];
    
    recentEvents.forEach((event: any) => {
      byStatus[event.status] = (byStatus[event.status] || 0) + 1;
      if (event.status === 'rejected' && event.error_message) {
        errors.push({
          error_code: event.error_code,
          error_message: event.error_message,
          created_at: event.created_at
        });
      }
    });

    addResult('Order Events', 'PASS', `Found ${recentEvents.length} order events in last 24h`, { by_status: byStatus });

    if (errors.length > 0) {
      addResult('Order Errors', 'WARN', `Found ${errors.length} order rejections`, {
        recent_errors: errors.slice(0, 5)
      });
    }
  } catch (error: any) {
    addResult('Order Events', 'FAIL', 'Error checking order events', { error: error.message });
  }
}

async function main() {
  console.log('🔍 POLYCOPY LIVE TRADING DIAGNOSTIC');
  console.log('=' .repeat(80));
  console.log('\nThis diagnostic will identify why your live trading bot is not executing trades.\n');

  // Run all checks
  const strategies = await checkLTStrategies();
  
  if (strategies && strategies.length > 0) {
    await checkFTOrders(strategies);
    await checkLTOrders(strategies);
    await checkRiskState(strategies);
  }
  
  await checkCronConfiguration();
  await checkOrderEventsLog();

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 DIAGNOSTIC SUMMARY');
  console.log('='.repeat(80));

  const failed = results.filter(r => r.status === 'FAIL');
  const warnings = results.filter(r => r.status === 'WARN');
  const passed = results.filter(r => r.status === 'PASS');

  console.log(`\n✅ Passed: ${passed.length}`);
  console.log(`⚠️  Warnings: ${warnings.length}`);
  console.log(`❌ Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log('\n🚨 CRITICAL ISSUES:');
    failed.forEach((r, i) => {
      console.log(`\n${i + 1}. [${r.category}] ${r.message}`);
      if (r.details) {
        console.log('   →', JSON.stringify(r.details, null, 2));
      }
    });
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  WARNINGS:');
    warnings.forEach((r, i) => {
      console.log(`\n${i + 1}. [${r.category}] ${r.message}`);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('💡 RECOMMENDED ACTIONS:');
  console.log('='.repeat(80));

  // Prioritized actions
  if (results.some(r => r.category === 'LT Strategies' && r.status === 'FAIL')) {
    console.log('\n1️⃣  CREATE LIVE TRADING STRATEGIES');
    console.log('   - Go to /lt page in your app');
    console.log('   - Click "New Live Strategy"');
    console.log('   - Select an FT wallet to mirror');
    console.log('   - Set starting capital and wallet address');
    console.log('   - Or use API: POST /api/lt/strategies');
  }

  if (results.some(r => r.category === 'Active Strategies' && r.status === 'FAIL')) {
    console.log('\n2️⃣  ACTIVATE YOUR STRATEGIES');
    console.log('   - Strategies exist but are paused or inactive');
    console.log('   - Resume via UI at /lt or API: POST /api/lt/strategies/{id}/resume');
  }

  if (results.some(r => r.category === 'FT Orders' && r.status === 'FAIL')) {
    console.log('\n3️⃣  FIX FORWARD TESTING SYNC');
    console.log('   - LT reads trades from FT orders table');
    console.log('   - Manually trigger FT sync: POST /api/ft/sync');
    console.log('   - Check FT wallets are active and configured correctly');
    console.log('   - Verify FT sync cron is running (check Vercel logs)');
  }

  if (results.some(r => r.category === 'Pending Execution' && r.status === 'WARN')) {
    console.log('\n4️⃣  TRIGGER MANUAL EXECUTION');
    console.log('   - There are FT orders ready to execute');
    console.log('   - Manually trigger: POST /api/lt/execute');
    console.log('   - Or wait for next cron run (every 2 minutes)');
  }

  if (results.some(r => r.category === 'Risk State' && r.message.includes('PAUSED'))) {
    console.log('\n5️⃣  CHECK RISK MANAGEMENT');
    console.log('   - Strategies are paused due to risk limits');
    console.log('   - Review risk state in database or UI');
    console.log('   - Adjust risk rules or reset state if needed');
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Diagnostic complete! Check the output above for specific issues.\n');
}

main().catch(console.error);
