/**
 * Sell Manager — Detect and execute sell/exit orders for Live Trading
 *
 * Sell triggers (checked by cron):
 *   1. Trader SELL detection — when the copied trader sells a position we hold
 *   2. Stop-loss — position price dropped below threshold
 *   3. Take-profit — position price rose above threshold
 *   4. Max hold time — position held longer than allowed
 *   5. Manual close — user requests position closure via UI
 *
 * For now, implements trader sell detection and stop-loss/take-profit.
 * Uses the same placeOrderCore as buys, with FOK sell orders.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { placeOrderCore } from '@/lib/polymarket/place-order-core';
import { prepareOrderParamsForClob } from '@/lib/polymarket/order-prep';
import { ensureTraderId } from '@/lib/traders/ensure-id';
import { unlockCapital, releaseCapitalFromTrade } from './capital-manager';
import { recordDailySpend } from './risk-manager-v2';
import type { LTLogger } from './lt-logger';
import { randomUUID } from 'crypto';

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface SellCandidate {
    lt_order_id: string;
    strategy_id: string;
    user_id: string;
    condition_id: string;
    token_id: string;
    token_label: string;
    shares_remaining: number;
    executed_price: number;
    executed_size_usd: number;
    wallet_address: string;
    ft_trader_wallet: string | null;
}

export interface SellResult {
    success: boolean;
    lt_order_id: string;
    shares_sold?: number;
    sell_price?: number;
    sell_proceeds?: number;
    error?: string;
}

// ──────────────────────────────────────────────────────────────────────
// Detect Trader Sells
// ──────────────────────────────────────────────────────────────────────

/**
 * Check if the copied traders have sold positions that we still hold.
 * Queries the Polymarket activity API for SELL transactions.
 *
 * @returns Array of sell candidates (our open positions where trader sold)
 */
export async function detectTraderSells(
    supabase: SupabaseClient,
    logger?: LTLogger,
): Promise<SellCandidate[]> {
    const candidates: SellCandidate[] = [];

    // Get all open LT orders with shares remaining
    const { data: openOrders } = await supabase
        .from('lt_orders')
        .select(`
            lt_order_id, strategy_id, user_id, condition_id, token_id,
            token_label, shares_remaining, executed_price, executed_size_usd,
            ft_trader_wallet
        `)
        .eq('outcome', 'OPEN')
        .in('status', ['FILLED', 'PARTIAL'])
        .gt('shares_remaining', 0);

    if (!openOrders || openOrders.length === 0) return candidates;

    // Get unique trader wallets we need to check
    const traderWallets = [...new Set(openOrders.filter(o => o.ft_trader_wallet).map(o => o.ft_trader_wallet!))];

    for (const traderWallet of traderWallets) {
        try {
            // Check trader's recent activity for SELLs
            const resp = await fetch(
                `https://data-api.polymarket.com/activity?user=${traderWallet}&limit=50`,
                { cache: 'no-store' },
            );

            if (!resp.ok) continue;
            const activities = await resp.json();
            if (!Array.isArray(activities)) continue;

            // Find SELL activities
            const sells = activities.filter((a: any) =>
                (a.type === 'SELL' || a.side === 'SELL' || a.action === 'SELL') &&
                a.conditionId,
            );

            for (const sell of sells) {
                const conditionId = sell.conditionId || sell.condition_id;
                const tokenLabel = ((sell.outcome || sell.token || '').toUpperCase()) || 'YES';

                // Find matching open positions
                const matching = openOrders.filter(
                    o =>
                        o.ft_trader_wallet?.toLowerCase() === traderWallet.toLowerCase() &&
                        o.condition_id === conditionId,
                );

                for (const order of matching) {
                    // Get strategy wallet address
                    const { data: strategy } = await supabase
                        .from('lt_strategies')
                        .select('wallet_address')
                        .eq('strategy_id', order.strategy_id)
                        .single();

                    if (strategy) {
                        candidates.push({
                            ...order,
                            wallet_address: strategy.wallet_address,
                            shares_remaining: Number(order.shares_remaining) || 0,
                            executed_price: Number(order.executed_price) || 0,
                            executed_size_usd: Number(order.executed_size_usd) || 0,
                        });
                    }
                }
            }
        } catch (err: any) {
            logger?.warn('SELL_DETECT', `Error checking trader ${traderWallet.slice(0, 12)}: ${err.message}`);
        }
    }

    // Deduplicate by lt_order_id
    const seen = new Set<string>();
    return candidates.filter(c => {
        if (seen.has(c.lt_order_id)) return false;
        seen.add(c.lt_order_id);
        return true;
    });
}

// ──────────────────────────────────────────────────────────────────────
// Detect Stop-Loss / Take-Profit
// ──────────────────────────────────────────────────────────────────────

/**
 * Check positions against stop-loss and take-profit thresholds.
 */
