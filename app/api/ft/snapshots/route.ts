import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * GET /api/ft/snapshots?wallet_id=X&from=ISO&to=ISO
 *
 * Returns hourly performance snapshots for line charts.
 * wallet_id: optional, filter by wallet
 * from, to: optional ISO date range
 */
export async function GET(request: Request) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const walletId = searchParams.get('wallet_id');
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const supabase = createAdminServiceClient();
    let query = supabase
      .from('ft_performance_snapshots')
      .select('*')
      .order('snapshot_at', { ascending: true });

    if (walletId) query = query.eq('wallet_id', walletId);
    if (from) query = query.gte('snapshot_at', from);
    if (to) query = query.lte('snapshot_at', to);

    const { data, error } = await query;

    if (error) {
      console.error('[ft/snapshots] Error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      snapshots: data ?? [],
    });
  } catch (err: unknown) {
    console.error('[ft/snapshots] Error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
