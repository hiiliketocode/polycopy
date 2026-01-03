import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'
import { POST_ORDER } from '@polymarket/clob-client/dist/endpoints.js'
import { interpretClobOrderResult } from '@/lib/polymarket/order-response'
import { getValidatedPolymarketClobBaseUrl } from '@/lib/env'
import { ensureEvomiProxyAgent } from '@/lib/evomi/proxy'
import { getBodySnippet } from '@/lib/polymarket/order-route-helpers'
import { sanitizeError } from '@/lib/http/sanitize-error'
import { resolveOrdersTableName, type OrdersTableName } from '@/lib/orders/table'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

const HANDLER_FINGERPRINT = 'app/api/polymarket/orders/place/route.ts'

type Body = {
  tokenId?: string
  price?: number
  amount?: number
  side?: 'BUY' | 'SELL'
  orderType?: 'GTC' | 'FOK' | 'IOC'
  confirm?: boolean
  copiedTraderId?: string | null
  copiedTraderWallet?: string | null
  copiedTraderUsername?: string | null
  copiedTradeId?: string | null
  marketId?: string | null
  outcome?: string | null
}

function respondWithMetadata(body: Record<string, unknown>, status: number) {
  const payload = {
    handlerFingerprint: HANDLER_FINGERPRINT,
    ...body,
  }
  const response = NextResponse.json(payload, { status })
  response.headers.set('x-polycopy-handler', HANDLER_FINGERPRINT)
  return response
}

function createServiceClientInstance() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

