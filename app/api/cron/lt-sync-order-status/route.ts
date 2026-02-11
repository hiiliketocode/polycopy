import { NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { POST as syncPost } from '@/app/api/lt/sync-order-status/route';

/**
 * GET /api/cron/lt-sync-order-status
 * Cron wrapper for order status sync. Vercel crons use GET.
 * Runs every minute to update PENDING → FILLED from Polymarket CLOB.
 */
export async function GET(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;
    return syncPost(request);
}
