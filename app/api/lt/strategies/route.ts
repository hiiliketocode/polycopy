import { NextResponse } from 'next/server';
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';
import { initializeRiskState } from '@/lib/live-trading/risk-manager';

/**
 * POST /api/lt/strategies
 * Create a new live trading strategy (admin only)
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
            starting_capital,
            display_name,
            description,
            slippage_tolerance_pct,
            order_type,
            max_position_size_usd,
            max_total_exposure_usd,
        } = body;

        if (!ft_wallet_id) {
            return NextResponse.json(
                { error: 'ft_wallet_id is required' },
                { status: 400 }
            );
        }
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
                { status: 400 }
            );
        }

        // Check if FT wallet exists
        const { data: ftWallet } = await supabase
            .from('ft_wallets')
            .select('wallet_id, display_name')
            .eq('wallet_id', ft_wallet_id)
            .single();

        if (!ftWallet) {
            return NextResponse.json(
                { error: 'FT wallet not found' },
                { status: 404 }
            );
        }

        // Check if strategy already exists
        const strategyId = `LT_${ft_wallet_id}`;
        const { data: existing } = await supabase
            .from('lt_strategies')
            .select('strategy_id')
            .eq('strategy_id', strategyId)
            .eq('user_id', userId)
            .maybeSingle();

        if (existing) {
            return NextResponse.json(
                { error: 'Strategy already exists for this FT wallet' },
                { status: 409 }
            );
        }

        // Create strategy (use resolved wallet: from body or connected Turnkey account)
        const { data: strategy, error: strategyError } = await supabase
            .from('lt_strategies')
            .insert({
                strategy_id: strategyId,
                ft_wallet_id,
                user_id: userId,
                wallet_address: resolvedWallet.toLowerCase(),
                starting_capital: starting_capital || 1000.00,
                display_name: display_name || `${ftWallet.display_name} (Live)`,
                description: description || null,
                slippage_tolerance_pct: slippage_tolerance_pct ?? 3,
                order_type: order_type || 'GTC',
                max_position_size_usd: max_position_size_usd || null,
                max_total_exposure_usd: max_total_exposure_usd || null,
                is_active: false, // Start inactive, user must activate
                is_paused: false,
            })
            .select('*')
            .single();

        if (strategyError || !strategy) {
            console.error('[LT Strategies] Failed to create strategy:', strategyError);
            return NextResponse.json(
                { error: strategyError?.message || 'Failed to create strategy' },
                { status: 500 }
            );
        }

        // Initialize risk state
        await initializeRiskState(supabase, strategyId, strategy.starting_capital);

        // Create default risk rules
        const { data: riskRules } = await supabase
            .from('lt_risk_rules')
            .insert({
                strategy_id: strategyId,
                daily_budget_pct: 0.10, // 10% per day
                max_position_size_pct: 0.02, // 2% per trade
                max_total_exposure_pct: 0.50, // 50% total exposure
                max_drawdown_pct: 0.07, // 7% drawdown limit
                max_consecutive_losses: 5,
                max_slippage_pct: 0.01, // 1% slippage
                max_concurrent_positions: 20,
            })
            .select('rule_id')
            .single();

        if (riskRules) {
            // Link risk rules to strategy
            await supabase
                .from('lt_strategies')
                .update({ risk_rules_id: riskRules.rule_id })
                .eq('strategy_id', strategyId);
        }

        return NextResponse.json({
            success: true,
            strategy,
        });
    } catch (error: any) {
        console.error('[LT Strategies] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/lt/strategies
 * List admin's live trading strategies with computed stats from lt_orders (admin only).
 * Returns FT-compatible shape so strategies can render in the FT Performance table.
 */
