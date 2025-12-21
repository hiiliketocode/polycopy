import { ClobClient } from '@polymarket/clob-client'
import type { OpenOrder, Trade, MakerOrder } from '@polymarket/clob-client/dist/types'
import { POLYMARKET_CLOB_BASE_URL } from '@/lib/turnkey/config'

const POLYGON_CHAIN_ID = 137
const DEFAULT_PAGE_SIZE = 200
const DEFAULT_RETRIES = 3
const DEFAULT_BACKOFF_MS = 500

export type ClobCredentials = {
  key: string
  secret: string
  passphrase: string
  address: string
}

export type NormalizedOrder = {
  orderId: string
  traderWallet: string
  marketId: string
  outcome: string | null
  side: string
  orderType: string | null
  timeInForce: string | null
  price: number | null
  size: number
  filledSize: number
  remainingSize: number | null
  status: string
  expiration: Date | null
  raw: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

export type NormalizedFill = {
  fillId: string
  orderId: string
  traderWallet: string
  marketId: string
  price: number
  size: number
  outcome: string | null
  side: string | null
  filledAt: Date
}

function loadCredentials(): ClobCredentials {
  const key = process.env.POLYMARKET_CLOB_API_KEY
  const secret = process.env.POLYMARKET_CLOB_API_SECRET
  const passphrase = process.env.POLYMARKET_CLOB_API_PASSPHRASE
  const address = process.env.POLYMARKET_CLOB_API_ADDRESS

  if (!key || !secret || !passphrase || !address) {
    throw new Error('Missing Polymarket CLOB API credentials (POLYMARKET_CLOB_API_KEY/SECRET/PASSPHRASE/ADDRESS)')
  }

  return { key, secret, passphrase, address }
}

// createL2Headers requires a signer that can return an address; we provide a header-only signer.
function createHeaderOnlySigner(address: string) {
  return {
    getAddress: async () => address
  } as any
}

function createClient(creds: ClobCredentials): ClobClient {
  const signer = createHeaderOnlySigner(creds.address)
  return new ClobClient(
    POLYMARKET_CLOB_BASE_URL,
    POLYGON_CHAIN_ID as any,
    signer,
    {
      key: creds.key,
      secret: creds.secret,
      passphrase: creds.passphrase
    } as any
  )
}

async function withBackoff<T>(fn: () => Promise<T>, retries: number = DEFAULT_RETRIES, backoffMs: number = DEFAULT_BACKOFF_MS): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (retries <= 0) throw err
    await new Promise((resolve) => setTimeout(resolve, backoffMs))
    return withBackoff(fn, retries - 1, backoffMs * 2)
  }
}

function parseNumber(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null) return null
  const n = typeof value === 'string' ? parseFloat(value) : value
  return Number.isFinite(n) ? n : null
}

function parseTimestamp(value: string | number | null | undefined): Date {
  if (value === undefined || value === null) return new Date()
  const n = typeof value === 'string' ? parseInt(value, 10) : value
  const ms = n < 10_000_000_000 ? n * 1000 : n
  return new Date(ms)
}

function mapOrder(openOrder: OpenOrder, traderWallet: string): NormalizedOrder {
  const originalSize = parseNumber(openOrder.original_size) ?? 0
  const matched = parseNumber(openOrder.size_matched) ?? 0
  const remaining = Number.isFinite(originalSize - matched) ? originalSize - matched : null

  return {
    orderId: openOrder.id,
    traderWallet,
    marketId: openOrder.market || openOrder.asset_id || '',
    outcome: openOrder.outcome || null,
    side: (openOrder.side || '').toLowerCase(),
    orderType: openOrder.order_type || null,
    timeInForce: openOrder.order_type || null,
    price: parseNumber(openOrder.price),
    size: originalSize,
    filledSize: matched,
    remainingSize: remaining,
    status: (openOrder.status || 'open').toLowerCase(),
    expiration: openOrder.expiration ? new Date(openOrder.expiration) : null,
    raw: openOrder as unknown as Record<string, unknown>,
    createdAt: parseTimestamp(openOrder.created_at),
    updatedAt: parseTimestamp(openOrder.created_at)
  }
}

function mapFillFromTrade(trade: Trade, makerOrder: MakerOrder, traderWallet: string): NormalizedFill {
  const fillId = `${trade.id}-${makerOrder.order_id}`
  return {
    fillId,
    orderId: makerOrder.order_id,
    traderWallet,
    marketId: trade.market || trade.asset_id || '',
    price: parseNumber(makerOrder.price) ?? 0,
    size: parseNumber(makerOrder.matched_amount) ?? 0,
    outcome: makerOrder.outcome || trade.outcome || null,
    side: (makerOrder.side || '').toLowerCase() || null,
    filledAt: parseTimestamp(trade.match_time || trade.last_update)
  }
}

