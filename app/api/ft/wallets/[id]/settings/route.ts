import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/ft/wallets/[id]/settings
 * Returns the current settings for a wallet.
 * Admin only.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { id: walletId } = await params;
    const supabase = createAdminServiceClient();
    
    const { data: wallet, error } = await supabase
      .from('ft_wallets')
      .select('*')
      .eq('wallet_id', walletId)
      .single();
    
    if (error || !wallet) {
      return NextResponse.json(
        { success: false, error: 'Wallet not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      settings: {
        wallet_id: wallet.wallet_id,
        config_id: wallet.config_id,
        display_name: wallet.display_name,
        description: wallet.description,
        detailed_description: wallet.detailed_description,
        starting_balance: wallet.starting_balance,
        bet_size: wallet.bet_size,
        bet_allocation_weight: wallet.bet_allocation_weight ?? 1.0,
        allocation_method: wallet.allocation_method ?? 'KELLY',
        kelly_fraction: wallet.kelly_fraction ?? 0.25,
        min_bet: wallet.min_bet ?? 0.50,
        max_bet: wallet.max_bet ?? 10.00,
        start_date: { value: wallet.start_date },
        end_date: { value: wallet.end_date },
        is_active: wallet.is_active,
        model_threshold: wallet.model_threshold,
        price_min: wallet.price_min,
        price_max: wallet.price_max,
        min_edge: wallet.min_edge,
        use_model: wallet.use_model,
        min_trader_resolved_count: wallet.min_trader_resolved_count
      }
    });
    
  } catch (error) {
    console.error('[ft/settings] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ft/wallets/[id]/settings
 * Updates wallet settings.
 * Admin only.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { id: walletId } = await params;
    const body = await request.json();
    const supabase = createAdminServiceClient();
    
    // Verify wallet exists
    const { data: wallet, error: fetchError } = await supabase
      .from('ft_wallets')
      .select('wallet_id')
      .eq('wallet_id', walletId)
      .single();
    
    if (fetchError || !wallet) {
      return NextResponse.json(
        { success: false, error: 'Wallet not found' },
        { status: 404 }
      );
    }
    
    // Build update payload (only include provided fields)
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString()
    };
    
    if (body.display_name !== undefined) updatePayload.display_name = body.display_name;
    if (body.description !== undefined) updatePayload.description = body.description;
    if (body.detailed_description !== undefined) updatePayload.detailed_description = body.detailed_description;
    if (body.bet_size !== undefined) updatePayload.bet_size = Number(body.bet_size);
    if (body.bet_allocation_weight !== undefined) updatePayload.bet_allocation_weight = Number(body.bet_allocation_weight);
    if (body.allocation_method !== undefined) updatePayload.allocation_method = body.allocation_method;
    if (body.kelly_fraction !== undefined) updatePayload.kelly_fraction = Number(body.kelly_fraction);
    if (body.min_bet !== undefined) updatePayload.min_bet = Number(body.min_bet);
    if (body.max_bet !== undefined) updatePayload.max_bet = Number(body.max_bet);
    if (body.end_date !== undefined) updatePayload.end_date = body.end_date;
    if (body.is_active !== undefined) updatePayload.is_active = Boolean(body.is_active);
    if (body.model_threshold !== undefined) updatePayload.model_threshold = body.model_threshold !== null ? Number(body.model_threshold) : null;
    if (body.price_min !== undefined) updatePayload.price_min = Number(body.price_min);
    if (body.price_max !== undefined) updatePayload.price_max = Number(body.price_max);
    if (body.min_edge !== undefined) updatePayload.min_edge = Number(body.min_edge);
    if (body.use_model !== undefined) updatePayload.use_model = Boolean(body.use_model);
    if (body.min_trader_resolved_count !== undefined) updatePayload.min_trader_resolved_count = Number(body.min_trader_resolved_count);
    
    const { error: updateError } = await supabase
      .from('ft_wallets')
      .update(updatePayload)
      .eq('wallet_id', walletId);
    
    if (updateError) {
      console.error('[ft/settings] Update error:', updateError);
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Settings updated successfully',
      updated_fields: Object.keys(updatePayload).filter(k => k !== 'updated_at')
    });
    
  } catch (error) {
    console.error('[ft/settings] PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