export async function GET(request: Request) {
    const authError = await requireAdmin();
    if (authError) return authError;
    const adminUser = await getAdminSessionUser();
    const userId = adminUser!.id;

    try {
        const supabase = createAdminServiceClient();

        // Fetch strategies (no joins to lt_risk_rules — ambiguous FK)
        const { data: strategies, error } = await supabase
            .from('lt_strategies')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const list = strategies || [];
        const strategyIds = list.map((s: { strategy_id: string }) => s.strategy_id);

        // Fetch risk state separately
        let riskStateMap: Record<string, any> = {};
        if (strategyIds.length > 0) {
            const { data: riskRows } = await supabase
                .from('lt_risk_state')
                .select('strategy_id, current_equity, peak_equity, current_drawdown_pct, consecutive_losses, is_paused, circuit_breaker_active')
                .in('strategy_id', strategyIds);
            if (riskRows) {
                riskRows.forEach((r: any) => { riskStateMap[r.strategy_id] = r; });
            }
        }

        // Fetch all lt_orders for these strategies to compute stats
        let ordersMap: Record<string, any[]> = {};
        if (strategyIds.length > 0) {
            const { data: allOrders } = await supabase
                .from('lt_orders')
                .select('strategy_id, status, outcome, pnl, signal_size_usd, executed_size, executed_price, signal_price, slippage_pct, fill_rate, order_placed_at, resolved_at')
                .in('strategy_id', strategyIds);
            if (allOrders) {
                allOrders.forEach((o: any) => {
                    if (!ordersMap[o.strategy_id]) ordersMap[o.strategy_id] = [];
                    ordersMap[o.strategy_id].push(o);
                });
            }
        }

        // Compute FT-compatible stats per strategy
        const strategiesWithStats = list.map((s: any) => {
            const rs = riskStateMap[s.strategy_id] || null;
            const orders = ordersMap[s.strategy_id] || [];
            const filledOrPartial = orders.filter((o: any) => o.status === 'FILLED' || o.status === 'PARTIAL');
            const won = filledOrPartial.filter((o: any) => o.outcome === 'WON').length;
            const lost = filledOrPartial.filter((o: any) => o.outcome === 'LOST').length;
            const openOrders = filledOrPartial.filter((o: any) => o.outcome === 'OPEN').length;
            const resolvedPnl = filledOrPartial.filter((o: any) => o.outcome === 'WON' || o.outcome === 'LOST')
                .reduce((sum: number, o: any) => sum + (Number(o.pnl) || 0), 0);
            const totalExecuted = filledOrPartial.reduce((sum: number, o: any) => sum + (Number(o.executed_size) || 0), 0);
            const avgTradeSize = filledOrPartial.length > 0 ? totalExecuted / filledOrPartial.length : 0;
            const currentEquity = rs?.current_equity ?? s.starting_capital;
            const totalPnl = currentEquity - s.starting_capital;
            const firstOrder = filledOrPartial.length > 0 ? filledOrPartial.reduce((a: any, b: any) => a.order_placed_at < b.order_placed_at ? a : b) : null;
            const lastOrder = filledOrPartial.length > 0 ? filledOrPartial.reduce((a: any, b: any) => a.order_placed_at > b.order_placed_at ? a : b) : null;

            return {
                ...s,
                lt_risk_state: rs ? [rs] : [],
                // FT-compatible computed stats
                lt_stats: {
                    total_trades: filledOrPartial.length,
                    open_positions: openOrders,
                    won,
                    lost,
                    win_rate: (won + lost) > 0 ? won / (won + lost) : null,
                    realized_pnl: resolvedPnl,
                    unrealized_pnl: totalPnl - resolvedPnl,
                    total_pnl: totalPnl,
                    current_balance: currentEquity,
                    cash_available: currentEquity - totalExecuted, // approximate
                    avg_trade_size: avgTradeSize,
                    first_trade: firstOrder ? firstOrder.order_placed_at : null,
                    last_trade: lastOrder ? lastOrder.order_placed_at : null,
                    // Execution quality
                    attempts: orders.length,
                    filled: orders.filter((o: any) => o.status === 'FILLED').length,
                    failed: orders.filter((o: any) => o.status === 'REJECTED' || o.status === 'CANCELLED').length,
                    pending: orders.filter((o: any) => o.status === 'PENDING').length,
                    fill_rate_pct: (() => {
                        const sig = orders.reduce((s2: number, o: any) => s2 + (Number(o.signal_size_usd) || 0), 0);
                        const exe = orders.reduce((s2: number, o: any) => s2 + (Number(o.executed_size) || 0), 0);
                        return sig > 0 ? Math.round((exe / sig) * 10000) / 100 : null;
                    })(),
                    avg_slippage_pct: (() => {
                        const withSlip = orders.filter((o: any) => o.slippage_pct != null);
                        return withSlip.length > 0 ? withSlip.reduce((s2: number, o: any) => s2 + Number(o.slippage_pct), 0) / withSlip.length : null;
                    })(),
                },
            };
        });

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
        console.error('[LT Strategies] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
