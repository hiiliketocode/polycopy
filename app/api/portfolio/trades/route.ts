import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'

const PRICE_STALE_MS = 60_000
const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000'

const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const normalizeOutcome = (value: string | null | undefined) =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim().toUpperCase() : null

const pickOutcomePrice = (
  outcomePrices: Record<string, any> | null | undefined,
  outcome: string | null | undefined
) => {
  if (!outcomePrices) return null
  const normalizedOutcome = normalizeOutcome(outcome)
  if (!normalizedOutcome) return null

  for (const [key, price] of Object.entries(outcomePrices)) {
    const normalizedKey = normalizeOutcome(key)
    if (normalizedKey === normalizedOutcome && Number.isFinite(Number(price))) {
      return Number(price)
    }
  }
  return null
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

    const debug = searchParams.get('debug') === 'true'
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const pageSize = Math.min(
      100,
      Math.max(10, parseInt(searchParams.get('pageSize') || '25', 10))
    )
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const supabase = createService()

    // Debug mode: compare base orders table vs enriched view
    if (debug) {
      // Get all orders from base table
      const { data: allOrders, error: ordersError } = await supabase
        .from('orders')
        .select('order_id, copied_trade_id, copied_market_title, status, filled_size, size, amount_invested, created_at, trade_method')
        .eq('copy_user_id', requestedUserId)
        .order('created_at', { ascending: false })

      // Get orders from enriched view
      const { data: enrichedOrders, error: enrichedError } = await supabase
        .from('orders_copy_enriched')
        .select('order_id, copied_trade_id')
        .eq('copy_user_id', requestedUserId)

      const enrichedIds = new Set(
        (enrichedOrders || []).map(o => o.order_id || o.copied_trade_id)
      )

      const missingOrders = (allOrders || []).filter(order => {
        const id = order.order_id || order.copied_trade_id
        return !enrichedIds.has(id)
      })

      const seahawksOrders = (allOrders || []).filter(order =>
        order.copied_market_title?.toLowerCase().includes('seahawks') ||
        order.copied_market_title?.toLowerCase().includes('super bowl')
      )

      return NextResponse.json({
        debug: true,
        summary: {
          totalOrders: allOrders?.length || 0,
          ordersInEnrichedView: enrichedOrders?.length || 0,
          missingFromView: missingOrders.length
        },
        missingOrders: missingOrders.map(o => ({
          order_id: o.order_id,
          copied_trade_id: o.copied_trade_id,
          market_title: o.copied_market_title,
          status: o.status,
          filled_size: o.filled_size,
          size: o.size,
          amount_invested: o.amount_invested,
          created_at: o.created_at,
          trade_method: o.trade_method,
          reason: (o.status?.toLowerCase() === 'open' && (o.filled_size === 0 || o.filled_size === null))
            ? 'Filtered: status=open AND filled_size=0'
            : 'Unknown'
        })),
        seahawksOrders: seahawksOrders.map(o => ({
          order_id: o.order_id,
          copied_trade_id: o.copied_trade_id,
          market_title: o.copied_market_title,
          status: o.status,
          filled_size: o.filled_size,
          size: o.size,
          created_at: o.created_at,
          inEnrichedView: enrichedIds.has(o.order_id || o.copied_trade_id)
        }))
      })
    }
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
      'side',
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

    // Load cached markets for these trades
    const uniqueMarketIds = Array.from(
      new Set((data || []).map((row: any) => row.market_id).filter(Boolean))
    )

    const marketsMap = new Map<string, any>()
    if (uniqueMarketIds.length > 0) {
      const { data: marketsData, error: marketsError } = await supabase
        .from('markets')
        .select(
          [
            'condition_id',
            'title',
            'image',
            'market_slug',
            'status',
            'winning_side',
            'resolved_outcome',
            'outcome_prices',
            'last_price_updated_at',
            'closed',
          ].join(',')
        )
        .in('condition_id', uniqueMarketIds)

      if (marketsError) {
        console.warn('[portfolio] market lookup failed', marketsError)
      } else {
        (marketsData || []).forEach((market: any) => {
          if (market?.condition_id) {
            marketsMap.set(market.condition_id, market)
          }
        })
      }
    }

    // Refresh stale or missing prices for open markets (one fetch per market)
    // Only refresh if price data is actually stale (>1 hour) to avoid rate limits
    const now = Date.now()
    const refreshTargets = uniqueMarketIds.filter((marketId) => {
      const market = marketsMap.get(marketId)
      if (!market) return true
      const isResolved =
        market.closed ||
        market.status === 'resolved' ||
        Boolean(market.resolved_outcome || market.winning_side)
      if (isResolved) return false
      
      // Only refresh if price data is genuinely stale (>1 hour old)
      const updatedAt = market.last_price_updated_at || market.updated_at
        ? new Date(market.last_price_updated_at || market.updated_at).getTime()
        : 0
      
      // Only refresh if missing update time OR genuinely stale
      return !updatedAt || now - updatedAt > PRICE_STALE_MS
    })
    
    console.log(`[portfolio/trades] Checking ${uniqueMarketIds.length} markets, refreshing ${refreshTargets.length} stale markets`)

    if (refreshTargets.length > 0) {
      await Promise.all(
        refreshTargets.map(async (marketId) => {
          try {
            const resp = await fetch(
              `${APP_BASE_URL}/api/polymarket/price?conditionId=${encodeURIComponent(marketId)}`,
              { cache: 'no-store' }
            )
            if (!resp.ok) return
            const payload = await resp.json()
            const marketPayload = payload?.market ?? payload ?? null
            if (!marketPayload) return

            const outcomes = Array.isArray(marketPayload.outcomes)
              ? marketPayload.outcomes
              : []
            const outcomePrices = Array.isArray(marketPayload.outcomePrices)
              ? marketPayload.outcomePrices
              : []

            const priceMap: Record<string, number> = {}
            outcomes.forEach((outcome: string, idx: number) => {
              const price = Number(outcomePrices[idx])
              if (Number.isFinite(price)) {
                priceMap[outcome] = price
              }
            })

            const resolvedOutcome =
              marketPayload.resolvedOutcome ??
              marketPayload.resolved_outcome ??
              marketPayload.winner ??
              marketPayload.winning_outcome ??
              marketPayload.winningSide ??
              marketPayload.winning_side ??
              null

            const closed =
              Boolean(marketPayload.closed || marketPayload.resolved) ||
              Boolean(resolvedOutcome)

            const updatedMarket = {
              condition_id: marketId,
              outcome_prices: Object.keys(priceMap).length > 0 ? priceMap : null,
              last_price_updated_at: new Date().toISOString(),
              resolved_outcome: resolvedOutcome ?? null,
              closed,
              status: closed ? 'resolved' : marketPayload.status ?? null,
              title: marketPayload.question ?? marketPayload.title ?? null,
              image: marketPayload.icon ?? marketPayload.image ?? null,
              market_slug: marketPayload.slug ?? marketPayload.market_slug ?? null,
              updated_at: new Date().toISOString(),
            }

            await supabase
              .from('markets')
              .upsert(updatedMarket, { onConflict: 'condition_id' })

            const existing = marketsMap.get(marketId) || {}
            marketsMap.set(marketId, { ...existing, ...updatedMarket })
          } catch (err) {
            console.warn(`[portfolio] failed to refresh market price for ${marketId}`, err)
          }
        })
      )
    }

    const trades = (data || []).map((row: any) => {
      const entryPrice = toNumber(row.entry_price)
      const market = row.market_id ? marketsMap.get(row.market_id) : null
      const resolvedOutcome =
        row.resolved_outcome ?? market?.resolved_outcome ?? market?.winning_side ?? null
      const marketResolved =
        row.market_resolved ||
        Boolean(market?.closed || market?.status === 'resolved') ||
        Boolean(resolvedOutcome)

      const settlementPrice =
        marketResolved && resolvedOutcome && row.outcome
          ? normalizeOutcome(resolvedOutcome) === normalizeOutcome(row.outcome)
            ? 1
            : 0
          : null

      const cachedPrice = pickOutcomePrice(market?.outcome_prices, row.outcome)
      const latestPrice =
        settlementPrice !== null
          ? settlementPrice
          : toNumber(row.current_price) ?? cachedPrice

      const exitPrice =
        toNumber(row.exit_price) ??
        toNumber(row.user_exit_price) ??
        latestPrice ??
        toNumber(row.current_price)

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

      const marketTitle =
        row.copied_market_title ||
        market?.title ||
        row.market_title ||
        row.market_slug ||
        null

      return {
        id: row.copied_trade_id || row.order_id,
        order_id: row.order_id,
        copied_trade_id: row.copied_trade_id,
        trader_wallet: row.copied_trader_wallet,
        trader_username: row.copied_trader_username,
        trader_profile_image_url: row.trader_profile_image_url,
        market_id: row.market_id,
        market_title: marketTitle,
        market_slug: row.market_slug ?? market?.market_slug ?? null,
        market_avatar_url: row.market_avatar_url ?? market?.image ?? null,
        outcome: row.outcome,
        price_when_copied: entryPrice,
        entry_size: toNumber(row.entry_size),
        amount_invested: toNumber(row.invested_usd),
        copied_at: row.created_at, // align with frontend expectations
        created_at: row.created_at,
        trader_still_has_position: row.trader_still_has_position,
        trader_closed_at: null,
        current_price: latestPrice,
        market_resolved: marketResolved || row.market_resolved,
        market_resolved_at: row.market_resolved_at,
        roi,
        user_closed_at: row.user_closed_at,
        user_exit_price: toNumber(row.user_exit_price),
        resolved_outcome: resolvedOutcome ?? null,
        trade_method: row.trade_method,
        side: row.side ?? null,
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
