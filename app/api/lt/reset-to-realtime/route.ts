/**
 * POST /api/lt/reset-to-realtime
 * Reset strategies to only execute NEW trades going forward (not historical backlog)
 * Sets last_sync_time to NOW so bot only picks up fresh FT orders
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';

export async function POST(request: Request) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const supabase = createAdminServiceClient();
  const now = new Date();

  try {
    console.log('[lt/reset-to-realtime] Resetting strategies to real-time mode at', now.toISOString());

    // Get active strategies
    const { data: strategies, error: strategyError } = await supabase
      .from('lt_strategies')
      .select('strategy_id, ft_wallet_id, last_sync_time')
      .eq('is_active', true)
      .eq('is_paused', false);

    if (strategyError || !strategies || strategies.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No active strategies found'
      });
    }

    const updates: any[] = [];

    for (const strategy of strategies) {
      const oldSyncTime = strategy.last_sync_time;
      const newSyncTime = now.toISOString();

      // Update to NOW so only future FT orders are picked up
      const { error: updateError } = await supabase
        .from('lt_strategies')
        .update({ last_sync_time: newSyncTime })
        .eq('strategy_id', strategy.strategy_id);

      if (!updateError) {
        updates.push({
          strategy_id: strategy.strategy_id,
          ft_wallet_id: strategy.ft_wallet_id,
          old_sync_time: oldSyncTime,
          new_sync_time: newSyncTime,
          status: 'reset_to_realtime'
        });

        console.log(`[lt/reset-to-realtime] ✅ ${strategy.strategy_id} reset to NOW`);
      } else {
        console.error(`[lt/reset-to-realtime] ❌ Failed to update ${strategy.strategy_id}:`, updateError);
      }
    }

    console.log(`[lt/reset-to-realtime] Reset ${updates.length} strategies to real-time mode`);

    return NextResponse.json({
      success: true,
      message: `Reset ${updates.length} strategies to real-time execution mode`,
      description: 'Strategies will now only execute NEW FT orders created from this moment forward',
      updates,
      next_steps: [
        'Wait for FT sync to create new orders (runs every 2 minutes)',
        'LT execute will pick them up on next run (also every 2 minutes)',
        'Watch Vercel logs for: [lt/execute] ✅ Successfully executed',
        'Check /api/lt/diagnostic to see new orders being created'
      ],
      monitoring: {
        check_execution: 'POST /api/lt/execute (manual trigger)',
        check_new_orders: 'SELECT * FROM lt_orders WHERE order_placed_at > NOW() - INTERVAL \'10 minutes\' ORDER BY order_placed_at DESC;',
        check_vercel_logs: 'vercel logs --follow | grep "lt/execute"'
      },
      timestamp: now.toISOString()
    });
  } catch (error: any) {
    console.error('[lt/reset-to-realtime] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Reset failed',
        details: error.message
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to reset strategies to real-time execution mode',
    description: 'Sets last_sync_time to NOW so strategies only execute NEW FT orders going forward (ignores historical backlog)',
    use_case: 'Use this when you want to start fresh and only copy new trades, not execute hundreds of historical orders'
  });
}
