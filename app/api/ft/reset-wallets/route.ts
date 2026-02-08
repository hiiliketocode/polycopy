import { NextRequest, NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * POST /api/ft/reset-wallets
 *
 * Resets FT test wallets to a clean state. Use after deploying fixes that change
 * strategy logic (e.g. ML-first gating) to avoid mixed results from pre-fix data.
 *
 * Body: { wallet_ids?: string[]; use_model_only?: boolean; reset_start_date?: boolean }
 * - wallet_ids: specific wallets to reset (default: all use_model wallets if use_model_only)
 * - use_model_only: if true, reset only wallets with use_model=true (most affected by ML-first fix)
 * - reset_start_date: if true, set start_date to today for fresh test period
 */
const USE_MODEL_WALLET_IDS = [
  // Core model strategies (were wrongly use_model=false)
  'FT_MODEL_BALANCED', 'FT_MODEL_ONLY', 'FT_SHARP_SHOOTER', 'FT_UNDERDOG_HUNTER',
  // Thesis strategies
  'FT_T1_PURE_ML', 'FT_T3_POLITICS', 'FT_T4_ML_EDGE', 'FT_T4_FULL_STACK',
  // Model-mix strategies (ML_MIX)
  'FT_ML_SHARP_SHOOTER', 'FT_ML_UNDERDOG', 'FT_ML_FAVORITES', 'FT_ML_HIGH_CONV',
  'FT_ML_EDGE', 'FT_ML_MIDRANGE', 'FT_ML_STRICT', 'FT_ML_LOOSE',
  'FT_ML_CONTRARIAN', 'FT_ML_HEAVY_FAV',
];

export async function POST(request: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const supabase = createAdminServiceClient();
    const body = await request.json().catch(() => ({}));
    const useModelOnly = body.use_model_only ?? true;
    const resetStartDate = body.reset_start_date ?? false;
    const explicitIds = body.wallet_ids as string[] | undefined;

    let walletIds: string[];
    if (explicitIds && Array.isArray(explicitIds) && explicitIds.length > 0) {
      walletIds = explicitIds;
    } else if (useModelOnly) {
      // Verify these wallets exist and have use_model=true
      const { data: wallets } = await supabase
        .from('ft_wallets')
        .select('wallet_id')
        .in('wallet_id', USE_MODEL_WALLET_IDS)
        .eq('use_model', true);
      walletIds = (wallets || []).map((w: { wallet_id: string }) => w.wallet_id);
    } else {
      const { data: wallets } = await supabase
        .from('ft_wallets')
        .select('wallet_id');
      walletIds = (wallets || []).map((w: { wallet_id: string }) => w.wallet_id);
    }

    if (walletIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No wallets to reset',
        orders_deleted: 0,
        seen_deleted: 0,
        wallets_updated: 0,
      });
    }

    // 1. Delete ft_orders for these wallets
    const { data: deletedOrders, error: ordersError } = await supabase
      .from('ft_orders')
      .delete()
      .in('wallet_id', walletIds)
      .select('order_id');

    if (ordersError) {
      console.error('[ft/reset-wallets] Orders delete error:', ordersError);
      return NextResponse.json({ success: false, error: ordersError.message }, { status: 500 });
    }
    const ordersDeleted = deletedOrders?.length ?? 0;

    // 2. Delete ft_seen_trades for these wallets
    const { data: deletedSeen, error: seenError } = await supabase
      .from('ft_seen_trades')
      .delete()
      .in('wallet_id', walletIds)
      .select('source_trade_id');

    if (seenError) {
      console.error('[ft/reset-wallets] Seen trades delete error:', seenError);
      return NextResponse.json({ success: false, error: seenError.message }, { status: 500 });
    }
    const seenDeleted = deletedSeen?.length ?? 0;

    // 3. Reset wallet state: current_balance = starting_balance, trades_seen/trades_skipped = 0
    const { data: wallets } = await supabase
      .from('ft_wallets')
      .select('wallet_id, starting_balance')
      .in('wallet_id', walletIds);

    let walletsUpdated = 0;
    for (const w of wallets || []) {
      const { error: upErr } = await supabase
        .from('ft_wallets')
        .update({
          current_balance: w.starting_balance ?? 1000,
          trades_seen: 0,
          trades_skipped: 0,
          last_sync_time: null,
          ...(resetStartDate ? { start_date: new Date().toISOString().split('T')[0] } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('wallet_id', w.wallet_id);
      if (!upErr) walletsUpdated++;
    }

    console.log(`[ft/reset-wallets] Reset ${walletIds.length} wallets: ${ordersDeleted} orders, ${seenDeleted} seen trades`);

    return NextResponse.json({
      success: true,
      wallet_ids: walletIds,
      orders_deleted: ordersDeleted,
      seen_deleted: seenDeleted,
      wallets_updated: walletsUpdated,
      message: `Reset complete. Sync will repopulate from scratch.`,
    });
  } catch (error: unknown) {
    console.error('[ft/reset-wallets] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
