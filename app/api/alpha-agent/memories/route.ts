import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

export async function GET(request: Request) {
  const authResult = await requireAdmin();
  if (authResult) return authResult;

  const supabase = createAdminServiceClient();
  const url = new URL(request.url);
  const tier = url.searchParams.get('tier');
  const type = url.searchParams.get('type');
  const limit = Math.min(Number(url.searchParams.get('limit') || '50'), 100);

  try {
    let query = supabase
      .from('alpha_agent_memory')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (tier) query = query.eq('memory_tier', tier);
    if (type) query = query.eq('memory_type', type);

    const { data: memories, error } = await query;
    if (error) throw error;

    // Get memory counts by tier
    const { data: tierCounts } = await supabase
      .from('alpha_agent_memory')
      .select('memory_tier')
      .then(result => {
        const counts: Record<string, number> = {};
        for (const m of (result.data || [])) {
          counts[m.memory_tier] = (counts[m.memory_tier] || 0) + 1;
        }
        return { data: counts };
      });

    return NextResponse.json({
      success: true,
      memories: memories || [],
      tier_counts: tierCounts || {},
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