export async function fetchTradesForWallet(wallet: string, after?: Date) {
  const creds = loadCredentials()
  const client = createClient(creds)
  return fetchTradesForWalletWithClient(client, wallet, after)
}

export async function fetchOrder(orderId: string): Promise<NormalizedOrder | null> {
  const creds = loadCredentials()
  const client = createClient(creds)
  return fetchOrderWithClient(client, orderId)
}

export async function fetchOpenOrdersForWallet(wallet: string) {
  const creds = loadCredentials()
  const client = createClient(creds)
  return fetchOpenOrdersForWalletWithClient(client, wallet)
}

export async function fetchTradesForWalletWithClient(client: ClobClient, wallet: string, after?: Date) {
  const params: any = {
    maker_address: wallet.toLowerCase(),
    limit: DEFAULT_PAGE_SIZE
  }

  if (after) {
    params.after = Math.floor(after.getTime() / 1000).toString()
  }

  return withBackoff(async () => client.getTradesPaginated(params))
}

export async function fetchTradesForAuthedClient(client: ClobClient, after?: Date) {
  const params: any = {
    limit: DEFAULT_PAGE_SIZE
  }

  if (after) {
    params.after = Math.floor(after.getTime() / 1000).toString()
  }

  return withBackoff(async () => client.getTradesPaginated(params))
}

export async function fetchOrderWithClient(client: ClobClient, orderId: string): Promise<NormalizedOrder | null> {
  const order = await withBackoff(() => client.getOrder(orderId))
  if (!order) return null
  return mapOrder(order, order.owner || order.maker_address || '')
}

export async function fetchOpenOrdersForWalletWithClient(client: ClobClient, wallet: string) {
  const params: any = { owner: wallet.toLowerCase(), maker_address: wallet.toLowerCase() }
  return withBackoff(async () => client.getOpenOrders(params))
}

export function normalizeTradesToFills(trades: Trade[], wallet: string): { fills: NormalizedFill[]; orderIds: Set<string>; lastMatchAt: Date | null } {
  const fills: NormalizedFill[] = []
  const orderIds = new Set<string>()
  let lastMatchAt: Date | null = null

  for (const trade of trades) {
    const makers = trade.maker_orders || []
    for (const maker of makers) {
      if (maker.maker_address?.toLowerCase() !== wallet.toLowerCase()) continue
      const fill = mapFillFromTrade(trade, maker, wallet)
      fills.push(fill)
      orderIds.add(maker.order_id)
      if (!lastMatchAt || fill.filledAt > lastMatchAt) {
        lastMatchAt = fill.filledAt
      }
    }

    if (trade.trader_side === 'TAKER' && trade.taker_order_id) {
      const fillId = `${trade.id}-${trade.taker_order_id}`
      const filledAt = parseTimestamp(trade.match_time || trade.last_update)
      fills.push({
        fillId,
        orderId: trade.taker_order_id,
        traderWallet: wallet,
        marketId: trade.market || trade.asset_id || '',
        price: parseNumber(trade.price) ?? 0,
        size: parseNumber(trade.size) ?? 0,
        outcome: trade.outcome || null,
        side: (trade.side || '').toLowerCase() || null,
        filledAt
      })
      orderIds.add(trade.taker_order_id)
      if (!lastMatchAt || filledAt > lastMatchAt) {
        lastMatchAt = filledAt
      }
    }
  }

  return { fills, orderIds, lastMatchAt }
}

export function mapOrderFromTradeFallback(trade: Trade, traderWallet: string): NormalizedOrder | null {
  const maker = (trade.maker_orders || []).find((m) => m.maker_address?.toLowerCase() === traderWallet.toLowerCase())
  if (!maker) return null

  const createdAt = parseTimestamp(trade.match_time || trade.last_update)
  return {
    orderId: maker.order_id,
    traderWallet,
    marketId: trade.market || trade.asset_id || '',
    outcome: maker.outcome || trade.outcome || null,
    side: (maker.side || trade.side || '').toLowerCase(),
    orderType: null,
    timeInForce: null,
    price: parseNumber(maker.price),
    size: parseNumber(maker.matched_amount) ?? 0,
    filledSize: parseNumber(maker.matched_amount) ?? 0,
    remainingSize: null,
    status: (trade.status || 'filled').toLowerCase(),
    expiration: null,
    raw: trade as unknown as Record<string, unknown>,
    createdAt,
    updatedAt: createdAt
  }
}
