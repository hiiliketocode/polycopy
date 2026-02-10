import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/ft-auth';
import { POST as executePost } from '@/app/api/lt/execute/route';

/**
 * GET /api/lt/execute-debug
 * Admin-only: manually trigger LT execution and return full results.
 * Shows exactly how many trades were evaluated, executed, skipped, and WHY.
 */
export async function GET(request: Request) {
    const authError = await requireAdmin();
    if (authError) return authError;

    // Call the actual execute endpoint (same as the cron does)
    const fakeRequest = new Request(request.url, {
        method: 'POST',
        headers: request.headers,
    });

    const result = await executePost(fakeRequest);
    return result;
}
