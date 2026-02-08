import { NextResponse } from 'next/server';
import { POST as resolvePost } from '@/app/api/ft/resolve/route';
import { POST as enrichPost } from '@/app/api/ft/enrich-ml/route';

/**
 * Cron: GET /api/cron/ft-resolve
 * Runs every 10 minutes to resolve FT orders when markets close.
 * Also triggers ML enrichment for orders missing model scores.
 * Requires CRON_SECRET when set.
 * Calls resolve/enrich logic directly (no internal HTTP) to avoid auth issues.
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
    const headers: Record<string, string> = cronSecret
      ? { Authorization: `Bearer ${cronSecret}` }
      : {};

    // 1. Resolve FT orders
    const resolveReq = new Request('https://internal/api/ft/resolve', {
      method: 'POST',
      headers,
    });
    const resolveRes = await resolvePost(resolveReq);
    const data = await resolveRes.json().catch(() => ({}));
    if (!resolveRes.ok) {
      console.error('[cron/ft-resolve] Resolve failed:', data?.error || resolveRes.statusText);
      return NextResponse.json(
        { success: false, error: data?.error || 'Resolve failed' },
        { status: 500 }
      );
    }

    // 2. Enrich orders with ML scores (catches any that failed at sync time)
    const enrichReq = new Request('https://internal/api/ft/enrich-ml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ limit: 30 }),
    });
    const enrichRes = await enrichPost(enrichReq);
    const enrichData = await enrichRes.json().catch(() => ({}));

    return NextResponse.json({
      success: true,
      resolved: data.orders_resolved ?? 0,
      won: data.won ?? 0,
      lost: data.lost ?? 0,
      ml_enriched: enrichData.enriched ?? 0,
    });
  } catch (err: unknown) {
    console.error('[cron/ft-resolve] Error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
