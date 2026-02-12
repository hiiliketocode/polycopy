import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * POST /api/lt/strategies
 * Create a new live trading strategy (admin only).
 * V2: All risk rules and cash management are inline on lt_strategies — no separate tables.
 */
export async function POST(request: Request) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const supabase = createAdminServiceClient();
        const body = await request.json();

        const {
            ft_wallet_id,
            wallet_address,
            initial_capital,
            display_name,
            description,
            slippage_tolerance_pct,
            order_type,
            max_position_size_usd,
            max_total_exposure_usd,
            daily_budget_usd,
            max_daily_loss_usd,
            circuit_breaker_loss_pct,
            cooldown_hours,
            shadow_mode,
        } = body;

        if (!ft_wallet_id) {
            return NextResponse.json({ error: 'ft_wallet_id is required' }, { status: 400 });
        }

        // Resolve wallet address
        let resolvedWallet = (wallet_address || '').trim();
        if (!resolvedWallet || !resolvedWallet.startsWith('0x')) {
            const { data: tw } = await supabase
                .from('turnkey_wallets')
                .select('polymarket_account_address, eoa_address')
                .eq('user_id', userId)
                .not('polymarket_account_address', 'is', null)
                .limit(1)
                .maybeSingle();
            const fallback = (tw as any)?.polymarket_account_address || (tw as any)?.eoa_address;
            if (fallback) resolvedWallet = fallback;
        }
        if (!resolvedWallet || !resolvedWallet.startsWith('0x') || resolvedWallet.length < 40) {
            return NextResponse.json(
                { error: 'Polymarket wallet required. Connect a wallet in Portfolio, or pass wallet_address.' },
                { status: 400 },
            );
        }

        // Check FT wallet exists
        const { data: ftWallet } = await supabase
            .from('ft_wallets')
            .select('wallet_id, display_name')
            .eq('wallet_id', ft_wallet_id)
            .single();

        if (!ftWallet) {
            return NextResponse.json({ error: 'FT wallet not found' }, { status: 404 });
        }

        const strategyId = `LT_${ft_wallet_id}`;
        const { data: existing } = await supabase
            .from('lt_strategies')
            .select('strategy_id')
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({ error: 'Strategy already exists for this FT wallet' }, { status: 409 });
        }

        const capital = initial_capital || 1000;

        const { data: strategy, error: insertError } = await supabase
            .from('lt_strategies')
            .insert({
                strategy_id: strategyId,
                ft_wallet_id,
                user_id: userId,
                wallet_address: resolvedWallet.toLowerCase(),
                display_name: display_name || `${ftWallet.display_name} (Live)`,
                description: description || null,

                // Cash management
                initial_capital: capital,
                available_cash: capital,
                locked_capital: 0,
                cooldown_capital: 0,
                cooldown_hours: cooldown_hours ?? 3,

                // Execution
                slippage_tolerance_pct: slippage_tolerance_pct ?? 3,
                order_type: order_type || 'GTC',
                min_order_size_usd: 1,
                max_order_size_usd: 100,

                // Risk rules
                max_position_size_usd: max_position_size_usd || null,
                max_total_exposure_usd: max_total_exposure_usd || null,
                daily_budget_usd: daily_budget_usd || null,
                max_daily_loss_usd: max_daily_loss_usd || null,
                circuit_breaker_loss_pct: circuit_breaker_loss_pct || null,

                // Risk state
                peak_equity: capital,

                // Status — active immediately, use pause to stop
                is_active: true,
                is_paused: false,
                shadow_mode: shadow_mode || false,
            })
            .select('*')
            .single();

        if (insertError || !strategy) {
            return NextResponse.json({ error: insertError?.message || 'Failed to create strategy' }, { status: 500 });
        }

        return NextResponse.json({ success: true, strategy });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * GET /api/lt/strategies
 * List admin's live trading strategies with computed stats.
 * V2: Risk state is inline — no separate lt_risk_state table.
 */
