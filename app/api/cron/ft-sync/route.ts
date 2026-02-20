import { NextResponse } from 'next/server';
import { POST as syncPost } from '@/app/api/ft/sync/route';

/**
 * GET /api/cron/ft-sync
 * Cron wrapper for FT sync. Runs on a schedule so ft_orders are always
 * populated from Polymarket; LT execute depends on OPEN ft_orders.
 * Without this cron, no new signals are synced unless the dashboard triggers sync.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const headers: Record<string, string> = cronSecret
    ? { Authorization: `Bearer ${cronSecret}` }
    : {};
  const syncReq = new Request('https://internal/api/ft/sync', {
    method: 'POST',
    headers,
  });
  const res = await syncPost(syncReq);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[cron/ft-sync] Sync failed:', data?.error || res.statusText);
    return NextResponse.json(
      { success: false, error: data?.error || 'Sync failed' },
      { status: res.status }
    );
  }
  return NextResponse.json(data);
}