export async function POST(request: NextRequest) {
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
    return respondWithMetadata(
      {
        error: 'Unauthorized - please log in',
        details: authError?.message,
        source: 'local_guard',
      },
      401
    )
  }

  const body: Body = await request.json()
  const { tokenId, price, amount, side, orderType = 'GTC', confirm } = body

  const requestId = request.headers.get('x-request-id') ?? null

  if (!confirm) {
    return respondWithMetadata(
      { error: 'confirm=true required to place order', source: 'local_guard' },
      400
    )
  }

  if (!tokenId || !price || !amount || !side) {
    return respondWithMetadata(
      { error: 'tokenId, price, amount, and side are required', source: 'local_guard' },
      400
    )
  }
  function sanitizeForResponse(value: unknown): unknown {
    if (value === undefined || value === null) return value
    if (typeof value !== 'object') return value
    try {
      const seen = new WeakSet<any>()
      return JSON.parse(
        JSON.stringify(value, (_, replacement) => {
          if (typeof replacement === 'object' && replacement !== null) {
            if (seen.has(replacement)) return '[Circular]'
            seen.add(replacement)
          }
          if (typeof replacement === 'function') return '[Function]'
          if (typeof replacement === 'bigint') return replacement.toString()
          return replacement
        })
      )
    } catch {
      // Final fallback to a safe string so callers never try to stringify a circular object again
      return '[Unserializable]'
    }
  }

  try {
    // Configure Evomi proxy BEFORE creating ClobClient to ensure axios defaults are set
    let evomiProxyUrl: string | null = null
    try {
      evomiProxyUrl = await ensureEvomiProxyAgent()
      if (!evomiProxyUrl) {
        console.warn('[POLY-ORDER-PLACE] ⚠️  No Evomi proxy configured - requests will go direct (may be blocked by Cloudflare)')
      } else {
        const proxyEndpoint = evomiProxyUrl.split('@')[1] ?? evomiProxyUrl
        console.log('[POLY-ORDER-PLACE] ✅ Evomi proxy enabled via', proxyEndpoint)
        console.log('[POLY-ORDER-PLACE] Proxy note: Ensure proxy endpoint uses Finland IP for Polymarket access')
      }
    } catch (error: any) {
      console.error('[POLY-ORDER-PLACE] ❌ Evomi proxy config failed:', error?.message || error)
      // Continue without proxy if configuration fails (will likely be blocked)
    }

    const { client, proxyAddress, signerAddress, signatureType } = await getAuthedClobClientForUser(
      userId
    )

    const clobBaseUrl = getValidatedPolymarketClobBaseUrl()
    const requestUrl = new URL(POST_ORDER, clobBaseUrl).toString()
    const upstreamHost = new URL(clobBaseUrl).hostname
    console.log('[POLY-ORDER-PLACE] CLOB order', {
      requestId,
      upstreamHost,
      side,
      orderType,
      keys: Object.keys(body ?? {}),
    })

    const order = await client.createOrder(
      { tokenID: tokenId, price, size: amount, side: side as any },
      { signatureType } as any
    )

    let rawResult: unknown
    try {
      rawResult = await client.postOrder(order, orderType as any, false)
    } catch (error: any) {
      // Normalize axios/network errors to avoid circular structures that break JSON serialization
      const message = typeof error?.message === 'string' ? error.message : null
      const code = typeof error?.code === 'string' ? error.code : null
      // Prefer upstream data when safe, but avoid bubbling full axios response (circular)
      const responseData = error?.response?.data
      rawResult =
        responseData && typeof responseData === 'object'
          ? responseData
          : {
              error: message || 'Network error placing order',
              code,
            }
    }
    const safeRawResult = sanitizeForResponse(rawResult)
    const evaluation = interpretClobOrderResult(safeRawResult)
    const failedEvaluation = !evaluation.success
    const upstreamStatus = failedEvaluation ? evaluation.status ?? 502 : 200
    const upstreamContentType = evaluation.contentType
    const logPayload: Record<string, unknown> = {
      requestId,
      upstreamHost,
      upstreamStatus,
      contentType: upstreamContentType,
      orderId: evaluation.success ? evaluation.orderId : null,
      evomiProxyUrl,
    }
    let sanitizedEvaluationRaw: unknown
    if (failedEvaluation) {
      logPayload.rayId = evaluation.rayId
      sanitizedEvaluationRaw = sanitizeForResponse(evaluation.raw)
      logPayload.raw = sanitizedEvaluationRaw
    }
    console.log('[POLY-ORDER-PLACE] Upstream response', logPayload)

    if (failedEvaluation) {
      let snippet: string | null = null
      try {
        const snippetSource =
          sanitizedEvaluationRaw ?? sanitizeForResponse(evaluation.raw) ?? evaluation.raw ?? ''
        snippet = getBodySnippet(snippetSource)
      } catch (snippetError) {
        console.warn('[POLY-ORDER-PLACE] snippet serialization failed', snippetError)
        snippet = '[unserializable]'
      }
      return respondWithMetadata(
        {
          ok: false,
          error: evaluation.message,
          errorType: evaluation.errorType,
          rayId: evaluation.rayId,
          blockedByCloudflare: evaluation.errorType === 'blocked_by_cloudflare',
          requestUrl,
          source: 'upstream',
          upstreamHost,
          upstreamStatus,
          isHtml: evaluation.contentType === 'text/html',
          contentType: evaluation.contentType,
          raw:
            typeof sanitizedEvaluationRaw === 'string'
              ? sanitizedEvaluationRaw
              : sanitizedEvaluationRaw !== undefined
                ? sanitizedEvaluationRaw
                : undefined,
          snippet,
        },
        upstreamStatus
      )
    }

    const { orderId } = evaluation

    try {
      const supabaseService = createServiceClientInstance()
      const ordersTable = await resolveOrdersTableName(supabaseService)
      await persistOrderRecord({
        serviceClient: supabaseService,
        ordersTable,
        orderId,
        proxyAddress: proxyAddress ?? signerAddress,
        tokenId: tokenId!,
        side: side!,
        price: price!,
        amount: amount!,
        orderType,
        marketId: body.marketId ?? null,
        outcome: body.outcome ?? null,
        copiedTraderId: body.copiedTraderId ?? null,
        copiedTraderWallet: body.copiedTraderWallet ?? null,
        copiedTraderUsername: body.copiedTraderUsername ?? null,
        copiedTradeId: body.copiedTradeId ?? null,
      })
    } catch (error) {
      console.warn('[POLY-ORDER-PLACE] Failed to persist order row', error)
    }

    return respondWithMetadata(
      {
        ok: true,
        proxy: proxyAddress,
        signer: signerAddress,
        signatureType,
        orderId,
        submittedAt: new Date().toISOString(),
        source: 'upstream',
        upstreamHost,
        upstreamStatus,
        isHtml: false,
        raw: sanitizeForResponse(evaluation.raw),
        contentType: evaluation.contentType,
      },
      200
    )
  } catch (error: any) {
    const safeError = sanitizeError(error)
    console.error('[POLY-ORDER-PLACE] Error (sanitized):', safeError)
    return respondWithMetadata(
      {
        ok: false,
        source: 'server',
        error: safeError,
      },
      safeError.status && Number.isInteger(safeError.status) ? safeError.status : 500
    )
  }
}

