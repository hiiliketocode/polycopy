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

        if (!ft_wallet_id || !wallet_address) {
            return NextResponse.json(
                { error: 'ft_wallet_id and wallet_address are required' },
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
            .single();

        if (existing) {
            return NextResponse.json(
                { error: 'Strategy already exists for this FT wallet' },
                { status: 409 }
            );
        }

        // Create strategy
        const { data: strategy, error: strategyError } = await supabase
            .from('lt_strategies')
            .insert({
                strategy_id: strategyId,
                ft_wallet_id,
                user_id: userId,
                wallet_address: wallet_address.toLowerCase(),
                starting_capital: starting_capital || 1000.00,
                display_name: display_name || `${ftWallet.display_name} (Live)`,
                description: description || null,
                slippage_tolerance_pct: slippage_tolerance_pct || 0.5,
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
 * List admin's live trading strategies (admin only)
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
            .select(`
                *,
                lt_risk_state (
                    current_equity,
                    peak_equity,
                    current_drawdown_pct,
                    consecutive_losses,
                    is_paused,
                    circuit_breaker_active
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            strategies: strategies || [],
        });
    } catch (error: any) {
        console.error('[LT Strategies] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
