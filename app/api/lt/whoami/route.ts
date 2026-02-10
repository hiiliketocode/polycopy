import { NextResponse } from 'next/server';
import { getAdminSessionUser } from '@/lib/admin';
import { requireAdmin } from '@/lib/ft-auth';

/**
 * GET /api/lt/whoami
 * Returns current session user (for debugging auth issues)
 */
export async function GET() {
    const authError = await requireAdmin();
    if (authError) {
        return NextResponse.json(
            { authenticated: false, error: 'Not authenticated or not admin' },
            { status: 401 }
        );
    }

    const user = await getAdminSessionUser();
    if (!user) {
        return NextResponse.json(
            { authenticated: false, error: 'No user in session' },
            { status: 401 }
        );
    }

    return NextResponse.json({
        authenticated: true,
        user_id: user.id,
        email: user.email,
    });
}
