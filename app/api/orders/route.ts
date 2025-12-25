import { NextResponse } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { resolveOrdersTableName } from '@/lib/orders/table'
import { normalizeOrderStatus } from '@/lib/orders/normalizeStatus'
import { OrderRow } from '@/lib/orders/types'
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

const marketCacheColumns = 'market_id, title, image_url, is_open, metadata'
const traderProfileColumns = 'trader_id, display_name, avatar_url, wallet_address'
const MARKET_METADATA_FETCH_LIMIT = 32

export async function GET() {
  const supabaseAuth = await createAuthClient()
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser()

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
      'order_id, trader_id, market_id, outcome, side, order_type, time_in_force, price, size, filled_size, remaining_size, status, created_at, updated_at, raw'
    )
    .eq('trader_id', trader.id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (ordersError) {
    console.error('[orders] orders query error', ordersError)
    return NextResponse.json(
      { error: 'Failed to load orders', details: ordersError.message },
      { status: 500 }
    )
  }

  const marketIds = Array.from(
    new Set(
      (orders || [])
        .map((order) => order.market_id)
        .filter(Boolean) as string[]
    )
  )
  const traderIds = Array.from(
    new Set(
      (orders || [])
        .map((order) => order.trader_id)
        .filter(Boolean) as string[]
    )
  )

  const marketRows = await fetchMarketCacheRows(supabase, marketIds)
  const traderRows = await fetchTraderProfiles(supabase, traderIds)
  const marketCacheMap = new Map<string, MarketCacheRow>()
  marketRows.forEach((row) => {
    if (row?.market_id) {
      marketCacheMap.set(row.market_id, row)
    }
  })

  const traderProfileMap = new Map<string, TraderProfileRow>()
  traderRows.forEach((row) => {
    if (row?.trader_id) {
      traderProfileMap.set(row.trader_id, row)
    }
  })

  const marketMetadataMap = await fetchMarketMetadataFromClob(
    [...new Set(marketIds)].filter(Boolean)
  )

  const cacheUpsertMap = new Map<string, MarketCacheUpsertRow>()

  const enrichedOrders: OrderRow[] = (orders || []).map((order) => {
    const marketId = String(order.market_id ?? '')
    const traderId = String(order.trader_id ?? '')
    const cache = marketCacheMap.get(marketId)
    const profile = traderProfileMap.get(traderId)

    const metadata = marketMetadataMap[marketId]
    const marketTitle = getMarketTitle(order, marketId, cache, metadata)
    const marketSubtitle = getMarketSubtitle(order, cache, metadata)
    const marketImageUrl =
      cache?.image_url ??
      metadata?.icon ??
      metadata?.image ??
      extractMarketAvatarUrl(order.raw) ??
      null
    const marketIsOpen = deriveMarketOpenStatus(cache, order.raw)

    const sizeValue = parseNumeric(order.size)
    const filledValue = parseNumeric(order.filled_size)
    const remainingValue = parseNumeric(order.remaining_size)

    const priceValue = parseNumeric(order.price ?? order.raw?.price ?? order.raw?.avg_price)

    const status = normalizeOrderStatus(
      order.raw,
      order.status,
      filledValue,
      sizeValue,
      remainingValue
    )

    if (
      marketId &&
      metadata &&
      !cache?.image_url &&
      (metadata.icon || metadata.image) &&
      !cacheUpsertMap.has(marketId)
    ) {
      cacheUpsertMap.set(marketId, {
        market_id: marketId,
        title: cache?.title ?? metadata.question ?? marketTitle,
        image_url: metadata.icon ?? metadata.image ?? null,
        metadata: metadata.metadataPayload,
      })
    }

    const currentPrice = resolveCurrentPrice(order, metadata)
    const pnlUsd = calculatePnlUsd(order.side, priceValue, currentPrice, filledValue)
    const positionState = resolvePositionState(order.raw)
    const positionStateLabel = getPositionStateLabel(positionState)

    return {
      orderId: String(order.order_id ?? ''),
      status,
      marketId,
      marketTitle,
      marketSubtitle,
      marketImageUrl,
      marketIsOpen,
      traderId,
      traderName: getTraderName(profile, order.raw),
      traderAvatarUrl: profile?.avatar_url ?? extractTraderAvatar(order.raw),
      traderWalletShort:
        formatWalletShort(profile?.wallet_address)
        ?? formatWalletShort(order.raw?.trader?.wallet)
        ?? formatWalletShort(order.raw?.wallet)
        ?? '--',
      side: String(order.side ?? order.raw?.side ?? '').toLowerCase(),
      outcome: order.outcome ?? null,
      size: sizeValue ?? 0,
      filledSize: filledValue ?? 0,
      priceOrAvgPrice: priceValue,
      currentPrice,
      pnlUsd,
      positionState,
      positionStateLabel,
      createdAt: order.created_at ?? new Date().toISOString(),
      updatedAt: order.updated_at ?? order.created_at ?? new Date().toISOString(),
      raw: order.raw ?? null,
    }
  })

  const cacheUpserts = Array.from(cacheUpsertMap.values())
  if (cacheUpserts.length > 0) {
    await supabase
      .from('market_cache')
      .upsert(cacheUpserts, { onConflict: 'market_id' })
  }

  return NextResponse.json({ orders: enrichedOrders })
}

