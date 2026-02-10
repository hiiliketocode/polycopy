import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin, getAdminSessionUser } from '@/lib/ft-auth';
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client';
import { roundDownToStep } from '@/lib/polymarket/sizing';

/**
 * POST /api/lt/force-test-trade
 * Admin-only: Force a minimal test trade to verify the full LT pipeline.
 * 
 * Places a tiny limit order ($0.50) on a real market to verify:
 *  - CLOB authentication works
 *  - Token ID resolution works  
 *  - Order placement works
 *  - lt_orders recording works
 *  - orders table stamping works
 *  - "Auto" badge will appear
 *
 * Body (optional):
 *   { "strategy_id": "LT_FT_ML_EDGE" }  — which strategy to test (defaults to first active)
 *   { "cancel_after": true }              — cancel order right after placing (default: true)
 */
export async function POST(request: Request) {
    const authError = await requireAdmin();
    if (authError) return authError;

    const user = await getAdminSessionUser();
    if (!user) {
        return NextResponse.json({ ok: false, error: 'No user session' }, { status: 401 });
    }

    const supabase = createAdminServiceClient();
    const body = await request.json().catch(() => ({}));
    const cancelAfter = body.cancel_after !== false; // default true

    // 1. Find the strategy
    let strategy: any;
    if (body.strategy_id) {
        const { data } = await supabase
            .from('lt_strategies')
            .select('*')
            .eq('strategy_id', body.strategy_id)
            .single();
        strategy = data;
    } else {
        const { data } = await supabase
            .from('lt_strategies')
            .select('*')
            .eq('is_active', true)
            .limit(1)
            .single();
        strategy = data;
    }

    if (!strategy) {
        return NextResponse.json({ ok: false, error: 'No LT strategy found. Create one first.' }, { status: 404 });
    }

    // 2. Find a liquid market to test on
    // Look for an active, non-resolved market with good liquidity
    const { data: markets } = await supabase
        .from('markets')
        .select('condition_id, title, slug, outcomes, outcome_prices, tokens')
        .eq('closed', false)
        .is('resolved_outcome', null)
        .order('volume_num', { ascending: false })
        .limit(20);

    if (!markets || markets.length === 0) {
        return NextResponse.json({ ok: false, error: 'No active markets found' }, { status: 404 });
    }

    // Pick a market that has token data
    let selectedMarket: any = null;
    let tokenId: string | null = null;
    let tokenLabel = 'Yes';

    for (const market of markets) {
        // Try to get token ID from the tokens field
        let tokens = market.tokens;
        if (typeof tokens === 'string') {
            try { tokens = JSON.parse(tokens); } catch { tokens = null; }
        }

        if (Array.isArray(tokens) && tokens.length > 0) {
            // Use the first token (usually "Yes")
            const firstToken = tokens[0];
            if (firstToken?.token_id) {
                selectedMarket = market;
                tokenId = firstToken.token_id;
                tokenLabel = firstToken.outcome || 'Yes';
                break;
            }
        }

        // Fallback: try to get token from CLOB API
        if (!tokenId) {
            try {
                const resp = await fetch(
                    `https://clob.polymarket.com/markets/${market.condition_id}`,
                    { cache: 'no-store' }
                );
                if (resp.ok) {
                    const clobMarket = await resp.json();
                    if (Array.isArray(clobMarket?.tokens) && clobMarket.tokens.length > 0) {
                        selectedMarket = market;
                        tokenId = clobMarket.tokens[0].token_id;
                        tokenLabel = clobMarket.tokens[0].outcome || 'Yes';
                        break;
                    }
                }
            } catch {
                // continue to next market
            }
        }
    }

    if (!selectedMarket || !tokenId) {
        return NextResponse.json({ 
            ok: false, 
            error: 'Could not find a market with valid token IDs',
            markets_checked: markets.length,
        }, { status: 404 });
    }

    // 3. Parse current price
    let outcomePrices = selectedMarket.outcome_prices;
    if (typeof outcomePrices === 'string') {
        try { outcomePrices = JSON.parse(outcomePrices); } catch { outcomePrices = [0.5]; }
    }
    const currentPrice = Number(outcomePrices?.[0]) || 0.5;

    // Use a very low limit price to avoid getting filled (unless market is very cheap)
    // Place a BUY at a price well below current to create a resting order
    const testPrice = roundDownToStep(Math.max(0.01, currentPrice * 0.5), 0.01);
    const testSizeUsd = 0.50; // Minimal $0.50 test
    const testSizeContracts = roundDownToStep(testSizeUsd / testPrice, 0.01);

    if (testSizeContracts <= 0) {
        return NextResponse.json({ ok: false, error: 'Calculated size too small' }, { status: 400 });
    }

    // 4. Place the order via CLOB
    const steps: string[] = [];
    let orderId: string | null = null;
    let ltOrderId: string | null = null;

    try {
        steps.push(`Authenticating CLOB client for user ${user.id}...`);
        const { client, signatureType } = await getAuthedClobClientForUserAnyWallet(user.id);
        steps.push('CLOB client authenticated ✓');

        steps.push(`Creating order: BUY ${testSizeContracts} contracts of "${selectedMarket.title}" (${tokenLabel}) @ $${testPrice}`);
        steps.push(`Token ID: ${tokenId}`);
        steps.push(`Market: ${selectedMarket.title}`);

        const order = await client.createOrder(
            {
                tokenID: tokenId,
                price: testPrice,
                size: testSizeContracts,
                side: 'BUY' as any,
            },
            { signatureType } as any
        );
        steps.push('Order created (signed) ✓');

        const rawResult = await client.postOrder(order, 'GTC' as any, false);
        steps.push(`Order posted to CLOB ✓`);
        steps.push(`CLOB response: ${JSON.stringify(rawResult)}`);

        orderId = rawResult?.orderID || rawResult?.order_id || null;
        if (!orderId) {
            steps.push('WARNING: No orderID in response');
            return NextResponse.json({
                ok: false,
                error: 'Order posted but no orderID returned',
                steps,
                clob_response: rawResult,
            });
        }
        steps.push(`Order ID: ${orderId}`);

        // 5. Record in lt_orders
        const { data: ltOrder, error: ltError } = await supabase
            .from('lt_orders')
            .insert({
                strategy_id: strategy.strategy_id,
                order_id: orderId,
                polymarket_order_id: orderId,
                source_trade_id: `TEST_${Date.now()}`,
                trader_address: 'FORCE_TEST',
                condition_id: selectedMarket.condition_id,
                market_slug: selectedMarket.slug,
                market_title: selectedMarket.title,
                token_label: tokenLabel.toUpperCase(),
                signal_price: currentPrice,
                signal_size_usd: testSizeUsd,
                executed_price: testPrice,
                executed_size: testSizeContracts,
                order_placed_at: new Date().toISOString(),
                slippage_pct: (testPrice - currentPrice) / currentPrice,
                fill_rate: 0, // Resting order, not filled yet
                execution_latency_ms: 0,
                risk_check_passed: true,
                status: 'PENDING',
                outcome: 'OPEN',
            })
            .select('lt_order_id')
            .single();

        if (ltError) {
            steps.push(`WARNING: Failed to create lt_order: ${ltError.message}`);
        } else {
            ltOrderId = ltOrder?.lt_order_id || null;
            steps.push(`LT order recorded: ${ltOrderId} ✓`);
        }

        // 6. Stamp the orders table
        // First check if the order exists in our orders table
        const { data: existingOrder } = await supabase
            .from('orders')
            .select('order_id')
            .or(`order_id.eq.${orderId},polymarket_order_id.eq.${orderId}`)
            .limit(1)
            .maybeSingle();

        if (existingOrder) {
            await supabase
                .from('orders')
                .update({
                    lt_strategy_id: strategy.strategy_id,
                    lt_order_id: ltOrderId,
                    signal_price: currentPrice,
                    signal_size_usd: testSizeUsd,
                })
                .eq('order_id', existingOrder.order_id);
            steps.push(`Orders table stamped with lt_strategy_id ✓`);
        } else {
            steps.push('NOTE: Order not yet in orders table (may appear on next sync)');
            // Insert a minimal record so the Auto badge shows
            const { error: insertErr } = await supabase
                .from('orders')
                .insert({
                    order_id: orderId,
                    trader_id: strategy.wallet_address,
                    market_id: selectedMarket.condition_id,
                    outcome: tokenLabel,
                    side: 'BUY',
                    order_type: 'GTC',
                    price: testPrice,
                    size: testSizeContracts,
                    filled_size: 0,
                    remaining_size: testSizeContracts,
                    status: 'open',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    lt_strategy_id: strategy.strategy_id,
                    lt_order_id: ltOrderId,
                    signal_price: currentPrice,
                    signal_size_usd: testSizeUsd,
                })
                .select('order_id')
                .single();

            if (insertErr) {
                steps.push(`WARNING: Could not insert into orders table: ${insertErr.message}`);
            } else {
                steps.push('Inserted order record with lt_strategy_id ✓');
            }
        }

        // 7. Optionally cancel the order
        if (cancelAfter && orderId) {
            try {
                await client.cancelOrder(orderId);
                steps.push('Order cancelled after test ✓');

                // Update lt_order status
                if (ltOrderId) {
                    await supabase
                        .from('lt_orders')
                        .update({ status: 'CANCELLED', outcome: 'CANCELLED' })
                        .eq('lt_order_id', ltOrderId);
                }
            } catch (cancelErr: any) {
                steps.push(`WARNING: Cancel failed (order may have filled): ${cancelErr.message}`);
            }
        }

        return NextResponse.json({
            ok: true,
            message: 'Test trade pipeline completed successfully',
            strategy_id: strategy.strategy_id,
            market: selectedMarket.title,
            token_id: tokenId,
            token_label: tokenLabel,
            price: testPrice,
            size_contracts: testSizeContracts,
            size_usd: testSizeUsd,
            order_id: orderId,
            lt_order_id: ltOrderId,
            cancelled: cancelAfter,
            steps,
        });
    } catch (error: any) {
        steps.push(`FAILED: ${error.message}`);
        return NextResponse.json({
            ok: false,
            error: error.message,
            steps,
            strategy_id: strategy.strategy_id,
            market: selectedMarket?.title,
            token_id: tokenId,
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to this endpoint to force a test trade',
        description: 'Places a minimal $0.50 resting order, records it in lt_orders, stamps the orders table, then optionally cancels it.',
        body_options: {
            strategy_id: 'Optional: which LT strategy to use (defaults to first active)',
            cancel_after: 'Optional: cancel the order after placing (default: true)',
        },
    });
}
