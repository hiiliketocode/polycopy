import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth';
import { resolveFeatureTier, tierHasPremiumAccess } from '@/lib/feature-tier';

/**
 * Free bots — display_name substrings that mark a bot as free-tier accessible.
 * Matches the logic in app/v2/bots/page.tsx.
 */
const FREE_BOT_NAMES = ['Steady Eddie', 'Balanced Play', 'Full Send'];

/**
 * POST /api/v2/bots/subscribe
 *
 * Creates a live trading strategy (lt_strategy) for the authenticated user,
 * subscribing them to copy a specific FT bot.
 *
 * This is the v2 user-facing equivalent of the admin-only POST /api/lt/strategies.
 */
export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const supabase = createAdminServiceClient();

    // Parse request body
    const body = await request.json();
    const {
      ft_wallet_id,
      initial_capital,
      max_order_size_usd,
      daily_budget_usd,
      slippage_tolerance_pct,
    } = body;

    if (!ft_wallet_id) {
      return NextResponse.json({ error: 'ft_wallet_id is required' }, { status: 400 });
    }

    const capital = parseFloat(initial_capital);
    if (!capital || capital < 5) {
      return NextResponse.json({ error: 'Minimum capital allocation is $5' }, { status: 400 });
    }

    // 1. Verify user has a connected wallet
    const { data: wallet } = await supabase
      .from('turnkey_wallets')
      .select('polymarket_account_address, eoa_address')
      .eq('user_id', userId)
      .not('polymarket_account_address', 'is', null)
      .limit(1)
      .maybeSingle();

    const walletAddress =
      (wallet as any)?.polymarket_account_address || (wallet as any)?.eoa_address;

    if (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length < 40) {
      return NextResponse.json(
        { error: 'You must connect a wallet before subscribing to a bot' },
        { status: 400 },
      );
    }

    // 2. Verify FT wallet exists and is active
    const { data: ftWallet } = await supabase
      .from('ft_wallets')
      .select('wallet_id, display_name, description, min_bet, max_bet, is_active')
      .eq('wallet_id', ft_wallet_id)
      .single();

    if (!ftWallet) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    // 3. Check premium gating
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_premium, is_admin')
      .eq('id', userId)
      .single();

    const tier = resolveFeatureTier(
      true,
      profile as any,
    );
    const isPremium = tierHasPremiumAccess(tier);
    const isFreeBot = FREE_BOT_NAMES.some((n) =>
      (ftWallet as any).display_name?.includes(n),
    );

    if (!isFreeBot && !isPremium) {
      return NextResponse.json(
        { error: 'This bot requires a premium subscription' },
        { status: 403 },
      );
    }

    // 4. Check for existing subscription (unique per user + ft_wallet_id)
    const strategyId = `LT_${ft_wallet_id}_${userId.slice(0, 8)}`;
    const { data: existing } = await supabase
      .from('lt_strategies')
      .select('strategy_id, is_active')
      .eq('ft_wallet_id', ft_wallet_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      if ((existing as any).is_active) {
        return NextResponse.json(
          { error: 'You are already subscribed to this bot' },
          { status: 409 },
        );
      }
      // Re-activate existing strategy
      const { data: reactivated, error: updateErr } = await supabase
        .from('lt_strategies')
        .update({
          is_active: true,
          is_paused: false,
          initial_capital: capital,
          available_cash: capital,
          locked_capital: 0,
          cooldown_capital: 0,
          peak_equity: capital,
          max_order_size_usd: max_order_size_usd || (ftWallet as any).max_bet || 100,
          daily_budget_usd: daily_budget_usd || null,
          slippage_tolerance_pct: slippage_tolerance_pct ?? 3,
        })
        .eq('strategy_id', (existing as any).strategy_id)
        .select('*')
        .single();

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, strategy: reactivated });
    }

    // 5. Create new lt_strategy
    const { data: strategy, error: insertError } = await supabase
      .from('lt_strategies')
      .insert({
        strategy_id: strategyId,
        ft_wallet_id,
        user_id: userId,
        wallet_address: walletAddress.toLowerCase(),
        display_name: `${(ftWallet as any).display_name} (Live)`,
        description: (ftWallet as any).description || null,
        initial_capital: capital,
        available_cash: capital,
        locked_capital: 0,
        cooldown_capital: 0,
        cooldown_hours: 3,
        slippage_tolerance_pct: slippage_tolerance_pct ?? 3,
        order_type: 'GTC',
        min_order_size_usd: 1,
        max_order_size_usd: max_order_size_usd || (ftWallet as any).max_bet || 100,
        daily_budget_usd: daily_budget_usd || null,
        max_daily_loss_usd: null,
        circuit_breaker_loss_pct: null,
        max_position_size_usd: null,
        max_total_exposure_usd: null,
        peak_equity: capital,
        is_active: true,
        is_paused: false,
        shadow_mode: false,
      })
      .select('*')
      .single();

    if (insertError || !strategy) {
      return NextResponse.json(
        { error: insertError?.message || 'Failed to create strategy' },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, strategy });
  } catch (error: any) {
    console.error('[v2/bots/subscribe] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
