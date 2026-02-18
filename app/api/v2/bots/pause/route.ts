import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth';

/**
 * POST /api/v2/bots/pause
 *
 * Toggles is_paused on the user's lt_strategy for the given bot.
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

    const { data: strategy } = await supabase
      .from('lt_strategies')
      .select('strategy_id, is_active, is_paused')
      .eq('ft_wallet_id', ft_wallet_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!strategy) {
      return NextResponse.json({ error: 'No subscription found for this bot' }, { status: 404 });
    }

    const s = strategy as any;

    if (!s.is_active) {
      return NextResponse.json({ error: 'Cannot pause an inactive subscription' }, { status: 400 });
    }

    const newPaused = !s.is_paused;

    const { data: updated, error: updateErr } = await supabase
      .from('lt_strategies')
      .update({ is_paused: newPaused, updated_at: new Date().toISOString() })
      .eq('strategy_id', s.strategy_id)
      .select('strategy_id, is_paused')
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, is_paused: (updated as any).is_paused });
  } catch (error: any) {
    console.error('[v2/bots/pause] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
