import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'
import { ClobClient } from '@polymarket/clob-client'
import { ApiCredentials } from '@/lib/polymarket/clob'
import { CLOB_ENCRYPTION_KEY_V1, POLYMARKET_CLOB_BASE_URL } from '@/lib/turnkey/config'
import { createHash, createDecipheriv } from 'crypto'
import { getActualFillPriceWithClient } from '@/lib/polymarket/fill-price'

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
  const cappedFilledSize =
    originalSize !== null && Number.isFinite(originalSize) && filledSize > originalSize
      ? originalSize
      : filledSize
  const remainingSize =
    originalSize !== null && Number.isFinite(originalSize - cappedFilledSize)
      ? Math.max(originalSize - cappedFilledSize, 0)
      : parseNumber(order?.remaining_size)

  const updated =
    parseTimestamp(order?.updated_at) ||
    parseTimestamp(order?.last_update) ||
    parseTimestamp(order?.created_at)

  return {
    status: String(order?.status || 'unknown').toLowerCase(),
    size: originalSize,
    filledSize: cappedFilledSize,
    remainingSize,
    price: parseNumber(order?.price),
    marketId: order?.market || order?.asset_id || order?.market_id || null,
    updatedAt: updated ? updated.toISOString() : null,
  }
}

export async function GET(request: NextRequest) {
  const orderIdFromParams = request.nextUrl.searchParams.get('orderId')
  let orderId = (orderIdFromParams || '').trim()
  if (!orderId) {
    const parts = request.nextUrl.pathname.split('/').filter(Boolean)
    const index = parts.indexOf('orders')
    if (index !== -1 && parts[index + 1]) {
      orderId = parts[index + 1].trim()
    }
  }
  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
  }

  // Use centralized secure auth utility
  const userId = await getAuthenticatedUserId(request)

  if (!userId) {
    return NextResponse.json(
      { error: 'Unauthorized - please log in' },
      { status: 401 }
    )
  }

  try {
    const { data: wallet, error: walletError } = await supabaseServiceRole
      .from('turnkey_wallets')
      .select('id, user_id, wallet_type, eoa_address, polymarket_account_address, turnkey_private_key_id, turnkey_wallet_id')
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

    const credentialByProxy = await supabaseServiceRole
      .from('clob_credentials')
      .select('api_key, api_secret_encrypted, api_passphrase_encrypted')
      .eq('user_id', userId)
      .ilike('polymarket_account_address', proxyAddress)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const credentialFallback = !credentialByProxy.data
      ? await supabaseServiceRole
          .from('clob_credentials')
          .select('api_key, api_secret_encrypted, api_passphrase_encrypted')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : null

    const credential =
      credentialByProxy.data || credentialFallback?.data || null

    if (!credential) {
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

    const order = await client.getOrder(orderId)
    const normalized = normalizeOrder(order)

    // Get actual fill price from CLOB trades (not just the limit price)
    let fillPrice: number | null = null
    const filledSize = normalized.filledSize ?? 0
    if (filledSize > 0 && normalized.price) {
      try {
        const result = await getActualFillPriceWithClient(client, orderId, normalized.price)
        fillPrice = result.fillPrice
      } catch {
        // Fall back — fillPrice stays null
      }
    }

    return NextResponse.json({
      ok: true,
      orderId,
      proxy: proxyAddress,
      signer: signerAddress,
      ...normalized,
      fillPrice,
      raw: order,
    })
  } catch (error: any) {
    const status = error?.response?.status || error?.status || 500
    const payload = error?.response?.data || error?.data || error?.message || error
    console.error('[POLY-ORDER-STATUS] Error status:', status)
    console.error('[POLY-ORDER-STATUS] Error payload:', payload)
    return NextResponse.json(
      { error: 'Failed to fetch order status', details: error?.message || String(error) },
      { status: 500 }
    )
  }
}
