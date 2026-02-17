import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth';

/**
 * POST /api/v2/bots/unsubscribe
 *
 * Deactivates (soft-deletes) a user's live trading strategy subscription.
 * The lt_strategy row is preserved for historical records; only is_active is set to false.
 */
export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = createAdminServiceClient();
    const body = await request.json();
    const { ft_wallet_id } = body;

    if (!ft_wallet_id) {
      return NextResponse.json({ error: 'ft_wallet_id is required' }, { status: 400 });
    }

    // Find the user's strategy for this bot
    const { data: strategy } = await supabase
      .from('lt_strategies')
      .select('strategy_id, is_active')
      .eq('ft_wallet_id', ft_wallet_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!strategy) {
      return NextResponse.json({ error: 'No subscription found for this bot' }, { status: 404 });
    }

    if (!(strategy as any).is_active) {
      return NextResponse.json({ error: 'Subscription is already inactive' }, { status: 400 });
    }

    // Deactivate
    const { error: updateErr } = await supabase
      .from('lt_strategies')
      .update({ is_active: false, is_paused: false })
      .eq('strategy_id', (strategy as any).strategy_id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[v2/bots/unsubscribe] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
