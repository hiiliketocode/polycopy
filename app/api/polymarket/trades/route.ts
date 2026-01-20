import { NextResponse } from 'next/server';

const MAX_LIMIT = 200;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

const POLYMARKET_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)',
  'Accept': 'application/json,text/html;q=0.9',
};

function extractCloudflareRayId(html: string): string | null {
  const match = html.match(/Cloudflare Ray ID:\s*<strong[^>]*>([^<]+)<\/strong>/i);
  return match ? match[1].trim() : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletParam = searchParams.get('wallet') || searchParams.get('user');
  const limitParam = searchParams.get('limit');

  if (!walletParam) {
    return NextResponse.json(
      { error: 'wallet is required' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const wallet = walletParam.trim().toLowerCase();
  const parsedLimit = Number.parseInt(limitParam || '', 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
    : 50;

  try {
    const response = await fetch(
      `https://data-api.polymarket.com/trades?user=${encodeURIComponent(wallet)}&limit=${limit}`,
      { cache: 'no-store', headers: POLYMARKET_HEADERS }
    );

    if (!response.ok) {
      const text = await response.text();
      const contentType = response.headers.get('content-type') || '';
      if (response.status === 403 && contentType.includes('text/html')) {
        const rayId = extractCloudflareRayId(text);
        return NextResponse.json(
          {
            error: 'Blocked by Cloudflare while fetching Polymarket trades',
            rayId,
          },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
      return NextResponse.json(
        { error: `Polymarket API returned ${response.status}`, details: text },
        { status: response.status, headers: NO_STORE_HEADERS }
      );
    }

    const data = await response.json();
    return NextResponse.json(data, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch Polymarket trades' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
