import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { processPendingRedemptions } from '@/lib/live-trading/redemption-service';

/**
 * POST /api/lt/redemptions/process
 * Process pending redemptions (attempt to redeem winning positions)
 * Called by cron every 10 minutes
 */
export async function POST(request: Request) {
    const authError = await requireAdminOrCron(request);
    if (authError) return authError;

    try {
        const supabase = createAdminServiceClient();
        const now = new Date();

        console.log('[lt/redemptions] Processing redemptions at', now.toISOString());

        const result = await processPendingRedemptions(supabase);

        return NextResponse.json({
            success: true,
            processed_at: now.toISOString(),
            ...result,
        });
    } catch (error: any) {
        console.error('[lt/redemptions] Error:', error);
        return NextResponse.json(
            { success: false, error: 'Redemption processing failed', details: String(error) },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'POST to this endpoint to process redemptions',
        description: 'Attempts to redeem winning positions and confirm losses',
    });
}
