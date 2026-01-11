import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const createService = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )

export async function GET(request: Request) {
  try {
    const supabaseAuth = await createAuthClient()
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser()

    if (authError) {
      console.error('Auth error fetching user for portfolio stats:', authError)
    }

    const user = userData?.user
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const requestedUserId = searchParams.get('userId') || user.id
    if (requestedUserId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = createService()

    // Realized = resolved OR user closed
    const { data: realizedRows, error: realizedError, count: realizedCount } = await supabase
      .from('orders_copy_enriched')
      .select('pnl_usd, invested_usd', { count: 'exact' })
      .eq('copy_user_id', requestedUserId)
      .or('market_resolved.eq.true,user_exit_price.not.is.null')

    if (realizedError) {
      console.error('Error aggregating realized PnL:', realizedError)
      return NextResponse.json({ error: realizedError.message }, { status: 500 })
    }

    // Unrealized = open positions (not resolved, not user closed)
    const { data: openRows, error: openError, count: openCount } = await supabase
      .from('orders_copy_enriched')
      .select('pnl_usd, invested_usd', { count: 'exact' })
      .eq('copy_user_id', requestedUserId)
      .is('market_resolved', false)
      .is('user_exit_price', null)

    if (openError) {
      console.error('Error aggregating unrealized PnL:', openError)
      return NextResponse.json({ error: openError.message }, { status: 500 })
    }

    // Win rate uses resolved/user-closed only
    const { count: winningTrades, error: winError } = await supabase
      .from('orders_copy_enriched')
      .select('order_id', { count: 'exact', head: true })
      .eq('copy_user_id', requestedUserId)
      .or('market_resolved.eq.true,user_exit_price.not.is.null')
      .gt('pnl_usd', 0)

    if (winError) {
      console.error('Error counting winning trades:', winError)
      return NextResponse.json({ error: winError.message }, { status: 500 })
    }

    const { count: totalTrades, error: totalError } = await supabase
      .from('orders_copy_enriched')
      .select('order_id', { count: 'exact', head: true })
      .eq('copy_user_id', requestedUserId)

    if (totalError) {
      console.error('Error counting total trades:', totalError)
      return NextResponse.json({ error: totalError.message }, { status: 500 })
    }

    const realizedPnl = (realizedRows || []).reduce(
      (sum, row: any) => sum + toNumber(row.pnl_usd),
      0
    )
    const unrealizedPnl = (openRows || []).reduce((sum, row: any) => sum + toNumber(row.pnl_usd), 0)
    const realizedInvested = (realizedRows || []).reduce(
      (sum, row: any) => sum + toNumber(row.invested_usd),
      0
    )
    const unrealizedInvested = (openRows || []).reduce(
      (sum, row: any) => sum + toNumber(row.invested_usd),
      0
    )

    const totalPnl = realizedPnl + unrealizedPnl
    const totalVolume = realizedInvested + unrealizedInvested
    const roi = totalVolume > 0 ? (totalPnl / totalVolume) * 100 : 0

    const resolvedTradesCount = toNumber(realizedCount)
    const openTradesCount = toNumber(openCount)
    const winRate =
      resolvedTradesCount > 0 ? (toNumber(winningTrades) / resolvedTradesCount) * 100 : 0

    return NextResponse.json({
      totalPnl,
      realizedPnl,
      unrealizedPnl,
      totalVolume,
      roi,
      winRate,
      totalTrades: toNumber(totalTrades),
      openTrades: openTradesCount,
      closedTrades: resolvedTradesCount,
      freshness: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Unexpected error in /api/portfolio/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
