import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { resolveOrdersTableName } from '@/lib/orders/table'
import type { SupabaseClient } from '@supabase/supabase-js'
import { extractMarketAvatarUrl } from '@/lib/marketAvatar'

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
  const ordersTable = await resolveOrdersTableName(supabase)
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
    .from(ordersTable)
    .select(
      'order_id, market_id, outcome, side, order_type, time_in_force, price, size, filled_size, remaining_size, status, created_at, updated_at, raw'
    )
    .eq('trader_id', trader.id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (ordersError) {
    console.error('[orders] orders query error', ordersError)
    return NextResponse.json({ error: 'Failed to load orders', details: ordersError.message }, { status: 500 })
  }

  const uniqueMarketIds = Array.from(
    new Set((orders || []).map((order) => order.market_id).filter(Boolean) as string[])
  )

  const marketIconMap =
    uniqueMarketIds.length > 0
      ? await buildMarketIconMap(supabase, uniqueMarketIds)
      : {}

  const enrichedOrders = (orders || []).map((order) => {
    const marketId = order.market_id
    const iconFromPublic = marketId ? marketIconMap[marketId] : undefined
    const fallbackAvatar = extractMarketAvatarUrl(order.raw)
    return {
      ...order,
      market_avatar_url: iconFromPublic ?? fallbackAvatar ?? null,
    }
  })

  return NextResponse.json({ orders: enrichedOrders })
}

const MARKET_ICON_CHUNK_SIZE = 25

async function buildMarketIconMap(
  client: SupabaseClient,
  marketIds: string[]
): Promise<Record<string, string>> {
  try {
    const [conditionRows, assetRows] = await Promise.all([
      fetchMarketIconRows(client, 'condition_id', marketIds),
      fetchMarketIconRows(client, 'asset', marketIds),
    ])

    const iconMap: Record<string, string> = {}

    function trySetIcon(key: string | null | undefined, icon: string | null | undefined) {
      if (!key || !icon) return
      if (!iconMap[key]) {
        iconMap[key] = icon
      }
    }

    for (const row of [...conditionRows, ...assetRows]) {
      const icon = extractIconFromRaw(row.raw)
      if (!icon) continue
      trySetIcon(row.condition_id, icon)
      trySetIcon(row.asset, icon)
    }

    return iconMap
  } catch (error) {
    console.error('[orders] market icon enrichment failed', error)
    return {}
  }
}

async function fetchMarketIconRows(
  client: SupabaseClient,
  column: 'condition_id' | 'asset',
  marketIds: string[]
) {
  const rows: Array<{
    condition_id: string | null
    asset: string | null
    raw: Record<string, any> | null
  }> = []

  for (let i = 0; i < marketIds.length; i += MARKET_ICON_CHUNK_SIZE) {
    const chunk = marketIds.slice(i, i + MARKET_ICON_CHUNK_SIZE)
    if (chunk.length === 0) continue

    const { data, error } = await client
      .from('trades_public')
      .select('condition_id, asset, raw')
      .in(column, chunk)
      .order('trade_timestamp', { ascending: false })
      .limit(chunk.length * 3)

    if (error) {
      console.warn(`[orders] market icon lookup (${column}) chunk failed`, error.message)
      continue
    }
    if (data) {
      rows.push(...data)
    }
  }

  return rows
}

function extractIconFromRaw(raw: Record<string, any> | null | undefined): string | null {
  if (!raw) return null
  if (typeof raw.icon === 'string' && raw.icon.trim()) {
    return raw.icon
  }
  const nested = raw.market
  if (nested && typeof nested === 'object' && typeof nested.icon === 'string' && nested.icon.trim()) {
    return nested.icon
  }
  return null
}
