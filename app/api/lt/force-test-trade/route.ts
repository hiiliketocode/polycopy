import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client';
import { placeOrderCore } from '@/lib/polymarket/place-order-core';
import { roundDownToStep } from '@/lib/polymarket/sizing';
import { ensureTraderId } from '@/lib/traders/ensure-id';

/**
 * POST /api/lt/force-test-trade
 * Admin or cron: Replay the last FT trade for each active LT strategy as a real order.
 *
 * For each active LT strategy:
 *  1. Finds the most recent ft_order for the underlying FT wallet
 *  2. Resolves the correct token ID from the CLOB API
 *  3. Places a real BUY order at a limit price slightly below current market
 *  4. Records in lt_orders + stamps orders table
 *
 * Body (optional):
 *   { "strategy_id": "LT_FT_ML_EDGE" }  — only test one specific strategy
 *   { "cancel_after": false }             — keep the order live (default: false)
 */
export async function POST(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    // Try to get user from session, otherwise resolve from strategies
    const user = await getAdminSessionUser();
    const userId = user?.id || null;

    const supabase = createAdminServiceClient();
    const body = await request.json().catch(() => ({}));
    const cancelAfter = body.cancel_after === true; // default: false (keep order live)
    const specificStrategy = body.strategy_id || null;

    // 1. Get active LT strategies
    let strategyQuery = supabase.from('lt_strategies').select('*').eq('is_active', true);
    if (specificStrategy) {
        strategyQuery = supabase.from('lt_strategies').select('*').eq('strategy_id', specificStrategy);
    }
    const { data: strategies } = await strategyQuery;

    if (!strategies || strategies.length === 0) {
        return NextResponse.json({ ok: false, error: 'No LT strategies found' }, { status: 404 });
    }

    // Process each strategy (placeOrderCore handles Evomi + CLOB + order_events_log)
    const results: any[] = [];

    for (const strategy of strategies) {
        const steps: string[] = [];
        const ftWalletId = strategy.ft_wallet_id;

        try {
            // Find the last FT order for this wallet
            const { data: lastFtOrder } = await supabase
                .from('ft_orders')
                .select('order_id, wallet_id, condition_id, market_title, market_slug, token_label, entry_price, size, side, trader_address, source_trade_id, order_time')
                .eq('wallet_id', ftWalletId)
                .order('order_time', { ascending: false })
                .limit(1)
                .single();

            if (!lastFtOrder) {
                steps.push(`No FT orders found for wallet ${ftWalletId}`);
                results.push({ strategy_id: strategy.strategy_id, ft_wallet_id: ftWalletId, ok: false, error: 'No FT orders', steps });
                continue;
            }

            steps.push(`Found last FT order: "${lastFtOrder.market_title}" (${lastFtOrder.token_label}) @ ${lastFtOrder.entry_price} — ${lastFtOrder.order_time}`);

            // Resolve token ID from CLOB API
            const conditionId = lastFtOrder.condition_id;
            const tokenLabel = (lastFtOrder.token_label || 'Yes').toLowerCase();
            let tokenId: string | null = null;

            // Try CLOB API first
            try {
                const resp = await fetch(
                    `https://clob.polymarket.com/markets/${conditionId}`,
                    { cache: 'no-store' }
                );
                if (resp.ok) {
                    const clobMarket = await resp.json();
                    if (Array.isArray(clobMarket?.tokens)) {
                        // Match by outcome label
                        const matched = clobMarket.tokens.find(
                            (t: any) => (t.outcome || '').toLowerCase() === tokenLabel
                        );
                        tokenId = matched?.token_id || clobMarket.tokens[0]?.token_id || null;
                        steps.push(`Token ID resolved from CLOB: ${tokenId}`);
                    }
                }
            } catch {
                steps.push('CLOB market lookup failed, trying DB...');
            }

            // Fallback: check markets table for tokens field
            if (!tokenId) {
                const { data: marketRow } = await supabase
                    .from('markets')
                    .select('tokens')
                    .eq('condition_id', conditionId)
                    .single();

                let tokens = marketRow?.tokens;
                if (typeof tokens === 'string') {
                    try { tokens = JSON.parse(tokens); } catch { tokens = null; }
                }
                if (Array.isArray(tokens)) {
                    const matched = tokens.find((t: any) => (t.outcome || '').toLowerCase() === tokenLabel);
                    tokenId = matched?.token_id || tokens[0]?.token_id || null;
                    steps.push(`Token ID resolved from DB: ${tokenId}`);
                }
            }

            if (!tokenId) {
                steps.push('FAILED: Could not resolve token ID');
                results.push({ strategy_id: strategy.strategy_id, ft_wallet_id: ftWalletId, ok: false, error: 'No token ID', steps });
                continue;
            }

            // Get current market price
            let currentPrice = Number(lastFtOrder.entry_price) || 0.5;
            try {
                const { data: marketRow } = await supabase
                    .from('markets')
                    .select('outcome_prices, outcomes')
                    .eq('condition_id', conditionId)
                    .single();

                let outcomePrices = marketRow?.outcome_prices;
                let outcomes = marketRow?.outcomes;
                if (typeof outcomePrices === 'string') {
                    try { outcomePrices = JSON.parse(outcomePrices); } catch { outcomePrices = null; }
                }
                if (typeof outcomes === 'string') {
                    try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; }
                }
                if (Array.isArray(outcomePrices) && Array.isArray(outcomes)) {
                    const idx = outcomes.findIndex((o: string) => (o || '').toLowerCase() === tokenLabel);
                    if (idx >= 0 && outcomePrices[idx] !== undefined) {
                        currentPrice = Number(outcomePrices[idx]) || currentPrice;
                    }
                }
            } catch {}

            // Calculate order parameters — use the FT size, enforce Polymarket minimums, cap at $5 for safety
            // Polymarket: min $1 USD per order; some markets require min 5 contracts
            // CRITICAL: Price max 2 decimals, Size max 2 decimals (conservative to avoid 400 errors)
            const limitPrice = Math.round(currentPrice * 100) / 100; // 2 decimals
            const rawFtSizeUsd = Number(lastFtOrder.size) || 1;
            const ftSizeUsd = Math.max(1, Math.min(rawFtSizeUsd, 5));
            let sizeContracts = Math.round((ftSizeUsd / limitPrice) * 100) / 100; // 2 decimals
            sizeContracts = Math.max(5, sizeContracts); // satisfy markets with min 5 contracts

            if (sizeContracts <= 0 || limitPrice <= 0) {
                steps.push(`Invalid sizing: price=${limitPrice}, contracts=${sizeContracts}`);
                results.push({ strategy_id: strategy.strategy_id, ok: false, error: 'Invalid sizing', steps });
                continue;
            }

            steps.push(`Placing order: BUY ${sizeContracts} contracts @ $${limitPrice} (~$${(sizeContracts * limitPrice).toFixed(2)})`);

            const requestId = `lt_force_${strategy.strategy_id}_${Date.now()}`;
            const result = await placeOrderCore({
                supabase,
                userId: strategy.user_id,
                tokenId,
                price: limitPrice,
                size: sizeContracts,
                side: 'BUY',
                orderType: 'GTC',
                requestId,
                orderIntentId: randomUUID(),
                useAnyWallet: true,
                conditionId,
                outcome: lastFtOrder.token_label || null,
            });

            if (!result.success) {
                const errMsg = 'message' in result.evaluation ? result.evaluation.message : 'Unknown error';
                steps.push(`Order failed: ${errMsg}`);
                results.push({ strategy_id: strategy.strategy_id, ft_wallet_id: ftWalletId, ok: false, error: errMsg, steps });
                continue;
            }

            const orderId = result.orderId ?? null;
            if (!orderId) {
                steps.push('No order ID in result');
                results.push({ strategy_id: strategy.strategy_id, ok: false, error: 'No orderID returned', steps });
                continue;
            }
            steps.push(`Order posted ✓ — Order ID: ${orderId}`);

            // 1) Upsert orders row FIRST — lt_orders FK requires order_id to exist in orders
            const traderId = await ensureTraderId(supabase, strategy.wallet_address);
            const now = new Date().toISOString();
            const { error: ordersErr } = await supabase.from('orders').upsert(
                {
                    order_id: orderId,
                    trader_id: traderId,
                    market_id: conditionId,
                    outcome: lastFtOrder.token_label || 'Yes',
                    side: 'buy',
                    order_type: 'GTC',
                    price: limitPrice,
                    size: sizeContracts,
                    filled_size: 0,
                    remaining_size: sizeContracts,
                    status: 'open',
                    created_at: now,
                    updated_at: now,
                    lt_strategy_id: strategy.strategy_id,
                    lt_order_id: null,
                    signal_price: currentPrice,
                    signal_size_usd: ftSizeUsd,
                },
                { onConflict: 'order_id' }
            );
            if (ordersErr) {
                steps.push(`WARNING: orders upsert: ${ordersErr.message}`);
            } else {
                steps.push('Orders table stamped ✓');
            }

            // 2) Record in lt_orders (FK to orders now satisfied)
            const { data: ltOrder, error: ltError } = await supabase
                .from('lt_orders')
                .insert({
                    strategy_id: strategy.strategy_id,
                    ft_order_id: lastFtOrder.order_id,
                    order_id: orderId,
                    polymarket_order_id: orderId,
                    source_trade_id: lastFtOrder.source_trade_id || `REPLAY_${Date.now()}`,
                    trader_address: lastFtOrder.trader_address || 'REPLAY',
                    condition_id: conditionId,
                    market_slug: lastFtOrder.market_slug,
                    market_title: lastFtOrder.market_title,
                    token_label: (lastFtOrder.token_label || 'YES').toUpperCase(),
                    signal_price: currentPrice,
                    signal_size_usd: ftSizeUsd,
                    executed_price: limitPrice,
                    executed_size: sizeContracts,
                    order_placed_at: new Date().toISOString(),
                    slippage_pct: currentPrice > 0 ? (limitPrice - currentPrice) / currentPrice : 0,
                    fill_rate: 0,
                    execution_latency_ms: 0,
                    risk_check_passed: true,
                    status: 'PENDING',
                    outcome: 'OPEN',
                    ft_entry_price: Number(lastFtOrder.entry_price) || limitPrice,
                    ft_size: ftSizeUsd,
                    is_force_test: true,
                })
                .select('lt_order_id')
                .single();

            const ltOrderId = ltOrder?.lt_order_id || null;
            if (ltError) {
                steps.push(`WARNING: lt_orders insert failed: ${ltError.message}`);
            } else {
                steps.push(`lt_orders recorded: ${ltOrderId} ✓`);
                if (ltOrderId) {
                    await supabase.from('orders').update({ lt_order_id: ltOrderId }).eq('order_id', orderId);
                }
            }

            // Cancel if requested
            if (cancelAfter && orderId) {
                try {
                    const { client } = await getAuthedClobClientForUserAnyWallet(strategy.user_id);
                    await client.cancelOrders([orderId]);
                    steps.push('Order cancelled ✓');
                    if (ltOrderId) {
                        await supabase.from('lt_orders').update({ status: 'CANCELLED', outcome: 'CANCELLED' }).eq('lt_order_id', ltOrderId);
                    }
                } catch (cancelErr: any) {
                    steps.push(`Cancel failed: ${cancelErr.message}`);
                }
            }

            results.push({
                strategy_id: strategy.strategy_id,
                ft_wallet_id: ftWalletId,
                ok: true,
                market: lastFtOrder.market_title,
                token_label: lastFtOrder.token_label,
                ft_order_time: lastFtOrder.order_time,
                price: limitPrice,
                size_contracts: sizeContracts,
                size_usd: +(sizeContracts * limitPrice).toFixed(2),
                order_id: orderId,
                lt_order_id: ltOrderId,
                cancelled: cancelAfter,
                steps,
            });
        } catch (error: any) {
            steps.push(`FAILED: ${error.message}`);
            results.push({
                strategy_id: strategy.strategy_id,
                ft_wallet_id: ftWalletId,
                ok: false,
                error: error.message,
                steps,
            });
        }
    }

    const succeeded = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;

    return NextResponse.json({
        ok: succeeded > 0,
        summary: `${succeeded} trades placed, ${failed} failed`,
        total_strategies: strategies.length,
        results,
    });
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to replay the last FT trade for each active LT strategy as a real order',
        description: 'Finds the most recent ft_order per strategy, resolves token ID, places a real BUY at market price (capped at $5), records in lt_orders + orders table.',
        body_options: {
            strategy_id: 'Optional: test one specific strategy only',
            cancel_after: 'Optional: cancel orders after placing (default: false — orders stay live)',
        },
    });
}