async function fetchMarketCacheRows(client: ReturnType<typeof createServiceClient>, marketIds: string[]) {
  if (marketIds.length === 0) return []
  try {
    const { data } = await client
      .from('market_cache')
      .select(marketCacheColumns)
      .in('market_id', marketIds)
    return data ?? []
  } catch (error) {
    console.warn('[orders] market cache lookup failed', error)
    return []
  }
}

type MarketCacheRow = {
  market_id: string | null
  title: string | null
  image_url: string | null
  is_open: boolean | null
  metadata: Record<string, any> | null
}

async function fetchTraderProfiles(client: ReturnType<typeof createServiceClient>, traderIds: string[]) {
  if (traderIds.length === 0) return []
  try {
    const { data } = await client
      .from('trader_profiles')
      .select(traderProfileColumns)
      .in('trader_id', traderIds)
    return data ?? []
  } catch (error) {
    console.warn('[orders] trader profile lookup failed', error)
    return []
  }
}

type TraderProfileRow = {
  trader_id: string | null
  display_name: string | null
  avatar_url: string | null
  wallet_address: string | null
}

function getMarketTitle(
  order: any,
  marketId: string,
  cache?: MarketCacheRow | undefined,
  metadata?: MarketMetadata
) {
  if (metadata?.question) return metadata.question
  const cachedTitle = cache?.title
  if (cachedTitle) return cachedTitle

  const rawMarket = order.raw?.market ?? order.raw
  const fallbackTitle =
    rawMarket?.title ||
    rawMarket?.market_title ||
    rawMarket?.name ||
    rawMarket?.market ||
    marketId

  return fallbackTitle || 'unknown market'
}

function getMarketSubtitle(
  order: any,
  cache?: MarketCacheRow | undefined,
  metadata?: MarketMetadata
) {
  if (metadata?.slug) return metadata.slug
  const cachedMetadata = cache?.metadata
  const cachedSubtitle =
    cachedMetadata?.subtitle ||
    cachedMetadata?.description ||
    cachedMetadata?.question ||
    cachedMetadata?.text
  if (cachedSubtitle) {
    return String(cachedSubtitle)
  }

  const rawMarket = order.raw?.market ?? order.raw
  const candidate =
    rawMarket?.subtitle ||
    rawMarket?.description ||
    rawMarket?.question ||
    rawMarket?.market_description ||
    rawMarket?.market_question ||
    rawMarket?.text ||
    rawMarket?.summary ||
    rawMarket?.details ||
    ''

  return candidate ? String(candidate) : ''
}

function deriveMarketOpenStatus(cache?: MarketCacheRow, rawOrder?: any) {
  if (cache?.is_open !== undefined && cache.is_open !== null) {
    return cache.is_open
  }

  const rawValue = rawOrder?.market?.is_open ?? rawOrder?.market?.active ?? rawOrder?.is_open
  return parseBoolean(rawValue)
}

function parseBoolean(value: any): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if (['true', '1', 'open'].includes(lower)) return true
    if (['false', '0', 'closed'].includes(lower)) return false
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0
  }
  return null
}

function getTraderName(profile?: TraderProfileRow, rawOrder?: any) {
  const profileName = profile?.display_name
  if (profileName) return profileName
  const rawName =
    rawOrder?.trader?.display_name ??
    rawOrder?.raw_trader_name ??
    rawOrder?.trader_name ??
    rawOrder?.trader?.name
  return rawName || 'unknown trader'
}

function extractTraderAvatar(rawOrder?: any) {
  return rawOrder?.trader?.avatar ?? rawOrder?.trader?.image ?? null
}

function parseNumeric(value: any): number | null {
  if (value === null || value === undefined) return null
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value))
  return Number.isFinite(numericValue) ? numericValue : null
}

function formatWalletShort(address?: string | null) {
  if (!address) return null
  const normalized = address.trim()
  if (normalized.length <= 10) return normalized
  return `${normalized.slice(0, 6)}…${normalized.slice(-4)}`
}

type MarketCacheUpsertRow = {
  market_id: string
  title?: string | null
  image_url?: string | null
  metadata?: Record<string, any> | null
}

type MarketMetadata = {
  icon?: string | null
  image?: string | null
  question?: string | null
  slug?: string | null
  outcomes: string[]
  outcomePrices: number[]
  metadataPayload: Record<string, any> | null
}

