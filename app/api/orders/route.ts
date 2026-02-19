import { NextResponse, NextRequest } from 'next/server'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { resolveOrdersTableName, type OrdersTableName } from '@/lib/orders/table'
import { normalizeOrderStatus } from '@/lib/orders/normalizeStatus'
import { OrderActivity, OrderRow, OrderStatus } from '@/lib/orders/types'
import { extractMarketAvatarUrl } from '@/lib/marketAvatar'
import {
  extractTraderNameFromRecord,
  normalizeTraderDisplayName,
} from '@/lib/trader-name'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'
import { getAppBaseUrl } from '@/lib/app-url'

function normalizeOrderType(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function isGtcOrder(value: unknown): boolean {
  const normalized = normalizeOrderType(value)
  return (
    normalized === 'gtc' ||
    normalized === 'good_til_cancelled' ||
    normalized === 'good_til_canceled' ||
    normalized === 'good til cancelled' ||
    normalized === 'good til canceled'
  )
}

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
      return NextResponse.json({ orders: [], openOrderIds: [], openOrdersFetched: false })
    }

    // Track the set of open order ids returned by CLOB so the client can filter to truly-pending orders
    let clobOpenOrderIds: string[] | null = null
    let clobOpenOrdersFetched = false

    // Refresh orders from CLOB first (with timeout to avoid blocking)
    // This ensures we have the latest orders in the database
    try {
      const refreshPromise = (async () => {
        try {
          const { client } = await getAuthedClobClientForUser(user.id)
          const openOrders = await client.getOpenOrders({}, true)
          clobOpenOrdersFetched = true
          clobOpenOrderIds = Array.isArray(openOrders)
            ? openOrders
                .map((order: any) => (typeof order?.id === 'string' ? order.id.trim().toLowerCase() : null))
                .filter((id): id is string => Boolean(id))
            : []
          
          // Get trader_id using service client
          const supabaseService = createServiceClient()
          const { data: trader } = await supabaseService
            .from('traders')
            .select('id')
            .eq('wallet_address', walletAddress)
            .maybeSingle()

          if (!trader?.id) return

          const ordersTableForRefresh = await resolveOrdersTableName(supabaseService)

          // Check if this user has an active bot strategy so CLOB-refreshed orders
          // inherit bot attribution (Polymarket returns different order IDs for the
          // same trade on POST vs GET, creating duplicate rows without lt_strategy_id)
          let activeBotStrategyId: string | null = null
          try {
            const { data: strat } = await supabaseService
              .from('lt_strategies')
              .select('strategy_id')
              .eq('user_id', user.id)
              .eq('status', 'active')
              .limit(1)
              .maybeSingle()
            activeBotStrategyId = strat?.strategy_id ?? null
          } catch { /* non-fatal */ }

          // Fetch full order details for open orders
          const orderDetails = await Promise.allSettled(
            openOrders.slice(0, 20).map(async (order: any) => {
              try {
                const fullOrder: any = await client.getOrder(order.id)
                
                // Extract market_id (condition_id) — prefer the CLOB's `market` or
                // `condition_id` field which is the actual hex condition_id.
                // Fallback: derive from asset_id/token_id only as a last resort.
                const rawConditionId =
                  fullOrder.market ||
                  fullOrder.condition_id ||
                  fullOrder.conditionId ||
                  fullOrder.market_id ||
                  fullOrder.marketId ||
                  null
                const tokenId = fullOrder.asset_id || fullOrder.token_id || fullOrder.tokenId || ''
                const marketId = rawConditionId
                  ? String(rawConditionId).trim()
                  : tokenId
                
                // Try to get outcome from order response
                let outcome = fullOrder.outcome || fullOrder.token?.outcome || null
                
                // If outcome not in order, fetch from market data
                if (!outcome && marketId) {
                  try {
                    const marketResponse = await fetch(
                      `${(await import('@/lib/app-url')).getAppBaseUrl()}/api/polymarket/market?conditionId=${marketId}`,
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
                
                const originalSize = Number(fullOrder.original_size || fullOrder.size || 0)
                const sizeMatchedRaw = Number(fullOrder.size_matched || 0)
                const sizeMatched = sizeMatchedRaw > originalSize ? originalSize : sizeMatchedRaw
                const remainingSize = Math.max(originalSize - sizeMatched, 0)

                const timeInForce =
                  fullOrder.time_in_force ||
                  fullOrder.timeInForce ||
                  fullOrder.order_type ||
                  fullOrder.orderType ||
                  null

                const orderRow: Record<string, any> = {
                  order_id: fullOrder.id,
                  trader_id: trader.id,
                  market_id: marketId,
                  outcome: outcome,
                  side: (fullOrder.side || '').toLowerCase(),
                  order_type: fullOrder.order_type || null,
                  time_in_force: timeInForce ? String(timeInForce).toUpperCase() : null,
                  price: Number(fullOrder.price || 0),
                  size: originalSize,
                  filled_size: sizeMatched,
                  remaining_size: remainingSize,
                  status: (fullOrder.status || 'open').toLowerCase(),
                  created_at: fullOrder.created_at ? new Date(fullOrder.created_at).toISOString() : new Date().toISOString(),
                  updated_at: fullOrder.last_update ? new Date(fullOrder.last_update).toISOString() : new Date().toISOString(),
                  raw: fullOrder,
                }
                if (activeBotStrategyId) {
                  orderRow.lt_strategy_id = activeBotStrategyId
                  orderRow.copy_user_id = user.id
                }
                return orderRow
              } catch (error) {
                console.warn('[orders] Failed to fetch order details:', error)
                return null
              }
            })
          )

          const validOrders = orderDetails
            .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled' && result.value !== null)
            .map(result => result.value)

          const filteredValidOrders = validOrders.filter((order) => {
            const status = String(order?.status || '').toLowerCase()
            const filled = Number(order?.filled_size || 0)
            const orderType = order?.time_in_force || order?.order_type || ''
            const openLikeStatuses = new Set(['open', 'pending', 'submitted', 'accepted', 'unknown'])
            if (openLikeStatuses.has(status) && filled <= 0 && !isGtcOrder(orderType)) {
              return false
            }
            return true
          })

          if (filteredValidOrders.length > 0) {
            await supabaseService
              .from(ordersTableForRefresh)
              .upsert(filteredValidOrders, { onConflict: 'order_id' })
            console.log('[orders] Refreshed', filteredValidOrders.length, 'orders from CLOB')
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
    const copiedTraderLookup = await fetchCopiedTraderNames(supabase, ordersTable, user.id)

    let ordersResult = await fetchOrdersForTrader(
      supabase,
      ordersTable,
      trader.id
    )

    if (ordersResult.error) {
      console.error('[orders] orders query error', ordersResult.error)
      return NextResponse.json(
        { error: 'Failed to load orders', details: ordersResult.error.message },
        { status: 500 }
      )
    }

    const ordersList = ordersResult.data || []
    const clobOrderIdsForSet: string[] = Array.isArray(clobOpenOrderIds) ? clobOpenOrderIds : []
    const clobOpenSet =
      clobOrderIdsForSet.length > 0
        ? new Set(clobOrderIdsForSet.map((id) => id.trim().toLowerCase()))
        : null
    const autoCloseOrderIds = new Set<string>()
    for (const order of ordersList as any[]) {
      const autoCloseId = typeof order?.auto_close_order_id === 'string' ? order.auto_close_order_id.trim() : ''
      if (autoCloseId) {
        autoCloseOrderIds.add(autoCloseId.toLowerCase())
      }
    }
    
    console.log('[orders] Query result:', {
      traderId: trader.id,
      ordersCount: ordersList.length,
      orderIds: ordersList.map((o: any) => o.order_id).slice(0, 5),
      table: ordersTable,
    })

    const marketIds = Array.from(
      new Set(
        ordersList
          .map((order: any) => resolveOrderMarketId(order))
          .filter(Boolean) as string[]
      )
    )
    const traderIds = Array.from(
      new Set(
        ordersList
          .map((order: any) => order.trader_id)
          .filter(Boolean) as string[]
      )
    )
    const copiedTraderIdsFromOrders = Array.from(
      new Set(
        ordersList
          .map((order: any) => order.copied_trader_id)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      )
    )
    const copiedTraderWalletsFromOrders = Array.from(
      new Set(
        ordersList
          .map((order: any) => order.copied_trader_wallet)
          .filter((wallet): wallet is string => typeof wallet === 'string' && wallet.trim().length > 0)
      )
    )
    const copiedTraderWallets = Array.from(
      new Set([...copiedTraderLookup.wallet.keys(), ...copiedTraderWalletsFromOrders.map((w) => w.toLowerCase())])
    )

    const marketRows = await fetchMarketCacheRows(supabase, marketIds)
    const traderRecords = await fetchTraderRecords(supabase, [
      ...traderIds,
      ...copiedTraderIdsFromOrders,
    ])
    const copiedTraderRecords = await fetchTraderRecordsByWallets(supabase, copiedTraderWallets)
    const copiedTraderIds = copiedTraderRecords
      .map((row) => row.trader_id)
      .filter((id): id is string => Boolean(id))
    const traderIdsForProfiles = Array.from(
      new Set([...traderIds, ...copiedTraderIds, ...copiedTraderIdsFromOrders])
    )
    const traderRows = await fetchTraderProfiles(supabase, traderIdsForProfiles)
    const marketCacheMap = new Map<string, MarketCacheRow>()
    marketRows.forEach((row) => {
      if (row?.market_id) {
        marketCacheMap.set(row.market_id, row)
      }
    })

    // Only fetch fresh metadata for markets that are missing a name or icon in cache
    const marketIdsNeedingMetadata = marketIds.filter((id) => {
      const cache = marketCacheMap.get(id)
      if (!cache) return true
      const cachedMeta = cache.metadata
      const hasTitle = Boolean(
        cache.title ||
          cachedMeta?.question ||
          cachedMeta?.market_title ||
          cachedMeta?.title ||
          cachedMeta?.name
      )
      const hasImage = Boolean(
        cache.image_url ||
          cachedMeta?.icon ||
          cachedMeta?.image ||
          cachedMeta?.market_image ||
          cachedMeta?.market_icon
      )
      return !hasTitle || !hasImage
    })

    const allIdsForMetadata = (marketIdsNeedingMetadata.length > 0 ? marketIdsNeedingMetadata : marketIds).filter(Boolean)
    const marketMetadataMap = await fetchMarketMetadataFromGamma(allIdsForMetadata)
    // Gamma skips markets where it returns wrong conditionId. Ensure ALL requested
    // market IDs are in the map (even as empty stubs) so CLOB/Price API enrichment
    // fills them in. Without this, skipped markets get no prices at all.
    for (const id of allIdsForMetadata) {
      if (!marketMetadataMap[id]) {
        marketMetadataMap[id] = {
          icon: null, image: null, question: null, slug: null,
          outcomes: [], outcomePrices: [], tokens: [],
          closed: null, resolved: null, acceptingOrders: null,
          metadataPayload: null,
        }
      }
    }
    await enrichMetadataWithClobPricesWhenNeeded(marketMetadataMap)
    await enrichMetadataFromPriceApiWhenPlaceholder(marketMetadataMap)

    const traderProfileMap = new Map<string, TraderProfileRow>()
    traderRows.forEach((row) => {
      if (row?.trader_id) {
        traderProfileMap.set(row.trader_id, row)
      }
    })

    const traderRecordMap = new Map<string, TraderRecordRow>()
    const traderRecordByWallet = new Map<string, TraderRecordRow>()
    ;[...traderRecords, ...copiedTraderRecords].forEach((row) => {
      if (row?.trader_id) {
        traderRecordMap.set(row.trader_id, row)
      }
      const normalizedWallet = normalizeWalletAddress(row?.wallet_address)
      if (normalizedWallet) {
        traderRecordByWallet.set(normalizedWallet, row)
      }
    })

    const cacheUpsertMap = new Map<string, MarketCacheUpsertRow>()

    const enrichedOrders: OrderRow[] = (ordersList as any[]).map((order: any) => {
      const orderId = String(order.order_id ?? '')
      const marketId = resolveOrderMarketId(order)
      const traderId = String(order.trader_id ?? '')
      const copiedTraderIdFromRow =
        typeof order.copied_trader_id === 'string' && order.copied_trader_id.trim()
          ? order.copied_trader_id.trim()
          : null
      const copiedTraderWallet = normalizeWalletAddress(
        order.copied_trader_wallet ?? order.raw?.copied_trader_wallet ?? null
      )
      const cache = marketCacheMap.get(marketId)
      const profile = traderProfileMap.get(traderId)
      const traderRecord = traderRecordMap.get(traderId)
      const traderWallet = resolveTraderWallet(traderRecord, order.raw)
      const metadata = marketMetadataMap[marketId]
      const marketTitle = getMarketTitle(order, marketId, cache, metadata)
      const copiedTrader = resolveCopiedTraderForOrder(
        copiedTraderLookup,
        marketId || extractRawMarketId(order),
        marketTitle,
        order.outcome,
        metadata,
        order.raw,
        copiedTraderIdFromRow,
        copiedTraderWallet
      )
      const resolvedTraderWallet = copiedTrader?.wallet ?? copiedTraderWallet ?? traderWallet
      const resolvedTraderRecord =
        (resolvedTraderWallet && traderRecordByWallet.get(resolvedTraderWallet)) ??
        (copiedTraderIdFromRow ? traderRecordMap.get(copiedTraderIdFromRow) : null) ??
        traderRecord
      const resolvedProfile = resolvedTraderRecord && typeof resolvedTraderRecord === 'object' && resolvedTraderRecord.trader_id
        ? traderProfileMap.get(resolvedTraderRecord.trader_id)
        : profile
      const copiedTraderFromWallet =
        resolvedTraderWallet && copiedTraderLookup.wallet
          ? copiedTraderLookup.wallet.get(resolvedTraderWallet) ?? null
          : null
      const copiedTraderFromMarket = copiedTraderLookup.marketOutcome.get(
        getCopiedTraderKey(marketId, order.outcome)
      )
      const copiedTraderFromTitle = copiedTraderLookup.marketTitleOutcome.get(
        getCopiedTraderTitleKey(marketTitle, order.outcome)
      )
      const copiedDirectName =
        copiedTrader?.username ??
        copiedTraderFromWallet?.username ??
        copiedTraderFromMarket?.username ??
        copiedTraderFromTitle?.username ??
        null
      const hasCopiedData =
        Boolean(
          copiedTraderIdFromRow ||
            copiedTraderWallet ||
            copiedTrader ||
            copiedTraderFromWallet ||
            copiedTraderFromMarket ||
            copiedTraderFromTitle ||
            copiedDirectName
        )
      const copiedProfileName = hasCopiedData
        ? normalizeTraderDisplayName(
            (resolvedProfile ?? profile)?.display_name ?? 
            (resolvedTraderRecord && typeof resolvedTraderRecord === 'object' ? resolvedTraderRecord.display_name : null) ?? null
          )
        : null
      const traderNameForDisplay =
        copiedDirectName ??
        copiedProfileName ??
        formatWalletDisplay(resolvedTraderWallet) ??
        formatWalletDisplay(copiedTraderWallet) ??
        formatWalletDisplay(traderWallet) ??
        ''
      const marketImageUrl =
        cache?.image_url ??
        metadata?.icon ??
        metadata?.image ??
        extractMarketAvatarUrl(order.raw) ??
        null
      const marketIsOpen = deriveMarketOpenStatus(cache, order.raw, metadata)

      const rawMarketForSlug = order.raw?.market ?? order.raw
      const metadataSlug =
        typeof metadata?.slug === 'string' && metadata.slug.trim()
          ? metadata.slug.trim()
          : null
      const fallbackSlug =
        typeof metadata?.metadataPayload?.slug === 'string' && metadata.metadataPayload.slug.trim()
          ? metadata.metadataPayload.slug.trim()
          : null
      const rawSlug =
        metadataSlug ||
        fallbackSlug ||
        (typeof rawMarketForSlug?.slug === 'string' && rawMarketForSlug.slug.trim()
          ? rawMarketForSlug.slug.trim()
          : null) ||
        (typeof rawMarketForSlug?.market_slug === 'string' && rawMarketForSlug.market_slug.trim()
          ? rawMarketForSlug.market_slug.trim()
          : null) ||
        (typeof rawMarketForSlug?.market?.slug === 'string' && rawMarketForSlug.market.slug.trim()
          ? rawMarketForSlug.market.slug.trim()
          : null) ||
        (typeof rawMarketForSlug?.market?.market_slug === 'string' &&
        rawMarketForSlug.market.market_slug.trim()
          ? rawMarketForSlug.market.market_slug.trim()
          : null)
      const normalizedSlug = rawSlug
        ? rawSlug.trim()
        : null

      const sizeValue = parseNumeric(order.size)
      const filledValueRaw = parseNumeric(order.filled_size)
      const filledValue =
        Number.isFinite(sizeValue ?? NaN) && Number.isFinite(filledValueRaw ?? NaN)
          ? Math.min(filledValueRaw as number, sizeValue as number)
          : filledValueRaw
      const remainingValue = parseNumeric(order.remaining_size)

      const priceValue = parseNumeric(order.price ?? order.raw?.price ?? order.raw?.avg_price)

      const rawStatus =
        typeof order.status === 'string' ? order.status.trim().toLowerCase() : null
      const statusForLogic = normalizeOrderStatus(
        order.raw,
        rawStatus,
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
      const side = String(order.side ?? order.raw?.side ?? '').toLowerCase()
      const pnlUsd = calculatePnlUsd(side, priceValue, currentPrice, filledValue)
      const positionState = resolvePositionState(order.raw)
      const positionStateLabel = getPositionStateLabel(positionState)
      const activity = deriveOrderActivity(order.raw, statusForLogic, side, positionState, pnlUsd)
      const isAutoClose = autoCloseOrderIds.has(orderId.toLowerCase())
      const marketResolved =
        parseBoolean(
          order.market_resolved ??
            order.raw?.market_resolved ??
            order.raw?.market?.resolved ??
            order.raw?.resolved
        ) ?? null

      return {
        orderId,
        status: statusForLogic,
        activity: activity.activity,
        activityLabel: activity.activityLabel,
        activityIcon: activity.activityIcon,
        marketId,
        marketTitle,
        marketImageUrl,
        marketIsOpen,
        marketSlug: normalizedSlug ?? null,
        traderId: (resolvedTraderRecord && typeof resolvedTraderRecord === 'object' ? resolvedTraderRecord.trader_id : null) ?? copiedTraderIdFromRow ?? traderId,
        traderWallet: resolvedTraderWallet ?? null,
        copiedTraderId: copiedTraderIdFromRow ?? (resolvedTraderRecord && typeof resolvedTraderRecord === 'object' ? resolvedTraderRecord.trader_id : null) ?? null,
        copiedTraderWallet: resolvedTraderWallet ?? copiedTraderWallet ?? null,
        traderName: traderNameForDisplay,
        traderAvatarUrl:
          (resolvedProfile ?? profile)?.avatar_url ?? extractTraderAvatar(order.raw),
        side,
        outcome: order.outcome ?? null,
        size: sizeValue ?? 0,
        filledSize: filledValue ?? 0,
        priceOrAvgPrice: priceValue,
        currentPrice,
        pnlUsd,
        positionState,
        positionStateLabel,
        marketResolved,
        createdAt: order.created_at ?? new Date().toISOString(),
        updatedAt: order.updated_at ?? order.created_at ?? new Date().toISOString(),
        raw: order.raw ?? null,
        isAutoClose,
        ltStrategyId: order.lt_strategy_id ?? null,
      }
    })

    const cacheUpserts = Array.from(cacheUpsertMap.values())
    if (cacheUpserts.length > 0) {
      await supabase
        .from('market_cache')
        .upsert(cacheUpserts, { onConflict: 'market_id' })
    }

    return NextResponse.json({
      orders: enrichedOrders,
      walletAddress,
      openOrderIds: clobOpenOrderIds ?? [],
      openOrdersFetched: clobOpenOrdersFetched,
    })
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

async function fetchTraderRecordsByWallets(
  client: ReturnType<typeof createServiceClient>,
  wallets: string[]
) {
  const normalizedWallets = Array.from(
    new Set(
      wallets
        .map((wallet) => normalizeWalletAddress(wallet))
        .filter((wallet): wallet is string => Boolean(wallet))
    )
  )
  if (normalizedWallets.length === 0) return []
  try {
    const { data } = await client
      .from('traders')
      .select('id, display_name, wallet_address')
      .in('wallet_address', normalizedWallets)
    return (
      (data ?? []).map((row) => ({
        trader_id: row?.id ?? null,
        display_name: row?.display_name ?? null,
        wallet_address: row?.wallet_address ?? null,
      })) ?? []
    )
  } catch (error) {
    console.warn('[orders] trader lookup by wallet failed', error)
    return []
  }
}

function extractRawMarketId(order: any): string | null {
  // Only consider fields that represent condition_ids (market identifiers),
  // NOT asset_id / token_id which are ERC-1155 token identifiers.
  const candidates = [
    order?.market_id,
    order?.condition_id,
    order?.conditionId,
    order?.market,
    order?.raw?.market_id,
    order?.raw?.condition_id,
    order?.raw?.conditionId,
    order?.raw?.market,
    order?.raw?.market?.condition_id,
    order?.raw?.market?.conditionId,
  ]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (trimmed) return trimmed
  }
  return null
}

function resolveOrderMarketId(order: any): string {
  // Prefer explicit condition_id / market fields (hex condition ids)
  // over asset_id / token_id (ERC-1155 token identifiers) which are NOT condition ids.
  const normalized = deriveConditionIdFromCandidates([
    order?.market_id,
    order?.condition_id,
    order?.conditionId,
    order?.market,
    order?.raw?.market_id,
    order?.raw?.condition_id,
    order?.raw?.conditionId,
    order?.raw?.market,
    order?.raw?.market?.condition_id,
    order?.raw?.market?.conditionId,
  ])
  if (normalized) return normalized
  return extractRawMarketId(order) ?? ''
}

function deriveConditionIdFromCandidates(candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    const normalized = normalizeConditionId(trimmed)
    if (normalized) return normalized
  }
  return null
}

function normalizeConditionId(value: string): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const hasHexPrefix = trimmed.slice(0, 2).toLowerCase() === '0x'
  if (hasHexPrefix) {
    const hexBody = trimmed.slice(2)
    if (hexBody.length >= 64 && /^[0-9a-fA-F]+$/.test(hexBody)) {
      return `0x${hexBody.slice(0, 64).toLowerCase()}`
    }
    return null
  }
  if (/^\d+$/.test(trimmed)) {
    try {
      const numeric = BigInt(trimmed)
      if (numeric < 0n) return null
      const hex = numeric.toString(16).padStart(64, '0')
      return `0x${hex}`
    } catch {
      return null
    }
  }
  const bareHexMatch = trimmed.match(/^[0-9a-fA-F]{64,}$/)
  if (bareHexMatch) {
    return `0x${trimmed.slice(0, 64).toLowerCase()}`
  }
  return null
}

type CopiedTraderDetails = {
  id?: string | null
  username: string | null
  wallet: string | null
}

type CopiedTraderLookup = {
  wallet: Map<string, CopiedTraderDetails>
  marketOutcome: Map<string, CopiedTraderDetails>
  marketSlugOutcome: Map<string, CopiedTraderDetails>
  marketTitleOutcome: Map<string, CopiedTraderDetails>
}

function normalizeOutcome(value?: string | null) {
  return value ? value.trim().toLowerCase() : ''
}

function normalizeMarketKey(value?: string | null) {
  if (!value) return ''
  return value.trim().toLowerCase()
}

function normalizeMarketTitle(value?: string | null) {
  if (!value) return ''
  return value.trim().toLowerCase()
}

function getCopiedTraderKey(marketId: string | null, outcome?: string | null) {
  const normalizedMarketId = normalizeMarketKey(marketId)
  if (!normalizedMarketId) return ''
  const outcomePart = normalizeOutcome(outcome)
  return `${normalizedMarketId}|${outcomePart}`
}

function getCopiedTraderSlugKey(marketSlug?: string | null, outcome?: string | null) {
  const normalizedSlug = normalizeMarketTitle(marketSlug)
  if (!normalizedSlug) return ''
  const outcomePart = normalizeOutcome(outcome)
  return `${normalizedSlug}|${outcomePart}`
}

function getCopiedTraderTitleKey(marketTitle?: string | null, outcome?: string | null) {
  const normalizedTitle = normalizeMarketTitle(marketTitle)
  if (!normalizedTitle) return ''
  const outcomePart = normalizeOutcome(outcome)
  return `${normalizedTitle}|${outcomePart}`
}

async function fetchCopiedTraderNames(
  client: ReturnType<typeof createServiceClient>,
  ordersTable: OrdersTableName,
  userId: string | null
): Promise<CopiedTraderLookup> {
  if (!userId) {
    return {
      wallet: new Map<string, CopiedTraderDetails>(),
      marketOutcome: new Map<string, CopiedTraderDetails>(),
      marketSlugOutcome: new Map<string, CopiedTraderDetails>(),
      marketTitleOutcome: new Map<string, CopiedTraderDetails>(),
    }
  }
  try {
    const { data } = await client
      .from(ordersTable)
      .select(
        'market_id, copied_market_title, market_slug, outcome, copied_trader_username, copied_trader_wallet, created_at'
      )
      .eq('copy_user_id', userId)
      .not('copied_trade_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000)

    const lookup: CopiedTraderLookup = {
      wallet: new Map<string, CopiedTraderDetails>(),
      marketOutcome: new Map<string, CopiedTraderDetails>(),
      marketSlugOutcome: new Map<string, CopiedTraderDetails>(),
      marketTitleOutcome: new Map<string, CopiedTraderDetails>(),
    }

    for (const row of data ?? []) {
      const marketId =
        typeof row?.market_id === 'string' && row.market_id.trim()
          ? row.market_id.trim()
          : null
      const marketSlug =
        typeof row?.market_slug === 'string' && row.market_slug.trim()
          ? row.market_slug.trim()
          : null
      const outcome = typeof row?.outcome === 'string' ? row.outcome : ''
      const username =
        typeof row?.copied_trader_username === 'string' && row.copied_trader_username.trim()
          ? row.copied_trader_username.trim()
          : null
      const wallet = normalizeWalletAddress(row?.copied_trader_wallet ?? null)
      const marketTitle =
        typeof row?.copied_market_title === 'string' && row.copied_market_title.trim()
          ? row.copied_market_title.trim()
          : null

      const details: CopiedTraderDetails = {
        id: null,
        username: normalizeTraderDisplayName(username),
        wallet,
      }

      if (wallet && !lookup.wallet.has(wallet)) {
        lookup.wallet.set(wallet, details)
      }

      const marketKey = getCopiedTraderKey(marketId, outcome)
      if (marketKey && !lookup.marketOutcome.has(marketKey)) {
        lookup.marketOutcome.set(marketKey, details)
      }

      const slugKey = getCopiedTraderSlugKey(marketSlug, outcome)
      if (slugKey && !lookup.marketSlugOutcome.has(slugKey)) {
        lookup.marketSlugOutcome.set(slugKey, details)
      }

      const titleKey = getCopiedTraderTitleKey(marketTitle, outcome)
      if (titleKey && !lookup.marketTitleOutcome.has(titleKey)) {
        lookup.marketTitleOutcome.set(titleKey, details)
      }
    }
    return lookup
  } catch (error) {
    console.warn('[orders] copy metadata lookup failed', error)
    return {
      wallet: new Map<string, CopiedTraderDetails>(),
      marketOutcome: new Map<string, CopiedTraderDetails>(),
      marketSlugOutcome: new Map<string, CopiedTraderDetails>(),
      marketTitleOutcome: new Map<string, CopiedTraderDetails>(),
    }
  }
}

function resolveCopiedTraderForOrder(
  lookup: CopiedTraderLookup,
  marketId: string | null,
  marketTitle: string | null,
  outcome: string | null,
  metadata?: MarketMetadata,
  rawOrder?: any,
  copiedTraderIdFromRow?: string | null,
  copiedTraderWalletFromRow?: string | null
): CopiedTraderDetails | null {
  const copiedName = normalizeTraderDisplayName(
    rawOrder?.copied_trader_username ??
      rawOrder?.raw?.copied_trader_username ??
      rawOrder?.copiedTraderUsername ??
      rawOrder?.raw?.copiedTraderUsername ??
      rawOrder?.copied_trader_display_name ??
      rawOrder?.copied_trader_name
  )
  const traderName = normalizeTraderDisplayName(
    rawOrder?.trader_username ?? rawOrder?.trader?.username ?? rawOrder?.trader?.display_name
  )
  const hasExplicitCopiedTrader = Boolean(copiedTraderIdFromRow || copiedTraderWalletFromRow)
  const fallbackName = copiedName ?? (hasExplicitCopiedTrader ? null : traderName ?? null)
  const normalizedOutcome = normalizeOutcome(outcome ?? rawOrder?.outcome ?? rawOrder?.raw?.outcome)
  const normalizedMarketId = normalizeMarketKey(marketId)
  const withOverrides = (details: CopiedTraderDetails | null): CopiedTraderDetails | null => {
    if (!details) return null
    return {
      id: copiedTraderIdFromRow ?? details.id ?? null,
      wallet: copiedTraderWalletFromRow ?? details.wallet ?? null,
      username: details.username ?? fallbackName ?? null,
    }
  }

  if (normalizedMarketId) {
    const marketMatch = lookup.marketOutcome.get(
      getCopiedTraderKey(normalizedMarketId, normalizedOutcome)
    )
    if (marketMatch) return withOverrides(marketMatch)
  }

  const slugCandidates = [
    metadata?.slug,
    metadata?.metadataPayload?.slug,
    rawOrder?.market_slug,
    rawOrder?.market?.slug,
    rawOrder?.market?.market_slug,
  ]
  for (const slug of slugCandidates) {
    const slugKey = getCopiedTraderSlugKey(slug, normalizedOutcome)
    if (!slugKey) continue
    const match = lookup.marketSlugOutcome.get(slugKey)
    if (match) return withOverrides(match)
  }

  const titleCandidates = [
    marketTitle,
    metadata?.question,
    rawOrder?.market?.market_title,
    rawOrder?.market?.title,
    rawOrder?.market?.name,
  ].filter(Boolean) as string[]

  for (const title of titleCandidates) {
    const titleKey = getCopiedTraderTitleKey(title, normalizedOutcome)
    if (!titleKey) continue
    const match = lookup.marketTitleOutcome.get(titleKey)
    if (match) return withOverrides(match)
  }

  const copiedWalletCandidates = [
    copiedTraderWalletFromRow,
    normalizeWalletAddress(rawOrder?.copied_trader_wallet ?? null),
    normalizeWalletAddress(rawOrder?.copiedTraderWallet ?? null),
    normalizeWalletAddress(rawOrder?.copied_from_wallet ?? null),
  ].filter(Boolean) as string[]

  for (const wallet of copiedWalletCandidates) {
    const walletMatch = lookup.wallet.get(wallet)
    if (walletMatch) return withOverrides(walletMatch)
  }

  if (hasExplicitCopiedTrader) {
    return {
      id: copiedTraderIdFromRow ?? null,
      wallet: copiedTraderWalletFromRow ?? null,
      username: fallbackName ?? null,
    }
  }

  return fallbackName ? { id: null, wallet: null, username: fallbackName } : null
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
  // Prioritize metadata and cache over copied_market_title to avoid showing trader names
  if (metadata?.question) return metadata.question
  const cachedTitle = cache?.title
  if (cachedTitle) return cachedTitle
  const cachedMetadataTitle =
    (typeof cache?.metadata?.question === 'string' && cache.metadata.question.trim()) ||
    (typeof cache?.metadata?.market_title === 'string' && cache.metadata.market_title.trim()) ||
    (typeof cache?.metadata?.title === 'string' && cache.metadata.title.trim()) ||
    (typeof cache?.metadata?.name === 'string' && cache.metadata.name.trim()) ||
    null
  if (cachedMetadataTitle) return cachedMetadataTitle

  // Get raw market data from order
  const rawMarket = order.raw?.market ?? order.raw
  const rawMarketTitle =
    rawMarket?.title ||
    rawMarket?.market_title ||
    rawMarket?.name ||
    rawMarket?.question ||
    null

  // Use raw market title if available
  if (rawMarketTitle && typeof rawMarketTitle === 'string' && rawMarketTitle.trim()) {
    return rawMarketTitle.trim()
  }

  // Check if copied_market_title looks like a valid market name (not a wallet address or trader name)
  const copiedMarketTitle =
    typeof order?.copied_market_title === 'string' && order.copied_market_title.trim()
      ? order.copied_market_title.trim()
      : null

  // Get trader information to compare against
  const traderUsername = order?.copied_trader_username || order?.raw?.copied_trader_username || null
  const traderWallet = order?.copied_trader_wallet || order?.raw?.copied_trader_wallet || null

  // Only use copied_market_title if:
  // 1. It doesn't look like a wallet address
  // 2. It's not the same as the trader username
  // 3. It's a reasonable length for a market title
  const isWalletAddress = copiedMarketTitle && (
    copiedMarketTitle.startsWith('0x') || 
    /^[a-f0-9]{40,}$/i.test(copiedMarketTitle) ||
    copiedMarketTitle === traderWallet
  )
  
  const isTraderName = copiedMarketTitle && (
    copiedMarketTitle === traderUsername ||
    copiedMarketTitle === traderWallet
  )

  const isValidMarketTitle = copiedMarketTitle && 
    !isWalletAddress &&
    !isTraderName &&
    copiedMarketTitle.length > 3

  if (isValidMarketTitle) {
    return copiedMarketTitle
  }

  // Check if marketId is a hex address - if so, return a fallback message
  const isHexAddress = marketId && (marketId.startsWith('0x') || /^[a-f0-9]{40,}$/i.test(marketId))
  if (isHexAddress) {
    return 'Unknown Market'
  }

  return (rawMarket?.market ?? marketId) || 'Unknown Market'
}

function deriveMarketOpenStatus(cache?: MarketCacheRow, rawOrder?: any, metadata?: MarketMetadata) {
  const acceptingOrders = parseBoolean(
    metadata?.acceptingOrders ??
      metadata?.metadataPayload?.acceptingOrders ??
      rawOrder?.market?.accepting_orders ??
      rawOrder?.accepting_orders
  )
  if (acceptingOrders !== null) {
    return acceptingOrders
  }

  const metadataClosed = parseBoolean(
    metadata?.closed ??
      metadata?.metadataPayload?.closed ??
      rawOrder?.market?.closed ??
      rawOrder?.closed
  )
  if (metadataClosed !== null) {
    return !metadataClosed
  }

  const metadataResolved = parseBoolean(
    metadata?.resolved ??
      metadata?.metadataPayload?.resolved ??
      rawOrder?.market?.resolved ??
      rawOrder?.resolved
  )
  if (metadataResolved !== null) {
    return !metadataResolved
  }

  if (cache?.is_open !== undefined && cache.is_open !== null) {
    return cache.is_open
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
  copiedTraderDirectName?: string | null,
  copiedTraderWalletName?: string | null,
  copiedTraderMarketName?: string | null,
  copiedTraderMarketTitleName?: string | null
) {
  const directCopiedName = normalizeTraderDisplayName(copiedTraderDirectName)
  if (directCopiedName) return directCopiedName

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

  return ''
}

function normalizeWalletAddress(value?: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed ? trimmed.toLowerCase() : null
}

function formatWalletDisplay(wallet?: string | null) {
  if (!wallet) return null
  const normalized = wallet.trim()
  if (normalized.length <= 10) return normalized
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`
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

type MarketMetadataToken = {
  tokenId: string | null
  outcome: string | null
  price: number | null
  winner: boolean | null
}

type MarketMetadata = {
  icon?: string | null
  image?: string | null
  question?: string | null
  slug?: string | null
  outcomes: string[]
  outcomePrices: number[]
  tokens?: MarketMetadataToken[]
  closed?: boolean | null
  resolved?: boolean | null
  acceptingOrders?: boolean | null
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

async function fetchMarketMetadataFromGamma(conditionIds: string[]) {
  const metadataMap: Record<string, MarketMetadata> = {}
  const uniqueIds = Array.from(new Set(conditionIds.filter(Boolean)))
    .map((id) =>
      typeof id === 'string' && id.startsWith('0x') && id.length >= 66
        ? id.slice(0, 66).toLowerCase()
        : id
    )
    .filter((id) => typeof id === 'string' && id.startsWith('0x'))

  if (uniqueIds.length === 0) return metadataMap

  for (let i = 0; i < uniqueIds.length; i += MARKET_METADATA_FETCH_CONCURRENCY) {
    const chunk = uniqueIds.slice(i, i + MARKET_METADATA_FETCH_CONCURRENCY)
    await Promise.allSettled(
      chunk.map(async (conditionId) => {
        if (!conditionId) return
        try {
          const response = await fetchWithTimeout(
            `https://gamma-api.polymarket.com/markets?condition_id=${encodeURIComponent(conditionId)}`,
            MARKET_METADATA_REQUEST_TIMEOUT_MS,
            { headers: { Accept: 'application/json' }, cache: 'no-store' }
          )
          if (!response.ok) return
          let data: any
          try {
            data = await response.json()
          } catch (error) {
            console.warn('[orders] market metadata parse failed', conditionId, error)
            return
          }
          const market = Array.isArray(data) && data.length > 0 ? data[0] : null
          if (!market) return

          // Validate: make sure the returned market actually matches the queried
          // condition_id. Gamma API can return unrelated results for invalid IDs.
          const returnedConditionId = (market.condition_id || market.conditionId || '').toLowerCase()
          if (returnedConditionId && conditionId.toLowerCase() !== returnedConditionId) {
            console.warn('[orders] Gamma API returned mismatched market', {
              queried: conditionId,
              returned: returnedConditionId,
            })
            return
          }

          const image =
            typeof market?.image === 'string' && market.image.trim() ? market.image.trim() : null

          const rawOutcomes = typeof market?.outcomes === 'string'
            ? (() => { try { return JSON.parse(market.outcomes) } catch { return null } })()
            : market?.outcomes
          const rawPricesRaw =
            market?.outcomePrices ??
            market?.outcome_prices ??
            (typeof market?.prices !== 'undefined' ? market.prices : undefined)
          const rawPrices = typeof rawPricesRaw === 'string'
            ? (() => { try { return JSON.parse(rawPricesRaw) } catch { return null } })()
            : Array.isArray(rawPricesRaw)
              ? rawPricesRaw
              : null
          const rawTokenIds = typeof market?.clobTokenIds === 'string'
            ? (() => { try { return JSON.parse(market.clobTokenIds) } catch { return null } })()
            : market?.clobTokenIds

          const outcomes: string[] = Array.isArray(rawOutcomes) ? rawOutcomes : []
          const outcomePrices: number[] = Array.isArray(rawPrices)
            ? rawPrices.map((p: any) => parseNumeric(p) ?? 0)
            : []
          const tokenIds: string[] = Array.isArray(rawTokenIds) ? rawTokenIds : []

          const metadataTokens: MarketMetadataToken[] = outcomes.map((outcome, idx) => ({
            tokenId: tokenIds[idx] ?? null,
            outcome: outcome ? String(outcome) : null,
            price: idx < outcomePrices.length ? outcomePrices[idx] : null,
            winner: outcomePrices[idx] === 1 ? true : outcomePrices[idx] === 0 ? false : null,
          }))

          const closed = market?.closed != null ? Boolean(market.closed) : null
          const resolved = market?.resolvedBy ? true : market?.resolved != null ? Boolean(market.resolved) : null
          const acceptingOrders = market?.active != null ? Boolean(market.active) : null

          metadataMap[conditionId] = {
            icon: image,
            image,
            question: market?.question ?? null,
            slug: market?.slug ?? null,
            outcomes,
            outcomePrices,
            tokens: metadataTokens,
            closed,
            resolved,
            acceptingOrders,
            metadataPayload: {
              question: market?.question ?? null,
              slug: market?.slug ?? null,
              closed,
              resolved,
              acceptingOrders,
              outcomes,
              outcomePrices,
              tokens: metadataTokens,
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

/** Returns true if outcome prices look like a placeholder (missing or all 0.5). */
function isPlaceholderPrices(outcomePrices: number[]): boolean {
  if (!outcomePrices || outcomePrices.length === 0) return true
  const allSame = outcomePrices.every((p) => p === outcomePrices[0])
  const allFifty = outcomePrices[0] === 0.5
  return Boolean(allSame && allFifty)
}

/** True if we have at least one real price (not placeholder 0.5). Don't overwrite Gamma with CLOB when CLOB only has 50¢. */
function hasRealPrices(outcomePrices: number[]): boolean {
  if (!outcomePrices || outcomePrices.length === 0) return false
  if (isPlaceholderPrices(outcomePrices)) return false
  return outcomePrices.some(
    (p) => Number.isFinite(p) && p > 0.01 && p < 0.99
  )
}

/** Fetch live token prices from CLOB for a single market. */
async function fetchClobMarketPrices(
  conditionId: string
): Promise<{ outcomes: string[]; outcomePrices: number[]; tokens: MarketMetadataToken[] } | null> {
  try {
    const response = await fetchWithTimeout(
      `https://clob.polymarket.com/markets/${conditionId}`,
      MARKET_METADATA_REQUEST_TIMEOUT_MS,
      { cache: 'no-store' }
    )
    if (!response.ok) return null
    const data = await response.json()
    const rawTokens = Array.isArray(data?.tokens) ? data.tokens : []
    if (rawTokens.length === 0) return null
    const outcomes: string[] = []
    const outcomePrices: number[] = []
    const tokens: MarketMetadataToken[] = []
    for (const t of rawTokens) {
      const outcome = t?.outcome ?? t?.outcomeName ?? null
      if (!outcome) continue
      const rawPrice = t?.price
      const price =
        typeof rawPrice === 'number' && Number.isFinite(rawPrice)
          ? rawPrice
          : typeof rawPrice === 'string'
            ? parseNumeric(rawPrice)
            : null
      outcomes.push(String(outcome))
      outcomePrices.push(price ?? 0)
      tokens.push({
        tokenId: t?.token_id ?? t?.tokenId ?? null,
        outcome: String(outcome),
        price: price ?? null,
        winner: price === 1 ? true : price === 0 ? false : null,
      })
    }
    if (outcomes.length === 0) return null
    return { outcomes, outcomePrices, tokens }
  } catch (error) {
    return null
  }
}

/** Fetch mid price from order book for a token. */
async function fetchMidPriceFromBook(tokenId: string): Promise<number | null> {
  try {
    const response = await fetchWithTimeout(
      `https://clob.polymarket.com/book?token_id=${encodeURIComponent(tokenId)}`,
      3000,
      { cache: 'no-store' }
    )
    if (!response.ok) return null
    const data = await response.json()
    const bids = Array.isArray(data?.bids) ? data.bids : []
    const asks = Array.isArray(data?.asks) ? data.asks : []
    const bestBid = bids.length > 0 ? parseNumeric(bids[0]?.price) : null
    const bestAsk = asks.length > 0 ? parseNumeric(asks[0]?.price) : null
    if (bestBid != null && bestAsk != null && Number.isFinite(bestBid) && Number.isFinite(bestAsk)) {
      const mid = (bestBid + bestAsk) / 2
      return mid > 0 && mid < 1 ? mid : null
    }
    const onlyBid = bestBid != null && Number.isFinite(bestBid) ? bestBid : null
    const onlyAsk = bestAsk != null && Number.isFinite(bestAsk) ? bestAsk : null
    if (onlyBid != null && onlyBid > 0 && onlyBid < 1) return onlyBid
    if (onlyAsk != null && onlyAsk > 0 && onlyAsk < 1) return onlyAsk
    return null
  } catch {
    return null
  }
}

const CLOB_ENRICH_CONCURRENCY = 8

/** Prefer CLOB for prices (then order book per token when CLOB has no price). Overwrite Gamma when CLOB has real prices or when Gamma is placeholder. */
async function enrichMetadataWithClobPricesWhenNeeded(
  metadataMap: Record<string, MarketMetadata>
): Promise<void> {
  const idsToEnrich = Object.keys(metadataMap)
  if (idsToEnrich.length === 0) return
  for (let i = 0; i < idsToEnrich.length; i += CLOB_ENRICH_CONCURRENCY) {
    const chunk = idsToEnrich.slice(i, i + CLOB_ENRICH_CONCURRENCY)
    await Promise.allSettled(
      chunk.map(async (conditionId) => {
      const existing = metadataMap[conditionId]
      if (!existing) return
      const clob = await fetchClobMarketPrices(conditionId)
      const useClob =
        clob &&
        clob.outcomes.length > 0 &&
        (hasRealPrices(clob.outcomePrices) || isPlaceholderPrices(existing.outcomePrices))
      if (useClob) {
        metadataMap[conditionId] = {
          ...existing,
          outcomes: clob.outcomes.length ? clob.outcomes : existing.outcomes,
          outcomePrices: clob.outcomePrices,
          tokens: clob.tokens,
          metadataPayload: existing.metadataPayload
            ? {
                ...existing.metadataPayload,
                outcomes: clob.outcomes.length ? clob.outcomes : existing.outcomes,
                outcomePrices: clob.outcomePrices,
                tokens: clob.tokens,
              }
            : null,
        }
        return
      }
      if (!clob || !clob.tokens.length || hasRealPrices(existing.outcomePrices)) return
      const tokensWithBookPrice: MarketMetadataToken[] = []
      for (const token of clob.tokens) {
        const tokenId = token.tokenId ?? null
        if (!tokenId) {
          tokensWithBookPrice.push(token)
          continue
        }
        const bookPrice = await fetchMidPriceFromBook(tokenId)
        const price = token.price != null && Number.isFinite(token.price) ? token.price : bookPrice
        tokensWithBookPrice.push({
          ...token,
          price: price ?? null,
          winner: price === 1 ? true : price === 0 ? false : null,
        })
      }
      const outcomePricesFromTokens = tokensWithBookPrice.map((t) => (t.price != null && Number.isFinite(t.price) ? t.price : 0))
      if (!hasRealPrices(outcomePricesFromTokens)) return
      const outcomesOrder = existing.outcomes.length ? existing.outcomes : clob.outcomes
      const outcomePrices = outcomesOrder.length === tokensWithBookPrice.length
        ? outcomesOrder.map((outcome) => {
            const idx = tokensWithBookPrice.findIndex((t) => String(t.outcome).toLowerCase() === String(outcome).toLowerCase())
            return idx >= 0 ? outcomePricesFromTokens[idx] : 0
          })
        : outcomePricesFromTokens
      if (!hasRealPrices(outcomePrices)) return
      metadataMap[conditionId] = {
        ...existing,
        outcomePrices,
        tokens: tokensWithBookPrice,
        metadataPayload: existing.metadataPayload
          ? { ...existing.metadataPayload, outcomePrices, tokens: tokensWithBookPrice }
          : null,
      }
    })
    )
  }
}

const PRICE_API_FALLBACK_BATCH = 5

/** Use Price API as single source of truth for current price: when Gamma/CLOB gave placeholder/no prices, or when market is open (stale Gamma data often wrong). */
async function enrichMetadataFromPriceApiWhenPlaceholder(
  metadataMap: Record<string, MarketMetadata>
): Promise<void> {
  const idsToFix = Object.keys(metadataMap).filter((conditionId) => {
    const existing = metadataMap[conditionId]
    if (!existing) return false
    // Always fix when missing/placeholder/bad prices
    if (!existing.outcomePrices?.length) return true
    if (isPlaceholderPrices(existing.outcomePrices)) return true
    if (!hasRealPrices(existing.outcomePrices)) return true
    // For open markets, always use Price API so "current" is correct (Gamma is often stale)
    const isOpen = existing.closed !== true && existing.resolved !== true
    if (isOpen) return true
    return false
  })
  if (idsToFix.length === 0) return

  const baseUrl = getAppBaseUrl()
  for (let i = 0; i < idsToFix.length; i += PRICE_API_FALLBACK_BATCH) {
    const chunk = idsToFix.slice(i, i + PRICE_API_FALLBACK_BATCH)
    await Promise.allSettled(
      chunk.map(async (conditionId) => {
        const existing = metadataMap[conditionId]
        if (!existing) return
        try {
          const res = await fetch(
            `${baseUrl}/api/polymarket/price?conditionId=${encodeURIComponent(conditionId)}&tier=T2b`,
            { cache: 'no-store', signal: AbortSignal.timeout(8000) }
          )
          if (!res.ok) return
          const json = await res.json()
          const market = json?.market
          if (!market) return
          const outcomes = Array.isArray(market.outcomes) ? market.outcomes : existing.outcomes ?? []
          const outcomePrices = Array.isArray(market.outcomePrices)
            ? market.outcomePrices.map((p: any) => Number(p)).filter((n: number) => Number.isFinite(n))
            : []
          if (outcomes.length === 0 || outcomePrices.length === 0 || !hasRealPrices(outcomePrices)) return
          const tokens: MarketMetadataToken[] = outcomes.map((outcome: string, idx: number) => ({
            tokenId: null,
            outcome,
            price: idx < outcomePrices.length ? outcomePrices[idx] : null,
            winner: outcomePrices[idx] === 1 ? true : outcomePrices[idx] === 0 ? false : null,
          }))
          metadataMap[conditionId] = {
            ...existing,
            outcomes,
            outcomePrices,
            tokens,
            metadataPayload: existing.metadataPayload
              ? { ...existing.metadataPayload, outcomes, outcomePrices, tokens }
              : existing.metadataPayload,
          }
        } catch {
          // ignore
        }
      })
    )
  }
}

function extractTokenIdFromOrderRecord(order: any): string | null {
  const rawCandidates = [
    order?.token_id,
    order?.tokenId,
    order?.tokenID,
    order?.asset_id,
    order?.assetId,
    order?.asset,
  ]
  for (const candidate of rawCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  const raw = order?.raw
  if (raw && typeof raw === 'object') {
    const nestedCandidates = [
      raw.token_id,
      raw.tokenId,
      raw.asset_id,
      raw.assetId,
      raw.asset,
      raw?.market?.token_id,
      raw?.market?.asset_id,
    ]
    for (const candidate of nestedCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
  }
  return null
}

function resolveCurrentPrice(order: any, metadata?: MarketMetadata): number | null {
  const normalizedOutcome = String(order?.outcome ?? order?.raw?.outcome ?? '')
    .trim()
    .toLowerCase()
  const tokenId = extractTokenIdFromOrderRecord(order)
  const normalizedTokenId = tokenId ? tokenId.toLowerCase() : null

  if (metadata?.tokens && normalizedTokenId) {
    const tokenMatch = metadata.tokens.find(
      (token) => typeof token.tokenId === 'string' && token.tokenId.toLowerCase() === normalizedTokenId
    )
    if (tokenMatch) {
      if (Number.isFinite(tokenMatch.price ?? NaN)) {
        return tokenMatch.price as number
      }
      if (tokenMatch.winner === true) return 1
      if (tokenMatch.winner === false) return 0
    }
  }

  if (metadata && metadata.outcomes.length > 0 && metadata.outcomePrices.length > 0) {
    if (normalizedOutcome) {
      const matchedIndex = metadata.outcomes.findIndex(
        (outcome) => String(outcome).trim().toLowerCase() === normalizedOutcome
      )
      const matchedPrice =
        matchedIndex >= 0 ? metadata.outcomePrices[matchedIndex] : undefined
      if (typeof matchedPrice === 'number' && Number.isFinite(matchedPrice)) {
        // Don't show 50¢ placeholder as "current price" — treat as missing so caller can try Price API
        if (matchedPrice === 0.5 && metadata.outcomePrices.every((p) => p === 0.5)) {
          return null
        }
        return matchedPrice
      }
      // Outcome not found: do not use fallback (first outcome's price) — that would show wrong side's price (e.g. 1¢ for a No position)
      return null
    }
    const fallbackPrice = metadata.outcomePrices.find((price) => Number.isFinite(price))
    if (typeof fallbackPrice === 'number' && fallbackPrice !== 0.5) {
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

const ACTIVITY_LABELS: Record<OrderActivity, string> = {
  bought: 'Bought',
  sold: 'Sold',
  redeemed: 'Redeemed',
  lost: 'Lost',
  canceled: 'Canceled',
  expired: 'Expired',
  failed: 'Failed',
}

const ACTIVITY_ICONS: Record<OrderActivity, string> = {
  bought: '+',
  sold: '-',
  redeemed: '✓',
  lost: '✕',
  canceled: '✕',
  expired: '⏲',
  failed: '!',
}

function normalizeActionType(rawOrder: any): string | null {
  const candidates = [
    rawOrder?.action_type,
    rawOrder?.action,
    rawOrder?.event_type,
    rawOrder?.eventType,
    rawOrder?.raw_action,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toLowerCase()
    }
  }

  return null
}

function deriveOrderActivity(
  rawOrder: any,
  status: OrderStatus,
  side: string | null | undefined,
  positionState: 'open' | 'closed' | 'unknown' | null,
  pnlUsd: number | null
): { activity: OrderActivity; activityLabel: string; activityIcon: string } {
  const normalizedAction = normalizeActionType(rawOrder)
  const normalizedSide = String(side ?? '').trim().toLowerCase()
  const resolvedPnl = Number.isFinite(pnlUsd ?? NaN) ? (pnlUsd as number) : null

  if (normalizedAction) {
    if (['redeem', 'claim', 'settle_win'].includes(normalizedAction)) {
      return {
        activity: 'redeemed',
        activityLabel: ACTIVITY_LABELS.redeemed,
        activityIcon: ACTIVITY_ICONS.redeemed,
      }
    }
    if (['expire', 'settle_loss'].includes(normalizedAction)) {
      return {
        activity: 'lost',
        activityLabel: ACTIVITY_LABELS.lost,
        activityIcon: ACTIVITY_ICONS.lost,
      }
    }
  }

  if (status === 'failed') {
    return {
      activity: 'failed',
      activityLabel: ACTIVITY_LABELS.failed,
      activityIcon: ACTIVITY_ICONS.failed,
    }
  }

  if (status === 'canceled') {
    return {
      activity: 'canceled',
      activityLabel: ACTIVITY_LABELS.canceled,
      activityIcon: ACTIVITY_ICONS.canceled,
    }
  }

  if (status === 'expired') {
    return {
      activity: 'expired',
      activityLabel: ACTIVITY_LABELS.expired,
      activityIcon: ACTIVITY_ICONS.expired,
    }
  }

  if (positionState === 'closed') {
    if ((resolvedPnl ?? 0) > 0) {
      return {
        activity: 'redeemed',
        activityLabel: ACTIVITY_LABELS.redeemed,
        activityIcon: ACTIVITY_ICONS.redeemed,
      }
    }
    return {
      activity: 'lost',
      activityLabel: ACTIVITY_LABELS.lost,
      activityIcon: ACTIVITY_ICONS.lost,
    }
  }

  if (normalizedSide === 'sell') {
    return {
      activity: 'sold',
      activityLabel: ACTIVITY_LABELS.sold,
      activityIcon: ACTIVITY_ICONS.sold,
    }
  }

  return {
    activity: 'bought',
    activityLabel: ACTIVITY_LABELS.bought,
    activityIcon: ACTIVITY_ICONS.bought,
  }
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

function columnMissing(error: any) {
  if (!error) return false
  const code = error?.code
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
  return code === '42703' || message.includes('column') || message.includes('does not exist')
}

async function reconcileMissingOpenOrders(
  client: ReturnType<typeof createServiceClient>,
  ordersTable: OrdersTableName,
  traderId: string
): Promise<boolean> {
  try {
    const { data, error } = await client
      .from(ordersTable)
      .select('order_id, size, filled_size, status')
      .eq('trader_id', traderId)
      .in('status', ['open', 'partial'])
      .limit(200)

    if (error) {
      console.warn('[orders] reconcile query failed', error)
      return false
    }

    const rows = data ?? []
    if (rows.length === 0) return false

    const now = new Date().toISOString()
    const updates = rows.map((row: any) => {
      const size = Number(row?.size ?? 0)
      const filled = Number(row?.filled_size ?? 0)
      const closedStatus = size > 0 && filled >= size ? 'matched' : 'canceled'
      return {
        order_id: row.order_id,
        status: closedStatus,
        remaining_size: 0,
        updated_at: now,
      }
    })

    const { error: updateError } = await client
      .from(ordersTable)
      .upsert(updates, { onConflict: 'order_id' })

    if (updateError) {
      console.warn('[orders] reconcile update failed', updateError)
      return false
    }

    console.log('[orders] reconciled stale open orders', updates.length)
    return updates.length > 0
  } catch (err) {
    console.warn('[orders] reconcile missing open orders failed', err)
    return false
  }
}

async function fetchOrdersForTrader(
  client: ReturnType<typeof createServiceClient>,
  ordersTable: OrdersTableName,
  traderId: string
) {
  const selectWithCopied =
    'order_id, trader_id, copied_trader_id, copied_trader_wallet, market_id, outcome, side, order_type, time_in_force, price, size, filled_size, remaining_size, status, created_at, updated_at, auto_close_order_id, copied_market_title, market_resolved, lt_strategy_id, raw'
  const selectLegacy =
    'order_id, trader_id, market_id, outcome, side, order_type, time_in_force, price, size, filled_size, remaining_size, status, created_at, updated_at, raw'

  const query = (columns: string) =>
    client
      .from(ordersTable)
      .select(columns)
      .eq('trader_id', traderId)
      .order('created_at', { ascending: false })
      .limit(200)

  const result = await query(selectWithCopied)
  if (!result.error) return result
  if (!columnMissing(result.error)) return result

  console.warn('[orders] copied trader columns missing, falling back to legacy select')
  return query(selectLegacy)
}
