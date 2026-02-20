import { NextResponse } from 'next/server'
import { createAdminServiceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TOP_N = 10

const DAILY_WALLETS = [
  'FT_TOP_DAILY_WINNERS',
  'FT_TOP_DAILY_ML55',
  'FT_TOP_DAILY_ML60_KELLY',
];

const WEEKLY_WALLETS = [
  'FT_TOP_7D_WINNERS',
  'FT_TOP_7D_ML55_NO_CRYPTO',
  'FT_TOP_7D_FIXED',
];

/**
 * GET/POST /api/cron/rotate-pnl-winners
 *
 * Runs daily at 3am UTC. Fetches top 10 traders by:
 * - Yesterday's realized PnL (FT_TOP_DAILY_WINNERS)
 * - Last 7 days realized PnL (FT_TOP_7D_WINNERS)
 *
 * Updates target_traders for both FT strategies so they copy the current hot hands.
 * Schedule: 0 3 * * * (3am UTC)
 */
function verifyAuth(request: Request): Response | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('[rotate-pnl-winners] Unauthorized')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

async function updateTargetTraders(
  supabase: ReturnType<typeof createAdminServiceClient>,
  walletId: string,
  traders: string[],
): Promise<boolean> {
  const { data: wallet } = await supabase
    .from('ft_wallets')
    .select('detailed_description')
    .eq('wallet_id', walletId)
    .single()

  if (!wallet) {
    console.warn(`[rotate-pnl-winners] Wallet ${walletId} not found, skipping`)
    return false
  }

  let prev: Record<string, unknown> = {}
  try {
    if (wallet.detailed_description && typeof wallet.detailed_description === 'string') {
      prev = JSON.parse(wallet.detailed_description)
    }
  } catch { /* use empty */ }

  const nextFilters = { ...prev, target_traders: traders }
  const { error } = await supabase
    .from('ft_wallets')
    .update({
      detailed_description: JSON.stringify(nextFilters),
      updated_at: new Date().toISOString(),
    })
    .eq('wallet_id', walletId)

  if (error) {
    console.error(`[rotate-pnl-winners] Update ${walletId} failed:`, error)
    return false
  }

  console.log(`[rotate-pnl-winners] Updated ${walletId}: ${traders.length} traders`)
  return true
}

async function rotatePnlWinners(): Promise<Response> {
  const supabase = createAdminServiceClient()

  try {
    const { data: dailyRows, error: errDaily } = await supabase.rpc('get_top_pnl_wallets', {
      p_window: '1d',
      p_limit: TOP_N,
    })

    if (errDaily) {
      console.error('[rotate-pnl-winners] RPC 1d failed:', errDaily)
      return NextResponse.json({ success: false, error: errDaily.message }, { status: 500 })
    }

    const { data: rows7d, error: err7d } = await supabase.rpc('get_top_pnl_wallets', {
      p_window: '7d',
      p_limit: TOP_N,
    })

    if (err7d) {
      console.error('[rotate-pnl-winners] RPC 7d failed:', err7d)
      return NextResponse.json({ success: false, error: err7d.message }, { status: 500 })
    }

    const dailyTraders = (dailyRows ?? []).map((r: { wallet_address: string }) =>
      (r.wallet_address || '').toLowerCase()
    ).filter(Boolean)

    const weeklyTraders = (rows7d ?? []).map((r: { wallet_address: string }) =>
      (r.wallet_address || '').toLowerCase()
    ).filter(Boolean)

    let updated = 0
    for (const wid of DAILY_WALLETS) {
      if (await updateTargetTraders(supabase, wid, dailyTraders)) updated++
    }
    for (const wid of WEEKLY_WALLETS) {
      if (await updateTargetTraders(supabase, wid, weeklyTraders)) updated++
    }

    return NextResponse.json({
      success: true,
      updated_wallets: updated,
      daily: { count: dailyTraders.length, wallets: dailyTraders, targets: DAILY_WALLETS },
      '7d': { count: weeklyTraders.length, wallets: weeklyTraders, targets: WEEKLY_WALLETS },
    })
  } catch (err) {
    console.error('[rotate-pnl-winners] Error:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  const authErr = verifyAuth(request)
  if (authErr) return authErr
  return rotatePnlWinners()
}

export async function POST(request: Request) {
  const authErr = verifyAuth(request)
  if (authErr) return authErr
  return rotatePnlWinners()
}