async function fetchMarketMetadataFromClob(conditionIds: string[]) {
  const metadataMap: Record<string, MarketMetadata> = {}
  const uniqueIds = Array.from(new Set(conditionIds.filter(Boolean)))

  for (const conditionId of uniqueIds.slice(0, MARKET_METADATA_FETCH_LIMIT)) {
    if (!conditionId || !conditionId.startsWith('0x')) continue
    try {
      const response = await fetch(`https://clob.polymarket.com/markets/${conditionId}`, {
        cache: 'no-store',
      })
      if (!response.ok) continue
      let market: any
      try {
        market = await response.json()
      } catch (error) {
        console.warn('[orders] market metadata parse failed', conditionId, error)
        continue
      }
      const icon =
        typeof market?.icon === 'string' && market.icon.trim()
          ? market.icon.trim()
          : typeof market?.image === 'string' && market.image.trim()
          ? market.image.trim()
          : null
      const image =
        typeof market?.image === 'string' && market.image.trim() ? market.image.trim() : null

      const tokens = Array.isArray(market?.tokens) ? market.tokens : []
      const outcomePairs = tokens
        .map((token: any) => {
          const outcome =
            token?.outcome ??
            token?.name ??
            token?.label ??
            token?.market ??
            token?.token ??
            null
          const price = parseNumeric(token?.price ?? token?.execution_price ?? token?.avg_price)
          return {
            outcome: outcome ? String(outcome) : null,
            price: price,
          }
        })
        .filter((entry: any) => entry.outcome && entry.price !== null)

      const outcomes = outcomePairs.map((entry: any) => entry.outcome!)
      const outcomePrices = outcomePairs.map((entry: any) => entry.price!)

      metadataMap[conditionId] = {
        icon,
        image,
        question: market?.question ?? market?.market_title ?? null,
        slug: market?.market_slug ?? null,
        outcomes,
        outcomePrices,
        metadataPayload: {
          question: market?.question ?? null,
          slug: market?.market_slug ?? null,
          closed: market?.closed ?? null,
          outcomes,
          outcomePrices,
        },
      }
    } catch (error) {
      console.warn('[orders] market metadata fetch failed', conditionId, error)
    }
  }

  return metadataMap
}

function resolveCurrentPrice(order: any, metadata?: MarketMetadata): number | null {
  const normalizedOutcome = String(order?.outcome ?? order?.raw?.outcome ?? '')
    .trim()
    .toLowerCase()

  if (metadata && metadata.outcomes.length > 0 && metadata.outcomePrices.length > 0) {
    if (normalizedOutcome) {
      const matchedIndex = metadata.outcomes.findIndex(
        (outcome) => outcome.toLowerCase() === normalizedOutcome
      )
      const matchedPrice =
        matchedIndex >= 0 ? metadata.outcomePrices[matchedIndex] : undefined
      if (typeof matchedPrice === 'number' && Number.isFinite(matchedPrice)) {
        return matchedPrice
      }
    }
    const fallbackPrice = metadata.outcomePrices.find((price) => Number.isFinite(price))
    if (typeof fallbackPrice === 'number') {
      return fallbackPrice
    }
  }

  return null
}

function calculatePnlUsd(
  side: string | null | undefined,
  entryPrice: number | null,
  currentPrice: number | null,
  filledSize: number | null
): number | null {
  if (
    !Number.isFinite(entryPrice ?? NaN) ||
    !Number.isFinite(currentPrice ?? NaN) ||
    !Number.isFinite(filledSize ?? NaN) ||
    (filledSize ?? 0) === 0
  ) {
    return null
  }
  const normalizedSide = String(side ?? '').trim().toLowerCase()
  const delta =
    normalizedSide === 'sell'
      ? (entryPrice ?? 0) - (currentPrice ?? 0)
      : (currentPrice ?? 0) - (entryPrice ?? 0)
  return delta * (filledSize ?? 0)
}

function resolvePositionState(rawOrder?: any): 'open' | 'closed' | 'unknown' | null {
  const candidates = [
    rawOrder?.position_status,
    rawOrder?.position?.status,
    rawOrder?.raw_position_status,
    rawOrder?.status,
    rawOrder?.market?.status,
  ]

  for (const candidate of candidates) {
    const normalized = normalizePositionStateValue(candidate)
    if (normalized) return normalized
  }

  return null
}

function normalizePositionStateValue(
  value: string | null | undefined
): 'open' | 'closed' | 'unknown' | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (['open', 'active', 'running'].includes(normalized)) return 'open'
  if (['closed', 'resolved', 'settled', 'canceled', 'cancelled'].includes(normalized)) return 'closed'
  return 'unknown'
}

function getPositionStateLabel(state: 'open' | 'closed' | 'unknown' | null): string | null {
  if (!state || state === 'unknown') return null
  return state === 'open' ? 'Position open' : 'Position closed'
}
