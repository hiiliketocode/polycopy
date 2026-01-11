import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
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
      console.error('Auth error fetching user for portfolio trades:', authError)
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

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(
      100,
      Math.max(10, parseInt(searchParams.get('pageSize') || '25', 10))
    )
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const supabase = createService()
    const selectFields = [
      'order_id',
      'copied_trade_id',
      'copy_user_id',
      'copied_trader_wallet',
      'copied_trader_username',
      'trader_profile_image_url',
      'market_id',
      'copied_market_title',
      'market_slug',
      'market_avatar_url',
      'outcome',
      'entry_price',
      'entry_size',
      'invested_usd',
      'exit_price',
      'current_price',
      'pnl_usd',
      'pnl_pct',
      'market_resolved',
      'market_resolved_at',
      'user_exit_price',
      'user_closed_at',
      'resolved_outcome',
      'trader_still_has_position',
      'trade_method',
      'created_at',
    ].join(',')

    const { data, error, count } = await supabase
      .from('orders_copy_enriched')
      .select(selectFields, { count: 'exact' })
      .eq('copy_user_id', requestedUserId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('Error fetching portfolio trades:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const trades = (data || []).map((row) => {
      const entryPrice = toNumber(row.entry_price)
      const exitPrice = toNumber(row.exit_price) ?? toNumber(row.current_price)
      const pnlUsd =
        toNumber(row.pnl_usd) ??
        (entryPrice !== null && exitPrice !== null && toNumber(row.entry_size) !== null
          ? (exitPrice - entryPrice) * (toNumber(row.entry_size) as number)
          : null)

      const roi =
        toNumber(row.pnl_pct) ??
        (entryPrice !== null && exitPrice !== null
          ? ((exitPrice - entryPrice) / entryPrice) * 100
          : null)

      return {
        id: row.copied_trade_id || row.order_id,
        order_id: row.order_id,
        copied_trade_id: row.copied_trade_id,
        trader_wallet: row.copied_trader_wallet,
        trader_username: row.copied_trader_username,
        trader_profile_image_url: row.trader_profile_image_url,
        market_id: row.market_id,
        market_title: row.copied_market_title,
        market_slug: row.market_slug,
        market_avatar_url: row.market_avatar_url,
        outcome: row.outcome,
        price_when_copied: entryPrice,
        entry_size: toNumber(row.entry_size),
        amount_invested: toNumber(row.invested_usd),
        created_at: row.created_at,
        trader_still_has_position: row.trader_still_has_position,
        trader_closed_at: null,
        current_price: exitPrice,
        market_resolved: row.market_resolved,
        market_resolved_at: row.market_resolved_at,
        roi,
        user_closed_at: row.user_closed_at,
        user_exit_price: toNumber(row.user_exit_price),
        resolved_outcome: row.resolved_outcome ?? null,
        trade_method: row.trade_method,
        pnl_usd: pnlUsd,
      }
    })

    const total = count ?? trades.length
    const hasMore = total > to + 1

    return NextResponse.json({
      trades,
      total,
      page,
      pageSize,
      hasMore,
    })
  } catch (error: any) {
    console.error('Unexpected error in /api/portfolio/trades:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
