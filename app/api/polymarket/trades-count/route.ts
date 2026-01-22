import { NextRequest, NextResponse } from 'next/server';

type PolymarketTrade = {
  timestamp?: number | string;
  time?: number | string;
  createdAt?: string;
  created_at?: string;
  [key: string]: unknown;
};

function parseTimestamp(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  let ts = Number(value);
  if (!Number.isFinite(ts)) return null;
  if (ts < 10000000000) ts *= 1000;
  return ts;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get('wallet')?.trim();
  const hours = Number(url.searchParams.get('hours') || 24);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 200), 10), 500);

  if (!wallet) {
    return NextResponse.json({ count: 0, hasMore: false }, { status: 200 });
  }

  try {
    const response = await fetch(
      `https://data-api.polymarket.com/trades?user=${wallet.toLowerCase()}&limit=${limit}`,
      { cache: 'no-store', headers: { 'User-Agent': 'Polycopy Discover Trades Count' } }
    );

    if (!response.ok) {
      return NextResponse.json({ count: 0, hasMore: false }, { status: 200 });
    }

    const data = await response.json();
    const trades = Array.isArray(data) ? (data as PolymarketTrade[]) : [];
    const cutoff = Date.now() - hours * 60 * 60 * 1000;

    let count = 0;
    let oldestTs: number | null = null;

    for (const trade of trades) {
      const ts =
        parseTimestamp(trade.timestamp) ??
        parseTimestamp(trade.time) ??
        parseTimestamp(trade.createdAt) ??
        parseTimestamp(trade.created_at);
      if (ts === null) continue;
      if (!oldestTs || ts < oldestTs) oldestTs = ts;
      if (ts >= cutoff) count += 1;
    }

    const hasMore = trades.length >= limit && oldestTs !== null && oldestTs >= cutoff;
    return NextResponse.json({ count, hasMore }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ count: 0, hasMore: false }, { status: 200 });
  }
}
