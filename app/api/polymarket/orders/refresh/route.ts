import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { ClobClient } from '@polymarket/clob-client'
import type { Trade } from '@polymarket/clob-client/dist/types'
import { ApiCredentials } from '@/lib/polymarket/clob'
import {
  CLOB_ENCRYPTION_KEY,
  CLOB_ENCRYPTION_KEY_V1,
  CLOB_ENCRYPTION_KEY_V2,
  POLYMARKET_CLOB_BASE_URL,
} from '@/lib/turnkey/config'
import { createDecipheriv, createHash } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

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
  const remainingSize =
    originalSize !== null && Number.isFinite(originalSize - filledSize)
      ? originalSize - filledSize
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
    filled_size: filledSize,
    remaining_size: remainingSize,
    status: String(order?.status || 'open').toLowerCase(),
    created_at: createdAt ? createdAt.toISOString() : new Date().toISOString(),
    updated_at: updatedAt ? updatedAt.toISOString() : new Date().toISOString(),
    raw: order ?? {},
  }
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
  try {
    const tradesResp = await client.getTradesPaginated({ limit })
    trades = Array.isArray(tradesResp?.trades) ? tradesResp.trades : []
  } catch (error) {
    console.warn('[POLY-ORDERS-REFRESH] trades fetch without filter failed, falling back', error)
    const tradesResp = await client.getTradesPaginated({ maker_address: proxyAddress, limit })
    trades = Array.isArray(tradesResp?.trades) ? tradesResp.trades : []
  }
  const orderIds = new Set<string>(openOrders.map((o: any) => o?.id).filter(Boolean))
  for (const id of extractOrderIds(trades)) orderIds.add(id)

  const { data: existingOrders } = await supabaseServiceRole
    .from('orders')
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
    (order) => order.polymarket_order_id && order.market_id && order.side
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

  const payload = filteredOrders.map((order) => ({
    order_id: order.polymarket_order_id,
    trader_id: traderId,
    market_id: order.market_id,
    outcome: order.outcome,
    side: order.side,
    order_type: order.order_type,
    time_in_force: order.time_in_force,
    price: order.price,
    size: order.size,
    filled_size: order.filled_size,
    remaining_size: order.remaining_size,
    status: order.status,
    created_at: order.created_at,
    updated_at: order.updated_at,
    raw: order.raw,
  }))

  const payloadOrderIds = payload.map((order) => order.order_id)
  const { data: existingOrderRows } = await supabaseServiceRole
    .from('orders')
    .select('order_id')
    .eq('trader_id', traderId)
    .in('order_id', payloadOrderIds)

  const existingIds = new Set((existingOrderRows || []).map((row) => row.order_id))
  const insertedCount = payload.filter((order) => !existingIds.has(order.order_id)).length
  const updatedCount = payload.length - insertedCount

  const { error: upsertError } = await supabaseServiceRole
    .from('orders')
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
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  let userId: string | null = user?.id ?? null
  const devOverrideUserId =
    DEV_BYPASS_AUTH ? request.headers.get('x-dev-user-id')?.trim() : null
  if (!userId && devOverrideUserId) {
    userId = devOverrideUserId
  }
  if (!userId && DEV_BYPASS_AUTH && process.env.TURNKEY_DEV_BYPASS_USER_ID) {
    userId = process.env.TURNKEY_DEV_BYPASS_USER_ID
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in', details: authError?.message },
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
