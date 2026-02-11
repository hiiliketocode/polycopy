import { NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { POST as executePost } from '@/app/api/lt/execute/route';

/**
 * GET /api/cron/lt-execute
 * Cron wrapper for LT execution (V2).
 * Runs every minute.
 */
export async function GET(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    return executePost(request);
}
