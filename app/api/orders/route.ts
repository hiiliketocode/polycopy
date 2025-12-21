import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

export async function GET() {
  const supabaseAuth = await createAuthClient()
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized', details: authError?.message },
      { status: 401 }
    )
  }

  const supabase = createServiceClient()
  const { data: credential } = await supabase
    .from('clob_credentials')
    .select('polymarket_account_address')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const walletAddress = credential?.polymarket_account_address?.toLowerCase() || null
  if (!walletAddress) {
    return NextResponse.json({ orders: [] })
  }

  const { data: trader } = await supabase
    .from('traders')
    .select('id')
    .eq('wallet_address', walletAddress)
    .maybeSingle()

  if (!trader?.id) {
    return NextResponse.json({ orders: [] })
  }

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('order_id, market_id, outcome, side, order_type, time_in_force, price, size, filled_size, remaining_size, status, created_at, updated_at')
    .eq('trader_id', trader.id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (ordersError) {
    console.error('[orders] orders query error', ordersError)
    return NextResponse.json({ error: 'Failed to load orders', details: ordersError.message }, { status: 500 })
  }

  return NextResponse.json({ orders: orders || [] })
}
