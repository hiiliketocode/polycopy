import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client'
import { resolveFeatureTier, tierHasPremiumAccess } from '@/lib/feature-tier'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null) return null
  const numeric = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(numeric) ? numeric : null
}

function toIsoTimestamp(value: number | string | null | undefined): string {
  if (value === undefined || value === null) return ''
  const numeric = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(numeric)) return ''
  const ms = numeric < 10_000_000_000 ? numeric * 1000 : numeric
  return new Date(ms).toISOString()
}

function normalizeClobOrder(order: any) {
  const size = toNumber(order?.original_size ?? order?.size) ?? 0
  const filledSizeRaw = toNumber(order?.size_matched ?? order?.filled_size) ?? 0
  const filledSize = filledSizeRaw > size ? size : filledSizeRaw
  const remainingSize = Number.isFinite(size - filledSize) ? Math.max(size - filledSize, 0) : null
  const createdAt = toIsoTimestamp(order?.created_at)
  const updatedAt = toIsoTimestamp(order?.last_update) || createdAt

  return {
    order_id: String(order?.id || ''),
    market_id: String(order?.market || order?.asset_id || ''),
    outcome: order?.outcome ?? null,
    side: String(order?.side || ''),
    order_type: order?.order_type ?? null,
    price: toNumber(order?.price),
    size,
    filled_size: filledSize,
    remaining_size: remainingSize,
    status: String(order?.status || 'open').toLowerCase(),
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

function sortOrdersByCreatedAt(orders: any[]) {
  return orders
    .slice()
    .sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )
}

export async function GET() {
  try {
    const supabaseAuth = await createAuthClient()
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()

    if (authError) {
      console.error('[portfolio] auth error', authError.message)
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_premium, is_admin, premium_since, trading_wallet_address')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('[portfolio] profile query error', profileError)
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
    }

    const featureTier = resolveFeatureTier(true, profile)
    const hasPremiumAccess = tierHasPremiumAccess(featureTier)

    const account = {
      id: user.id,
      email: user.email || null,
      is_premium: Boolean(profile?.is_premium),
      is_admin: Boolean(profile?.is_admin),
      featureTier,
      premium_since: profile?.premium_since || null,
      trading_wallet_address: profile?.trading_wallet_address || null,
      wallet_source: profile?.trading_wallet_address ? 'profile' : null,
      has_clob_credentials: false
    }

    if (!hasPremiumAccess) {
      return NextResponse.json(
        { account, error: 'Premium or admin access required' },
        { status: 403 }
      )
    }

    if (!account.trading_wallet_address) {
      const { data: latestCred } = await supabase
        .from('clob_credentials')
        .select('polymarket_account_address, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestCred?.polymarket_account_address) {
        account.trading_wallet_address = latestCred.polymarket_account_address
        account.wallet_source = 'clob_credentials'
        account.has_clob_credentials = true
      }
    }

    if (!account.trading_wallet_address) {
      return NextResponse.json({
        account,
        trader: null,
        orders: [],
        message: 'No trading wallet connected'
      })
    }

    const wallet = account.trading_wallet_address.toLowerCase()
    const { data: userWallets } = await supabase
      .from('user_wallets')
      .select('id, proxy_wallet, eoa_wallet, clob_enabled')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    const matchedUserWallet = (userWallets || []).find((entry) => {
      const proxy = entry.proxy_wallet?.toLowerCase()
      const eoa = entry.eoa_wallet?.toLowerCase()
      return proxy === wallet || eoa === wallet
    })

    if (matchedUserWallet?.clob_enabled) {
      account.has_clob_credentials = true
    }

    let clobOrders: any[] | null = null
    if (account.has_clob_credentials) {
      try {
        const proxyOverride =
          matchedUserWallet?.proxy_wallet ||
          matchedUserWallet?.eoa_wallet ||
          account.trading_wallet_address ||
          undefined
        const { client } = await getAuthedClobClientForUserAnyWallet(user.id, proxyOverride)
        const openOrders = await client.getOpenOrders({}, true)
        clobOrders = sortOrdersByCreatedAt(openOrders.map(normalizeClobOrder))
      } catch (error) {
        console.error('[portfolio] clob open orders error', error)
      }
    }

    if (matchedUserWallet?.id) {
      if (!account.wallet_source) {
        account.wallet_source = 'user_wallets'
      }

      const { data: orders, error: ordersError } = await supabase
        .from('user_clob_orders')
        .select('order_id, market_id, outcome, side, order_type, price, size, filled_size, remaining_size, status, created_at, updated_at')
        .eq('user_wallet_id', matchedUserWallet.id)
        .order('created_at', { ascending: false })
        .limit(200)

      if (ordersError) {
        console.error('[portfolio] user orders query error', ordersError)
        return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
      }

      const dbOrders = orders || []
      if (clobOrders) {
        const openIds = new Set(clobOrders.map((order) => order.order_id))
        const merged = sortOrdersByCreatedAt([
          ...clobOrders,
          ...dbOrders.filter((order) => !openIds.has(order.order_id)),
        ])
        return NextResponse.json({
          account,
          trader: null,
          orders: merged,
        })
      }

      return NextResponse.json({
        account,
        trader: null,
        orders: dbOrders,
      })
    }

    if (clobOrders && clobOrders.length > 0) {
      return NextResponse.json({
        account,
        trader: null,
        orders: clobOrders,
      })
    }

    const { data: trader, error: traderError } = await supabase
      .from('traders')
      .select('id, wallet_address, display_name')
      .eq('wallet_address', wallet)
      .single()

    if (traderError || !trader) {
      if (traderError) {
        console.error('[portfolio] trader query error', traderError)
      }
      const message =
        account.wallet_source === 'clob_credentials'
          ? 'CLOB credentials linked'
          : 'Trader not found for wallet'
      return NextResponse.json({
        account,
        trader: null,
        orders: [],
        message
      })
    }

    // Query orders table (not trades - trades table is being removed)
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('order_id, market_id, outcome, side, order_type, price, size, filled_size, remaining_size, status, created_at, updated_at')
      .eq('trader_id', trader.id)
      .order('created_at', { ascending: false })
      .limit(200)

    if (ordersError) {
      console.error('[portfolio] orders query error', ordersError)
      return NextResponse.json({ error: 'Failed to load orders' }, { status: 500 })
    }

    return NextResponse.json({
      account,
      trader,
      orders: orders || []
    })
  } catch (error: any) {
    console.error('[portfolio] unexpected error', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
