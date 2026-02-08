import { NextResponse } from 'next/server';
import { POST as syncPost } from '@/app/api/ft/sync/route';

/**
 * Cron: GET /api/cron/ft-sync
 * Runs every 5 minutes to capture new Polymarket trades into FT wallets.
 * Sync runs independently of the FT page being open.
 * Requires CRON_SECRET when set.
 * Calls sync logic directly (no internal HTTP) to avoid auth issues.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const synthRequest = new Request('https://internal/api/ft/sync', {
      method: 'POST',
      headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : undefined,
    });
    const syncRes = await syncPost(synthRequest);
    const data = await syncRes.json().catch(() => ({}));

    if (!syncRes.ok) {
      console.error('[cron/ft-sync] Sync failed:', data?.error || syncRes.statusText);
      return NextResponse.json(
        { success: false, error: data?.error || 'Sync failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      total_inserted: data.total_inserted ?? 0,
      total_skipped: data.total_skipped ?? 0,
      wallets_processed: data.wallets_processed ?? 0,
      synced_at: data.synced_at,
    });
  } catch (err: unknown) {
    console.error('[cron/ft-sync] Error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
