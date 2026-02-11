import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client';
import { placeOrderCore } from '@/lib/polymarket/place-order-core';
import { ensureTraderId } from '@/lib/traders/ensure-id';
import { resolveTokenId } from '@/lib/live-trading/token-cache';

/**
 * POST /api/lt/force-test-trade
 * Admin or cron: Replay the last FT trade for each active LT strategy as a real order.
 * V2: Uses new lt_orders schema with token_id, shares tracking. No lt_strategy_id on orders.
 */
export async function POST(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    const supabase = createAdminServiceClient();
    const body = await request.json().catch(() => ({}));
    const cancelAfter = body.cancel_after === true;
    const specificStrategy = body.strategy_id || null;

    let strategyQuery = supabase.from('lt_strategies').select('*').eq('is_active', true);
    if (specificStrategy) {
        strategyQuery = supabase.from('lt_strategies').select('*').eq('strategy_id', specificStrategy);
    }
    const { data: strategies } = await strategyQuery;

    if (!strategies || strategies.length === 0) {
        return NextResponse.json({ ok: false, error: 'No LT strategies found' }, { status: 404 });
    }

    const results: any[] = [];

    for (const strategy of strategies) {
        const steps: string[] = [];
        try {
            // Find last FT order
            const { data: lastFtOrder } = await supabase
                .from('ft_orders')
                .select('order_id, wallet_id, condition_id, market_title, market_slug, token_label, entry_price, size, trader_address, source_trade_id, order_time')
                .eq('wallet_id', strategy.ft_wallet_id)
                .order('order_time', { ascending: false })
                .limit(1)
                .single();

            if (!lastFtOrder) {
                results.push({ strategy_id: strategy.strategy_id, ok: false, error: 'No FT orders', steps });
                continue;
            }

            steps.push(`Found FT order: "${lastFtOrder.market_title}" (${lastFtOrder.token_label}) @ ${lastFtOrder.entry_price}`);

            // Resolve token ID (using V2 cache)
            const tokenId = await resolveTokenId(supabase, lastFtOrder.condition_id, lastFtOrder.token_label || 'YES');
            if (!tokenId) {
                results.push({ strategy_id: strategy.strategy_id, ok: false, error: 'Token ID resolution failed', steps });
                continue;
            }
            steps.push(`Token ID: ${tokenId}`);

            // Calculate order params (cap at $5 for safety)
            const currentPrice = Number(lastFtOrder.entry_price) || 0.5;
            const limitPrice = Math.round(currentPrice * 100) / 100;
            const ftSizeUsd = Math.max(1, Math.min(Number(lastFtOrder.size) || 1, 5));
            let sizeContracts = Math.round((ftSizeUsd / limitPrice) * 100) / 100;
            sizeContracts = Math.max(5, sizeContracts);

            steps.push(`Placing: BUY ${sizeContracts} @ $${limitPrice} (~$${(sizeContracts * limitPrice).toFixed(2)})`);

            const forceExpiration = Math.floor(Date.now() / 1000) + 30 * 60; // 30 min
            const result = await placeOrderCore({
                supabase,
                userId: strategy.user_id,
                tokenId,
                price: limitPrice,
                size: sizeContracts,
                side: 'BUY',
                orderType: 'GTD',
                requestId: `lt_force_${strategy.strategy_id}_${Date.now()}`,
                orderIntentId: randomUUID(),
                useAnyWallet: true,
                conditionId: lastFtOrder.condition_id,
                outcome: lastFtOrder.token_label || null,
                expiration: forceExpiration,
            });

            if (!result.success) {
                const errMsg = 'message' in result.evaluation ? result.evaluation.message : 'Unknown error';
                results.push({ strategy_id: strategy.strategy_id, ok: false, error: errMsg, steps });
                continue;
            }

            const orderId = result.orderId ?? '';
            steps.push(`Order posted: ${orderId}`);

            // Record in orders table (no lt_strategy_id — V2 doesn't use it)
            const traderId = await ensureTraderId(supabase, strategy.wallet_address);
            const now = new Date().toISOString();
            await supabase.from('orders').upsert({
                order_id: orderId,
                trader_id: traderId,
                market_id: lastFtOrder.condition_id,
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
            }, { onConflict: 'order_id' });

            // Record in lt_orders (V2 schema)
            const ltOrderId = randomUUID();
            const sourceTradeId = lastFtOrder.source_trade_id || `REPLAY_${Date.now()}`;
            await supabase.from('lt_orders').insert({
                lt_order_id: ltOrderId,
                strategy_id: strategy.strategy_id,
                user_id: strategy.user_id,
                ft_order_id: lastFtOrder.order_id,
                ft_wallet_id: strategy.ft_wallet_id,
                ft_trader_wallet: lastFtOrder.trader_address || null,
                source_trade_id: sourceTradeId,
                condition_id: lastFtOrder.condition_id,
                token_id: tokenId,
                token_label: (lastFtOrder.token_label || 'YES').toUpperCase(),
                market_title: lastFtOrder.market_title,
                market_slug: lastFtOrder.market_slug,
                side: 'BUY',
                signal_price: currentPrice,
                signal_size_usd: ftSizeUsd,
                executed_price: limitPrice,
                executed_size_usd: +(sizeContracts * limitPrice).toFixed(2),
                shares_bought: sizeContracts,
                shares_remaining: sizeContracts,
                order_id: orderId,
                status: 'PENDING',
                outcome: 'OPEN',
                risk_check_passed: true,
                is_force_test: true,
                is_shadow: false,
            });

            steps.push(`lt_orders recorded: ${ltOrderId}`);

            // Cancel if requested
            if (cancelAfter && orderId) {
                try {
                    const { client } = await getAuthedClobClientForUserAnyWallet(strategy.user_id);
                    await client.cancelOrders([orderId]);
                    steps.push('Order cancelled');
                    await supabase.from('lt_orders').update({ status: 'CANCELLED', outcome: 'CANCELLED' }).eq('lt_order_id', ltOrderId);
                } catch (cancelErr: any) {
                    steps.push(`Cancel failed: ${cancelErr.message}`);
                }
            }

            results.push({
                strategy_id: strategy.strategy_id,
                ok: true,
                market: lastFtOrder.market_title,
                order_id: orderId,
                lt_order_id: ltOrderId,
                cancelled: cancelAfter,
                steps,
            });
        } catch (error: any) {
            steps.push(`FAILED: ${error.message}`);
            results.push({ strategy_id: strategy.strategy_id, ok: false, error: error.message, steps });
        }
    }

    return NextResponse.json({
        ok: results.some(r => r.ok),
        summary: `${results.filter(r => r.ok).length} placed, ${results.filter(r => !r.ok).length} failed`,
        results,
    });
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to replay the last FT trade as a real order',
        description: 'V2: Uses new lt_orders schema. Cap $5 for safety.',
    });
}
