import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * POST /api/ft/reset-sync
 * 
 * Resets last_sync_time for wallets to allow re-evaluation of historical trades.
 * Admin only.
 */
export async function POST(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const supabase = createAdminServiceClient();
    const body = await request.json().catch(() => ({}));
    const walletIds = body.wallet_ids; // Optional: specific wallets to reset
    
    let query = supabase
      .from('ft_wallets')
      .update({ last_sync_time: null })
      .eq('is_active', true);
    
    if (walletIds && walletIds.length > 0) {
      query = query.in('wallet_id', walletIds);
    }
    
    const { data, error } = await query.select('wallet_id');
    
    if (error) {
      console.error('[ft/reset-sync] Error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    const resetCount = data?.length || 0;
    console.log(`[ft/reset-sync] Reset last_sync_time for ${resetCount} wallets`);
    
    return NextResponse.json({
      success: true,
      reset_count: resetCount,
      message: `Reset sync time for ${resetCount} wallets. Next sync will evaluate all recent trades.`
    });
    
  } catch (error: any) {
    console.error('[ft/reset-sync] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
