import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';

const RETENTION_DAYS = 30;

/**
 * Cron: GET /api/cron/cleanup-old-trades
 * Runs daily to delete trades_public rows older than 30 days.
 * Prevents unbounded table growth.
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
    const supabase = createAdminServiceClient();
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { count, error } = await supabase
      .from('trades_public')
      .delete({ count: 'exact' })
      .lt('trade_timestamp', cutoff);

    if (error) {
      console.error('[cleanup-old-trades] Delete error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[cleanup-old-trades] Deleted ${count ?? 0} trades older than ${RETENTION_DAYS} days`);
    return NextResponse.json({ deleted: count ?? 0, cutoff });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cleanup-old-trades] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
