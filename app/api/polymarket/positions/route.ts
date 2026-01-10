import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit/index'
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client'
import type { ClobClient } from '@polymarket/clob-client'
import type { Trade, TradeParams } from '@polymarket/clob-client/dist/types'

const MIN_OPEN_SIZE = 1e-6
type PositionAccumulator = {
  tokenId: string
  marketId: string
  outcome: string
  buyShares: number
  buyCost: number
  sellShares: number
  sellProceeds: number
  firstTradeAt: string | null
  lastTradeAt: string | null
}

const TRADE_PAGE_LIMIT = 500
const TRADE_MAX_PAGES = 40
const TRADE_MAX_ITEMS = 20000

function normalizeSide(value: unknown): 'BUY' | 'SELL' | null {
  if (!value) return null
  const normalized = String(value).trim().toUpperCase()
  if (normalized === 'BUY') return 'BUY'
  if (normalized === 'SELL') return 'SELL'
  return null
}

async function fetchTradesForPositions(
  client: ClobClient,
  proxyAddress: string | null
): Promise<Trade[]> {
  const trades = await fetchTradesPaged(client, {})
  if (trades.length > 0 || !proxyAddress) {
    return trades
  }
  return fetchTradesPaged(client, { maker_address: proxyAddress.toLowerCase() })
}

async function fetchTradesPaged(
  client: ClobClient,
  params: TradeParams
): Promise<Trade[]> {
  const trades: Trade[] = []
  let nextCursor: string | undefined
  let pages = 0

  while (pages < TRADE_MAX_PAGES && trades.length < TRADE_MAX_ITEMS) {
    const response = await client.getTradesPaginated(
      { ...params, limit: TRADE_PAGE_LIMIT } as TradeParams,
      nextCursor
    )
    const batch = Array.isArray(response?.trades) ? response.trades : []
    trades.push(...batch)
    const returnedCursor =
      typeof response?.next_cursor === 'string' ? response.next_cursor : null
    if (!returnedCursor || returnedCursor === nextCursor || batch.length === 0) {
      break
    }
    nextCursor = returnedCursor
    pages += 1
  }

  return trades
}

function upsertPosition(acc: Map<string, PositionAccumulator>, trade: Trade) {
  const tokenId = trade.asset_id || trade.maker_orders?.[0]?.asset_id
  if (!tokenId) return

  const traderSide = trade.trader_side
  const makerOrders = Array.isArray(trade.maker_orders) ? trade.maker_orders : []
  const makerAddress = trade.maker_address?.toLowerCase?.() || null
  const filteredMakerOrders =
    makerAddress && makerOrders.length > 0
      ? makerOrders.filter((order) => order.maker_address?.toLowerCase?.() === makerAddress)
      : makerOrders

  if (traderSide === 'MAKER' && filteredMakerOrders.length > 0) {
    filteredMakerOrders.forEach((order) => {
      const size = parseFloat(order.matched_amount || '0')
      const price = parseFloat(order.price || '0')
      if (!Number.isFinite(size) || size === 0 || !Number.isFinite(price)) {
        return
      }

      const orderSide = normalizeSide(order.side)
      if (!orderSide) {
        return
      }

      const key = order.asset_id || tokenId
      const existing =
        acc.get(key) ||
        acc
          .set(key, {
            tokenId: key,
            marketId: trade.market,
            outcome: order.outcome || trade.outcome,
            buyShares: 0,
            buyCost: 0,
            sellShares: 0,
            sellProceeds: 0,
            firstTradeAt: trade.match_time || trade.last_update || null,
            lastTradeAt: trade.match_time || trade.last_update || null,
          })
          .get(key)!

      const total = size * price
      if (orderSide === 'BUY') {
        existing.buyShares += size
        existing.buyCost += total
      } else {
        existing.sellShares += size
        existing.sellProceeds += total
      }

      existing.firstTradeAt =
        existing.firstTradeAt || trade.match_time || trade.last_update || null
      existing.lastTradeAt = trade.last_update || trade.match_time || existing.lastTradeAt
    })
    return
  }

  const size = parseFloat(trade.size || '0')
  const price = parseFloat(trade.price || '0')
  if (!Number.isFinite(size) || size === 0 || !Number.isFinite(price)) {
    return
  }

  const key = tokenId
  const existing =
    acc.get(key) ||
    acc
      .set(key, {
        tokenId,
        marketId: trade.market,
        outcome: trade.outcome,
        buyShares: 0,
        buyCost: 0,
        sellShares: 0,
        sellProceeds: 0,
        firstTradeAt: trade.match_time || trade.last_update || null,
        lastTradeAt: trade.match_time || trade.last_update || null,
      })
      .get(key)!

  const total = size * price
  const baseSide = normalizeSide(trade.side)
  if (!baseSide) {
    return
  }
  const side =
    traderSide === 'MAKER'
      ? baseSide === 'BUY'
        ? 'SELL'
        : 'BUY'
      : baseSide

  if (side === 'BUY') {
    existing.buyShares += size
    existing.buyCost += total
  } else {
    existing.sellShares += size
    existing.sellProceeds += total
  }

  existing.firstTradeAt =
    existing.firstTradeAt || trade.match_time || trade.last_update || null
  existing.lastTradeAt = trade.last_update || trade.match_time || existing.lastTradeAt
}

