import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth';

/**
 * GET /api/v2/bots/my-subscriptions
 *
 * Returns all lt_strategies for the authenticated user, indicating which bots
 * they are actively subscribed to. Used by the bots page and bot detail page
 * to show active/manage state on bot cards.
 */
export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = createAdminServiceClient();

    const { data: strategies, error } = await supabase
      .from('lt_strategies')
      .select(
        'strategy_id, ft_wallet_id, display_name, is_active, is_paused, initial_capital, available_cash, locked_capital, cooldown_capital, max_order_size_usd, daily_budget_usd, slippage_tolerance_pct, daily_spent_usd, peak_equity, current_drawdown_pct, created_at, updated_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      subscriptions: strategies || [],
    });
  } catch (error: any) {
    console.error('[v2/bots/my-subscriptions] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
