/**
 * Shared order placement core used by both quick trades (POST /api/polymarket/orders/place)
 * and Live Trading (executor). Single path: Evomi → CLOB → order_events_log → interpretClobOrderResult.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthedClobClientForUser, getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client'
import { requireEvomiProxyAgent, refreshEvomiProxyAgent } from '@/lib/evomi/proxy'
import { interpretClobOrderResult, type ClobOrderEvaluation } from '@/lib/polymarket/order-response'
import { logError, logInfo } from '@/lib/logging/logger'
import { sanitizeForLogging } from '@/lib/logging/logger'

const ORDER_EVENTS_TABLE = 'order_events_log'
const MAX_ERROR_MESSAGE_LENGTH = 500

function truncateMessage(value?: string | null, max = MAX_ERROR_MESSAGE_LENGTH): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length <= max ? trimmed : trimmed.slice(0, max)
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

async function updateOrderEventStatus(
  client: SupabaseClient,
  orderEventId: string | null,
  updates: Record<string, unknown>
) {
  if (!orderEventId) return
  try {
    await client.from(ORDER_EVENTS_TABLE).update(updates).eq('id', orderEventId)
  } catch (error) {
    console.error('[place-order-core] Failed to update order event row', error)
  }
}

async function postOrderWithCloudflareMitigation(params: {
  client: any
  order: any
  orderType: string
  sanitize: (value: unknown) => unknown
  proxyUrl: string | null
}): Promise<{
  evaluation: ClobOrderEvaluation
  safeRawResult: unknown
  attempts: number
  proxyUrl: string | null
}> {
  let attempts = 0
  let lastEvaluation: ClobOrderEvaluation | null = null
  let lastSafeRawResult: unknown = null
  let proxyUrl = params.proxyUrl ?? null

  while (attempts < 2) {
    attempts++

    let rawResult: unknown
    try {
      rawResult = await params.client.postOrder(params.order, params.orderType as any, false)
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : null
      const code = typeof error?.code === 'string' ? error.code : null
      const responseData = error?.response?.data
      rawResult =
        responseData && typeof responseData === 'object'
          ? responseData
          : { error: message || 'Network error placing order', code }
    }

    const safeRawResult = params.sanitize(rawResult) ?? rawResult
    const evaluation = interpretClobOrderResult(safeRawResult)

    if (evaluation.success || evaluation.errorType !== 'blocked_by_cloudflare') {
      return { evaluation, safeRawResult, attempts, proxyUrl }
    }

    lastEvaluation = evaluation
    lastSafeRawResult = safeRawResult

    console.warn('[place-order-core] Blocked by Cloudflare, rotating Evomi proxy and retrying...', {
      attempts,
      rayId: evaluation.rayId,
    })

    proxyUrl = (await refreshEvomiProxyAgent('cloudflare_blocked_order')) ?? proxyUrl
  }

  if (!lastEvaluation) {
    throw new Error('Polymarket order evaluation missing after retries')
  }

  return { evaluation: lastEvaluation, safeRawResult: lastSafeRawResult!, attempts, proxyUrl }
}

export interface PlaceOrderCoreParams {
  supabase: SupabaseClient
  userId: string
  tokenId: string
  price: number
  size: number
  side: 'BUY' | 'SELL'
  orderType: 'GTC' | 'GTD' | 'FOK' | 'FAK' | 'IOC'
  requestId: string
  orderIntentId: string
  /** When true, use getAuthedClobClientForUserAnyWallet (LT). When false, use getAuthedClobClientForUser (quick). */
  useAnyWallet?: boolean
  conditionId?: string | null
  outcome?: string | null
  /** Unix timestamp (seconds) after which the order expires. When set, orderType is forced to GTD. */
  expiration?: number | null
  /** Optional log-only fields for order_events_log */
  slippageBps?: number | null
  minOrderSize?: number | null
  tickSize?: number | null
  bestBid?: number | null
  bestAsk?: number | null
  inputMode?: 'usd' | 'contracts'
  usdInput?: number | null
  contractsInput?: number | null
  autoCorrectApplied?: boolean
}

