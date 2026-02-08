import { NextResponse } from 'next/server'
import { createAdminServiceClient } from '@/lib/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const WALLET_DAILY = 'FT_TOP_DAILY_WINNERS'
const WALLET_7D = 'FT_TOP_7D_WINNERS'
const TOP_N = 10

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

async function rotatePnlWinners(): Promise<Response> {
  const supabase = createAdminServiceClient()

  try {
    // 1. Fetch top 10 by yesterday's realized PnL
    const { data: dailyRows, error: errDaily } = await supabase.rpc('get_top_pnl_wallets', {
      p_window: '1d',
      p_limit: TOP_N,
    })

    if (errDaily) {
      console.error('[rotate-pnl-winners] RPC 1d failed:', errDaily)
      return NextResponse.json(
        { success: false, error: errDaily.message },
        { status: 500 }
      )
    }

    // 2. Fetch top 10 by last 7 days realized PnL
    const { data: rows7d, error: err7d } = await supabase.rpc('get_top_pnl_wallets', {
      p_window: '7d',
      p_limit: TOP_N,
    })

    if (err7d) {
      console.error('[rotate-pnl-winners] RPC 7d failed:', err7d)
      return NextResponse.json(
        { success: false, error: err7d.message },
        { status: 500 }
      )
    }

    const dailyWallets = (dailyRows ?? []).map((r: { wallet_address: string }) =>
      (r.wallet_address || '').toLowerCase()
    ).filter(Boolean)

    const wallets7d = (rows7d ?? []).map((r: { wallet_address: string }) =>
      (r.wallet_address || '').toLowerCase()
    ).filter(Boolean)

    // 3. Update FT_TOP_DAILY_WINNERS
    const { data: walletDaily } = await supabase
      .from('ft_wallets')
      .select('detailed_description')
      .eq('wallet_id', WALLET_DAILY)
      .single()

    if (walletDaily) {
      const prev = (walletDaily.detailed_description && typeof walletDaily.detailed_description === 'string')
        ? (() => {
            try {
              return JSON.parse(walletDaily.detailed_description as string) as Record<string, unknown>
            } catch {
              return {}
            }
          })()
        : {}

      const nextFilters = { ...prev, target_traders: dailyWallets }
      const { error: updDaily } = await supabase
        .from('ft_wallets')
        .update({
          detailed_description: JSON.stringify(nextFilters),
          updated_at: new Date().toISOString(),
        })
        .eq('wallet_id', WALLET_DAILY)

      if (updDaily) {
        console.error('[rotate-pnl-winners] Update daily failed:', updDaily)
      } else {
        console.log(`[rotate-pnl-winners] Updated ${WALLET_DAILY}: ${dailyWallets.length} traders`)
      }
    } else {
      console.warn(`[rotate-pnl-winners] Wallet ${WALLET_DAILY} not found, skipping`)
    }

    // 4. Update FT_TOP_7D_WINNERS
    const { data: wallet7d } = await supabase
      .from('ft_wallets')
      .select('detailed_description')
      .eq('wallet_id', WALLET_7D)
      .single()

    if (wallet7d) {
      const prev = (wallet7d.detailed_description && typeof wallet7d.detailed_description === 'string')
        ? (() => {
            try {
              return JSON.parse(wallet7d.detailed_description as string) as Record<string, unknown>
            } catch {
              return {}
            }
          })()
        : {}

      const nextFilters = { ...prev, target_traders: wallets7d }
      const { error: upd7d } = await supabase
        .from('ft_wallets')
        .update({
          detailed_description: JSON.stringify(nextFilters),
          updated_at: new Date().toISOString(),
        })
        .eq('wallet_id', WALLET_7D)

      if (upd7d) {
        console.error('[rotate-pnl-winners] Update 7d failed:', upd7d)
      } else {
        console.log(`[rotate-pnl-winners] Updated ${WALLET_7D}: ${wallets7d.length} traders`)
      }
    } else {
      console.warn(`[rotate-pnl-winners] Wallet ${WALLET_7D} not found, skipping`)
    }

    return NextResponse.json({
      success: true,
      daily: { count: dailyWallets.length, wallets: dailyWallets },
      '7d': { count: wallets7d.length, wallets: wallets7d },
    })
  } catch (err) {
    console.error('[rotate-pnl-winners] Error:', err)
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
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
