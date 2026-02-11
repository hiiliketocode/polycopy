/**
 * GET /api/polymarket/orders/[orderId]/clob-status
 * Ping the CLOB for live order status. Works for both quick-trade (session wallet)
 * and LT orders (resolves user from lt_strategies and uses any-wallet client).
 * Returns status, size_matched, and raw CLOB response.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client'
import { ClobClient } from '@polymarket/clob-client'
import { ApiCredentials } from '@/lib/polymarket/clob'
import { CLOB_ENCRYPTION_KEY_V1, POLYMARKET_CLOB_BASE_URL } from '@/lib/turnkey/config'
import { createHash, createDecipheriv } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseServiceRole = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const POLYGON_CHAIN_ID = 137

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

function decryptSecretV1(ciphertext: string): string {
  if (!CLOB_ENCRYPTION_KEY_V1) throw new Error('CLOB_ENCRYPTION_KEY_V1 is not configured')
  const [ivHex, encrypted] = ciphertext.split(':')
  if (!ivHex || !encrypted) throw new Error('Invalid encrypted secret format')
  const key = createHash('sha256').update(CLOB_ENCRYPTION_KEY_V1).digest()
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function createReadOnlyClient(address: string, apiCreds: ApiCredentials) {
  const signer = { getAddress: async () => address } as any
  return new ClobClient(POLYMARKET_CLOB_BASE_URL, POLYGON_CHAIN_ID as any, signer, {
    key: apiCreds.key,
    secret: apiCreds.secret,
    passphrase: apiCreds.passphrase,
  } as any)
}

function normalizeOrder(order: any) {
  const originalSize =
    parseNumber(order?.original_size) ?? parseNumber(order?.size) ?? parseNumber(order?.amount) ?? null
  const filledSize =
    parseNumber(order?.size_matched) ?? parseNumber(order?.filled_size) ?? parseNumber(order?.filledSize) ?? 0
  const cappedFilledSize =
    originalSize !== null && Number.isFinite(originalSize) && filledSize > originalSize ? originalSize : filledSize
  const remainingSize =
    originalSize !== null && Number.isFinite(originalSize - cappedFilledSize)
      ? Math.max(originalSize - cappedFilledSize, 0)
      : parseNumber(order?.remaining_size)
  const updated =
    parseTimestamp(order?.updated_at) || parseTimestamp(order?.last_update) || parseTimestamp(order?.created_at)
  return {
    status: String(order?.status || 'unknown').toLowerCase(),
    size: originalSize,
    filledSize: cappedFilledSize,
    size_matched: cappedFilledSize,
    remainingSize,
    price: parseNumber(order?.price),
    marketId: order?.market || order?.asset_id || order?.market_id || null,
    updatedAt: updated ? updated.toISOString() : null,
  }
}

type RouteParams = { params: Promise<{ orderId: string }> }

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { orderId: orderIdFromPath } = await params
  let orderId = (orderIdFromPath || request.nextUrl.searchParams.get('orderId') || '').trim()
  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
  }

  const sessionUserId = await getAuthenticatedUserId(request)
  if (!sessionUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // 1) LT order: resolve via lt_orders.polymarket_order_id -> strategy -> user_id
    const { data: ltOrder } = await supabaseServiceRole
      .from('lt_orders')
      .select('strategy_id, order_id')
      .eq('polymarket_order_id', orderId)
      .maybeSingle()

    if (ltOrder?.strategy_id) {
      const { data: strategy } = await supabaseServiceRole
        .from('lt_strategies')
        .select('user_id')
        .eq('strategy_id', ltOrder.strategy_id)
        .maybeSingle()
      if (strategy?.user_id && strategy.user_id === sessionUserId) {
        const { client } = await getAuthedClobClientForUserAnyWallet(strategy.user_id)
        const order = await client.getOrder(orderId)
        const normalized = normalizeOrder(order)
        return NextResponse.json({
          ok: true,
          source: 'lt',
          orderId,
          ...normalized,
          raw: order,
        })
      }
    }

    // 2) Check lt_orders table for this order_id (V2: lt_strategy_id no longer on orders table)
    const { data: ltOrderRow } = await supabaseServiceRole
      .from('lt_orders')
      .select('strategy_id, user_id')
      .eq('order_id', orderId)
      .maybeSingle()

    if (ltOrderRow?.user_id && ltOrderRow.user_id === sessionUserId) {
      const { client } = await getAuthedClobClientForUserAnyWallet(ltOrderRow.user_id)
      const order = await client.getOrder(orderId)
      const normalized = normalizeOrder(order)
      return NextResponse.json({
        ok: true,
        source: 'lt',
        orderId,
        ...normalized,
        raw: order,
      })
    }

    // 3) Non-LT: use session user's imported_magic wallet (same as existing status route)
    const { data: wallet } = await supabaseServiceRole
      .from('turnkey_wallets')
      .select('id, user_id, eoa_address, polymarket_account_address')
      .eq('user_id', sessionUserId)
      .eq('wallet_type', 'imported_magic')
      .single()

    if (!wallet?.polymarket_account_address) {
      return NextResponse.json({ error: 'Imported wallet not found' }, { status: 400 })
    }

    const proxyAddress = wallet.polymarket_account_address.toLowerCase()
    const { data: credByProxy } = await supabaseServiceRole
      .from('clob_credentials')
      .select('api_key, api_secret_encrypted, api_passphrase_encrypted')
      .eq('user_id', sessionUserId)
      .ilike('polymarket_account_address', proxyAddress)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: credFallback } = !credByProxy
      ? await supabaseServiceRole
          .from('clob_credentials')
          .select('api_key, api_secret_encrypted, api_passphrase_encrypted')
          .eq('user_id', sessionUserId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null }

    const credential = credByProxy ?? credFallback

    if (!credential) {
      return NextResponse.json({ error: 'No Polymarket API credentials found' }, { status: 400 })
    }

    const apiCreds: ApiCredentials = {
      key: credential.api_key,
      secret: decryptSecretV1(credential.api_secret_encrypted),
      passphrase: decryptSecretV1(credential.api_passphrase_encrypted),
    }
    const signerAddress = (wallet.eoa_address || '').toLowerCase()
    if (!signerAddress) {
      return NextResponse.json({ error: 'Signer address missing' }, { status: 400 })
    }

    const client = createReadOnlyClient(signerAddress, apiCreds)
    const order = await client.getOrder(orderId)
    const normalized = normalizeOrder(order)
    return NextResponse.json({
      ok: true,
      source: 'session',
      orderId,
      ...normalized,
      raw: order,
    })
  } catch (error: any) {
    const status = error?.response?.status || error?.status || 500
    const payload = error?.response?.data || error?.data || error?.message || error
    console.error('[CLOB-STATUS] Error:', status, payload)
    return NextResponse.json(
      { ok: false, error: 'Failed to fetch order status', details: error?.message || String(error) },
      { status: status >= 400 && status < 600 ? status : 500 }
    )
  }
}