export interface PlaceOrderCoreResult {
  success: boolean
  orderId?: string | null
  orderEventId: string | null
  evaluation: ClobOrderEvaluation
  walletAddress: string | null
  /** For quick-trade route: proxy/signer for response */
  proxyAddress?: string | null
  signerAddress?: string | null
  signatureType?: string | number
}

/**
 * Place an order via CLOB with Evomi proxy, order_events_log, and Cloudflare mitigation.
 * Callers are responsible for: idempotency (place route), orders/lt_orders persistence.
 */
export async function placeOrderCore(params: PlaceOrderCoreParams): Promise<PlaceOrderCoreResult> {
  const {
    supabase,
    userId,
    tokenId,
    price,
    size,
    side,
    orderType,
    requestId,
    orderIntentId,
    useAnyWallet = false,
    conditionId = null,
    outcome = null,
    expiration = null,
    slippageBps = null,
    minOrderSize = null,
    tickSize = null,
    bestBid = null,
    bestAsk = null,
    inputMode = 'usd',
    usdInput = null,
    contractsInput = null,
    autoCorrectApplied = false,
  } = params

  // If expiration is set, force GTD (Good-Til-Date); IOC maps to FAK
  const normalizedOrderType = expiration ? 'GTD' : orderType === 'IOC' ? 'FAK' : orderType
  const sideLower = side.toLowerCase()
  let orderEventId: string | null = null
  let walletAddress: string | null = null
  let proxyAddress: string | null = null
  let signerAddress: string | null = null
  let signatureType: string | number | undefined

  await requireEvomiProxyAgent('order placement')

  const { client, proxyAddress: proxy, signerAddress: signer, signatureType: sigType } = useAnyWallet
    ? await getAuthedClobClientForUserAnyWallet(userId)
    : await getAuthedClobClientForUser(userId)

  walletAddress = signer ? signer.toLowerCase() : null
  proxyAddress = proxy ?? null
  signerAddress = signer ?? null
  signatureType = sigType

  const orderEventPayload = {
    user_id: userId,
    wallet_address: walletAddress,
    order_intent_id: orderIntentId,
    request_id: requestId,
    condition_id: conditionId ?? null,
    token_id: tokenId,
    side: sideLower,
    outcome: outcome ?? null,
    order_type: normalizedOrderType,
    slippage_bps: slippageBps,
    limit_price: price,
    size,
    min_order_size: minOrderSize,
    tick_size: tickSize ?? null,
    best_bid: bestBid,
    best_ask: bestAsk,
    input_mode: inputMode,
    usd_input: usdInput,
    contracts_input: contractsInput,
    auto_correct_applied: Boolean(autoCorrectApplied),
    status: 'attempted',
    polymarket_order_id: null,
    http_status: null,
    error_code: null,
    error_message: null,
    raw_error: null,
  }

  try {
    const { data: insertedEvent, error: eventError } = await supabase
      .from(ORDER_EVENTS_TABLE)
      .insert(orderEventPayload)
      .select('id')
      .single()
    if (!eventError && insertedEvent?.id) {
      orderEventId = insertedEvent.id
    }
  } catch (eventError) {
    console.error('[place-order-core] Failed to persist order event', eventError)
  }

  logInfo('order_attempted', {
    request_id: requestId,
    order_intent_id: orderIntentId,
    user_id: userId,
    wallet_address: walletAddress,
    condition_id: conditionId,
    token_id: tokenId,
    outcome,
    side: sideLower,
    order_type: normalizedOrderType,
    limit_price: price,
    size,
    status: 'attempted',
    event_id: orderEventId,
  })

  let evaluation: ClobOrderEvaluation
  let evomiAttempts = 0

  try {
    const userOrder: Record<string, any> = { tokenID: tokenId, price, size, side: side as any }
    if (expiration) {
      userOrder.expiration = expiration
    }
    const order = await client.createOrder(
      userOrder as any,
      { signatureType } as any
    )

    const result = await postOrderWithCloudflareMitigation({
      client,
      order,
      orderType: normalizedOrderType,
      sanitize: sanitizeForResponse,
      proxyUrl: null,
    })
    evaluation = result.evaluation
    evomiAttempts = result.attempts
  } catch (err: any) {
    const message = err?.message ?? 'Order placement failed'
    const code = err?.code ?? err?.name ?? 'server_error'
    evaluation = {
      success: false,
      message,
      status: 500,
      errorType: 'api_error',
      raw: { error: message, code },
      contentType: 'application/json',
    }
    const truncatedErrorMessage = truncateMessage(message)
    await updateOrderEventStatus(supabase, orderEventId, {
      status: 'rejected',
      http_status: 500,
      error_code: code,
      error_message: truncatedErrorMessage,
      raw_error: sanitizeForLogging(err) ?? null,
    })
    logError('order_rejected', {
      request_id: requestId,
      order_intent_id: orderIntentId,
      user_id: userId,
      wallet_address: walletAddress,
      condition_id: conditionId,
      token_id: tokenId,
      outcome,
      side: sideLower,
      order_type: normalizedOrderType,
      limit_price: price,
      size,
      http_status: 500,
      error_code: code,
      error_message: truncatedErrorMessage,
      event_id: orderEventId,
    })
    return {
      success: false,
      orderEventId,
      evaluation,
      walletAddress,
      proxyAddress,
      signerAddress,
      signatureType,
    }
  }

  const failedEvaluation = !evaluation.success
  const upstreamStatus = failedEvaluation ? ('status' in evaluation ? evaluation.status ?? 502 : 502) : 200

  if (failedEvaluation) {
    const truncatedErrorMessage = truncateMessage('message' in evaluation ? evaluation.message ?? 'Order rejected' : 'Order rejected')
    const sanitizedErrorBody = sanitizeForLogging(evaluation.raw ?? null)
    const errType = 'errorType' in evaluation ? evaluation.errorType ?? null : null
    await updateOrderEventStatus(supabase, orderEventId, {
      status: 'rejected',
      http_status: upstreamStatus,
      error_code: errType,
      error_message: truncatedErrorMessage,
      raw_error: sanitizedErrorBody ?? null,
    })
    logError('order_rejected', {
      request_id: requestId,
      order_intent_id: orderIntentId,
      user_id: userId,
      wallet_address: walletAddress,
      condition_id: conditionId,
      token_id: tokenId,
      outcome,
      side: sideLower,
      order_type: normalizedOrderType,
      limit_price: price,
      size,
      http_status: upstreamStatus,
      error_code: errType,
      error_message: truncatedErrorMessage,
      raw_error: sanitizedErrorBody ?? null,
      event_id: orderEventId,
    })
    return {
      success: false,
      orderEventId,
      evaluation,
      walletAddress,
      proxyAddress,
      signerAddress,
      signatureType,
    }
  }

  const orderId = evaluation.success ? evaluation.orderId ?? null : null
  await updateOrderEventStatus(supabase, orderEventId, {
    status: 'submitted',
    http_status: upstreamStatus,
    polymarket_order_id: orderId,
    error_code: null,
    error_message: null,
    raw_error: null,
  })

  logInfo('order_submitted', {
    request_id: requestId,
    order_intent_id: orderIntentId,
    user_id: userId,
    wallet_address: walletAddress,
    condition_id: conditionId,
    token_id: tokenId,
    outcome,
    side: sideLower,
    order_type: normalizedOrderType,
    limit_price: price,
    size,
    http_status: upstreamStatus,
    polymarket_order_id: orderId,
    status: 'submitted',
    event_id: orderEventId,
    evomi_attempts: evomiAttempts,
  })

  return {
    success: true,
    orderId,
    orderEventId,
    evaluation,
    walletAddress,
    proxyAddress,
    signerAddress,
    signatureType,
  }
}
