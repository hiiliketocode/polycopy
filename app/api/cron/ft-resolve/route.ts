import { NextResponse } from 'next/server';

/**
 * Cron: GET /api/cron/ft-resolve
 * Runs every 10 minutes to resolve FT orders when markets close.
 * Also triggers ML enrichment for orders missing model scores.
 * Requires CRON_SECRET when set.
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
    const base =
      process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    const headers: Record<string, string> = {};
    if (cronSecret) {
      headers['Authorization'] = `Bearer ${cronSecret}`;
    }

    // 1. Resolve FT orders
    const resolveUrl = `${base}/api/ft/resolve`;
    const resolveRes = await fetch(resolveUrl, { method: 'POST', headers, cache: 'no-store' });
    const data = await resolveRes.json().catch(() => ({}));
    if (!resolveRes.ok) {
      console.error('[cron/ft-resolve] Resolve failed:', data?.error || resolveRes.statusText);
      return NextResponse.json(
        { success: false, error: data?.error || 'Resolve failed' },
        { status: 500 }
      );
    }

    // 2. Enrich orders with ML scores (catches any that failed at sync time)
    const enrichUrl = `${base}/api/ft/enrich-ml`;
    const enrichRes = await fetch(enrichUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ limit: 30 }),
      cache: 'no-store'
    });
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
