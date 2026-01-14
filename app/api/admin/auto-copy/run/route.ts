import { NextResponse } from 'next/server'
import { createAdminServiceClient, getAdminSessionUser } from '@/lib/admin'
import { requireEvomiProxyAgent } from '@/lib/evomi/proxy'
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client'
import { roundDownToStep } from '@/lib/polymarket/sizing'

type PolymarketTrade = {
  transactionHash?: string
  asset?: string
  conditionId?: string
  title?: string
  slug?: string
  outcome?: string
  side?: string
  size?: number | string
  price?: number | string
  timestamp?: number | string
}

const toNumber = (value: unknown): number | null => {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const parseTradeTimestamp = (value: PolymarketTrade['timestamp']): Date | null => {
  if (value === null || value === undefined) return null
  let ts = Number(value)
  if (!Number.isFinite(ts)) return null
  if (ts < 10000000000) ts *= 1000
  const date = new Date(ts)
  return Number.isNaN(date.getTime()) ? null : date
}

async function fetchRecentTrades(
  wallet: string,
  since: Date | null,
  maxTrades: number
): Promise<PolymarketTrade[]> {
  const normalizedWallet = wallet.toLowerCase()
  const pageSize = 200
  let offset = 0
  const collected: { trade: PolymarketTrade; ts: Date }[] = []
  const sinceMs = since?.getTime() ?? 0

  while (collected.length < maxTrades) {
    const url = `https://data-api.polymarket.com/trades?user=${normalizedWallet}&limit=${pageSize}&offset=${offset}`
    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`Polymarket trades API ${response.status}`)
    }
    const trades: PolymarketTrade[] = await response.json()
    if (!Array.isArray(trades) || trades.length === 0) break

    for (const trade of trades) {
      const ts = parseTradeTimestamp(trade.timestamp)
      if (!ts) continue
      if (sinceMs && ts.getTime() <= sinceMs) {
        // We have reached already-processed trades
        return collected.sort((a, b) => a.ts.getTime() - b.ts.getTime()).map((row) => row.trade)
      }
      collected.push({ trade, ts })
      if (collected.length >= maxTrades) break
    }

    if (trades.length < pageSize) break
    offset += pageSize
  }

  return collected.sort((a, b) => a.ts.getTime() - b.ts.getTime()).map((row) => row.trade)
}

