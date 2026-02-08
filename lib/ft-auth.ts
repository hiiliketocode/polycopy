import { NextResponse } from 'next/server';
import { getAdminSessionUser } from '@/lib/admin';

/**
 * Require admin session. Returns null if allowed, or a 401 Response to return.
 */
export async function requireAdmin(): Promise<Response | null> {
  const user = await getAdminSessionUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Admin access required' },
      { status: 401 }
    );
  }
  return null;
}

/**
 * Require either admin session OR valid CRON_SECRET (for cron-triggered routes like sync, resolve, enrich-ml).
 * Returns null if allowed, or a 401 Response to return.
 */
export async function requireAdminOrCron(request: Request): Promise<Response | null> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return null; // Cron request allowed
  }

  const user = await getAdminSessionUser();
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Admin access required' },
      { status: 401 }
    );
  }
  return null;
}