export async function GET(request: NextRequest) {
  // Use centralized secure auth utility
  const userId = await getAuthenticatedUserId()

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in' },
      { status: 401 }
    )
  }

  // SECURITY: Rate limit position fetches (TRADING tier)
  const rateLimitResult = await checkRateLimit(request, 'TRADING', userId, 'user')
  if (!rateLimitResult.success) {
    return rateLimitedResponse(rateLimitResult)
  }

  try {
    const { client, proxyAddress, signerAddress } = await getAuthedClobClientForUserAnyWallet(userId)
    const trades: Trade[] = await fetchTradesForPositions(client, proxyAddress)
    const accumulators = new Map<string, PositionAccumulator>()
    for (const trade of trades) {
      upsertPosition(accumulators, trade)
    }
    const positions = buildPositions(accumulators)

    return NextResponse.json({
      ok: true,
      proxy: proxyAddress,
      signer: signerAddress,
      count: positions.length,
      tradesEvaluated: trades.length,
      source: 'clob-trades',
      positions,
    })
  } catch (error: any) {
    console.error('[POLY-POSITIONS] Error:', error?.message || error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch positions' },
      { status: 500 }
    )
  }
}
function buildPositions(map: Map<string, PositionAccumulator>) {
  const positions = []
  for (const entry of map.values()) {
    const net = entry.buyShares - entry.sellShares
    if (Math.abs(net) < MIN_OPEN_SIZE) {
      continue
    }

    const direction = net >= 0 ? 'LONG' : 'SHORT'
    const openShares = Math.abs(net)
    const avgEntry =
      direction === 'LONG'
        ? entry.buyShares > 0
          ? entry.buyCost / entry.buyShares
          : null
        : entry.sellShares > 0
          ? entry.sellProceeds / entry.sellShares
          : null

    positions.push({
      tokenId: entry.tokenId,
      marketId: entry.marketId,
      outcome: entry.outcome,
      direction,
      side: direction === 'LONG' ? 'BUY' : 'SELL',
      size: Number(openShares.toFixed(6)),
      avgEntryPrice: avgEntry ? Number(avgEntry.toFixed(4)) : null,
      grossBuys: {
        shares: Number(entry.buyShares.toFixed(6)),
        cost: Number(entry.buyCost.toFixed(4)),
      },
      grossSells: {
        shares: Number(entry.sellShares.toFixed(6)),
        cost: Number(entry.sellProceeds.toFixed(4)),
      },
      firstTradeAt: entry.firstTradeAt,
      lastTradeAt: entry.lastTradeAt,
    })
  }

  positions.sort((a, b) => (b.lastTradeAt || '').localeCompare(a.lastTradeAt || ''))
  return positions
}
