import { NextResponse } from 'next/server';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { POST as resolvePost } from '@/app/api/lt/resolve/route';

/**
 * GET /api/cron/lt-resolve
 * Cron wrapper for LT resolution
 * Runs every 10 minutes
 */
export async function GET(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    // Call the actual resolve endpoint
    return resolvePost(request);
}
