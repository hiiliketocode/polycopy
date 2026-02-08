import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * POST /api/ft/reset-ml
 * 
 * Resets model_probability to NULL for all open orders so they can be re-enriched.
 * This fixes orders where model_probability was incorrectly set to trader_win_rate.
 * Admin only.
 */
export async function POST() {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const supabase = createAdminServiceClient();
    
    // Reset model_probability for all open orders
    const { data, error } = await supabase
      .from('ft_orders')
      .update({ model_probability: null })
      .eq('outcome', 'OPEN')
      .select('order_id');
    
    if (error) {
      console.error('[ft/reset-ml] Error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    
    const resetCount = data?.length || 0;
    console.log(`[ft/reset-ml] Reset model_probability for ${resetCount} orders`);
    
    return NextResponse.json({
      success: true,
      reset_count: resetCount,
      message: `Reset model_probability for ${resetCount} open orders. Run /api/ft/enrich-ml to re-populate.`
    });
    
  } catch (error: any) {
    console.error('[ft/reset-ml] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
