import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

export async function GET(request: Request) {
  const authResult = await requireAdmin();
  if (authResult) return authResult;

  const supabase = createAdminServiceClient();
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || '20'), 50);
  const offset = Number(url.searchParams.get('offset') || '0');

  try {
    const { data: runs, error, count } = await supabase
      .from('alpha_agent_runs')
      .select('*', { count: 'exact' })
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      runs: runs || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
