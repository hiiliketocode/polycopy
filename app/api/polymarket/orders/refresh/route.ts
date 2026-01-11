import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'
import { ClobClient } from '@polymarket/clob-client'
import type { Trade, TradeParams } from '@polymarket/clob-client/dist/types'
import { ApiCredentials } from '@/lib/polymarket/clob'
import {
  CLOB_ENCRYPTION_KEY,
  CLOB_ENCRYPTION_KEY_V1,
  CLOB_ENCRYPTION_KEY_V2,
  POLYMARKET_CLOB_BASE_URL,
} from '@/lib/turnkey/config'
import { createDecipheriv, createHash } from 'crypto'
import { resolveOrdersTableName } from '@/lib/orders/table'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseServiceRole = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
)

const POLYGON_CHAIN_ID = 137
const DEFAULT_LIMIT = 200
const REFRESH_DEDUPE_MS = 4000

type RefreshResult = {
  ok: boolean
  refreshedAt: string
  insertedCount: number
  updatedCount: number
  total: number
  deduped?: boolean
}

const inFlightRefreshes = new Map<
  string,
  { startedAt: number; promise: Promise<RefreshResult> }
>()

function parseNumber(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null) return null
  const n = typeof value === 'string' ? parseFloat(value) : value
  return Number.isFinite(n) ? n : null
}

function parseTimestamp(value: string | number | null | undefined): Date | null {
  if (value === undefined || value === null) return null
  const n = typeof value === 'string' ? parseInt(value, 10) : value
  const ms = n < 10_000_000_000 ? n * 1000 : n
  return new Date(ms)
}

function columnMissing(error: any) {
  if (!error) return false
  const code = error?.code
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : ''
  return code === '42703' || message.includes('column') || message.includes('does not exist')
}

function getEncryptionKeyForKid(kid?: string | null): string {
  if (kid === 'v2' && CLOB_ENCRYPTION_KEY_V2) return CLOB_ENCRYPTION_KEY_V2
  if (kid === 'v1' && CLOB_ENCRYPTION_KEY_V1) return CLOB_ENCRYPTION_KEY_V1
  return CLOB_ENCRYPTION_KEY
}

function decryptSecret(ciphertext: string, kid?: string | null): string {
  const [ivHex, encrypted] = ciphertext.split(':')
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted secret format')
  }
  const keyMaterial = getEncryptionKeyForKid(kid)
  const key = createHash('sha256').update(keyMaterial).digest()
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function createHeaderOnlySigner(address: string) {
  return {
    getAddress: async () => address,
  } as any
}

function createReadOnlyClient(address: string, apiCreds: ApiCredentials) {
  const signer = createHeaderOnlySigner(address)
  return new ClobClient(
    POLYMARKET_CLOB_BASE_URL,
    POLYGON_CHAIN_ID as any,
    signer,
    {
      key: apiCreds.key,
      secret: apiCreds.secret,
      passphrase: apiCreds.passphrase,
    } as any
  )
}

function normalizeOrder(order: any) {
  const originalSize =
    parseNumber(order?.original_size) ??
    parseNumber(order?.size) ??
    parseNumber(order?.amount) ??
    null
  const filledSize =
    parseNumber(order?.size_matched) ??
    parseNumber(order?.filled_size) ??
    parseNumber(order?.filledSize) ??
    0
  const cappedFilledSize =
    originalSize !== null && Number.isFinite(originalSize) && filledSize > originalSize
      ? originalSize
      : filledSize
  const remainingSize =
    originalSize !== null && Number.isFinite(originalSize - cappedFilledSize)
      ? Math.max(originalSize - cappedFilledSize, 0)
      : parseNumber(order?.remaining_size)

  const createdAt = parseTimestamp(order?.created_at)
  const updatedAt =
    parseTimestamp(order?.updated_at) ||
    parseTimestamp(order?.last_update) ||
    createdAt

  const orderType = order?.order_type || order?.orderType || null
  const timeInForce = order?.time_in_force || order?.timeInForce || orderType || null
  return {
    polymarket_order_id: String(order?.id || order?.order_id || ''),
    market_id: String(order?.market || order?.asset_id || order?.market_id || ''),
    outcome: order?.outcome ?? null,
    side: String(order?.side || '').toLowerCase(),
    order_type: orderType ? String(orderType) : null,
    time_in_force: timeInForce ? String(timeInForce).toUpperCase() : null,
    price: parseNumber(order?.price),
    size: originalSize ?? 0,
    filled_size: cappedFilledSize,
    remaining_size: remainingSize,
    status: String(order?.status || 'open').toLowerCase(),
    created_at: createdAt ? createdAt.toISOString() : new Date().toISOString(),
    updated_at: updatedAt ? updatedAt.toISOString() : new Date().toISOString(),
    raw: order ?? {},
  }
}