export async function detectStopLossTakeProfit(
    supabase: SupabaseClient,
    logger?: LTLogger,
): Promise<SellCandidate[]> {
    const candidates: SellCandidate[] = [];

    // Get strategies with SL/TP configured
    const { data: strategies } = await supabase
        .from('lt_strategies')
        .select('strategy_id, user_id, wallet_address, stop_loss_pct, take_profit_pct')
        .eq('is_active', true)
        .or('stop_loss_pct.not.is.null,take_profit_pct.not.is.null');

    if (!strategies || strategies.length === 0) return candidates;

    for (const strategy of strategies) {
        const { data: openOrders } = await supabase
            .from('lt_orders')
            .select(`
                lt_order_id, strategy_id, user_id, condition_id, token_id,
                token_label, shares_remaining, executed_price, executed_size_usd,
                ft_trader_wallet
            `)
            .eq('strategy_id', strategy.strategy_id)
            .eq('outcome', 'OPEN')
            .in('status', ['FILLED', 'PARTIAL'])
            .gt('shares_remaining', 0);

        if (!openOrders || openOrders.length === 0) continue;

        // Get current prices for these markets
        const conditionIds = [...new Set(openOrders.map(o => o.condition_id))];
        const priceMap = new Map<string, number>();

        for (const cid of conditionIds) {
            try {
                const resp = await fetch(
                    `https://gamma-api.polymarket.com/markets?condition_ids=${cid}`,
                    { headers: { Accept: 'application/json' } },
                );
                if (resp.ok) {
                    const markets = await resp.json();
                    for (const m of markets) {
                        const mcid = m.conditionId || m.condition_id;
                        if (!mcid) continue;
                        let prices: number[] = [];
                        let outcomes: string[] = [];
                        try {
                            prices = JSON.parse(typeof m.outcomePrices === 'string' ? m.outcomePrices : JSON.stringify(m.outcomePrices || [])).map(Number);
                            outcomes = JSON.parse(typeof m.outcomes === 'string' ? m.outcomes : JSON.stringify(m.outcomes || []));
                        } catch { continue; }

                        if (Math.max(...prices) > 1) prices = prices.map(p => p / 100);

                        for (let i = 0; i < outcomes.length; i++) {
                            priceMap.set(`${mcid}::${(outcomes[i] || '').toUpperCase()}`, prices[i] ?? 0.5);
                        }
                    }
                }
            } catch { /* ignore */ }
        }

        const stopLossPct = strategy.stop_loss_pct ? Number(strategy.stop_loss_pct) / 100 : null;
        const takeProfitPct = strategy.take_profit_pct ? Number(strategy.take_profit_pct) / 100 : null;

        for (const order of openOrders) {
            const currentPrice = priceMap.get(`${order.condition_id}::${(order.token_label || 'YES').toUpperCase()}`);
            if (currentPrice === undefined) continue;

            const entryPrice = Number(order.executed_price) || 0;
            if (entryPrice <= 0) continue;

            const changeFromEntry = (currentPrice - entryPrice) / entryPrice;

            // Stop-loss: price dropped below threshold
            if (stopLossPct !== null && changeFromEntry <= -stopLossPct) {
                logger?.info('SELL_DETECT', `Stop-loss triggered for ${order.lt_order_id}: ${(changeFromEntry * 100).toFixed(1)}% (limit: -${(stopLossPct * 100).toFixed(0)}%)`, {
                    lt_order_id: order.lt_order_id,
                    entry_price: entryPrice,
                    current_price: currentPrice,
                    change_pct: +(changeFromEntry * 100).toFixed(2),
                });
                candidates.push({
                    ...order,
                    wallet_address: strategy.wallet_address,
                    shares_remaining: Number(order.shares_remaining) || 0,
                    executed_price: entryPrice,
                    executed_size_usd: Number(order.executed_size_usd) || 0,
                });
                continue;
            }

            // Take-profit: price rose above threshold
            if (takeProfitPct !== null && changeFromEntry >= takeProfitPct) {
                logger?.info('SELL_DETECT', `Take-profit triggered for ${order.lt_order_id}: +${(changeFromEntry * 100).toFixed(1)}% (limit: +${(takeProfitPct * 100).toFixed(0)}%)`, {
                    lt_order_id: order.lt_order_id,
                    entry_price: entryPrice,
                    current_price: currentPrice,
                    change_pct: +(changeFromEntry * 100).toFixed(2),
                });
                candidates.push({
                    ...order,
                    wallet_address: strategy.wallet_address,
                    shares_remaining: Number(order.shares_remaining) || 0,
                    executed_price: entryPrice,
                    executed_size_usd: Number(order.executed_size_usd) || 0,
                });
            }
        }
    }

    return candidates;
}

// ──────────────────────────────────────────────────────────────────────
// Execute Sell
// ──────────────────────────────────────────────────────────────────────

/**
 * Execute a sell order for a position.
 *
 * Uses FOK (fill-or-kill) for sells to ensure clean exit.
 * Sells at the current best bid to maximize fill probability.
 */
