import { NextResponse, NextRequest } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { resolveOrdersTableName, type OrdersTableName } from '@/lib/orders/table'
import { normalizeOrderStatus } from '@/lib/orders/normalizeStatus'
import { OrderRow } from '@/lib/orders/types'
import { extractMarketAvatarUrl } from '@/lib/marketAvatar'
import {
  extractTraderNameFromRecord,
  normalizeTraderDisplayName,
} from '@/lib/trader-name'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'

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
const MARKET_METADATA_FETCH_LIMIT = 16
const MARKET_METADATA_FETCH_CONCURRENCY = 4
const MARKET_METADATA_REQUEST_TIMEOUT_MS = 6000

export async function GET(request: NextRequest) {
  try {
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
    let ordersTable: OrdersTableName
    try {
      ordersTable = await resolveOrdersTableName(supabase)
    } catch (tableError) {
      console.error('[orders] failed to resolve table name', tableError)
      return NextResponse.json(
        {
          error: 'Orders service unavailable',
          details: 'Unable to read order metadata',
        },
        { status: 503 }
      )
    }

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

    // Refresh orders from CLOB first (with timeout to avoid blocking)
    // This ensures we have the latest orders in the database
    try {
      const refreshPromise = (async () => {
        try {
          const { client } = await getAuthedClobClientForUser(user.id)
          const openOrders = await client.getOpenOrders({}, true)
          
          // Get trader_id using service client
          const supabaseService = createServiceClient()
          const { data: trader } = await supabaseService
            .from('traders')
            .select('id')
            .eq('wallet_address', walletAddress)
            .maybeSingle()

          if (!trader?.id) return

          const ordersTableForRefresh = await resolveOrdersTableName(supabaseService)
          
          // Fetch full order details for open orders
          const orderDetails = await Promise.allSettled(
            openOrders.slice(0, 20).map(async (order: any) => {
              try {
                const fullOrder: any = await client.getOrder(order.id)
                
                // Extract market_id (condition_id) from tokenId
                const tokenId = fullOrder.token_id || fullOrder.tokenId || fullOrder.asset_id || ''
                const marketId = tokenId.length >= 66 ? tokenId.slice(0, 66) : tokenId
                
                // Try to get outcome from order response
                let outcome = fullOrder.outcome || fullOrder.token?.outcome || null
                
                // If outcome not in order, fetch from market data
                if (!outcome && marketId) {
                  try {
                    const marketResponse = await fetch(
                      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/polymarket/market?conditionId=${marketId}`,
                      { cache: 'no-store' }
                    )
                    if (marketResponse.ok) {
                      const marketData = await marketResponse.json()
                      const tokens = marketData.tokens || []
                      const matchingToken = tokens.find((t: any) => 
                        t.token_id?.toLowerCase() === tokenId.toLowerCase()
                      )
                      if (matchingToken?.outcome) {
                        outcome = matchingToken.outcome
                      }
                    }
                  } catch (error) {
                    // Non-fatal - continue without outcome
                  }
                }
                
                return {
                  order_id: fullOrder.id,
                  trader_id: trader.id,
                  market_id: marketId,
                  outcome: outcome,
                  side: (fullOrder.side || '').toLowerCase(),
                  order_type: fullOrder.order_type || null,
                  time_in_force: fullOrder.order_type || null,
                  price: parseFloat(fullOrder.price || 0),
                  size: parseFloat(fullOrder.original_size || fullOrder.size || 0),
                  filled_size: parseFloat(fullOrder.size_matched || 0),
                  remaining_size: parseFloat((fullOrder.original_size || fullOrder.size || 0) - (fullOrder.size_matched || 0)),
                  status: (fullOrder.status || 'open').toLowerCase(),
                  created_at: fullOrder.created_at ? new Date(fullOrder.created_at).toISOString() : new Date().toISOString(),
                  updated_at: fullOrder.last_update ? new Date(fullOrder.last_update).toISOString() : new Date().toISOString(),
                  raw: fullOrder,
                }
              } catch (error) {
                console.warn('[orders] Failed to fetch order details:', error)
                return null
              }
            })
          )

          const validOrders = orderDetails
            .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled' && result.value !== null)
            .map(result => result.value)

          if (validOrders.length > 0) {
            await supabaseService
              .from(ordersTableForRefresh)
              .upsert(validOrders, { onConflict: 'order_id' })
            console.log('[orders] Refreshed', validOrders.length, 'orders from CLOB')
          }
        } catch (error) {
          // Non-fatal - continue with database query even if refresh fails
          console.warn('[orders] CLOB refresh failed (non-fatal):', error)
        }
      })()

      // Wait up to 2 seconds for refresh, then continue
      await Promise.race([
        refreshPromise,
        new Promise(resolve => setTimeout(resolve, 2000))
      ])
    } catch (error) {
      // Ignore refresh errors, continue with database query
    }

    const { data: trader, error: traderError } = await supabase
      .from('traders')
      .select('id, wallet_address')
      .eq('wallet_address', walletAddress)
      .maybeSingle()

    if (traderError) {
      console.error('[orders] Trader lookup error:', traderError)
    }

    if (!trader?.id) {
      console.warn('[orders] No trader found for wallet:', walletAddress)
      // Check if there are any traders with similar addresses
      const { data: allTraders } = await supabase
        .from('traders')
        .select('id, wallet_address')
        .limit(5)
      console.log('[orders] Available traders:', allTraders)
      return NextResponse.json({ orders: [], walletAddress, debug: 'No trader found' })
    }

    console.log('[orders] Found trader:', { id: trader.id, wallet: trader.wallet_address })

    const { data: accountProfile, error: accountProfileError } = await supabase
      .from('profiles')
      .select('polymarket_username')
      .eq('id', user.id)
      .maybeSingle()

    if (accountProfileError) {
      console.warn('[orders] profile lookup failed', accountProfileError)
    }

    const userPolymarketUsername = accountProfile?.polymarket_username ?? null
    const copiedTraderLookup = await fetchCopiedTraderNames(supabase, user.id)

    const { data: orders, error: ordersError } = await supabase
      .from(ordersTable)
      .select(
        'order_id, trader_id, market_id, outcome, side, order_type, time_in_force, price, size, filled_size, remaining_size, status, created_at, updated_at, raw'
      )
      .eq('trader_id', trader.id)
      .order('created_at', { ascending: false })
      .limit(200)

    console.log('[orders] Query result:', {
      traderId: trader.id,
      ordersCount: orders?.length || 0,
      orderIds: orders?.map(o => o.order_id).slice(0, 5),
      table: ordersTable,
    })

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
    const traderRecords = await fetchTraderRecords(supabase, traderIds)
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

    const traderRecordMap = new Map<string, TraderRecordRow>()
    traderRecords.forEach((row) => {
      if (row?.trader_id) {
        traderRecordMap.set(row.trader_id, row)
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
      const traderRecord = traderRecordMap.get(traderId)
      const traderWallet = resolveTraderWallet(traderRecord, order.raw)
      const metadata = marketMetadataMap[marketId]
      const copiedTraderNameFromWallet =
        traderWallet && copiedTraderLookup.wallet
          ? copiedTraderLookup.wallet.get(traderWallet) ?? null
          : null
      const copiedTraderNameFromMarket = copiedTraderLookup.marketOutcome.get(
        getCopiedTraderKey(marketId, order.outcome)
      )
      const marketTitle = getMarketTitle(order, marketId, cache, metadata)
      const copiedTraderNameFromTitle = copiedTraderLookup.marketTitleOutcome.get(
        getCopiedTraderTitleKey(marketTitle, order.outcome)
      )
      const marketImageUrl =
        cache?.image_url ??
        metadata?.icon ??
        metadata?.image ??
        extractMarketAvatarUrl(order.raw) ??
        null
      const marketIsOpen = deriveMarketOpenStatus(cache, order.raw, metadata)

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

      if (marketId && metadata) {
        const existing = cacheUpsertMap.get(marketId) ?? { market_id: marketId }
        const metadataTitle = metadata.question ?? null
        const needsTitleUpdate = metadataTitle && metadataTitle !== cache?.title
        const needsImageUpdate =
          !cache?.image_url && (metadata.icon || metadata.image)

        if (needsTitleUpdate || needsImageUpdate || metadata.metadataPayload) {
          const upsertPayload: MarketCacheUpsertRow = {
            market_id: marketId,
          }
          if (needsTitleUpdate) {
            upsertPayload.title = metadataTitle
          }
          if (needsImageUpdate) {
            upsertPayload.image_url = metadata.icon ?? metadata.image ?? null
          }
          if (metadata.metadataPayload) {
            upsertPayload.metadata = metadata.metadataPayload
          }
          const parsedMetadataClosed = parseBoolean(metadata.metadataPayload?.closed)
          if (parsedMetadataClosed !== null) {
            upsertPayload.is_open = !parsedMetadataClosed
          }

          cacheUpsertMap.set(marketId, {
            ...existing,
            ...upsertPayload,
          })
        }
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
        marketImageUrl,
        marketIsOpen,
        traderId,
        traderWallet: traderWallet ?? null,
        traderName: getTraderName(
          profile,
          traderRecord,
          order.raw,
          userPolymarketUsername,
          copiedTraderNameFromWallet,
          copiedTraderNameFromMarket,
          copiedTraderNameFromTitle
        ),
        traderAvatarUrl: profile?.avatar_url ?? extractTraderAvatar(order.raw),
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

    return NextResponse.json({ orders: enrichedOrders, walletAddress })
  } catch (error: any) {
    console.error('[orders] fatal error', error)
    const message =
      error?.message ||
      (error?.status === 504
        ? 'Upstream timeout while loading orders'
        : 'Failed to load orders')
    return NextResponse.json(
      { error: 'Orders service unavailable', details: message },
      { status: error?.status === 401 ? 401 : 503 }
    )
  }
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

async function fetchTraderRecords(
  client: ReturnType<typeof createServiceClient>,
  traderIds: string[]
) {
  if (traderIds.length === 0) return []
  try {
    const { data } = await client
      .from('traders')
      .select('id, display_name, wallet_address')
      .in('id', traderIds)
    return (
      (data ?? []).map((row) => ({
        trader_id: row?.id ?? null,
        display_name: row?.display_name ?? null,
        wallet_address: row?.wallet_address ?? null,
      })) ?? []
    )
  } catch (error) {
    console.warn('[orders] trader lookup failed', error)
    return []
  }
}

type CopiedTraderLookup = {
  wallet: Map<string, string>
  marketOutcome: Map<string, string>
  marketTitleOutcome: Map<string, string>
}

function getCopiedTraderKey(marketId: string | null, outcome?: string | null) {
  if (!marketId) return ''
  const outcomePart = outcome?.trim().toLowerCase() ?? ''
  return `${marketId.trim()}|${outcomePart}`
}

function getCopiedTraderTitleKey(marketTitle?: string | null, outcome?: string | null) {
  if (!marketTitle) return ''
  const titlePart = marketTitle.trim()
  if (!titlePart) return ''
  const outcomePart = outcome?.trim().toLowerCase() ?? ''
  return `${titlePart}|${outcomePart}`
}

async function fetchCopiedTraderNames(
  client: ReturnType<typeof createServiceClient>,
  userId: string | null
): Promise<CopiedTraderLookup> {
  if (!userId) {
    return {
      wallet: new Map(),
      marketOutcome: new Map(),
      marketTitleOutcome: new Map(),
    }
  }
  try {
    const { data } = await client
      .from('copied_trades')
      .select('market_id, market_title, outcome, trader_username, trader_wallet')
      .eq('user_id', userId)
      .order('copied_at', { ascending: false })
      .limit(1000)

    const lookup: CopiedTraderLookup = {
      wallet: new Map<string, string>(),
      marketOutcome: new Map<string, string>(),
      marketTitleOutcome: new Map<string, string>(),
    }

    for (const row of data ?? []) {
      const marketId =
        typeof row?.market_id === 'string' && row.market_id.trim()
          ? row.market_id.trim()
          : null
      const outcome =
        typeof row?.outcome === 'string' && row.outcome.trim()
          ? row.outcome.trim().toLowerCase()
          : ''
      const username =
        typeof row?.trader_username === 'string' && row.trader_username.trim()
          ? row.trader_username.trim()
          : null
      const wallet =
        typeof row?.trader_wallet === 'string' && row.trader_wallet.trim()
          ? row.trader_wallet.trim().toLowerCase()
          : null
      const marketTitle =
        typeof row?.market_title === 'string' && row.market_title.trim()
          ? row.market_title.trim()
          : null

      if (wallet && username && !lookup.wallet.has(wallet)) {
        lookup.wallet.set(wallet, username)
      }

      if (marketId && username) {
        const key = `${marketId}|${outcome}`
        if (!lookup.marketOutcome.has(key)) {
          lookup.marketOutcome.set(key, username)
        }
      }
      const titleKey = getCopiedTraderTitleKey(marketTitle, outcome)
      if (titleKey && username && !lookup.marketTitleOutcome.has(titleKey)) {
        lookup.marketTitleOutcome.set(titleKey, username)
      }
    }
    return lookup
  } catch (error) {
    console.warn('[orders] copied_trades lookup failed', error)
    return {
      wallet: new Map(),
      marketOutcome: new Map(),
      marketTitleOutcome: new Map(),
    }
  }
}

type TraderProfileRow = {
  trader_id: string | null
  display_name: string | null
  avatar_url: string | null
  wallet_address: string | null
}

type TraderRecordRow = {
  trader_id: string | null
  display_name: string | null
  wallet_address: string | null
}

type UserProfileRow = {
  polymarket_username: string | null
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

function deriveMarketOpenStatus(cache?: MarketCacheRow, rawOrder?: any, metadata?: MarketMetadata) {
  if (cache?.is_open !== undefined && cache.is_open !== null) {
    return cache.is_open
  }

  const metadataClosed = parseBoolean(metadata?.metadataPayload?.closed)
  if (metadataClosed !== null) {
    return !metadataClosed
  }

  const rawValue =
    rawOrder?.market?.is_open ??
    rawOrder?.market?.active ??
    rawOrder?.market?.status ??
    rawOrder?.market?.state ??
    rawOrder?.is_open
  return parseBoolean(rawValue)
}

function parseBoolean(value: any): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if (['true', '1', 'open', 'active', 'running', 'live'].includes(lower)) return true
    if (['false', '0', 'closed', 'resolved', 'settled', 'canceled', 'cancelled', 'ended'].includes(lower)) return false
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0
  }
  return null
}

function getTraderName(
  profile?: TraderProfileRow,
  traderRecord?: TraderRecordRow,
  rawOrder?: any,
  userProfileName?: string | null,
  copiedTraderWalletName?: string | null,
  copiedTraderMarketName?: string | null,
  copiedTraderMarketTitleName?: string | null
) {
  const mappedWalletName = normalizeTraderDisplayName(copiedTraderWalletName)
  if (mappedWalletName) return mappedWalletName

  const mappedMarketName = normalizeTraderDisplayName(copiedTraderMarketName)
  if (mappedMarketName) return mappedMarketName

  const mappedMarketTitleName = normalizeTraderDisplayName(copiedTraderMarketTitleName)
  if (mappedMarketTitleName) return mappedMarketTitleName

  const profileName = normalizeTraderDisplayName(profile?.display_name ?? null)
  if (profileName) return profileName

  const traderRecordName = normalizeTraderDisplayName(traderRecord?.display_name ?? null)
  if (traderRecordName) return traderRecordName

  const rawName = extractTraderNameFromRecord(rawOrder ?? null)
  if (rawName) return rawName

  const userName = normalizeTraderDisplayName(userProfileName)
  if (userName) return userName

  return 'unknown trader'
}

function normalizeWalletAddress(value?: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed ? trimmed.toLowerCase() : null
}

function resolveTraderWallet(traderRecord?: TraderRecordRow, rawOrder?: any) {
  const candidates: (string | undefined | null)[] = [
    traderRecord?.wallet_address,
    rawOrder?.trader?.wallet_address,
    rawOrder?.trader?.wallet,
    rawOrder?.trader?.address,
    rawOrder?.maker?.wallet_address,
    rawOrder?.maker?.address,
    rawOrder?.maker_address,
    rawOrder?.maker_wallet,
  ]
  for (const candidate of candidates) {
    const normalized = normalizeWalletAddress(candidate ?? undefined)
    if (normalized) return normalized
  }
  return null
}

function extractTraderAvatar(rawOrder?: any) {
  return rawOrder?.trader?.avatar ?? rawOrder?.trader?.image ?? null
}

function parseNumeric(value: any): number | null {
  if (value === null || value === undefined) return null
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value))
  return Number.isFinite(numericValue) ? numericValue : null
}

type MarketCacheUpsertRow = {
  market_id: string
  title?: string | null
  image_url?: string | null
  metadata?: Record<string, any> | null
  is_open?: boolean | null
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

async function fetchWithTimeout(url: string, timeoutMs = MARKET_METADATA_REQUEST_TIMEOUT_MS, options: RequestInit = {}) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}

async function fetchMarketMetadataFromClob(conditionIds: string[]) {
  const metadataMap: Record<string, MarketMetadata> = {}
  const uniqueIds = Array.from(
    new Set(conditionIds.filter(Boolean))
  ).filter((id) => typeof id === 'string' && id.startsWith('0x'))

  const limitedIds = uniqueIds.slice(0, MARKET_METADATA_FETCH_LIMIT)

  for (let i = 0; i < limitedIds.length; i += MARKET_METADATA_FETCH_CONCURRENCY) {
    const chunk = limitedIds.slice(i, i + MARKET_METADATA_FETCH_CONCURRENCY)
    await Promise.allSettled(
      chunk.map(async (conditionId) => {
        if (!conditionId) return
        try {
          const response = await fetchWithTimeout(
            `https://clob.polymarket.com/markets/${conditionId}`,
            MARKET_METADATA_REQUEST_TIMEOUT_MS,
            { cache: 'no-store' }
          )
          if (!response.ok) return
          let market: any
          try {
            market = await response.json()
          } catch (error) {
            console.warn('[orders] market metadata parse failed', conditionId, error)
            return
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
      })
    )
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
