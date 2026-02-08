import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * POST /api/ft/reset-counters
 * 
 * Resets trades_seen and trades_skipped counters to 0 for all active wallets.
 * Use this to start fresh tracking of evaluated/missed trades.
 * Admin only.
 */
export async function POST() {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const supabase = createAdminServiceClient();
    
    // Reset counters for all active wallets
    const { data, error } = await supabase
      .from('ft_wallets')
      .update({ 
        trades_seen: 0, 
        trades_skipped: 0 
      })
      .eq('is_active', true)
      .select('wallet_id');
    
    if (error) {
      console.error('[ft/reset-counters] Error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    const resetCount = data?.length || 0;
    console.log(`[ft/reset-counters] Reset counters for ${resetCount} wallets`);
    
    return NextResponse.json({
      success: true,
      reset_count: resetCount,
      message: `Reset trades_seen and trades_skipped to 0 for ${resetCount} wallets. Tracking starts fresh from now.`
    });
    
  } catch (error: any) {
    console.error('[ft/reset-counters] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
