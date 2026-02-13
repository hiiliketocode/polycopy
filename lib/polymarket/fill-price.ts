/**
 * Shared CLOB Fill Price Resolution
 *
 * The CLOB order `price` field is the LIMIT price, NOT the execution price.
 * On Polymarket's CLOB, a BUY limit at 10¢ can fill at 0.1¢ (price improvement).
 *
 * This module queries the actual trade fills via the order's `associate_trades`
 * to compute the real weighted-average execution price.
 *
 * Used by:
 *   - LT executor (executor-v2.ts)
 *   - LT sync-order-status cron
 *   - Quick trade order status
 *   - Backfill scripts
 */

import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client';

// ──────────────────────────────────────────────────────────────────────
// Core: accepts a pre-built CLOB client (no wallet coupling)
// ──────────────────────────────────────────────────────────────────────

export async function getActualFillPriceWithClient(
    client: any,
    orderId: string,
    limitPrice: number,
): Promise<{ fillPrice: number; fills: number; method: string }> {
    // Step 1: Get the order to find associate_trades + market
    const order = await client.getOrder(orderId) as any;
    const associateTradeIds: string[] = order?.associate_trades;
    if (!associateTradeIds?.length || !order?.market) {
        return { fillPrice: limitPrice, fills: 0, method: 'no_associate_trades' };
    }

    // Step 2: Fetch trades for this market (CLOB filters to our wallet via auth)
    const trades = await client.getTrades({ market: order.market }) as any[];
    if (!trades?.length) {
        return { fillPrice: limitPrice, fills: 0, method: 'no_market_trades' };
    }

    // Step 3: Match trade IDs from associate_trades
    const assocSet = new Set(associateTradeIds);
    let fills = trades.filter((t: any) => assocSet.has(t.id));

    if (fills.length === 0) {
        // Fallback: match by taker_order_id or maker_orders
        fills = trades.filter((t: any) =>
            t.taker_order_id === orderId ||
            t.maker_orders?.some((mo: any) => mo.order_id === orderId)
        );
        if (fills.length === 0) {
            return { fillPrice: limitPrice, fills: 0, method: 'no_matching_fills' };
        }
    }

    // Step 4: Weighted average fill price
    let totalSize = 0;
    let totalCost = 0;
    for (const fill of fills) {
        const size = parseFloat(fill.size) || 0;
        const price = parseFloat(fill.price) || 0;
        totalSize += size;
        totalCost += size * price;
    }

    if (totalSize <= 0) {
        return { fillPrice: limitPrice, fills: 0, method: 'zero_size' };
    }

    const avgPrice = +(totalCost / totalSize).toFixed(8);
    return { fillPrice: avgPrice, fills: fills.length, method: 'clob_trades' };
}

// ──────────────────────────────────────────────────────────────────────
// Convenience: accepts userId, builds client internally
// ──────────────────────────────────────────────────────────────────────

export async function getActualFillPrice(
    userId: string,
    orderId: string,
    limitPrice: number,
): Promise<number> {
    try {
        const { client } = await getAuthedClobClientForUserAnyWallet(userId);
        const result = await getActualFillPriceWithClient(client, orderId, limitPrice);
        return result.fillPrice;
    } catch {
        return limitPrice;
    }
}
