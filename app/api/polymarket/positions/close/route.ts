import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'
import { POST_ORDER } from '@polymarket/clob-client/dist/endpoints.js'
import { buildLocalGuardResponse, getBodySnippet } from '@/lib/polymarket/order-route-helpers'
import { interpretClobOrderResult } from '@/lib/polymarket/order-response'

const DEV_BYPASS_AUTH =
  process.env.TURNKEY_DEV_ALLOW_UNAUTH === 'true' &&
  Boolean(process.env.TURNKEY_DEV_BYPASS_USER_ID)

type Body = {
  tokenId?: string
  amount?: number
  price?: number
  confirm?: boolean
}

const MAX_TEST_AMOUNT = 10

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
  const { tokenId, amount, price, confirm } = body

  if (!confirm) {
    return buildLocalGuardResponse(
      { error: 'confirm=true required to close position' },
      400
    )
  }

  if (!tokenId || !amount || !price) {
    return buildLocalGuardResponse(
      { error: 'tokenId, amount, and price are required' },
      400
    )
  }

  if (amount > MAX_TEST_AMOUNT) {
    return buildLocalGuardResponse(
      { error: `amount too large for test endpoint (>${MAX_TEST_AMOUNT})` },
      400
    )
  }

  console.log('[POLY-POSITION-CLOSE] Incoming request', {
    url: request.url,
    method: request.method,
    authenticated: Boolean(userId),
  })

  try {
    const { client, proxyAddress, signerAddress, signatureType } = await getAuthedClobClientForUser(
      userId
    )

    const order = await client.createOrder(
      { tokenID: tokenId, price, size: amount, side: 'SELL' as any },
      { signatureType } as any
    )

    const requestUrl = `${client.host}${POST_ORDER}`
    const upstreamHost = new URL(requestUrl).hostname
    console.log('[POLY-POSITION-CLOSE] Closing position via CLOB', {
      requestUrl,
      host: client.host,
      proxyAddress,
    })

    const rawResult = await client.postOrder(order, 'GTC' as any, false)
    const evaluation = interpretClobOrderResult(rawResult)
    const isHtmlResponse = evaluation.errorType === 'blocked_by_cloudflare'
    const upstreamContentType = isHtmlResponse ? 'text/html' : 'application/json'
    const upstreamStatus =
      isHtmlResponse && !evaluation.status
        ? 502
        : evaluation.errorType === 'blocked_by_cloudflare'
        ? 502
        : evaluation.status ?? (evaluation.success ? 200 : 502)
    const snippet = getBodySnippet(evaluation.raw ?? '')

    console.log('[POLY-POSITION-CLOSE] Upstream response', {
      requestUrl,
      upstreamHost,
      status: upstreamStatus,
      contentType: upstreamContentType,
      isHtml: isHtmlResponse,
      rayId: evaluation.rayId,
      snippet,
    })

    if (!evaluation.success) {
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
        },
        { status: upstreamStatus }
      )
    }

    const { orderId } = evaluation

    return NextResponse.json({
      ok: true,
      proxy: proxyAddress,
      signer: signerAddress,
      orderId,
      source: 'upstream',
      upstreamHost,
      upstreamStatus,
      isHtml: false,
      raw: evaluation.raw,
    })
  } catch (error: any) {
    console.error('[POLY-POSITION-CLOSE] Error:', error?.message || error)
    return buildLocalGuardResponse(
      { error: error?.message || 'Failed to close position' },
      500
    )
  }
}
