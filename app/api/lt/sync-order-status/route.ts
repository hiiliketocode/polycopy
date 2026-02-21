/**
 * POST /api/lt/sync-order-status
 *
 * Sync order fill status from CLOB for all PENDING/PARTIAL lt_orders,
 * then ALWAYS run capital reconciliation for every active strategy.
 *
 * Capital reconciliation ensures:
 *   equity = initial_capital + realized_pnl
 *   locked_capital = sum of open filled + pending orders
 *   available_cash = equity - locked - cooldown
 *   daily_spent_usd = sum of today's actually-filled order values
 *   drawdown = correct % based on equity vs initial
 *
 * Called by cron every minute.
 */

import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { runCapitalReconciliation } from '@/lib/live-trading/capital-reconciliation';
import { syncPendingOrdersWithClob } from '@/lib/live-trading/sync-pending-orders';

/** Max time (ms) for CLOB sync so we leave room for Phase 2 (reconciliation). Cron runs every 2 min. */
const PHASE1_MAX_MS = 55_000;

export async function POST(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    const supabase = createAdminServiceClient();
    const now = new Date();

    try {
        // ═══════════════════════════════════════════════════════════════
        // PHASE 1: Sync PENDING/PARTIAL lt_orders with CLOB (shared with execute)
        // ═══════════════════════════════════════════════════════════════
        const { checked, updated, errors } = await syncPendingOrdersWithClob(supabase, { maxMs: PHASE1_MAX_MS, log: true });
        if (checked === 0) console.log('[lt/sync-order-status] No pending/partial orders to sync');

        // ═══════════════════════════════════════════════════════════════
        // PHASE 2: Capital reconciliation — ALWAYS runs (shared with execute)
        // ═══════════════════════════════════════════════════════════════
        const { strategiesReconciled, capitalReconciled } = await runCapitalReconciliation(supabase, { now, log: true });

        return NextResponse.json({
            success: true,
            checked,
            updated,
            errors,
            capital_reconciled: +capitalReconciled.toFixed(2),
            strategies_reconciled: strategiesReconciled,
            timestamp: now.toISOString(),
        });
    } catch (error: any) {
        console.error('[lt/sync-order-status] Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to sync LT order fill status from CLOB',
        description: 'V2: Syncs PENDING/PARTIAL orders with CLOB, then reconciles capital for ALL active strategies every run.',
    });
}
