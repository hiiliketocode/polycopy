import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'
import { POST_ORDER } from '@polymarket/clob-client/dist/endpoints.js'
import { interpretClobOrderResult } from '@/lib/polymarket/order-response'
import { getValidatedPolymarketClobBaseUrl } from '@/lib/env'
import { ensureEvomiProxyAgent } from '@/lib/evomi/proxy'
import {
  buildLocalGuardResponse,
  getBodySnippet,
} from '@/lib/polymarket/order-route-helpers'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

type Body = {
  tokenId?: string
  price?: number
  amount?: number
  side?: 'BUY' | 'SELL'
  orderType?: 'GTC' | 'FOK' | 'IOC'
  confirm?: boolean
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
    return buildLocalGuardResponse(
      { error: 'Unauthorized - please log in', details: authError?.message },
      401
    )
  }

  const body: Body = await request.json()
  const { tokenId, price, amount, side, orderType = 'GTC', confirm } = body

  const requestId = request.headers.get('x-request-id') ?? null

  if (!confirm) {
    return buildLocalGuardResponse(
      { error: 'confirm=true required to place order' },
      400
    )
  }

  if (!tokenId || !price || !amount || !side) {
    return buildLocalGuardResponse(
      { error: 'tokenId, price, amount, and side are required' },
      400
    )
  }
  function sanitizeForResponse(value: unknown): unknown {
    if (value === undefined) return undefined
    if (typeof value !== 'object' || value === null) return value
    try {
      const seen = new WeakSet<any>()
      return JSON.parse(
        JSON.stringify(value, (_, replacement) => {
          if (typeof replacement === 'object' && replacement !== null) {
            if (seen.has(replacement)) return undefined
            seen.add(replacement)
          }
          return replacement
        })
      )
    } catch {
      return undefined
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

    const order = await client.createOrder(
      { tokenID: tokenId, price, size: amount, side: side as any },
      { signatureType } as any
    )

    let rawResult: unknown
    try {
      rawResult = await client.postOrder(order, orderType as any, false)
    } catch (error: any) {
      // Catch axios errors and extract response data if available
      // Axios errors may contain circular references, so we extract just the response data
      if (error?.response) {
        rawResult = error.response.data ?? error.response
      } else if (error?.message) {
        rawResult = { error: error.message, code: error.code }
      } else {
        rawResult = String(error)
      }
    }
    const evaluation = interpretClobOrderResult(rawResult)
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
      const snippet = getBodySnippet(evaluation.raw ?? '')
      return NextResponse.json(
        {
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
          raw: sanitizedEvaluationRaw
            ? typeof sanitizedEvaluationRaw === 'string'
              ? sanitizedEvaluationRaw
              : JSON.stringify(sanitizedEvaluationRaw)
            : undefined,
          snippet,
        },
        { status: upstreamStatus }
      )
    }

    const { orderId } = evaluation

    return NextResponse.json({
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
    })
  } catch (error: any) {
    console.error('[POLY-ORDER-PLACE] Error:', error?.message || error)
    return buildLocalGuardResponse(
      { error: error?.message || 'Failed to place order' },
      500
    )
  }
}
