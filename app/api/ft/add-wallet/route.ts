import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * POST /api/ft/add-wallet
 * 
 * Adds a new FT wallet configuration.
 * Admin only.
 */
export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const supabase = createAdminServiceClient();
    const body = await request.json();
    
    // Build wallet object with all supported columns
    const wallet: Record<string, any> = {
      wallet_id: body.wallet_id,
      config_id: body.config_id || body.wallet_id,
      display_name: body.display_name,
      description: body.description,
      detailed_description: body.detailed_description || null,
      starting_balance: body.starting_balance || 1000,
      current_balance: body.starting_balance || 1000,
      bet_size: body.bet_size || 1.20,
      model_threshold: body.model_threshold ?? null,
      price_min: body.price_min ?? 0,
      price_max: body.price_max ?? 1,
      min_edge: body.min_edge ?? 0,
      use_model: body.use_model ?? false,
      min_trader_resolved_count: body.min_trader_resolved_count ?? 30,
      is_active: body.is_active !== false,
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days
      trades_seen: 0,
      trades_skipped: 0
    };
    
    // Dynamic allocation settings
    if (body.allocation_method) wallet.allocation_method = body.allocation_method;
    if (body.kelly_fraction !== undefined) wallet.kelly_fraction = body.kelly_fraction;
    if (body.min_bet !== undefined) wallet.min_bet = body.min_bet;
    if (body.max_bet !== undefined) wallet.max_bet = body.max_bet;
    if (body.min_conviction !== undefined) wallet.min_conviction = body.min_conviction;
    
    // Extended filters (store as JSON in detailed_description if columns don't exist)
    // These will be used by sync logic
    const extendedFilters: Record<string, any> = {};
    if (body.min_trader_win_rate !== undefined) extendedFilters.min_trader_win_rate = body.min_trader_win_rate;
    if (body.max_trader_win_rate !== undefined) extendedFilters.max_trader_win_rate = body.max_trader_win_rate;
    if (body.max_conviction !== undefined) extendedFilters.max_conviction = body.max_conviction;
    if (body.max_edge !== undefined) extendedFilters.max_edge = body.max_edge;
    if (body.market_categories) extendedFilters.market_categories = body.market_categories;
    if (body.min_original_trade_usd !== undefined) extendedFilters.min_original_trade_usd = body.min_original_trade_usd;
    if (body.max_original_trade_usd !== undefined) extendedFilters.max_original_trade_usd = body.max_original_trade_usd;
    if (body.hypothesis) extendedFilters.hypothesis = body.hypothesis;
    if (body.thesis_tier) extendedFilters.thesis_tier = body.thesis_tier;
    if (body.target_trader) extendedFilters.target_trader = body.target_trader.toLowerCase();
    if (body.target_traders && Array.isArray(body.target_traders)) {
      extendedFilters.target_traders = body.target_traders.map((a: string) => (a || '').toLowerCase()).filter(Boolean);
    }
    if (body.target_trader_name) extendedFilters.target_trader_name = body.target_trader_name;
    if (body.trader_pool) extendedFilters.trader_pool = body.trader_pool;
    
    // Store extended filters in detailed_description as JSON if we have any
    if (Object.keys(extendedFilters).length > 0) {
      wallet.detailed_description = JSON.stringify(extendedFilters);
    }
    
    const { data, error } = await supabase
      .from('ft_wallets')
      .upsert(wallet, { onConflict: 'wallet_id' })
      .select()
      .single();
    
    if (error) {
      console.error('[ft/add-wallet] Error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, wallet: data });
  } catch (error: any) {
    console.error('[ft/add-wallet] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
