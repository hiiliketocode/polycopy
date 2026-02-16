/**
 * GET /api/mcp/strategies/[id]
 *
 * MCP-only: Get strategy detail. Auth: CRON_SECRET (Bearer).
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';

type RouteParams = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: RouteParams) {
  const authError = await requireAdminOrCron(request);
  if (authError) return authError;

  const { id: strategyId } = await params;
  const supabase = createAdminServiceClient();

  try {
    const { data: strategy, error } = await supabase
      .from('lt_strategies')
      .select('*')
      .eq('strategy_id', strategyId)
      .maybeSingle();

    if (error || !strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('polymarket_username')
      .eq('id', strategy.user_id)
      .maybeSingle();

    let ftWallet = null;
    if (strategy.ft_wallet_id) {
      const { data: fw } = await supabase
        .from('ft_wallets')
        .select('wallet_id, display_name, description, bet_size, allocation_method, min_edge, price_min, price_max')
        .eq('wallet_id', strategy.ft_wallet_id)
        .maybeSingle();
      ftWallet = fw;
    }

    return NextResponse.json({
      success: true,
      strategy: { ...strategy, owner_label: ownerProfile?.polymarket_username || null },
      ft_wallet: ftWallet,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