function normalizeWalletAddress(value?: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed ? trimmed.toLowerCase() : null
}

function deriveMarketIdFromToken(tokenId?: string | null) {
  if (!tokenId) return null
  const trimmed = tokenId.trim()
  return trimmed.length >= 66 ? trimmed.slice(0, 66) : trimmed || null
}

async function ensureTraderId(
  client: ReturnType<typeof createServiceClientInstance>,
  walletAddress: string
) {
  const normalized = normalizeWalletAddress(walletAddress)
  if (!normalized) throw new Error('Missing wallet address for trader lookup')

  const { data: existing } = await client
    .from('traders')
    .select('id')
    .eq('wallet_address', normalized)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: inserted, error } = await client
    .from('traders')
    .insert({ wallet_address: normalized })
    .select('id')
    .single()

  if (error) throw error
  return inserted.id
}

type PersistOrderArgs = {
  serviceClient: ReturnType<typeof createServiceClientInstance>
  ordersTable: OrdersTableName
  orderId: string
  proxyAddress: string
  tokenId: string
  side: 'BUY' | 'SELL'
  price: number
  amount: number
  orderType: 'GTC' | 'FOK' | 'IOC'
  marketId?: string | null
  outcome?: string | null
  copiedTraderId?: string | null
  copiedTraderWallet?: string | null
  copiedTraderUsername?: string | null
  copiedTradeId?: string | null
}

async function persistOrderRecord({
  serviceClient,
  ordersTable,
  orderId,
  proxyAddress,
  tokenId,
  side,
  price,
  amount,
  orderType,
  marketId,
  outcome,
  copiedTraderId,
  copiedTraderWallet,
  copiedTraderUsername,
  copiedTradeId,
}: PersistOrderArgs) {
  const traderId = await ensureTraderId(serviceClient, proxyAddress)
  const normalizedCopiedWallet = normalizeWalletAddress(copiedTraderWallet)
  let resolvedCopiedTraderId = copiedTraderId ?? null

  if (!resolvedCopiedTraderId && normalizedCopiedWallet) {
    try {
      resolvedCopiedTraderId = await ensureTraderId(serviceClient, normalizedCopiedWallet)
    } catch (error) {
      console.warn('[POLY-ORDER-PLACE] Failed to ensure copied trader record', error)
    }
  }

  const payload = {
    order_id: orderId,
    trader_id: traderId,
    market_id: marketId ?? deriveMarketIdFromToken(tokenId),
    outcome: outcome ?? null,
    side: side.toLowerCase(),
    order_type: orderType,
    time_in_force: orderType,
    price,
    size: amount,
    filled_size: 0,
    remaining_size: amount,
    status: 'open',
    copied_trader_id: resolvedCopiedTraderId,
    copied_trader_wallet: normalizedCopiedWallet,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    raw: {
      copied_trader_id: resolvedCopiedTraderId,
      copied_trader_wallet: normalizedCopiedWallet,
      copied_trader_username: copiedTraderUsername ?? null,
      copied_trade_id: copiedTradeId ?? null,
      source: 'place_route',
    },
  }

  const { error } = await serviceClient.from(ordersTable).upsert(payload, {
    onConflict: 'order_id',
  })

  if (error) {
    throw error
  }
}
