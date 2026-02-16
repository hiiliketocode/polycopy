/**
 * Order book depth helpers for Polymarket CLOB.
 * Used for pre-execution liquidity checks and dynamic slippage.
 *
 * Data source: GET https://clob.polymarket.com/book?token_id={tokenId}
 */

import { getValidatedPolymarketClobBaseUrl } from '@/lib/env';

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export async function fetchOrderBook(tokenId: string): Promise<OrderBook | null> {
  const baseUrl = getValidatedPolymarketClobBaseUrl();
  const url = `${baseUrl}/book?token_id=${encodeURIComponent(tokenId)}`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    const bids = (data.bids || []).map((b: { price: string; size: string }) => ({
      price: parseFloat(b.price) || 0,
      size: parseFloat(b.size) || 0,
    }));
    const asks = (data.asks || []).map((a: { price: string; size: string }) => ({
      price: parseFloat(a.price) || 0,
      size: parseFloat(a.size) || 0,
    }));
    return { bids, asks };
  } catch {
    return null;
  }
}

/**
 * Volume available at or better than the given price.
 * BUY: sum of ask sizes where price <= limitPrice
 * SELL: sum of bid sizes where price >= limitPrice
 */
export function getVolumeForPrice(
  book: OrderBook,
  side: 'BUY' | 'SELL',
  limitPrice: number
): number {
  if (side === 'BUY') {
    return book.asks
      .filter((a) => a.price <= limitPrice && a.price > 0)
      .reduce((sum, a) => sum + a.size, 0);
  }
  return book.bids
    .filter((b) => b.price >= limitPrice && b.price > 0)
    .reduce((sum, b) => sum + b.size, 0);
}

/**
 * Price at which we could fill the given volume.
 * BUY: walk asks until cumulative size >= volume
 * SELL: walk bids until cumulative size >= volume
 */
export function getPriceForVolume(
  book: OrderBook,
  side: 'BUY' | 'SELL',
  volume: number
): { price: number; filledVolume: number } | null {
  const levels = side === 'BUY' ? book.asks : book.bids;
  let cumulative = 0;
  let lastPrice = 0;
  for (const level of levels) {
    if (level.price <= 0 || level.size <= 0) continue;
    cumulative += level.size;
    lastPrice = level.price;
    if (cumulative >= volume) {
      return { price: lastPrice, filledVolume: Math.min(cumulative, volume) };
    }
  }
  return cumulative > 0 ? { price: lastPrice, filledVolume: cumulative } : null;
}

/**
 * Best bid (highest buy price) or best ask (lowest sell price)
 */
export function getBestBid(book: OrderBook): number | null {
  const valid = book.bids.filter((b) => b.price > 0 && b.size > 0);
  if (valid.length === 0) return null;
  return Math.max(...valid.map((b) => b.price));
}

export function getBestAsk(book: OrderBook): number | null {
  const valid = book.asks.filter((a) => a.price > 0 && a.size > 0);
  if (valid.length === 0) return null;
  return Math.min(...valid.map((a) => a.price));
}