export async function executeSell(
    supabase: SupabaseClient,
    candidate: SellCandidate,
    sellFraction: number,
    logger?: LTLogger,
): Promise<SellResult> {
    const sharesToSell = +(candidate.shares_remaining * Math.min(1, sellFraction)).toFixed(6);

    if (sharesToSell < 1) {
        return { success: false, lt_order_id: candidate.lt_order_id, error: 'Sell size too small (< 1 share)' };
    }

    // Get current best bid from orderbook
    let sellPrice: number;
    try {
        const bookResp = await fetch(`https://clob.polymarket.com/book?token_id=${candidate.token_id}`, {
            cache: 'no-store',
        });
        if (bookResp.ok) {
            const book = await bookResp.json();
            const bids = book?.bids || [];
            sellPrice = bids.length > 0 ? parseFloat(bids[0].price) : 0;
        } else {
            sellPrice = 0;
        }
    } catch {
        sellPrice = 0;
    }

    if (sellPrice <= 0) {
        return { success: false, lt_order_id: candidate.lt_order_id, error: 'No bids available in orderbook' };
    }

    await logger?.info('SELL_EXECUTE', `Selling ${sharesToSell} shares @ $${sellPrice.toFixed(4)} (token: ${candidate.token_id.slice(0, 12)}...)`, {
        lt_order_id: candidate.lt_order_id,
        shares_to_sell: sharesToSell,
        sell_price: sellPrice,
    });

    // Prepare and place sell order
    const prepared = await prepareOrderParamsForClob(candidate.token_id, sellPrice, sharesToSell, 'SELL');
    if (!prepared) {
        return { success: false, lt_order_id: candidate.lt_order_id, error: 'Order prep failed for sell' };
    }

    const requestId = `lt_sell_${candidate.lt_order_id}_${Date.now()}`;
    const orderIntentId = randomUUID();

    try {
        // GTD sell with 30-min expiration
        const sellExpiration = Math.floor(Date.now() / 1000) + 30 * 60;

        const result = await placeOrderCore({
            supabase,
            userId: candidate.user_id,
            tokenId: candidate.token_id,
            price: prepared.price,
            size: prepared.size,
            side: 'SELL',
            orderType: 'GTD',
            requestId,
            orderIntentId,
            useAnyWallet: true,
            conditionId: candidate.condition_id,
            outcome: candidate.token_label,
            expiration: sellExpiration,
            tickSize: prepared.tickSize,
        });

        if (!result.success) {
            const errMsg = 'message' in result.evaluation ? result.evaluation.message : 'Sell order rejected';
            return { success: false, lt_order_id: candidate.lt_order_id, error: errMsg };
        }

        const sellProceeds = +(sharesToSell * sellPrice).toFixed(2);
        const newSharesRemaining = +(candidate.shares_remaining - sharesToSell).toFixed(6);

        // Update lt_orders: reduce shares_remaining
        await supabase
            .from('lt_orders')
            .update({
                shares_remaining: newSharesRemaining,
                outcome: newSharesRemaining <= 0 ? 'SOLD' : 'OPEN',
                updated_at: new Date().toISOString(),
            })
            .eq('lt_order_id', candidate.lt_order_id);

        // Release capital: the invested portion for sold shares leaves locked,
        // proceeds go to cooldown
        const investedPortion = +(candidate.executed_price * sharesToSell).toFixed(2);
        await releaseCapitalFromTrade(
            supabase,
            candidate.strategy_id,
            investedPortion,
            sellProceeds,
            candidate.lt_order_id,
        );

        // Record the sell in orders table for visibility
        const traderId = await ensureTraderId(supabase, candidate.wallet_address);
        const orderId = result.orderId ?? requestId;
        await supabase.from('orders').upsert({
            order_id: orderId,
            trader_id: traderId,
            market_id: candidate.condition_id,
            outcome: candidate.token_label,
            side: 'sell',
            order_type: 'FOK',
            price: prepared.price,
            size: prepared.size,
            filled_size: sharesToSell,
            remaining_size: 0,
            status: 'filled',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'order_id' });

        await logger?.info('SELL_EXECUTE', `Sell completed: ${sharesToSell} shares @ $${sellPrice.toFixed(4)} = $${sellProceeds.toFixed(2)} proceeds`, {
            lt_order_id: candidate.lt_order_id,
            shares_sold: sharesToSell,
            sell_price: sellPrice,
            sell_proceeds: sellProceeds,
            shares_remaining: newSharesRemaining,
        });

        return {
            success: true,
            lt_order_id: candidate.lt_order_id,
            shares_sold: sharesToSell,
            sell_price: sellPrice,
            sell_proceeds: sellProceeds,
        };
    } catch (err: any) {
        return { success: false, lt_order_id: candidate.lt_order_id, error: `Sell execution error: ${err.message}` };
    }
}
