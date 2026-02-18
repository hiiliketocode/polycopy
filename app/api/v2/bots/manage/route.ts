import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth';

/**
 * PATCH /api/v2/bots/manage
 *
 * Updates an existing lt_strategy for the authenticated user.
 * Accepts capital adjustments (initial_capital / available_cash).
 */
export async function PATCH(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = createAdminServiceClient();
    const body = await request.json();
    const { ft_wallet_id, initial_capital } = body;

    if (!ft_wallet_id) {
      return NextResponse.json({ error: 'ft_wallet_id is required' }, { status: 400 });
    }

    const { data: strategy } = await supabase
      .from('lt_strategies')
      .select('strategy_id, is_active, initial_capital, available_cash, locked_capital, cooldown_capital')
      .eq('ft_wallet_id', ft_wallet_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!strategy) {
      return NextResponse.json({ error: 'No subscription found for this bot' }, { status: 404 });
    }

    const s = strategy as any;

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (initial_capital != null) {
      const newCapital = parseFloat(initial_capital);
      if (isNaN(newCapital) || newCapital < 5) {
        return NextResponse.json({ error: 'Minimum capital is $5' }, { status: 400 });
      }

      const oldCapital = Number(s.initial_capital) || 0;
      const delta = newCapital - oldCapital;
      const currentAvailable = Number(s.available_cash) || 0;
      const newAvailable = Math.max(0, currentAvailable + delta);

      updates.initial_capital = newCapital;
      updates.available_cash = newAvailable;
      updates.peak_equity = Math.max(newCapital, Number(s.peak_equity) || newCapital);
    }

    const { data: updated, error: updateErr } = await supabase
      .from('lt_strategies')
      .update(updates)
      .eq('strategy_id', s.strategy_id)
      .select('*')
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, strategy: updated });
  } catch (error: any) {
    console.error('[v2/bots/manage] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
