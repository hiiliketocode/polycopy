import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * GET /api/lt/execute-debug
 * Admin-only: deep diagnostic for live trading execution.
 * V2: Risk state is inline on lt_strategies — no separate tables.
 */
export async function GET() {
    const authError = await requireAdmin();
    if (authError) return authError;

    const supabase = createAdminServiceClient();

    // 1. Get all LT strategies
    const { data: strategies } = await supabase
        .from('lt_strategies')
        .select(`
            strategy_id, ft_wallet_id, is_active, is_paused, shadow_mode,
            wallet_address, initial_capital, available_cash, locked_capital, cooldown_capital,
            circuit_breaker_active, daily_spent_usd, current_drawdown_pct,
            last_sync_time, launched_at, created_at
        `);

    if (!strategies || strategies.length === 0) {
        return NextResponse.json({ ok: false, message: 'No LT strategies found' });
    }

    // 2. Get lt_orders per strategy
    const { data: ltOrders } = await supabase
        .from('lt_orders')
        .select('strategy_id, status, outcome, executed_price, signal_price, pnl, slippage_bps, created_at')
        .in('strategy_id', strategies.map(s => s.strategy_id))
        .order('created_at', { ascending: false });

    const ltOrdersByStrategy: Record<string, any[]> = {};
    for (const o of ltOrders || []) {
        if (!ltOrdersByStrategy[o.strategy_id]) ltOrdersByStrategy[o.strategy_id] = [];
        ltOrdersByStrategy[o.strategy_id].push(o);
    }

    // 3. Check FT wallets
    const ftWalletIds = [...new Set(strategies.map(s => s.ft_wallet_id))];
    const { data: ftWallets } = await supabase
        .from('ft_wallets')
        .select('wallet_id, display_name, is_active, last_sync_time, use_model, model_threshold, price_min, price_max, min_edge')
        .in('wallet_id', ftWalletIds);

    // 4. Recent ft_orders (last 6h)
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: recentFtOrders } = await supabase
        .from('ft_orders')
        .select('wallet_id, market_title, side, size, entry_price, outcome, order_time')
        .in('wallet_id', ftWalletIds)
        .gte('order_time', cutoff)
        .order('order_time', { ascending: false })
        .limit(100);

    const ftOrdersByWallet: Record<string, any[]> = {};
    for (const o of recentFtOrders || []) {
        if (!ftOrdersByWallet[o.wallet_id]) ftOrdersByWallet[o.wallet_id] = [];
        ftOrdersByWallet[o.wallet_id].push(o);
    }

    // Build diagnostics
    const strategyDiagnostics = strategies.map(s => {
        const ftWallet = ftWallets?.find(w => w.wallet_id === s.ft_wallet_id);
        const ltOrds = ltOrdersByStrategy[s.strategy_id] || [];
        const ftOrds = ftOrdersByWallet[s.ft_wallet_id] || [];
        const equity = Number(s.available_cash) + Number(s.locked_capital) + Number(s.cooldown_capital);

        return {
            ...s,
            equity,
            ft_wallet: ftWallet || 'NOT FOUND',
            lt_orders_total: ltOrds.length,
            lt_orders_recent: ltOrds.slice(0, 5),
            ft_orders_last_6h: ftOrds.length,
            ft_orders_recent: ftOrds.slice(0, 5),
            issues: [
                !s.is_active ? 'STRATEGY NOT ACTIVE' : null,
                s.is_paused ? 'STRATEGY IS PAUSED' : null,
                s.circuit_breaker_active ? 'CIRCUIT BREAKER ACTIVE' : null,
                !ftWallet ? 'FT WALLET NOT FOUND' : null,
                !s.last_sync_time ? 'NEVER SYNCED' : null,
                s.last_sync_time && (Date.now() - new Date(s.last_sync_time).getTime() > 10 * 60 * 1000) ? 'LAST SYNC > 10 min ago' : null,
                ltOrds.length === 0 && ftOrds.length > 0 ? 'FT HAS TRADES BUT LT DOES NOT' : null,
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
            ft_orders_last_6h: (recentFtOrders || []).length,
        },
        strategies: strategyDiagnostics,
    });
}