function normalizeOrderType(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function isGtcOrder(order: any): boolean {
  const value =
    order?.time_in_force ??
    order?.timeInForce ??
    order?.order_type ??
    order?.orderType ??
    ''
  const normalized = normalizeOrderType(value)
  return (
    normalized === 'gtc' ||
    normalized === 'good_til_cancelled' ||
    normalized === 'good_til_canceled' ||
    normalized === 'good til cancelled' ||
    normalized === 'good til canceled'
  )
}

function shouldPersistOrder(order: ReturnType<typeof normalizeOrder>): boolean {
  const status = String(order.status || '').toLowerCase()
  const filled = typeof order.filled_size === 'number' ? order.filled_size : 0
  const openLikeStatuses = new Set(['open', 'pending', 'submitted', 'accepted', 'unknown'])
  if (openLikeStatuses.has(status) && filled <= 0 && !isGtcOrder(order.raw)) {
    return false
  }
  return true
}

function extractOrderIds(trades: Trade[]): Set<string> {
  const orderIds = new Set<string>()
  for (const trade of trades || []) {
    const makers = trade.maker_orders || []
    for (const maker of makers) {
      if (maker?.order_id) orderIds.add(maker.order_id)
    }
    if (trade.taker_order_id) {
      orderIds.add(trade.taker_order_id)
    }
  }
  return orderIds
}

async function ensureTraderId(walletAddress: string) {
  const normalized = walletAddress.toLowerCase()
  const { data: existing } = await supabaseServiceRole
    .from('traders')
    .select('id')
    .eq('wallet_address', normalized)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: inserted, error } = await supabaseServiceRole
    .from('traders')
    .insert({ wallet_address: normalized })
    .select('id')
    .single()

  if (error) {
    throw error
  }

  return inserted.id
}

