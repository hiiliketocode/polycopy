/**
 * Recovery script: Restore post-fix lt_orders incorrectly cancelled.
 *
 * Run with:  npx tsx scripts/recover-post-fix-orders.ts
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const CUTOFF = '2026-02-13T23:00:00+00:00';

async function fetchAll(query: any) {
    // Supabase limits to 1000 rows by default; paginate
    const allRows: any[] = [];
    let offset = 0;
    const PAGE = 1000;
    while (true) {
        const { data, error } = await query.range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allRows.push(...data);
        if (data.length < PAGE) break;
        offset += PAGE;
    }
    return allRows;
}

async function main() {
    console.log('=== Recovery: Restore post-fix orders ===\n');

    // ── Fetch all post-fix orders ──
    console.log('Fetching post-fix orders...');
    const { data: orders, error: fetchErr } = await supabase
        .from('lt_orders')
        .select('lt_order_id, pnl, winning_label, token_label, fill_rate, shares_bought, executed_price, executed_size_usd, signal_size_usd, risk_check_passed, strategy_id, order_placed_at')
        .gte('order_placed_at', CUTOFF);

    if (fetchErr) {
        console.error('Fetch error:', fetchErr.message);
        process.exit(1);
    }

    if (!orders || orders.length === 0) {
        console.log('No post-fix orders found.');
        return;
    }

    console.log(`Found ${orders.length} post-fix orders\n`);

    // ── Classify orders ──
    const resolved: typeof orders = [];
    const openFilled: typeof orders = [];
    const pending: typeof orders = [];
    const skipped: typeof orders = [];

    for (const o of orders) {
        if (o.risk_check_passed === false) {
            skipped.push(o);
            continue;
        }

        if (o.pnl != null) {
            resolved.push(o);
        } else if ((o.shares_bought ?? 0) > 0) {
            openFilled.push(o);
        } else if (o.executed_price != null && (o.executed_size_usd ?? 0) === 0) {
            pending.push(o);
        } else {
            skipped.push(o);
        }
    }

    console.log(`  Resolved (WON/LOST): ${resolved.length}`);
    console.log(`  Open filled:         ${openFilled.length}`);
    console.log(`  Pending:             ${pending.length}`);
    console.log(`  Skipped (rejected):  ${skipped.length}\n`);

    // ── Step 1: Restore resolved orders ──
    console.log('Step 1: Restoring resolved orders...');
    let step1Count = 0;
    for (const o of resolved) {
        let outcome: string;
        if (o.winning_label && o.token_label) {
            outcome = (o.token_label || '').toUpperCase() === (o.winning_label || '').toUpperCase() ? 'WON' : 'LOST';
        } else {
            outcome = (o.pnl ?? 0) >= 0 ? 'WON' : 'LOST';
        }

        const fillRate = o.fill_rate ?? 0;
        const status = fillRate >= 1.0 ? 'FILLED' : fillRate > 0 ? 'PARTIAL' : 'FILLED';

        const { error } = await supabase
            .from('lt_orders')
            .update({
                outcome,
                status,
                rejection_reason: null,
                updated_at: new Date().toISOString(),
            })
            .eq('lt_order_id', o.lt_order_id);

        if (error) {
            console.error(`  Error updating ${o.lt_order_id}: ${error.message}`);
        } else {
            step1Count++;
        }
    }
    console.log(`  Restored ${step1Count} resolved orders\n`);

    // ── Step 2: Restore open filled orders ──
    console.log('Step 2: Restoring open filled orders...');
    let step2Count = 0;
    for (const o of openFilled) {
        const fillRate = o.fill_rate ?? 0;
        const status = fillRate >= 1.0 ? 'FILLED' : fillRate > 0 ? 'PARTIAL' : 'FILLED';

        const { error } = await supabase
            .from('lt_orders')
            .update({
                outcome: 'OPEN',
                status,
                rejection_reason: null,
                resolved_at: null,
                updated_at: new Date().toISOString(),
            })
            .eq('lt_order_id', o.lt_order_id);

        if (error) {
            console.error(`  Error updating ${o.lt_order_id}: ${error.message}`);
        } else {
            step2Count++;
        }
    }
    console.log(`  Restored ${step2Count} open filled orders\n`);

    // ── Step 3: Restore pending orders ──
    console.log('Step 3: Restoring pending orders...');
    let step3Count = 0;
    for (const o of pending) {
        const { error } = await supabase
            .from('lt_orders')
            .update({
                outcome: 'OPEN',
                status: 'PENDING',
                rejection_reason: null,
                resolved_at: null,
                updated_at: new Date().toISOString(),
            })
            .eq('lt_order_id', o.lt_order_id);

        if (error) {
            console.error(`  Error updating ${o.lt_order_id}: ${error.message}`);
        } else {
            step3Count++;
        }
    }
    console.log(`  Restored ${step3Count} pending orders\n`);

    // ── Step 4: Recalculate strategy capital ──
    console.log('Step 4: Recalculating strategy capital...');

    // Re-fetch recovered orders to compute capital
    const { data: recoveredOrders, error: refetchErr } = await supabase
        .from('lt_orders')
        .select('strategy_id, outcome, status, pnl, executed_size_usd, shares_bought, executed_price, signal_size_usd')
        .gte('order_placed_at', CUTOFF)
        .neq('outcome', 'CANCELLED');

    if (refetchErr) {
        console.error('Re-fetch error:', refetchErr.message);
        process.exit(1);
    }

    // Group by strategy
    const strategyStats = new Map<string, { netPnl: number; lockedFilled: number; lockedPending: number }>();
    for (const o of recoveredOrders || []) {
        if (!strategyStats.has(o.strategy_id)) {
            strategyStats.set(o.strategy_id, { netPnl: 0, lockedFilled: 0, lockedPending: 0 });
        }
        const s = strategyStats.get(o.strategy_id)!;

        if (o.outcome === 'WON' || o.outcome === 'LOST') {
            s.netPnl += Number(o.pnl) || 0;
        } else if (o.outcome === 'OPEN' && (o.status === 'FILLED' || o.status === 'PARTIAL')) {
            s.lockedFilled += Number(o.executed_size_usd) || (Number(o.shares_bought) * Number(o.executed_price)) || 0;
        } else if (o.outcome === 'OPEN' && o.status === 'PENDING') {
            s.lockedPending += Number(o.signal_size_usd) || 0;
        }
    }

    let step4Count = 0;
    for (const [strategyId, stats] of strategyStats) {
        // Fetch initial_capital
        const { data: strat } = await supabase
            .from('lt_strategies')
            .select('initial_capital, is_active')
            .eq('strategy_id', strategyId)
            .maybeSingle();

        if (!strat || !strat.is_active) continue;

        const initialCapital = Number(strat.initial_capital) || 0;
        const availableCash = Math.max(0, initialCapital + stats.netPnl - stats.lockedFilled - stats.lockedPending);
        const lockedCapital = stats.lockedFilled + stats.lockedPending;
        const peakEquity = Math.max(initialCapital, initialCapital + stats.netPnl);

        const { error } = await supabase
            .from('lt_strategies')
            .update({
                available_cash: +availableCash.toFixed(2),
                locked_capital: +lockedCapital.toFixed(2),
                cooldown_capital: 0,
                peak_equity: +peakEquity.toFixed(2),
                current_drawdown_pct: 0,
                daily_spent_usd: 0,
                daily_loss_usd: 0,
                updated_at: new Date().toISOString(),
            })
            .eq('strategy_id', strategyId);

        if (error) {
            console.error(`  Error updating strategy ${strategyId}: ${error.message}`);
        } else {
            step4Count++;
            console.log(`  ${strategyId}: cash=$${availableCash.toFixed(2)} locked=$${lockedCapital.toFixed(2)} pnl=$${stats.netPnl.toFixed(2)}`);
        }
    }
    console.log(`  Updated ${step4Count} strategies\n`);

    console.log('=== Recovery complete ===');
    console.log(`  Total recovered: ${step1Count + step2Count + step3Count} orders across ${step4Count} strategies`);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
