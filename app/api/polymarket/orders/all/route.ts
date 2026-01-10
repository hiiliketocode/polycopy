import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'
import { ClobClient } from '@polymarket/clob-client'
import type { Trade, OpenOrderParams } from '@polymarket/clob-client/dist/types'
import { ApiCredentials } from '@/lib/polymarket/clob'
import { CLOB_ENCRYPTION_KEY_V1, POLYMARKET_CLOB_BASE_URL } from '@/lib/turnkey/config'
import { createHash, createDecipheriv } from 'crypto'

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
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

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
  if (!CLOB_ENCRYPTION_KEY_V1) {
    throw new Error('CLOB_ENCRYPTION_KEY_V1 is not configured')
  }
  const [ivHex, encrypted] = ciphertext.split(':')
  if (!ivHex || !encrypted) {
    throw new Error('Invalid encrypted secret format')
  }
  const key = createHash('sha256').update(CLOB_ENCRYPTION_KEY_V1).digest()
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

  const updated =
    parseTimestamp(order?.updated_at) ||
    parseTimestamp(order?.last_update) ||
    parseTimestamp(order?.created_at)

  return {
    orderId: order?.id || order?.order_id || null,
    status: String(order?.status || 'unknown').toLowerCase(),
    size: originalSize,
    filledSize,
    remainingSize,
    price: parseNumber(order?.price),
    marketId: order?.market || order?.asset_id || order?.market_id || null,
    updatedAt: updated ? updated.toISOString() : null,
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

export async function GET(request: NextRequest) {
  // Use centralized secure auth utility
  const userId = await getAuthenticatedUserId(request)

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in' },
      { status: 401 }
    )
  }

  const searchParams = request.nextUrl.searchParams
  const limitInput = searchParams.get('limit')
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(limitInput || DEFAULT_LIMIT))
  )

  try {
    const { data: wallet, error: walletError } = await supabaseServiceRole
      .from('turnkey_wallets')
      .select('id, user_id, wallet_type, eoa_address, polymarket_account_address')
      .eq('user_id', userId)
      .eq('wallet_type', 'imported_magic')
      .single()

    if (walletError || !wallet) {
      return NextResponse.json({ error: 'Imported wallet not found' }, { status: 400 })
    }

    const proxyAddress = wallet.polymarket_account_address?.toLowerCase() || null
    if (!proxyAddress) {
      return NextResponse.json(
        { error: 'Polymarket proxy address missing for wallet' },
        { status: 400 }
      )
    }

    const { data: credential, error: credentialError } = await supabaseServiceRole
      .from('clob_credentials')
      .select('api_key, api_secret_encrypted, api_passphrase_encrypted')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (credentialError || !credential) {
      return NextResponse.json(
        { error: 'No Polymarket API credentials found. Run L2 credential setup.' },
        { status: 400 }
      )
    }

    const apiCreds: ApiCredentials = {
      key: credential.api_key,
      secret: decryptSecretV1(credential.api_secret_encrypted),
      passphrase: decryptSecretV1(credential.api_passphrase_encrypted),
    }

    const signerAddress = wallet.eoa_address?.toLowerCase()
    if (!signerAddress) {
      return NextResponse.json({ error: 'Signer address missing for wallet' }, { status: 400 })
    }

    const client = createReadOnlyClient(signerAddress, apiCreds)

    type OpenOrdersQuery = OpenOrderParams & {
      owner?: string
      maker_address?: string
      limit?: number
    }

    const openOrdersParams: OpenOrdersQuery = {
      owner: proxyAddress,
      maker_address: proxyAddress,
      limit,
    }

    const openOrders = await client.getOpenOrders(openOrdersParams, true)

    type TradeQuery = {
      maker_address: string
      limit?: number
    }

    const tradesResp = await client.getTradesPaginated({
      maker_address: proxyAddress,
      limit,
    } as TradeQuery)
    const trades = Array.isArray(tradesResp?.trades) ? tradesResp.trades : []
    const orderIds = new Set<string>(openOrders.map((o: any) => o?.id).filter(Boolean))
    for (const id of extractOrderIds(trades)) orderIds.add(id)

    const ids = Array.from(orderIds)
    const orders = await Promise.all(
      ids.map(async (id) => {
        try {
          const order = await client.getOrder(id)
          return normalizeOrder(order)
        } catch (err: any) {
          const status = err?.response?.status || err?.status || 0
          return { orderId: id, status: 'error', errorStatus: status }
        }
      })
    )

    return NextResponse.json({
      ok: true,
      proxy: proxyAddress,
      signer: signerAddress,
      count: orders.length,
      orders,
    })
  } catch (error: any) {
    const status = error?.response?.status || error?.status || 500
    const payload = error?.response?.data || error?.data || error?.message || error
    console.error('[POLY-ORDERS-ALL] Error status:', status)
    console.error('[POLY-ORDERS-ALL] Error payload:', payload)
    return NextResponse.json(
      { error: 'Failed to fetch orders', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
