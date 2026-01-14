import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const createServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params
  const normalizedWallet = wallet?.trim().toLowerCase()

  if (!normalizedWallet) {
    return NextResponse.json({ error: 'Wallet is required' }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('orders_copy_enriched')
      .select(
        [
          'order_id',
          'copied_trade_id',
          'copied_trader_wallet',
          'copied_trader_username',
          'market_id',
          'copied_market_title',
          'market_slug',
          'market_avatar_url',
          'outcome',
          'entry_price',
          'entry_size',
          'invested_usd',
          'current_price',
          'market_resolved',
          'market_resolved_at',
          'resolved_outcome',
          'trader_still_has_position',
          'user_closed_at',
          'user_exit_price',
          'trade_method',
          'side',
          'created_at',
          'price_when_copied',
        ].join(',')
      )
      .eq('copied_trader_wallet', normalizedWallet)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('Error fetching trader copy trades:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    type OrderRow = {
      order_id: string
      copied_trade_id: string | null
      copied_trader_wallet: string | null
      copied_trader_username: string | null
      market_id: string | null
      copied_market_title: string | null
      market_slug: string | null
      market_avatar_url: string | null
      outcome: string | null
      entry_price: number | null
      entry_size: number | null
      invested_usd: number | null
      current_price: number | null
      market_resolved: boolean | null
      market_resolved_at: string | null
      resolved_outcome: string | null
      trader_still_has_position: boolean | null
      user_closed_at: string | null
      user_exit_price: number | null
      trade_method: string | null
      side: string | null
      created_at: string | null
      price_when_copied: number | null
    }

    const trades = ((data as OrderRow[]) || []).map((row) => ({
      id: row.copied_trade_id || row.order_id,
      order_id: row.order_id,
      copied_trade_id: row.copied_trade_id,
      trader_wallet: row.copied_trader_wallet,
      trader_username: row.copied_trader_username,
      market_id: row.market_id,
      market_title: row.copied_market_title,
      market_slug: row.market_slug,
      market_avatar_url: row.market_avatar_url,
      outcome: row.outcome,
      price_when_copied: row.entry_price,
      entry_size: row.entry_size,
      amount_invested: row.invested_usd,
      copied_at: row.created_at,
      trader_still_has_position: row.trader_still_has_position,
      market_resolved: row.market_resolved,
      market_resolved_at: row.market_resolved_at,
      resolved_outcome: row.resolved_outcome,
      user_closed_at: row.user_closed_at,
      user_exit_price: row.user_exit_price,
      trade_method: row.trade_method,
      side: row.side,
      current_price: row.current_price,
    }))

    return NextResponse.json({ trades })
  } catch (error: any) {
    console.error('Unexpected error in trader copy trades route:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}
