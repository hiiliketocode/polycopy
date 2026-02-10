import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * GET /api/lt/execute-debug
 * Admin-only: deep diagnostic for live trading execution.
 * Shows:
 *  - Active strategies and their last sync times
 *  - How many orders exist per strategy (lt_orders)
 *  - Recent FT orders for the underlying FT wallets (to check if FT itself is picking up trades)
 *  - Cron job configuration
 */
export async function GET() {
    const authError = await requireAdmin();
    if (authError) return authError;

    const supabase = createAdminServiceClient();

    // 1. Get all LT strategies
    const { data: strategies } = await supabase
        .from('lt_strategies')
        .select('strategy_id, ft_wallet_id, is_active, is_paused, wallet_address, starting_capital, last_sync_time, launched_at, created_at');

    if (!strategies || strategies.length === 0) {
        return NextResponse.json({ ok: false, message: 'No LT strategies found' });
    }

    // 2. Get lt_orders counts per strategy
    const { data: ltOrders } = await supabase
        .from('lt_orders')
        .select('strategy_id, status, outcome, executed_price, signal_price, pnl, created_at')
        .in('strategy_id', strategies.map(s => s.strategy_id))
        .order('created_at', { ascending: false });

    const ltOrdersByStrategy: Record<string, typeof ltOrders> = {};
    for (const o of ltOrders || []) {
        if (!ltOrdersByStrategy[o.strategy_id]) ltOrdersByStrategy[o.strategy_id] = [];
        ltOrdersByStrategy[o.strategy_id]!.push(o);
    }

    // 3. Check FT wallets config
    const ftWalletIds = [...new Set(strategies.map(s => s.ft_wallet_id))];
    const { data: ftWallets } = await supabase
        .from('ft_wallets')
        .select('wallet_id, display_name, is_active, last_sync_time, created_at, use_model, model_threshold, price_min, price_max, min_edge')
        .in('wallet_id', ftWalletIds);

    // 4. Check recent ft_orders for these wallets (last 24h)
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentFtOrders } = await supabase
        .from('ft_orders')
        .select('wallet_id, market_title, side, size, entry_price, outcome, order_time, created_at')
        .in('wallet_id', ftWalletIds)
        .gte('order_time', cutoff24h)
        .order('order_time', { ascending: false })
        .limit(100);

    const ftOrdersByWallet: Record<string, typeof recentFtOrders> = {};
    for (const o of recentFtOrders || []) {
        if (!ftOrdersByWallet[o.wallet_id]) ftOrdersByWallet[o.wallet_id] = [];
        ftOrdersByWallet[o.wallet_id]!.push(o);
    }

    // 5. Check if there are ANY ft_orders at all for these wallets
    const { count: totalFtOrderCount } = await supabase
        .from('ft_orders')
        .select('id', { count: 'exact', head: true })
        .in('wallet_id', ftWalletIds);

    // 6. Check if the main orders table has any lt trades
    const { data: mainTableLtOrders } = await supabase
        .from('orders')
        .select('order_id, lt_strategy_id, lt_order_id, status, created_at')
        .not('lt_strategy_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

    // 7. Check risk state
    const { data: riskStates } = await supabase
        .from('lt_risk_state')
        .select('*')
        .in('strategy_id', strategies.map(s => s.strategy_id));

    // Build diagnostic summary
    const strategyDiagnostics = strategies.map(s => {
        const ftWallet = ftWallets?.find(w => w.wallet_id === s.ft_wallet_id);
        const ltOrds = ltOrdersByStrategy[s.strategy_id] || [];
        const ftOrds = ftOrdersByWallet[s.ft_wallet_id] || [];
        const riskState = riskStates?.find(r => r.strategy_id === s.strategy_id);

        return {
            strategy_id: s.strategy_id,
            ft_wallet_id: s.ft_wallet_id,
            is_active: s.is_active,
            is_paused: s.is_paused,
            wallet_address: s.wallet_address,
            starting_capital: s.starting_capital,
            last_sync_time: s.last_sync_time,
            launched_at: s.launched_at,
            created_at: s.created_at,
            ft_wallet: ftWallet ? {
                display_name: ftWallet.display_name,
                is_active: ftWallet.is_active,
                last_sync_time: ftWallet.last_sync_time,
                use_model: ftWallet.use_model,
                model_threshold: ftWallet.model_threshold,
                price_min: ftWallet.price_min,
                price_max: ftWallet.price_max,
                min_edge: ftWallet.min_edge,
            } : 'NOT FOUND',
            lt_orders_total: ltOrds.length,
            lt_orders_recent: ltOrds.slice(0, 5),
            ft_orders_last_24h: ftOrds.length,
            ft_orders_recent: ftOrds.slice(0, 5),
            risk_state: riskState || null,
            issues: [
                !s.is_active ? 'STRATEGY NOT ACTIVE' : null,
                s.is_paused ? 'STRATEGY IS PAUSED' : null,
                !ftWallet ? 'FT WALLET NOT FOUND' : null,
                ftWallet && !ftWallet.is_active ? 'FT WALLET NOT ACTIVE (but LT uses its config, not its active state)' : null,
                !s.last_sync_time ? 'NEVER SYNCED - cron may not be running' : null,
                s.last_sync_time && (Date.now() - new Date(s.last_sync_time).getTime() > 10 * 60 * 1000) ? 'LAST SYNC > 10 min ago - cron may not be running' : null,
                ltOrds.length === 0 && ftOrds.length === 0 ? 'NO TRADES: Neither LT nor FT have orders - likely no qualifying trades from leaderboard' : null,
                ltOrds.length === 0 && ftOrds.length > 0 ? 'FT HAS TRADES BUT LT DOES NOT - this indicates LT executor may be failing to place real orders or the FT trades happened before LT was launched' : null,
                riskState?.circuit_breaker_active ? 'CIRCUIT BREAKER ACTIVE' : null,
            ].filter(Boolean),
        };
    });

    return NextResponse.json({
        ok: true,
        timestamp: new Date().toISOString(),
        summary: {
            total_strategies: strategies.length,
            active_strategies: strategies.filter(s => s.is_active && !s.is_paused).length,
            total_lt_orders: (ltOrders || []).length,
            total_ft_orders_all_time: totalFtOrderCount,
            ft_orders_last_24h: (recentFtOrders || []).length,
            main_table_lt_orders: (mainTableLtOrders || []).length,
        },
        strategies: strategyDiagnostics,
        main_table_lt_orders: mainTableLtOrders || [],
    });
}
