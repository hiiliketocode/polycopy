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
import { logError, logInfo, makeRequestId, sanitizeForLogging } from '@/lib/logging/logger'
import { resolveOrdersTableName } from '@/lib/orders/table'
import { adjustSizeForImpliedAmount, roundDownToStep } from '@/lib/polymarket/sizing'
import { getAuthenticatedUserId } from '@/lib/auth/secure-auth'
import { checkRateLimit, rateLimitedResponse } from '@/lib/rate-limit/index'
import {
  validateMarketId,
  validatePositiveNumber,
  validateOrderSide,
  validateOrderType,
  sanitizeString,
  validateBatch,
} from '@/lib/validation/input'


const HANDLER_FINGERPRINT = 'app/api/polymarket/orders/place/route.ts'

type Body = {
  tokenId?: string
  price?: number
  amount?: number
  amountInvested?: number
  side?: 'BUY' | 'SELL'
  orderType?: 'GTC' | 'FOK' | 'FAK' | 'IOC'
  confirm?: boolean
  copiedTraderId?: string
  copiedTraderWallet?: string
  copiedTraderUsername?: string
  marketId?: string
  marketTitle?: string
  marketSlug?: string
  marketAvatarUrl?: string
  outcome?: string
  autoCloseOnTraderClose?: boolean
  autoClose?: boolean
  slippagePercent?: number
  orderIntentId?: string
  conditionId?: string
  inputMode?: 'usd' | 'contracts'
  usdInput?: number | string
  contractsInput?: number | string
  autoCorrectApplied?: boolean
  bestBid?: number | string
  bestAsk?: number | string
  minOrderSize?: number
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

function normalizeOptionalString(value?: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeWallet(value?: string | null) {
  const normalized = normalizeOptionalString(value)
  return normalized ? normalized.toLowerCase() : null
}

function normalizeNumber(value?: number | string | null) {
  if (value === null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

async function fetchMarketTickSize(clobBaseUrl: string, tokenId: string) {
  const normalizedTokenId = normalizeOptionalString(tokenId)
  if (!normalizedTokenId) return null
  const tickUrl = new URL('/tick-size', clobBaseUrl)
  tickUrl.searchParams.set('token_id', normalizedTokenId)
  try {
    const response = await fetch(tickUrl.toString(), { cache: 'no-store' })
    const data = await response.json()
    const tick = normalizeNumber(data?.minimum_tick_size ?? data?.tick_size)
    if (response.ok && tick && tick > 0) {
      return tick
    }
  } catch {
    // Fall through to book lookup.
  }

  const bookUrl = new URL('/book', clobBaseUrl)
  bookUrl.searchParams.set('token_id', normalizedTokenId)
  try {
    const response = await fetch(bookUrl.toString(), { cache: 'no-store' })
    const data = await response.json()
    const tick = normalizeNumber(data?.tick_size)
    if (response.ok && tick && tick > 0) {
      return tick
    }
  } catch {
    // Ignore failures; caller will fall back to default tick size.
  }

  return null
}


/**
 * SECURITY: Service Role Usage - ORDER PLACEMENT LOGGING
 * 
 * Why service role is required:
 * - Inserts into `order_events_log` table (system audit log)
 * - Inserts into `orders` table with copy trade metadata
 * - These tables may have RLS policies that restrict user access
 * - Logging must succeed even if RLS would block it
 * 
 * Security measures:
 * - ✅ User authenticated before ANY database operations
 * - ✅ Rate limited (CRITICAL tier - 10 req/min)
 * - ✅ Only operates on authenticated user's data
 * - ✅ Does not expose other users' data
 * 
 * RLS policies bypassed:
 * - order_events_log (system audit log - no user RLS)
 * - orders table (user placing their own order)
 * - clob_credentials (reading user's own credentials)
 * 
 * Alternative considered:
 * Could potentially use authenticated client, but service role ensures
 * logging succeeds even if RLS policies change. Critical for audit trail.
 * 
 * Reviewed: January 10, 2025
 * Status: JUSTIFIED (audit logging, user's own data only)
 */
function createServiceRoleClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
}

const ORDER_EVENTS_TABLE = 'order_events_log'
const MAX_ERROR_MESSAGE_LENGTH = 500

function normalizeLogInputMode(value?: string | null): 'usd' | 'contracts' {
  return value?.toLowerCase() === 'contracts' ? 'contracts' : 'usd'
}

function truncateMessage(value?: string | null, max = MAX_ERROR_MESSAGE_LENGTH) {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max)
}

async function updateOrderEventStatus(
  client: ReturnType<typeof createServiceRoleClient>,
  orderEventId: string | null,
  updates: Record<string, unknown>
) {
  if (!orderEventId) return
  try {
    await client.from(ORDER_EVENTS_TABLE).update(updates).eq('id', orderEventId)
  } catch (error) {
    console.error('[POLY-ORDER-PLACE] Failed to update order event row', error)
  }
}

async function ensureTraderId(
  client: ReturnType<typeof createServiceRoleClient>,
  walletAddress: string
) {
  const normalized = walletAddress.toLowerCase()
  const { data: existing, error } = await client
    .from('traders')
    .select('id')
    .eq('wallet_address', normalized)
    .maybeSingle()

  if (error) throw error
  if (existing?.id) return existing.id

  const { data: inserted, error: insertError } = await client
    .from('traders')
    .insert({ wallet_address: normalized })
    .select('id')
    .single()

  if (insertError) throw insertError
  return inserted.id
}

async function persistCopiedTraderMetadata({
  userId,
  orderId,
  tokenId,
  price,
  amount,
  amountInvested,
  side,
  orderType,
  copiedTraderId,
  copiedTraderWallet,
  copiedTraderUsername,
  marketId,
  marketTitle,
  marketSlug,
  marketAvatarUrl,
  outcome,
  autoCloseOnTraderClose,
  autoClose,
  slippagePercent,
}: {
  userId: string
  orderId: string
  tokenId?: string
  price?: number
  amount?: number
  amountInvested?: number
  side?: 'BUY' | 'SELL'
  orderType?: 'GTC' | 'FOK' | 'FAK' | 'IOC'
  copiedTraderId?: string
  copiedTraderWallet?: string
  copiedTraderUsername?: string
  marketId?: string
  marketTitle?: string
  marketSlug?: string
  marketAvatarUrl?: string
  outcome?: string
  autoCloseOnTraderClose?: boolean
  autoClose?: boolean
  slippagePercent?: number
}) {
  const hasCopiedMetadata =
    Boolean(normalizeOptionalString(copiedTraderId)) ||
    Boolean(normalizeOptionalString(copiedTraderWallet)) ||
    Boolean(normalizeOptionalString(copiedTraderUsername))
  const hasOrderContext =
    Boolean(normalizeOptionalString(orderType ?? null)) ||
    Boolean(normalizeOptionalString(tokenId ?? null)) ||
    Boolean(normalizeOptionalString(marketId ?? null)) ||
    Boolean(normalizeOptionalString(outcome ?? null)) ||
    Boolean(normalizeOptionalString(side ?? null)) ||
    normalizeNumber(price) !== null ||
    normalizeNumber(amount) !== null
  if (!hasCopiedMetadata && !hasOrderContext) return

  const service = createServiceRoleClient()
  const ordersTable = await resolveOrdersTableName(service)

  const { data: credential, error: credentialError } = await service
    .from('clob_credentials')
    .select('polymarket_account_address')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (credentialError || !credential?.polymarket_account_address) {
    throw credentialError ?? new Error('Missing Polymarket account address for user')
  }

  const traderId = await ensureTraderId(service, credential.polymarket_account_address)
  const normalizedMarketId =
    normalizeOptionalString(marketId) ??
    (tokenId && tokenId.length >= 66 ? tokenId.slice(0, 66) : null)
  const normalizedMarketTitle = normalizeOptionalString(marketTitle)
  const normalizedMarketSlug = normalizeOptionalString(marketSlug)
  const normalizedMarketAvatarUrl = normalizeOptionalString(marketAvatarUrl)
  const normalizedPrice = normalizeNumber(price)
  const normalizedSize = normalizeNumber(amount)
  const normalizedAmountInvested = normalizeNumber(amountInvested)
  const normalizedCopiedTraderId = normalizeOptionalString(copiedTraderId)
  const normalizedCopiedTraderWallet = normalizeWallet(copiedTraderWallet)
  const normalizedCopiedTraderUsername = normalizeOptionalString(copiedTraderUsername)
  const now = new Date().toISOString()
  const resolvedAutoClose =
    typeof autoCloseOnTraderClose === 'boolean'
      ? autoCloseOnTraderClose
      : typeof autoClose === 'boolean'
        ? autoClose
        : true
  const normalizedSlippage =
    typeof slippagePercent === 'number' && Number.isFinite(slippagePercent) && slippagePercent >= 0
      ? slippagePercent
      : null

  const payload: Record<string, unknown> = {
    order_id: orderId,
    trader_id: traderId,
    copied_trader_id: normalizedCopiedTraderId,
    copied_trader_wallet: normalizedCopiedTraderWallet,
    market_id: normalizedMarketId,
    outcome: normalizeOptionalString(outcome),
    side: side ? side.toLowerCase() : null,
    order_type: orderType ?? null,
    time_in_force: orderType ?? null,
    price: normalizedPrice ?? 0,
    size: normalizedSize ?? 0,
    filled_size: 0,
    remaining_size: normalizedSize ?? 0,
    status: 'open',
    created_at: now,
    updated_at: now,
    auto_close_on_trader_close: resolvedAutoClose,
    auto_close_slippage_percent: normalizedSlippage,
    raw: {
      source: 'polycopy_place_order',
      token_id: tokenId ?? null,
      market_id: normalizedMarketId,
      outcome: normalizeOptionalString(outcome),
      copied_trader_id: normalizedCopiedTraderId,
      copied_trader_wallet: normalizedCopiedTraderWallet,
      copied_trader_username: normalizeOptionalString(copiedTraderUsername),
      auto_close_on_trader_close: resolvedAutoClose,
      auto_close_slippage_percent: normalizedSlippage,
    },
  }

  if (normalizedCopiedTraderWallet) {
    payload.copy_user_id = userId
    payload.copied_trader_username = normalizedCopiedTraderUsername
    payload.copied_market_title = normalizedMarketTitle
    payload.price_when_copied = normalizedPrice
    payload.amount_invested = normalizedAmountInvested
    payload.market_slug = normalizedMarketSlug
    payload.market_avatar_url = normalizedMarketAvatarUrl
    payload.trade_method = 'quick'
  }

  await service.from(ordersTable).upsert(payload, { onConflict: 'order_id' })
}

export async function POST(request: NextRequest) {
  // Use centralized secure auth utility
  const userId = await getAuthenticatedUserId(request)

  if (!userId) {
    return respondWithMetadata(
      {
        error: 'Unauthorized - please log in',
        source: 'local_guard',
      },
      401
    )
  }

  // SECURITY: Rate limit order placement (CRITICAL tier - prevents fund drainage)
  const rateLimitResult = await checkRateLimit(request, 'CRITICAL', userId, 'ip-user')
  if (!rateLimitResult.success) {
    return rateLimitedResponse(rateLimitResult)
  }

  const body: Body = await request.json()
  const {
    tokenId,
    price,
    amount,
    amountInvested,
    side,
    orderType = 'GTC',
    confirm,
    copiedTraderId,
    copiedTraderWallet,
    copiedTraderUsername,
    marketId,
    marketTitle,
    marketSlug,
    marketAvatarUrl,
    outcome,
    autoCloseOnTraderClose,
    autoClose,
    slippagePercent,
    orderIntentId,
    conditionId,
    inputMode,
    usdInput,
    contractsInput,
    autoCorrectApplied,
    bestBid,
    bestAsk,
    minOrderSize,
  } = body

  // SECURITY: Input validation - prevents injection attacks and invalid data
  // Validate critical parameters before ANY processing
  const validationResults = validateBatch([
    { field: 'tokenId', result: validateMarketId(tokenId) },
    { field: 'price', result: validatePositiveNumber(price, 'Price', { min: 0.01, max: 0.99 }) },
    { field: 'amount', result: validatePositiveNumber(amount, 'Amount', { min: 0.01, max: 1000000 }) },
    { field: 'side', result: validateOrderSide(side) },
    { field: 'orderType', result: validateOrderType(orderType) },
  ])

  if (!validationResults.valid) {
    const firstError = validationResults.errors[0]
    return respondWithMetadata(
      {
        error: `Invalid ${firstError.field}: ${firstError.error}`,
        source: 'validation',
        validationErrors: validationResults.errors,
      },
      400
    )
  }

  // Additional validation for optional fields
  if (marketId) {
    const marketIdValidation = validateMarketId(marketId)
    if (!marketIdValidation.valid) {
      return respondWithMetadata(
        { error: marketIdValidation.error, source: 'validation' },
        400
      )
    }
  }

  if (marketTitle) {
    const titleValidation = sanitizeString(marketTitle, 200)
    if (!titleValidation.valid) {
      return respondWithMetadata(
        { error: titleValidation.error, source: 'validation' },
        400
      )
    }
  }

  if (!confirm) {
    return respondWithMetadata(
      { error: 'confirm=true required to place order', source: 'local_guard' },
      400
    )
  }

  // Use validated values from this point forward
  const validatedTokenId = validationResults.sanitized.tokenId as string
  const validatedPrice = validationResults.sanitized.price as number
  const validatedAmount = validationResults.sanitized.amount as number
  const validatedSide = validationResults.sanitized.side as 'BUY' | 'SELL'
  const validatedOrderType = validationResults.sanitized.orderType as 'GTC' | 'FOK' | 'FAK' | 'IOC'

  // Generate request tracking IDs
  const requestId = request.headers.get('x-request-id') ?? makeRequestId()
  const serviceRole = createServiceRoleClient()
  const resolvedOrderIntentId = normalizeOptionalString(orderIntentId) ?? makeRequestId()
  const normalizedConditionId = normalizeOptionalString(conditionId ?? marketId) ?? null
  const resolvedInputMode = normalizeLogInputMode(inputMode)
  const resolvedUsdInput = normalizeNumber(usdInput)
  const resolvedContractsInput = normalizeNumber(contractsInput)
  const normalizedBestBid = normalizeNumber(bestBid)
  const normalizedBestAsk = normalizeNumber(bestAsk)
  const resolvedMinOrderSize = normalizeNumber(minOrderSize)
  const normalizedTokenId = normalizeOptionalString(tokenId)
  const normalizedOutcomeValue = normalizeOptionalString(outcome)
  const sideLower = side ? side.toLowerCase() : null
  const resolvedSlippage =
    typeof slippagePercent === 'number' && Number.isFinite(slippagePercent) && slippagePercent >= 0
      ? slippagePercent
      : null
  const slippageBps = resolvedSlippage !== null ? Math.round(resolvedSlippage * 100) : null

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

  let orderEventId: string | null = null
  let normalizedWalletAddress: string | null = null

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
    const normalizedOrderType = orderType === 'IOC' ? 'FAK' : orderType
    normalizedWalletAddress = normalizeWallet(signerAddress)
    const requestUrl = new URL(POST_ORDER, clobBaseUrl).toString()
    const upstreamHost = new URL(clobBaseUrl).hostname
    const normalizedPrice = normalizeNumber(price)
    const normalizedAmount = normalizeNumber(amount)
    const tickSize = await fetchMarketTickSize(clobBaseUrl, validatedTokenId)
    const effectiveTickSize = tickSize ?? 0.01
    const roundedPrice =
      normalizedPrice ? roundDownToStep(normalizedPrice, effectiveTickSize) : normalizedPrice
    const roundedAmount =
      normalizedAmount && normalizedAmount > 0 ? roundDownToStep(normalizedAmount, 0.01) : null
    const adjustedAmount =
      roundedPrice && roundedAmount
        ? adjustSizeForImpliedAmount(roundedPrice, roundedAmount, effectiveTickSize, 2, 2)
        : roundedAmount
    console.log('[POLY-ORDER-PLACE] CLOB order', {
      requestId,
      upstreamHost,
      side,
      orderType: normalizedOrderType,
      keys: Object.keys(body ?? {}),
      tickSize,
      effectiveTickSize,
      roundedPrice,
      roundedAmount,
      adjustedAmount,
    })

    if (!roundedPrice || !roundedAmount || !adjustedAmount) {
      return respondWithMetadata(
        { error: 'Invalid price or amount after rounding', source: 'local_guard' },
        400
      )
    }

    const orderEventPayload = {
      user_id: userId,
      wallet_address: normalizedWalletAddress,
      order_intent_id: resolvedOrderIntentId,
      request_id: requestId,
      condition_id: normalizedConditionId,
      token_id: normalizedTokenId,
      side: sideLower,
      outcome: normalizedOutcomeValue,
      order_type: normalizedOrderType,
      slippage_bps: slippageBps,
      limit_price: roundedPrice,
      size: adjustedAmount,
      min_order_size: resolvedMinOrderSize,
      tick_size: effectiveTickSize,
      best_bid: normalizedBestBid,
      best_ask: normalizedBestAsk,
      input_mode: resolvedInputMode,
      usd_input: resolvedUsdInput,
      contracts_input: resolvedContractsInput,
      auto_correct_applied: Boolean(autoCorrectApplied),
      status: 'attempted',
      polymarket_order_id: null,
      http_status: null,
      error_code: null,
      error_message: null,
      raw_error: null,
    }

    try {
      const { data: insertedEvent, error: eventError } = await serviceRole
        .from(ORDER_EVENTS_TABLE)
        .insert(orderEventPayload)
        .select('id')
        .single()
      if (eventError) {
        throw eventError
      }
      orderEventId = insertedEvent?.id ?? null
    } catch (eventError) {
      console.error('[POLY-ORDER-PLACE] Failed to persist order event', eventError)
    }

    logInfo('order_attempted', {
      request_id: requestId,
      order_intent_id: resolvedOrderIntentId,
      user_id: userId,
      wallet_address: normalizedWalletAddress,
      condition_id: normalizedConditionId,
      token_id: normalizedTokenId,
      outcome: normalizedOutcomeValue,
      side: sideLower,
      order_type: normalizedOrderType,
      limit_price: roundedPrice,
      size: adjustedAmount,
      status: 'attempted',
      event_id: orderEventId,
    })

    const order = await client.createOrder(
      { tokenID: tokenId, price: roundedPrice, size: adjustedAmount, side: side as any },
      { signatureType } as any
    )

    let rawResult: unknown
    try {
      rawResult = await client.postOrder(order, normalizedOrderType as any, false)
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
    const safeRawResult = sanitizeForResponse(rawResult) ?? rawResult
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
      const snippet = getBodySnippet(evaluation.raw ?? '')
      console.error('[POLY-ORDER-PLACE] Upstream error', {
        requestId,
        upstreamHost,
        upstreamStatus,
        errorType: evaluation.errorType,
        message: evaluation.message,
        raw: sanitizedEvaluationRaw,
      })
      console.log('[POLY-ORDER-PLACE] Polymarket raw response', {
        status: upstreamStatus,
        body: sanitizedEvaluationRaw ?? evaluation.raw,
      })
      const truncatedErrorMessage = truncateMessage(evaluation.message ?? 'Order rejected')
      const sanitizedErrorBody =
        sanitizedEvaluationRaw ?? sanitizeForLogging(evaluation.raw ?? null)
      await updateOrderEventStatus(serviceRole, orderEventId, {
        status: 'rejected',
        http_status: upstreamStatus,
        error_code: evaluation.errorType ?? null,
        error_message: truncatedErrorMessage,
        raw_error: sanitizedErrorBody ?? null,
      })
      logError('order_rejected', {
        request_id: requestId,
        order_intent_id: resolvedOrderIntentId,
        user_id: userId,
        wallet_address: normalizedWalletAddress,
        condition_id: normalizedConditionId,
        token_id: normalizedTokenId,
        outcome: normalizedOutcomeValue,
        side: sideLower,
        order_type: normalizedOrderType,
        limit_price: roundedPrice,
        size: adjustedAmount,
        http_status: upstreamStatus,
        error_code: evaluation.errorType ?? null,
        error_message: truncatedErrorMessage,
        raw_error: sanitizedErrorBody ?? null,
        event_id: orderEventId,
      })
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
          polymarketError: sanitizedEvaluationRaw ?? evaluation.raw,
          raw: sanitizedEvaluationRaw
            ? typeof sanitizedEvaluationRaw === 'string'
              ? sanitizedEvaluationRaw
              : JSON.stringify(sanitizedEvaluationRaw)
            : undefined,
          snippet,
        },
        upstreamStatus
      )
    }

    const { orderId } = evaluation

    await updateOrderEventStatus(serviceRole, orderEventId, {
      status: 'submitted',
      http_status: upstreamStatus,
      polymarket_order_id: orderId ?? null,
      error_code: null,
      error_message: null,
      raw_error: null,
    })
    logInfo('order_submitted', {
      request_id: requestId,
      order_intent_id: resolvedOrderIntentId,
      user_id: userId,
      wallet_address: normalizedWalletAddress,
      condition_id: normalizedConditionId,
      token_id: normalizedTokenId,
      outcome: normalizedOutcomeValue,
      side: sideLower,
      order_type: normalizedOrderType,
      limit_price: roundedPrice,
      size: adjustedAmount,
      http_status: upstreamStatus,
      polymarket_order_id: orderId ?? null,
      status: 'submitted',
      event_id: orderEventId,
    })

    try {
      if (orderId) {
        await persistCopiedTraderMetadata({
          userId,
          orderId,
          tokenId,
          price: roundedPrice,
          amount: adjustedAmount,
          amountInvested,
          side,
          orderType: normalizedOrderType,
          copiedTraderId,
          copiedTraderWallet,
          copiedTraderUsername,
          marketId,
          marketTitle,
          marketSlug,
          marketAvatarUrl,
          outcome,
          autoCloseOnTraderClose,
          autoClose,
          slippagePercent,
        })
      }
    } catch (error) {
      console.warn('[POLY-ORDER-PLACE] Failed to persist copied trader metadata', error)
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
    const truncatedErrorMessage = truncateMessage(safeError.message)
    const sanitizedErrorBody = sanitizeForLogging(safeError)
    const errorStatus =
      safeError.status && Number.isInteger(safeError.status) ? safeError.status : 500
    await updateOrderEventStatus(serviceRole, orderEventId, {
      status: 'rejected',
      http_status: errorStatus,
      error_code: safeError.code ?? safeError.name,
      error_message: truncatedErrorMessage,
      raw_error: sanitizedErrorBody ?? null,
    })
    logError('order_rejected', {
      request_id: requestId,
      order_intent_id: resolvedOrderIntentId,
      user_id: userId,
      wallet_address: normalizedWalletAddress,
      condition_id: normalizedConditionId,
      token_id: normalizedTokenId,
      outcome: normalizedOutcomeValue,
      side: sideLower,
      order_type: orderType === 'IOC' ? 'FAK' : orderType,
      limit_price: normalizeNumber(price),
      size: normalizeNumber(amount),
      http_status: errorStatus,
      error_code: safeError.code ?? safeError.name,
      error_message: truncatedErrorMessage,
      raw_error: sanitizedErrorBody ?? null,
      event_id: orderEventId,
    })
    console.error('[POLY-ORDER-PLACE] Error (sanitized):', safeError)
    return respondWithMetadata(
      {
        ok: false,
        source: 'server',
        error: safeError,
      },
      errorStatus
    )
  }
}