async function refreshOrders(userId: string, limit: number): Promise<RefreshResult> {
  const ordersTable = await resolveOrdersTableName(supabaseServiceRole)

  const { data: credential, error: credentialError } = await supabaseServiceRole
    .from('clob_credentials')
    .select('api_key, api_secret_encrypted, api_passphrase_encrypted, enc_kid, polymarket_account_address, turnkey_address')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (credentialError || !credential) {
    throw new Error('No Polymarket API credentials found. Run L2 credential setup.')
  }

  const proxyAddress = credential.polymarket_account_address?.toLowerCase()
  if (!proxyAddress) {
    throw new Error('Polymarket account address missing for credentials')
  }

  const apiCreds: ApiCredentials = {
    key: credential.api_key,
    secret: decryptSecret(credential.api_secret_encrypted, credential.enc_kid),
    passphrase: decryptSecret(credential.api_passphrase_encrypted, credential.enc_kid),
  }

  const signerAddress = credential.turnkey_address?.toLowerCase() || proxyAddress
  const client = createReadOnlyClient(signerAddress, apiCreds)
  const traderId = await ensureTraderId(proxyAddress)

  const openOrders = await client.getOpenOrders({}, true)

  let trades: Trade[] = []
  type TradeQuery = TradeParams & { limit?: number }

  try {
    const tradesResp = await client.getTradesPaginated({ limit } as TradeQuery)
    trades = Array.isArray(tradesResp?.trades) ? tradesResp.trades : []
  } catch (error) {
    console.warn('[POLY-ORDERS-REFRESH] trades fetch without filter failed, falling back', error)
    const tradesResp = await client.getTradesPaginated(
      { maker_address: proxyAddress, limit } as TradeQuery
    )
    trades = Array.isArray(tradesResp?.trades) ? tradesResp.trades : []
  }
  const orderIds = new Set<string>(openOrders.map((o: any) => o?.id).filter(Boolean))
  for (const id of extractOrderIds(trades)) orderIds.add(id)

  const { data: existingOrders } = await supabaseServiceRole
    .from(ordersTable)
    .select('order_id')
    .eq('trader_id', traderId)
    .order('updated_at', { ascending: false })
    .limit(limit)

  for (const existing of existingOrders || []) {
    if (existing?.order_id) orderIds.add(existing.order_id)
  }

  const ids = Array.from(orderIds).slice(0, limit)
  const orders = (
    await Promise.all(
      ids.map(async (id) => {
        try {
          const order = await client.getOrder(id)
          return normalizeOrder(order)
        } catch (error) {
          console.error('[POLY-ORDERS-REFRESH] Failed to fetch order', id, error)
          return null
        }
      })
    )
  ).filter((order): order is ReturnType<typeof normalizeOrder> => Boolean(order))

  const filteredOrders = orders.filter(
    (order) =>
      order.polymarket_order_id &&
      order.market_id &&
      order.side &&
      shouldPersistOrder(order)
  )
  if (filteredOrders.length === 0) {
    return {
      ok: true,
      refreshedAt: new Date().toISOString(),
      insertedCount: 0,
      updatedCount: 0,
      total: 0,
    }
  }

  const payloadOrderIds = filteredOrders.map((order) => order.polymarket_order_id)
  let supportsCopiedColumns = true
  let existingOrderRows: Array<{
    order_id: string
    order_type?: string | null
    time_in_force?: string | null
    copied_trader_id?: string | null
    copied_trader_wallet?: string | null
  }> = []

  try {
    const { data, error } = await supabaseServiceRole
      .from(ordersTable)
      .select('order_id, order_type, time_in_force, copied_trader_id, copied_trader_wallet')
      .eq('trader_id', traderId)
      .in('order_id', payloadOrderIds)

    if (error) {
      if (columnMissing(error)) {
        supportsCopiedColumns = false
      } else {
        throw error
      }
    }

    if (data) {
      existingOrderRows = data as typeof existingOrderRows
    }
  } catch (error) {
    console.warn('[POLY-ORDERS-REFRESH] existing order lookup failed', error)
  }

  if (!supportsCopiedColumns) {
    const { data, error } = await supabaseServiceRole
      .from(ordersTable)
      .select('order_id, order_type, time_in_force')
      .eq('trader_id', traderId)
      .in('order_id', payloadOrderIds)

    if (!error && data) {
      existingOrderRows = data as typeof existingOrderRows
    }
  }

  const existingOrderMap = new Map(
    existingOrderRows.map((row) => [row.order_id, row])
  )

  const payload = filteredOrders.map((order) => {
    const existing = existingOrderMap.get(order.polymarket_order_id)
    const resolvedOrderType = existing?.order_type ?? order.order_type ?? null
    const resolvedTimeInForce = existing?.time_in_force ?? order.time_in_force ?? null
    const row = {
      order_id: order.polymarket_order_id,
      trader_id: traderId,
      market_id: order.market_id,
      outcome: order.outcome,
      side: order.side,
      order_type: resolvedOrderType,
      time_in_force: resolvedTimeInForce,
      price: order.price,
      size: order.size,
      filled_size: order.filled_size,
      remaining_size: order.remaining_size,
      status: order.status,
      created_at: order.created_at,
      updated_at: order.updated_at,
      raw: order.raw,
    } as Record<string, unknown>

    if (supportsCopiedColumns) {
      row.copied_trader_id = existing?.copied_trader_id ?? null
      row.copied_trader_wallet = existing?.copied_trader_wallet ?? null
    }

    return row
  })

  const existingIds = new Set(existingOrderRows.map((row) => row.order_id))
  const insertedCount = payload.filter((order) => {
    const orderId = typeof order.order_id === 'string' ? order.order_id : String(order.order_id || '')
    return !existingIds.has(orderId)
  }).length
  const updatedCount = payload.length - insertedCount

  const { error: upsertError } = await supabaseServiceRole
    .from(ordersTable)
    .upsert(payload, { onConflict: 'order_id' })

  if (upsertError) {
    throw upsertError
  }

  return {
    ok: true,
    refreshedAt: new Date().toISOString(),
    insertedCount,
    updatedCount,
    total: payload.length,
  }
}

export async function POST(request: NextRequest) {
  // Use centralized secure auth utility
  const userId = await getAuthenticatedUserId(request)

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in' },
      { status: 401 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const limit = Math.max(1, Math.min(DEFAULT_LIMIT, Number(body?.limit || DEFAULT_LIMIT)))

  const now = Date.now()
  const existing = inFlightRefreshes.get(userId)
  if (existing && now - existing.startedAt < REFRESH_DEDUPE_MS) {
    try {
      const result = await existing.promise
      return NextResponse.json({ ...result, deduped: true })
    } catch (error: any) {
      return NextResponse.json(
        { error: error?.message || 'Refresh failed' },
        { status: 500 }
      )
    }
  }

  const refreshPromise = refreshOrders(userId, limit).finally(() => {
    const current = inFlightRefreshes.get(userId)
    if (current?.promise === refreshPromise) {
      inFlightRefreshes.delete(userId)
    }
  })

  inFlightRefreshes.set(userId, { startedAt: now, promise: refreshPromise })

  try {
    const result = await refreshPromise
    return NextResponse.json(result)
  } catch (error: any) {
    const message = error?.message || String(error)
    console.error('[POLY-ORDERS-REFRESH] Error:', message)
    if (
      message.includes('No Polymarket API credentials found') ||
      message.includes('Polymarket account address missing')
    ) {
      return NextResponse.json({ error: message }, { status: 400 })
    }
    return NextResponse.json(
      { error: message || 'Failed to refresh orders' },
      { status: 500 }
    )
  }
}
