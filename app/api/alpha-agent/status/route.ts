import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';
import { getAgentStatus } from '@/lib/alpha-agent';

export async function GET() {
  const authResult = await requireAdmin();
  if (authResult) return authResult;

  const supabase = createAdminServiceClient();

  try {
    const status = await getAgentStatus(supabase);
    return NextResponse.json({ success: true, ...status });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
