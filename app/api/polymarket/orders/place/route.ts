import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getAuthedClobClientForUser } from '@/lib/polymarket/authed-client'
import { getActualFillPriceWithClient } from '@/lib/polymarket/fill-price'
import { POST_ORDER } from '@polymarket/clob-client/dist/endpoints.js'
import { placeOrderCore } from '@/lib/polymarket/place-order-core'
import { getValidatedPolymarketClobBaseUrl } from '@/lib/env'
import { requireEvomiProxyAgent } from '@/lib/evomi/proxy'
import { getBodySnippet } from '@/lib/polymarket/order-route-helpers'
import { sanitizeError } from '@/lib/http/sanitize-error'
import { logError, logInfo, makeRequestId, sanitizeForLogging } from '@/lib/logging/logger'
import { resolveOrdersTableName } from '@/lib/orders/table'
import { fetchMarketTickSize } from '@/lib/polymarket/order-prep'
import { adjustSizeForImpliedAmount, adjustSizeForImpliedAmountAtLeast, roundDownToStep } from '@/lib/polymarket/sizing'
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
  isClosingFullPosition?: boolean
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

function normalizeTimestamp(value?: string | Date | null) {
  if (!value) return null
  try {
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  } catch {
    return null
  }
}

async function fetchCopiedTraderPositionSize(
  wallet?: string | null,
  marketId?: string | null,
  outcome?: string | null
): Promise<number | null> {
  const normalizedWallet = normalizeWallet(wallet)
  const normalizedMarketId = normalizeOptionalString(marketId)
  const normalizedOutcome = normalizeOptionalString(outcome)?.toUpperCase()
  if (!normalizedWallet || !normalizedMarketId || !normalizedOutcome) return null

  const limit = 500
  let offset = 0

  while (true) {
    const url = new URL('https://data-api.polymarket.com/positions')
    url.searchParams.set('user', normalizedWallet)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('offset', String(offset))

    try {
      const response = await fetch(url.toString(), { cache: 'no-store' })
      if (!response.ok) break

      const batch = await response.json()
      if (!Array.isArray(batch) || batch.length === 0) break

      for (const position of batch) {
        const conditionId = normalizeOptionalString(position?.conditionId ?? position?.asset ?? null)
        const matchesMarket =
          conditionId &&
          (conditionId === normalizedMarketId ||
            normalizedMarketId.startsWith(conditionId) ||
            conditionId.startsWith(normalizedMarketId))
        if (!matchesMarket) continue

        const outcomeValue = normalizeOptionalString(position?.outcome)?.toUpperCase()
        if (outcomeValue !== normalizedOutcome) continue

        const sizeValue = normalizeNumber(position?.size)
        if (sizeValue !== null && sizeValue >= 0) {
          return sizeValue
        }
      }

      if (batch.length < limit) break
      offset += limit
    } catch (error) {
      console.warn('[POLY-ORDER-PLACE] Failed to fetch copied trader position size', error)
      break
    }
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

  // Trigger PnL backfill for the new trader asynchronously
  import('@/lib/backfill/trigger-wallet-pnl-backfill')
    .then((mod) => mod.triggerWalletPnlBackfill(normalized))
    .catch((err) => {
      console.error(`[ensureTraderId] Failed to trigger PnL backfill for new trader ${normalized}:`, err)
    })

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
  autoCloseAllowed,
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
  autoCloseAllowed?: boolean
},
overrides?: {
  status?: string | null
  size?: number | null
  filledSize?: number | null
  remainingSize?: number | null
  createdAt?: string | Date | null
  rawOrder?: any
  fillPrice?: number | null
}) {
  const hasCopiedMetadata =
    Boolean(normalizeOptionalString(copiedTraderId)) ||
    Boolean(normalizeOptionalString(copiedTraderWallet)) ||
    Boolean(normalizeOptionalString(copiedTraderUsername))
  const normalizedOutcome = normalizeOptionalString(outcome)
  const hasOrderContext =
    Boolean(normalizeOptionalString(orderType ?? null)) ||
    Boolean(normalizeOptionalString(tokenId ?? null)) ||
    Boolean(normalizeOptionalString(marketId ?? null)) ||
    Boolean(normalizedOutcome) ||
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
  const normalizedSize = normalizeNumber(overrides?.size ?? amount)
  const normalizedFilledSize = normalizeNumber(overrides?.filledSize)
  const normalizedRemainingSize =
    normalizeNumber(overrides?.remainingSize) ??
    (normalizedSize !== null && normalizedFilledSize !== null
      ? Math.max(normalizedSize - normalizedFilledSize, 0)
      : normalizedSize)
  const normalizedStatus = normalizeOptionalString(overrides?.status)?.toLowerCase() ?? 'open'
  const normalizedAmountInvested = normalizeNumber(amountInvested)
  const normalizedCopiedTraderId = normalizeOptionalString(copiedTraderId)
  const normalizedCopiedTraderWallet = normalizeWallet(copiedTraderWallet)
  const normalizedCopiedTraderUsername = normalizeOptionalString(copiedTraderUsername)
  const now = new Date().toISOString()
  const resolvedCreatedAt = normalizeTimestamp(overrides?.createdAt) ?? now
  const allowAutoClose = Boolean(autoCloseAllowed)
  const resolvedAutoClose =
    allowAutoClose &&
    (typeof autoCloseOnTraderClose === 'boolean'
      ? autoCloseOnTraderClose
      : typeof autoClose === 'boolean'
        ? autoClose
        : true)
  const normalizedSlippage =
    allowAutoClose &&
    typeof slippagePercent === 'number' &&
    Number.isFinite(slippagePercent) &&
    slippagePercent >= 0
      ? slippagePercent
      : null

  const traderPositionSize = await fetchCopiedTraderPositionSize(
    normalizedCopiedTraderWallet,
    normalizedMarketId,
    normalizedOutcome
  )

  // Use actual fill price from CLOB trades when available, otherwise limit price
  const effectivePrice = overrides?.fillPrice ?? normalizedPrice;

  const rawPayload: Record<string, unknown> = {
    source: 'polycopy_place_order',
    token_id: tokenId ?? null,
    market_id: normalizedMarketId,
    outcome: normalizedOutcome,
    copied_trader_id: normalizedCopiedTraderId,
    copied_trader_wallet: normalizedCopiedTraderWallet,
    copied_trader_username: normalizeOptionalString(copiedTraderUsername),
    auto_close_on_trader_close: resolvedAutoClose,
    auto_close_slippage_percent: normalizedSlippage,
  }

  if (traderPositionSize !== null) {
    rawPayload.trader_position_size = traderPositionSize
  }

  if (overrides?.rawOrder) {
    rawPayload.clob_order = overrides.rawOrder
  }

  const payload: Record<string, unknown> = {
    order_id: orderId,
    trader_id: traderId,
    copied_trader_id: normalizedCopiedTraderId,
    copied_trader_wallet: normalizedCopiedTraderWallet,
    market_id: normalizedMarketId,
    outcome: normalizedOutcome,
    side: side ? side.toLowerCase() : null,
    order_type: orderType ?? null,
    time_in_force: orderType ?? null,
    price: effectivePrice ?? normalizedPrice ?? 0,
    size: normalizedSize ?? 0,
    filled_size: normalizedFilledSize ?? 0,
    remaining_size: normalizedRemainingSize ?? normalizedSize ?? 0,
    status: normalizedStatus,
    created_at: resolvedCreatedAt,
    updated_at: now,
    auto_close_on_trader_close: resolvedAutoClose,
    auto_close_slippage_percent: normalizedSlippage,
    raw: rawPayload,
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
    payload.copied_trade_id = randomUUID()
  }

  if (traderPositionSize !== null) {
    payload.trader_position_size = traderPositionSize
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
    isClosingFullPosition,
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
  
  // SECURITY: Idempotency check - Prevent duplicate orders (Race Condition Fix)
  // If orderIntentId is provided, it MUST be unique. If not provided, generate one.
  // This prevents double-clicks, network retries, and race conditions from creating duplicate orders.
  const resolvedOrderIntentId = normalizeOptionalString(orderIntentId) ?? makeRequestId()
  
  // Check idempotency BEFORE any processing
  try {
    const { data: idempotencyCheck, error: idempotencyError } = await serviceRole
      .rpc('check_and_record_order_intent', {
        p_order_intent_id: resolvedOrderIntentId,
        p_user_id: userId,
      })
    
    if (idempotencyError) {
      console.error('[POLY-ORDER-PLACE] Idempotency check failed:', idempotencyError)
      // Allow order to proceed (fail-open for availability)
      // But log the error for monitoring
      logError('idempotency_check_failed', {
        request_id: requestId,
        order_intent_id: resolvedOrderIntentId,
        user_id: userId,
        error: idempotencyError,
      })
    } else if (idempotencyCheck) {
      const { allowed, reason, existing_order_id, status, result_data } = idempotencyCheck as any
      
      if (!allowed) {
        // Duplicate request detected
        if (reason === 'duplicate' && result_data) {
          // Return cached result for idempotent response
          logInfo('order_duplicate_detected', {
            request_id: requestId,
            order_intent_id: resolvedOrderIntentId,
            user_id: userId,
            existing_order_id,
            status,
          })
          
          return respondWithMetadata(
            {
              ok: true,
              ...result_data,
              idempotent: true,
              cached: true,
              originalStatus: status,
            },
            200
          )
        } else if (reason === 'race_detected') {
          // Rare: Race condition between check and insert
          logError('order_race_detected', {
            request_id: requestId,
            order_intent_id: resolvedOrderIntentId,
            user_id: userId,
          })
          
          return respondWithMetadata(
            {
              error: 'Order already in progress. Please wait.',
              source: 'idempotency_check',
              reason: 'duplicate_detected',
            },
            429
          )
        } else if (reason === 'intent_id_taken') {
          // Different user trying to use same intent ID (malicious?)
          logError('order_intent_id_conflict', {
            request_id: requestId,
            order_intent_id: resolvedOrderIntentId,
            user_id: userId,
          })
          
          return respondWithMetadata(
            {
              error: 'Invalid order intent ID',
              source: 'idempotency_check',
            },
            400
          )
        }
      } else {
        // Order is new and recorded, proceed
        logInfo('order_idempotency_recorded', {
          request_id: requestId,
          order_intent_id: resolvedOrderIntentId,
          user_id: userId,
          reason,
        })
      }
    }
  } catch (error) {
    // Idempotency check failed (database error, etc.)
    console.error('[POLY-ORDER-PLACE] Idempotency check exception:', error)
    logError('idempotency_check_exception', {
      request_id: requestId,
      order_intent_id: resolvedOrderIntentId,
      user_id: userId,
      error,
    })
    // Fail-open: Allow order to proceed
  }

  const { data: profile, error: profileError } = await serviceRole
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    console.error('[POLY-ORDER-PLACE] Failed to load profile for admin check', profileError)
  }

  const isAdminUser = Boolean(profile?.is_admin)
  const autoCloseAllowed = isAdminUser
  
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

  const clobBaseUrl = getValidatedPolymarketClobBaseUrl()
  const requestUrl = new URL(POST_ORDER, clobBaseUrl).toString()
  const upstreamHost = new URL(clobBaseUrl).hostname
  const normalizedOrderType = orderType === 'IOC' ? 'FAK' : orderType

  try {
    try {
      await requireEvomiProxyAgent('order placement')
      const targetCountryCode = (process.env.EVOMI_PROXY_COUNTRY?.trim() || 'IE').toUpperCase()
      const targetCountryLabel = targetCountryCode === 'IE' ? 'Ireland' : targetCountryCode
      console.log(
        `[POLY-ORDER-PLACE] Proxy note: Ensure proxy endpoint uses ${targetCountryLabel} IP for Polymarket access`
      )
    } catch (error: any) {
      console.error('[POLY-ORDER-PLACE] ❌ Evomi proxy required but unavailable:', error?.message || error)
      return respondWithMetadata(
        { ok: false, source: 'proxy', error: 'Evomi proxy unavailable', errorType: 'evomi_unavailable' },
        503
      )
    }

    const normalizedPrice = normalizeNumber(price)
    const normalizedAmount = normalizeNumber(amount)
    const tickSize = await fetchMarketTickSize(clobBaseUrl, validatedTokenId)
    const effectiveTickSize = tickSize ?? 0.01
    const roundedPrice =
      normalizedPrice ? roundDownToStep(normalizedPrice, effectiveTickSize) : normalizedPrice
    const roundedAmount =
      normalizedAmount && normalizedAmount > 0 ? roundDownToStep(normalizedAmount, 0.01) : null
    const shouldRoundUp = resolvedInputMode === 'usd' && validatedSide === 'BUY'
    const shouldSkipAdjustment = validatedSide === 'SELL'
    const adjustmentFunction = shouldRoundUp
      ? adjustSizeForImpliedAmountAtLeast
      : adjustSizeForImpliedAmount
    const adjustedAmount =
      shouldSkipAdjustment || !roundedPrice || !roundedAmount
        ? roundedAmount
        : adjustmentFunction(roundedPrice, roundedAmount, effectiveTickSize, 2, 2)
    console.log('[POLY-ORDER-PLACE] CLOB order', {
      requestId,
      upstreamHost,
      side,
      orderType: normalizedOrderType,
      tickSize,
      effectiveTickSize,
      roundedPrice,
      roundedAmount,
      adjustedAmount,
      inputMode: resolvedInputMode,
    })

    if (!roundedPrice || !roundedAmount || !adjustedAmount) {
      return respondWithMetadata(
        {
          error: 'Invalid price or amount after rounding. This may occur if the market price is too close to $1.00 and there is insufficient liquidity in the order book to execute your sell. You may need to wait until the market resolves or try again with different slippage settings.',
          source: 'local_guard',
        },
        400
      )
    }

    const result = await placeOrderCore({
      supabase: serviceRole,
      userId,
      tokenId: validatedTokenId,
      price: roundedPrice,
      size: adjustedAmount,
      side: validatedSide,
      orderType: normalizedOrderType,
      requestId,
      orderIntentId: resolvedOrderIntentId,
      useAnyWallet: false,
      conditionId: normalizedConditionId,
      outcome: normalizedOutcomeValue,
      slippageBps,
      minOrderSize: resolvedMinOrderSize,
      tickSize: effectiveTickSize,
      bestBid: normalizedBestBid,
      bestAsk: normalizedBestAsk,
      inputMode: resolvedInputMode,
      usdInput: resolvedUsdInput,
      contractsInput: resolvedContractsInput,
      autoCorrectApplied: Boolean(autoCorrectApplied),
    })

    if (!result.success) {
      const evaluation = result.evaluation
      const errMsg = 'message' in evaluation ? evaluation.message : 'Order rejected'
      const truncatedErrorMessage = truncateMessage(errMsg)
      try {
        await serviceRole.rpc('update_order_idempotency_result', {
          p_order_intent_id: resolvedOrderIntentId,
          p_status: 'failed',
          p_error_code: 'errorType' in evaluation ? evaluation.errorType ?? null : null,
          p_error_message: truncatedErrorMessage,
          p_result_data: {
            ok: false,
            error: errMsg,
            errorType: 'errorType' in evaluation ? evaluation.errorType : undefined,
            source: 'upstream',
          },
        })
      } catch (error) {
        console.warn('[POLY-ORDER-PLACE] Failed to update idempotency record (rejection)', error)
      }
      const sanitizedEvaluationRaw = sanitizeForResponse(evaluation.raw)
      const snippet = getBodySnippet(evaluation.raw ?? '')
      return respondWithMetadata(
        {
          ok: false,
          error: errMsg,
          errorType: 'errorType' in evaluation ? evaluation.errorType : undefined,
          rayId: 'rayId' in evaluation ? evaluation.rayId : undefined,
          blockedByCloudflare: 'errorType' in evaluation && evaluation.errorType === 'blocked_by_cloudflare',
          requestUrl,
          source: 'upstream',
          upstreamHost,
          upstreamStatus: 'status' in evaluation ? evaluation.status ?? 502 : 502,
          isHtml: evaluation.contentType === 'text/html',
          contentType: evaluation.contentType,
          polymarketError: sanitizedEvaluationRaw ?? evaluation.raw,
          raw: sanitizedEvaluationRaw != null ? (typeof sanitizedEvaluationRaw === 'string' ? sanitizedEvaluationRaw : JSON.stringify(sanitizedEvaluationRaw)) : undefined,
          snippet,
        },
        'status' in evaluation ? evaluation.status ?? 502 : 502
      )
    }

    const orderId = result.orderId ?? null
    const normalizedWalletAddress = result.walletAddress
    const { evaluation } = result

    let shouldPersistOrderRow = Boolean(orderId)
    let metadataOverrides:
      | {
          status?: string | null
          size?: number | null
          filledSize?: number | null
          remainingSize?: number | null
          createdAt?: string | Date | null
          rawOrder?: any
          fillPrice?: number | null
        }
      | undefined

    if (orderId && normalizedOrderType === 'FAK') {
      try {
        const { client } = await getAuthedClobClientForUser(userId)
        const clobOrder = await client.getOrder(orderId)
        const fetchedSize = normalizeNumber(clobOrder?.original_size)
        const fetchedFilled = normalizeNumber(clobOrder?.size_matched)
        const fetchedRemaining =
          fetchedSize !== null && fetchedFilled !== null
            ? Math.max(fetchedSize - fetchedFilled, 0)
            : null
        const fetchedStatus =
          typeof clobOrder?.status === 'string' ? clobOrder.status.toLowerCase() : null
        const createdAtIndex = clobOrder?.created_at
        const fetchedCreatedAt = normalizeTimestamp(
          createdAtIndex != null
            ? typeof createdAtIndex === 'number'
              ? new Date(createdAtIndex)
              : createdAtIndex
            : null
        )

        // Get actual fill price from CLOB trades (not limit price)
        let actualFillPrice: number | null = null
        if (fetchedFilled && fetchedFilled > 0 && roundedPrice) {
          try {
            const result = await getActualFillPriceWithClient(client, orderId, roundedPrice)
            actualFillPrice = result.fillPrice
          } catch {
            // Fall back to limit price
          }
        }

        metadataOverrides = {
          status: fetchedStatus,
          size: fetchedSize,
          filledSize: fetchedFilled,
          remainingSize: fetchedRemaining,
          createdAt: fetchedCreatedAt,
          rawOrder: clobOrder,
          fillPrice: actualFillPrice,
        }

        if (!fetchedFilled || fetchedFilled <= 0) {
          shouldPersistOrderRow = false
          console.log('[POLY-ORDER-PLACE] Skipping orders row for unfilled FAK order', {
            orderId,
          })
        }
      } catch (error) {
        console.warn('[POLY-ORDER-PLACE] Failed to fetch order for FAK persistence check', error)
      }
    }

    const upstreamStatus = 200
    // Update idempotency record with success
    try {
      await serviceRole.rpc('update_order_idempotency_result', {
        p_order_intent_id: resolvedOrderIntentId,
        p_status: 'completed',
        p_polymarket_order_id: orderId ?? null,
        p_result_data: {
          ok: true,
          orderId,
          submittedAt: new Date().toISOString(),
          source: 'upstream',
          upstreamHost,
          upstreamStatus,
        },
      })
    } catch (error) {
      console.warn('[POLY-ORDER-PLACE] Failed to update idempotency record (success)', error)
    }
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
      event_id: result.orderEventId,
    })

    try {
      if (shouldPersistOrderRow && orderId) {
        await persistCopiedTraderMetadata({
          userId,
          orderId,
          tokenId: validatedTokenId,
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
          autoCloseAllowed,
        }, metadataOverrides)
      }
    } catch (error) {
      console.warn('[POLY-ORDER-PLACE] Failed to persist copied trader metadata', error)
    }

    return respondWithMetadata(
      {
        ok: true,
        proxy: result.proxyAddress,
        signer: result.signerAddress,
        signatureType: result.signatureType,
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
    const errorStatus =
      safeError.status && Number.isInteger(safeError.status) ? safeError.status : 500
    
    // Update idempotency record with error
    try {
      await serviceRole.rpc('update_order_idempotency_result', {
        p_order_intent_id: resolvedOrderIntentId,
        p_status: 'failed',
        p_error_code: safeError.code ?? safeError.name,
        p_error_message: truncatedErrorMessage,
        p_result_data: {
          ok: false,
          source: 'server',
          error: safeError,
        },
      })
    } catch (error) {
      console.warn('[POLY-ORDER-PLACE] Failed to update idempotency record (error)', error)
    }
    logError('order_rejected', {
      request_id: requestId,
      order_intent_id: resolvedOrderIntentId,
      user_id: userId,
      wallet_address: null,
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
      raw_error: sanitizeForLogging(safeError) ?? null,
      event_id: null,
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
