import { NextResponse } from 'next/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v2/bots/[id]
 *
 * Public proxy to /api/ft/wallets/[id] — no admin auth required.
 * Bot performance data is non-sensitive and can be shown to any user on v2.
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;

  const baseUrl =
    (await import('@/lib/app-url')).getAppBaseUrl();

  try {
    // Forward to the admin route using an internal fetch.
    // We set an x-internal header so the admin route can trust it.
    const res = await fetch(`${baseUrl}/api/ft/wallets/${encodeURIComponent(id)}`, {
      headers: {
        // Pass through cookies so the admin route can auth
        cookie: request.headers.get('cookie') || '',
        'x-v2-public': '1',
      },
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('[v2/bots/id] Proxy error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bot details' },
      { status: 500 },
    );
  }
}
