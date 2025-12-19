import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'
import type { Trade } from '@polymarket/clob-client/dist/types'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

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

function upsertPosition(acc: Map<string, PositionAccumulator>, trade: Trade) {
  const tokenId = trade.asset_id
  if (!tokenId) return

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
  if (trade.side === 'BUY') {
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

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  let userId: string | null = user?.id ?? null
  if (!userId && DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
    userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in', details: authError?.message },
      { status: 401 }
    )
  }

  try {
    const { client, proxyAddress, signerAddress } = await getAuthedClobClientForUser(userId)
    const trades: Trade[] = await client.getTrades({}, false)
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
