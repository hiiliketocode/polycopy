import { NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { POST as processPost } from '@/app/api/lt/redemptions/process/route';

/**
 * GET /api/cron/lt-redemptions
 * Cron wrapper for redemption processing
 * Runs every 10 minutes
 */
export async function GET(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    // Call the actual redemption processing endpoint
    return processPost(request);
}