export async function GET(request: Request) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const supabase = createAdminServiceClient();

        const { data: strategies, error } = await supabase
            .from('lt_strategies')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const list = strategies || [];
        const strategyIds = list.map((s: any) => s.strategy_id);

        // Fetch all lt_orders for stats
        let ordersMap: Record<string, any[]> = {};
        if (strategyIds.length > 0) {
            const { data: allOrders } = await supabase
                .from('lt_orders')
                .select('strategy_id, status, outcome, pnl, signal_size_usd, executed_size_usd, executed_price, signal_price, slippage_bps, fill_rate, order_placed_at, resolved_at, shares_bought, is_shadow, condition_id, token_label')
                .in('strategy_id', strategyIds);

            if (allOrders) {
                allOrders.forEach((o: any) => {
                    if (!ordersMap[o.strategy_id]) ordersMap[o.strategy_id] = [];
                    ordersMap[o.strategy_id].push(o);
                });
            }
        }

        // Fetch current prices for unrealized P&L calculation
        const allOrders = Object.values(ordersMap).flat();
        const openOrders = allOrders.filter((o: any) => o.outcome === 'OPEN' && (o.status === 'FILLED' || o.status === 'PARTIAL'));
        const conditionIds = [...new Set(openOrders.map((o: any) => o.condition_id).filter(Boolean))];
        const priceMap = new Map<string, Record<string, number>>();

        if (conditionIds.length > 0) {
            const { data: marketsData } = await supabase
                .from('markets')
                .select('condition_id, outcome_prices, outcomes')
                .in('condition_id', conditionIds);

            if (marketsData) {
                marketsData.forEach((m: any) => {
                    let prices = m.outcome_prices;
                    let outcomes = m.outcomes;
                    if (typeof prices === 'string') { try { prices = JSON.parse(prices); } catch { prices = null; } }
                    if (typeof outcomes === 'string') { try { outcomes = JSON.parse(outcomes); } catch { outcomes = null; } }
                    if (Array.isArray(prices) && Array.isArray(outcomes)) {
                        const obj: Record<string, number> = {};
                        outcomes.forEach((out: string, idx: number) => { obj[out.toUpperCase()] = prices[idx] || 0; });
                        priceMap.set(m.condition_id, obj);
                    }
                });
            }
        }

        const strategiesWithStats = list.map((s: any) => {
            const orders = ordersMap[s.strategy_id] || [];
            const filled = orders.filter((o: any) => o.status === 'FILLED' || o.status === 'PARTIAL');
            const realOrders = filled.filter((o: any) => !o.is_shadow);
            const won = filled.filter((o: any) => o.outcome === 'WON').length;
            const lost = filled.filter((o: any) => o.outcome === 'LOST').length;
            const openCount = filled.filter((o: any) => o.outcome === 'OPEN').length;
            const resolvedPnl = filled
                .filter((o: any) => o.outcome === 'WON' || o.outcome === 'LOST')
                .reduce((sum: number, o: any) => sum + (Number(o.pnl) || 0), 0);

            // Compute unrealized P&L from live market prices
            const unrealizedPnl = filled
                .filter((o: any) => o.outcome === 'OPEN')
                .reduce((sum: number, o: any) => {
                    const label = (o.token_label || 'YES').toUpperCase();
                    const currentPrice = priceMap.get(o.condition_id)?.[label];
                    if (currentPrice != null && o.executed_price != null) {
                        const shares = Number(o.shares_bought) || 0;
                        return sum + ((currentPrice - Number(o.executed_price)) * shares);
                    }
                    return sum;
                }, 0);

            const totalPnl = resolvedPnl + unrealizedPnl;

            return {
                ...s,
                lt_stats: {
                    total_trades: filled.length,
                    open_positions: openCount,
                    won,
                    lost,
                    win_rate: (won + lost) > 0 ? +(won / (won + lost)).toFixed(4) : null,
                    realized_pnl: +resolvedPnl.toFixed(2),
                    unrealized_pnl: +unrealizedPnl.toFixed(2),
                    total_pnl: +totalPnl.toFixed(2),
                    current_equity: +(Number(s.initial_capital) + totalPnl).toFixed(2),
                    available_cash: Number(s.available_cash),
                    locked_capital: Number(s.locked_capital),
                    cooldown_capital: Number(s.cooldown_capital),

                    // Execution quality
                    attempts: orders.length,
                    filled_count: orders.filter((o: any) => o.status === 'FILLED').length,
                    rejected_count: orders.filter((o: any) => o.status === 'REJECTED').length,
                    fill_rate_pct: orders.length > 0
                        ? +(orders.filter((o: any) => o.status === 'FILLED').length / orders.length * 100).toFixed(1)
                        : null,
                    avg_slippage_bps: (() => {
                        const withSlip = realOrders.filter((o: any) => o.slippage_bps != null);
                        return withSlip.length > 0
                            ? +(withSlip.reduce((s2: number, o: any) => s2 + Number(o.slippage_bps), 0) / withSlip.length).toFixed(0)
                            : null;
                    })(),
                },
            };
        });

        // Get user wallet
        const { data: tw } = await supabase
            .from('turnkey_wallets')
            .select('polymarket_account_address, eoa_address')
            .eq('user_id', userId)
            .or('polymarket_account_address.not.is.null,eoa_address.not.is.null')
            .limit(1)
            .maybeSingle();
        const myWallet = (tw as any)?.polymarket_account_address || (tw as any)?.eoa_address || null;

        return NextResponse.json({
            success: true,
            strategies: strategiesWithStats,
            my_polymarket_wallet: myWallet ? String(myWallet) : null,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
