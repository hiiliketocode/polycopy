import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin';
import { runAgentCycle } from '@/lib/alpha-agent';

export const maxDuration = 120;

/**
 * Alpha Agent Cron Endpoint
 * Runs every 30 minutes via Vercel Cron.
 * Authenticated via CRON_SECRET bearer token.
 */
export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!geminiApiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
  }

  const supabase = createAdminServiceClient();

  try {
    // Check if there's a run already in progress (prevent overlap)
    const { data: runningRuns } = await supabase
      .from('alpha_agent_runs')
      .select('run_id, started_at')
      .eq('status', 'running')
      .limit(1);

    if (runningRuns && runningRuns.length > 0) {
      const runAge = Date.now() - new Date(runningRuns[0].started_at).getTime();
      if (runAge < 5 * 60 * 1000) {
        // Less than 5 minutes old — still running, skip
        return NextResponse.json({
          success: true,
          skipped: true,
          reason: `Run ${runningRuns[0].run_id} still in progress (${(runAge / 1000).toFixed(0)}s ago)`,
        });
      }
      // Older than 5 minutes — mark as failed (likely stuck)
      await supabase
        .from('alpha_agent_runs')
        .update({ status: 'failed', error_message: 'Timed out (stuck)', completed_at: new Date().toISOString() })
        .eq('run_id', runningRuns[0].run_id);
    }

    const result = await runAgentCycle(supabase, {
      runType: 'scheduled',
      geminiApiKey,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error('[Alpha Agent Cron] Error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown' },
      { status: 500 }
    );
  }
}
