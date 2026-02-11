/**
 * Shared order preparation for Polymarket CLOB.
 * Used by both manual quick trades (place route) and Live Trading (executor).
 * Ensures price/size are rounded correctly for Polymarket's maker/taker decimal limits.
 */

import { getValidatedPolymarketClobBaseUrl } from '@/lib/env';
import { adjustSizeForImpliedAmount, adjustSizeForImpliedAmountAtLeast, roundDownToStep } from '@/lib/polymarket/sizing';

function normalizeNumber(value?: number | string | null): number | null {
    if (value === null || value === undefined) return null;
    const n = typeof value === 'string' ? parseFloat(value) : value;
    return Number.isFinite(n) ? n : null;
}

/**
 * Fetch market tick size from CLOB API (tick-size endpoint or order book fallback).
 */
export async function fetchMarketTickSize(clobBaseUrl: string, tokenId: string): Promise<number | null> {
    if (!tokenId?.trim()) return null;
    const tickUrl = new URL('/tick-size', clobBaseUrl);
    tickUrl.searchParams.set('token_id', tokenId);
    try {
        const response = await fetch(tickUrl.toString(), { cache: 'no-store' });
        const data = await response.json();
        const tick = normalizeNumber(data?.minimum_tick_size ?? data?.tick_size);
        if (response.ok && tick && tick > 0) return tick;
    } catch {
        // Fall through to book lookup.
    }
    const bookUrl = new URL('/book', clobBaseUrl);
    bookUrl.searchParams.set('token_id', tokenId);
    try {
        const response = await fetch(bookUrl.toString(), { cache: 'no-store' });
        const data = await response.json();
        const tick = normalizeNumber(data?.tick_size);
        if (response.ok && tick && tick > 0) return tick;
    } catch {
        // Ignore
    }
    return null;
}

export interface PrepareOrderParamsResult {
    price: number;
    size: number;
    tickSize: number;
}

/**
 * Prepare price and size for CLOB order placement.
 * Same logic as manual quick trades: roundDownToStep + adjustSizeForImpliedAmountAtLeast.
 * Ensures Polymarket maker (2 decimals) / taker (4 decimals) requirements are satisfied.
 */
export async function prepareOrderParamsForClob(
    tokenId: string,
    price: number,
    sizeContracts: number,
    side: 'BUY' | 'SELL'
): Promise<PrepareOrderParamsResult | null> {
    const clobBaseUrl = getValidatedPolymarketClobBaseUrl();
    const tickSize = await fetchMarketTickSize(clobBaseUrl, tokenId);
    const effectiveTickSize = tickSize ?? 0.01;

    const roundedPrice = roundDownToStep(price, effectiveTickSize);
    const roundedAmount = sizeContracts > 0 ? roundDownToStep(sizeContracts, 0.01) : null;

    if (!roundedPrice || !roundedAmount || roundedPrice <= 0 || roundedAmount <= 0) {
        return null;
    }

    const shouldRoundUp = side === 'BUY';
    const adjustedAmount = shouldRoundUp
        ? adjustSizeForImpliedAmountAtLeast(roundedPrice, roundedAmount, effectiveTickSize, 2, 2)
        : adjustSizeForImpliedAmount(roundedPrice, roundedAmount, effectiveTickSize, 2, 2);

    if (!adjustedAmount || adjustedAmount < 1) {
        return null;
    }

    return { price: roundedPrice, size: adjustedAmount, tickSize: effectiveTickSize };
}