async function handleAutoCopyRun(request: Request, params: { configId?: string | null; copyUserId?: string | null; maxTrades?: number }) {
  const authHeader = request.headers.get('authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : null
  const cronSecret = process.env.CRON_SECRET
  const isCron = Boolean(cronSecret && bearer && bearer === cronSecret)

  const adminUser = isCron ? null : await getAdminSessionUser()
  if (!adminUser && !isCron) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminServiceClient()
  const configId = params.configId
  const copyUserId = params.copyUserId
  const maxTradesPerConfig = Math.max(1, Math.min(50, Number(params.maxTrades || 25)))

  // Ensure proxy is configured for upstream Polymarket calls
  try {
    await requireEvomiProxyAgent('auto-copy runner')
  } catch (error: any) {
    console.error('[auto-copy/run] proxy unavailable', error)
    return NextResponse.json({ error: 'Proxy unavailable for Polymarket' }, { status: 503 })
  }

  let configQuery = supabase.from('auto_copy_configs').select('*').eq('paused', false).order('updated_at', { ascending: false })

  if (configId) {
    configQuery = configQuery.eq('id', configId)
  }
  if (adminUser) {
    configQuery = configQuery.eq('copy_user_id', adminUser.id)
  } else if (copyUserId) {
    configQuery = configQuery.eq('copy_user_id', copyUserId)
  }

  const { data: configs, error: configError } = await configQuery

  if (configError) {
    console.error('[auto-copy/run] failed to fetch configs', configError)
    return NextResponse.json({ error: configError.message }, { status: 500 })
  }

  const results: any[] = []

  for (const config of configs ?? []) {
    const since = config.last_trader_trade_ts ? new Date(config.last_trader_trade_ts) : null
    const summary = {
      configId: config.id,
      traderWallet: config.trader_wallet,
      processed: 0,
      placed: 0,
      skipped: 0,
      errors: [] as string[],
    }

    let trades: PolymarketTrade[] = []
    try {
      trades = await fetchRecentTrades(config.trader_wallet, since, maxTradesPerConfig)
    } catch (error: any) {
      console.error('[auto-copy/run] fetch trades failed', { trader: config.trader_wallet, error })
      summary.errors.push(error?.message || 'Failed to fetch trades')
      results.push(summary)
      continue
    }

    if (!trades.length) {
      results.push(summary)
      continue
    }

    let lastProcessedTs: string | null = null
    let lastProcessedId: string | null = null

    // Precompute day limit
    let dailyCount = 0
    const maxPerDay = Number.isFinite(config.max_trades_per_day) ? config.max_trades_per_day : null
    if (maxPerDay) {
      const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { count, error } = await supabase
        .from('auto_copy_logs')
        .select('*', { count: 'exact', head: true })
        .eq('config_id', config.id)
        .gte('executed_at', sinceDate)
      if (!error && typeof count === 'number') {
        dailyCount = count
      }
    }

    for (const trade of trades) {
      summary.processed += 1
      const ts = parseTradeTimestamp(trade.timestamp)
      if (!ts) {
        summary.skipped += 1
        continue
      }

      // Respect time window
      if (config.time_window_start && ts < new Date(config.time_window_start)) {
        summary.skipped += 1
        continue
      }
      if (config.time_window_end && ts > new Date(config.time_window_end)) {
        summary.skipped += 1
        continue
      }

      // Enforce per-day cap
      if (maxPerDay && dailyCount >= maxPerDay) {
        summary.skipped += 1
        continue
      }

      const price = toNumber(trade.price)
      const size = toNumber(trade.size)
      if (price === null || size === null || price <= 0 || size <= 0) {
        summary.skipped += 1
        continue
      }

      if (config.min_price !== null && config.min_price !== undefined && price < config.min_price) {
        summary.skipped += 1
        continue
      }
      if (config.max_price !== null && config.max_price !== undefined && price > config.max_price) {
        summary.skipped += 1
        continue
      }

      const baseUsd = price * size
      const minUsd = Number.isFinite(config.min_trade_usd) ? Number(config.min_trade_usd) : 0
      const maxUsd = Number.isFinite(config.max_trade_usd) ? Number(config.max_trade_usd) : baseUsd
      const allocationCap = Number.isFinite(config.allocation_usd)
        ? Number(config.allocation_usd)
        : maxUsd
      const clampedUsd = clamp(baseUsd, minUsd, maxUsd)
      const finalUsd = Math.min(clampedUsd, allocationCap)
      if (!Number.isFinite(finalUsd) || finalUsd <= 0) {
        summary.skipped += 1
        continue
      }

      const tokenId = trade.asset || trade.conditionId
      const outcome = (trade.outcome as string | undefined)?.toUpperCase() || 'YES'
      const side = (trade.side as string | undefined)?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY'
      if (!tokenId) {
        summary.errors.push('Missing token/condition id')
        summary.skipped += 1
        continue
      }

      try {
        const { client, signatureType } = await getAuthedClobClientForUserAnyWallet(config.copy_user_id)
        const sizeContracts = finalUsd / price
        const roundedPrice = roundDownToStep(price, 0.01)
        const roundedSize = roundDownToStep(sizeContracts, 0.01)

        const order = await client.createOrder(
          { tokenID: tokenId, price: roundedPrice, size: roundedSize, side: side as any },
          { signatureType } as any
        )
        const rawResult = await client.postOrder(order, 'GTC' as any, false)

        await supabase.from('auto_copy_logs').insert({
          config_id: config.id,
          copy_user_id: config.copy_user_id,
          trader_wallet: config.trader_wallet,
          trader_username: config.trader_username ?? null,
          trader_profile_image_url: config.trader_profile_image_url ?? null,
          market_id: trade.conditionId ?? null,
          market_slug: trade.slug ?? null,
          market_title: (trade.title as string) ?? 'Auto copy trade',
          outcome,
          side: side.toLowerCase(),
          size: roundedSize,
          price: roundedPrice,
          amount_usd: finalUsd,
          allocation_usd: config.allocation_usd,
          status: 'executed',
          trade_method: 'auto',
          executed_at: ts.toISOString(),
          notes: 'Auto copy execution',
        })

        dailyCount += 1
        summary.placed += 1
        lastProcessedTs = ts.toISOString()
        lastProcessedId = trade.transactionHash || trade.asset || trade.conditionId || null
      } catch (error: any) {
        console.error('[auto-copy/run] execution failed', error)
        summary.errors.push(error?.message || 'Execution failed')
      }
    }

    if (lastProcessedTs) {
      await supabase
        .from('auto_copy_configs')
        .update({
          last_trader_trade_ts: lastProcessedTs,
          last_trader_trade_id: lastProcessedId,
          last_simulation_at: lastProcessedTs,
        })
        .eq('id', config.id)
    }

    results.push(summary)
  }

  return NextResponse.json({ results })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const params = {
    configId: searchParams.get('configId'),
    copyUserId: searchParams.get('copyUserId'),
    maxTrades: Number(searchParams.get('maxTrades') || '25'),
  }
  return handleAutoCopyRun(request, params)
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const params = {
    configId: typeof body?.configId === 'string' ? body.configId : null,
    copyUserId: typeof body?.copyUserId === 'string' ? body.copyUserId : null,
    maxTrades: Number(body?.maxTrades || 25),
  }
  return handleAutoCopyRun(request, params)
}
