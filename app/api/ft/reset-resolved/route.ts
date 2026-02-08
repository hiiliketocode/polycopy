import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * POST /api/ft/reset-resolved
 * 
 * Resets all resolved orders back to OPEN so they can be re-resolved.
 * Use this to fix orders that were incorrectly marked as WON/LOST.
 * Admin only.
 */
export async function POST() {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const supabase = createAdminServiceClient();
    
    // Reset resolved orders back to OPEN
    const { data, error } = await supabase
      .from('ft_orders')
      .update({ 
        outcome: 'OPEN', 
        pnl: null, 
        resolved_time: null,
        winning_label: null
      })
      .neq('outcome', 'OPEN')
      .select('order_id');
    
    if (error) {
      console.error('[ft/reset-resolved] Error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    const resetCount = data?.length || 0;
    console.log(`[ft/reset-resolved] Reset ${resetCount} resolved orders back to OPEN`);
    
    return NextResponse.json({
      success: true,
      reset_count: resetCount,
      message: `Reset ${resetCount} orders back to OPEN. Run /api/ft/resolve to re-process.`
    });
    
  } catch (error: any) {
    console.error('[ft/reset-resolved] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
