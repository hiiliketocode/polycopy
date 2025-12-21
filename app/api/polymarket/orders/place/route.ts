import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'
import { POST_ORDER } from '@polymarket/clob-client/dist/endpoints.js'
import { interpretClobOrderResult } from '@/lib/polymarket/order-response'
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

const MAX_TEST_AMOUNT = 10 // basic guardrail for test page

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

  if (amount > MAX_TEST_AMOUNT) {
    return buildLocalGuardResponse(
      { error: `amount too large for test endpoint (>${MAX_TEST_AMOUNT})` },
      400
    )
  }

  try {
    const { client, proxyAddress, signerAddress, signatureType } = await getAuthedClobClientForUser(
      userId
    )

    console.log('[POLY-ORDER-PLACE] Incoming request', {
      url: request.url,
      method: request.method,
      authenticated: Boolean(userId),
    })

    console.log('[POLY-ORDER-PLACE] Order params:', {
      tokenID: tokenId,
      price,
      amount,
      side,
      signatureType,
      types: {
        tokenID: typeof tokenId,
        price: typeof price,
        amount: typeof amount,
        side: typeof side,
      },
    })

    const order = await client.createOrder(
      { tokenID: tokenId, price, size: amount, side: side as any },
      { signatureType } as any
    )

    const requestUrl = `${client.host}${POST_ORDER}`
    const upstreamHost = new URL(requestUrl).hostname
    console.log('[POLY-ORDER-PLACE] Executing trade against Polymarket CLOB', {
      requestUrl,
      host: client.host,
      proxyAddress,
    })

    const rawResult = await client.postOrder(order, orderType as any, false)
    const evaluation = interpretClobOrderResult(rawResult)
    const failedResult = !evaluation.success
    const isHtmlResponse = failedResult && evaluation.errorType === 'blocked_by_cloudflare'
    const upstreamContentType = isHtmlResponse ? 'text/html' : 'application/json'
    const upstreamStatus = failedResult
      ? evaluation.errorType === 'blocked_by_cloudflare'
        ? 502
        : evaluation.status ?? 502
      : 200
    const logPayload = {
      requestUrl,
      upstreamHost,
      status: upstreamStatus,
      contentType: upstreamContentType,
      isHtml: isHtmlResponse,
    }

    if (!evaluation.success) {
      logPayload.rayId = evaluation.rayId
    }

    console.log('[POLY-ORDER-PLACE] Upstream response', logPayload)

    if (!evaluation.success) {
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
          isHtml: isHtmlResponse,
          raw: evaluation.raw,
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
      raw: evaluation.raw,
    })
  } catch (error: any) {
    console.error('[POLY-ORDER-PLACE] Error:', error?.message || error)
    return buildLocalGuardResponse(
      { error: error?.message || 'Failed to place order' },
      500
    )
  }
}
