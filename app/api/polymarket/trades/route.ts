import { NextResponse } from 'next/server';

const MAX_LIMIT = 200;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
};

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
      { cache: 'no-store' }
    );

    if (!response.ok) {
      const text = await response.text();
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
