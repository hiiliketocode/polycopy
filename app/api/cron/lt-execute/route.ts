import { NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { POST as executePost } from '@/app/api/lt/execute/route';

/**
 * GET /api/cron/lt-execute
 * Cron wrapper for LT execution
 * Runs every 2 minutes
 */
export async function GET(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    // Call the actual execute endpoint
    return executePost(request);
}
