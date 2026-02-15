import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { requireAdminOrCron } from '@/lib/ft-auth';
import { runAgentCycle } from '@/lib/alpha-agent';

export const maxDuration = 120; // 2 minutes max

export async function POST(request: Request) {
  // Auth check: admin or cron
  const authResult = await requireAdminOrCron(request);
  if (authResult) return authResult;

  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!geminiApiKey) {
    return NextResponse.json(
      { success: false, error: 'GEMINI_API_KEY not configured' },
      { status: 500 }
    );
  }

  // Parse options from request body
  let runType: 'scheduled' | 'manual' | 'reactive' = 'manual';
  let dryRun = false;

  try {
    const body = await request.json();
    if (body.runType) runType = body.runType;
    if (body.dryRun !== undefined) dryRun = body.dryRun;
  } catch {
    // No body or invalid JSON - use defaults
  }

  const supabase = createAdminServiceClient();

  try {
    const result = await runAgentCycle(supabase, {
      runType,
      geminiApiKey,
      dryRun,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('[Alpha Agent API] Run failed:', err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
