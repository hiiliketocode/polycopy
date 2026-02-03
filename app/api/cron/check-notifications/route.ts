import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import TraderClosedPositionEmail from '@/emails/TraderClosedPosition'
import MarketResolvedEmail from '@/emails/MarketResolved'
import AutoCloseExecutedEmail from '@/emails/AutoCloseExecuted'
import AutoCloseFailedEmail from '@/emails/AutoCloseFailed'
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client'
import { resolveOrdersTableName } from '@/lib/orders/table'
import { requireEvomiProxyAgent } from '@/lib/evomi/proxy'
import { interpretClobOrderResult } from '@/lib/polymarket/order-response'
import { fetchOrderWithClient } from '@/lib/polymarket/clobClient'
import { makeRequestId } from '@/lib/logging/logger'
import { adjustSizeForImpliedAmountAtLeast, roundDownToStep } from '@/lib/polymarket/sizing'

// Create service role client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Initialize Resend only if API key is available (prevents build errors)
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const ORDER_EVENTS_TABLE = 'order_events_log'
const MAX_ERROR_MESSAGE_LENGTH = 500

// Helper to calculate trader's ROI
function calculateTraderROI(traderAvgPrice: number | null, currentPrice: number | null): number {
  if (!traderAvgPrice || !currentPrice || traderAvgPrice === 0) {
    return 0
  }
  return ((currentPrice - traderAvgPrice) / traderAvgPrice) * 100
}

function normalizeOutcome(value: string | null | undefined) {
  return value ? value.trim().toLowerCase() : ''
}

function roundPriceToTick(price: number, tickSize: number | null) {
  if (!tickSize || tickSize <= 0) return price
  const steps = Math.round(price / tickSize)
  return steps * tickSize
}

function truncateMessage(value?: string | null, max = MAX_ERROR_MESSAGE_LENGTH) {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max)
}

async function updateOrderEventStatus(orderEventId: string | null, updates: Record<string, unknown>) {
  if (!orderEventId) return
  try {
    await supabase.from(ORDER_EVENTS_TABLE).update(updates).eq('id', orderEventId)
  } catch (error) {
    console.error('[AUTO-CLOSE] Failed to update order event row', error)
  }
}

async function fetchMarketTokenData(conditionId: string, outcome: string) {
  const response = await fetch(`https://clob.polymarket.com/markets/${conditionId}`, {
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`CLOB market fetch failed: ${response.status}`)
  }
  const market = await response.json()
  const tokens = Array.isArray(market?.tokens) ? market.tokens : []
  const normalizedOutcome = normalizeOutcome(outcome)
  const match = tokens.find((token: any) => normalizeOutcome(token?.outcome) === normalizedOutcome)
  const price = match?.price !== undefined ? Number(match.price) : null
  const tickSize =
    market?.tick_size !== undefined && market?.tick_size !== null
      ? Number(market.tick_size)
      : null
  const tokenId = match?.token_id ?? match?.tokenId ?? null
  return { tokenId, price, tickSize, question: market?.question ?? null }
}

async function fetchWalletPositionSize(wallet: string, marketId: string, outcome: string) {
  const positions: any[] = []
  let offset = 0
  const limit = 500
  let hasMore = true

  while (hasMore) {
    const positionsUrl = `https://data-api.polymarket.com/positions?user=${wallet}&limit=${limit}&offset=${offset}`
    const positionsResponse = await fetch(positionsUrl, { cache: 'no-store' })
    if (!positionsResponse.ok) {
      throw new Error(`Positions fetch failed: ${positionsResponse.status}`)
    }
    const batch = await positionsResponse.json()
    const batchSize = Array.isArray(batch) ? batch.length : 0
    if (batchSize > 0) {
      positions.push(...batch)
      offset += batchSize
      hasMore = batchSize === limit
    } else {
      hasMore = false
    }
  }

  const normalizedOutcome = normalizeOutcome(outcome)
  const match = positions.find((pos: any) => {
    const idMatch =
      pos.conditionId === marketId ||
      pos.asset === marketId ||
      (pos.conditionId && marketId && marketId.includes(pos.conditionId))
    const outcomeMatch = normalizeOutcome(pos.outcome) === normalizedOutcome
    const size = Number(pos.size ?? 0)
    return idMatch && outcomeMatch && Number.isFinite(size) && size > 0
  })

  if (!match) return null
  const size = Number(match.size ?? 0)
  return Number.isFinite(size) && size > 0 ? size : null
}

/**
 * GET /api/cron/check-notifications
 * Vercel Cron job that runs every minute to check for notification triggers
 */
export async function GET(request: NextRequest) {
  // Security: Verify this is called by Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('❌ Unauthorized cron request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  console.log('🔔 Starting notification check...')
  
  try {
    const ordersTable = await resolveOrdersTableName(supabase)

    // Fetch active trades that need checking from the enriched view for consistent PnL/entry fields.
    const { data: trades, error } = await supabase
      .from('orders_copy_enriched')
      .select(`
        order_id,
        copied_trade_id,
        copy_user_id,
        copied_trader_wallet,
        copied_trader_username,
        copied_market_title,
        market_id,
        outcome,
        price_when_copied,
        entry_price,
        invested_usd,
        trader_still_has_position,
        trader_closed_at,
        current_price,
        market_resolved,
        market_resolved_at,
        notification_closed_sent,
        notification_resolved_sent,
        last_checked_at,
        resolved_outcome,
        user_closed_at,
        user_exit_price,
        created_at
      `)
      .not('copy_user_id', 'is', null)
      .or(
        'market_resolved.eq.false,notification_resolved_sent.is.null,notification_resolved_sent.eq.false,notification_closed_sent.is.null,notification_closed_sent.eq.false'
      )
      .limit(500)
    
    if (error) {
      console.error('Error fetching trades:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    console.log(`📊 Checking ${trades?.length || 0} trades...`)
    
    let notificationsSent = 0
    let tradesChecked = 0
    
    const userWalletByTraderId = new Map<string, string | null>()
    const userIdByWallet = new Map<string, string | null>()
    const profileByUserId = new Map<string, { email: string | null; name: string }>()

    const resolveUserWalletByTraderId = async (traderId: string) => {
      if (userWalletByTraderId.has(traderId)) {
        return userWalletByTraderId.get(traderId) ?? null
      }
      const { data: traderRow } = await supabase
        .from('traders')
        .select('wallet_address')
        .eq('id', traderId)
        .maybeSingle()
      const wallet = traderRow?.wallet_address?.toLowerCase() || null
      userWalletByTraderId.set(traderId, wallet)
      return wallet
    }

    const resolveUserIdByWallet = async (wallet: string) => {
      if (userIdByWallet.has(wallet)) {
        return userIdByWallet.get(wallet) ?? null
      }
      const { data: credential } = await supabase
        .from('clob_credentials')
        .select('user_id')
        .ilike('polymarket_account_address', wallet)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const userId = credential?.user_id ?? null
      userIdByWallet.set(wallet, userId)
      return userId
    }

    const resolveProfile = async (userId: string) => {
      if (profileByUserId.has(userId)) {
        return profileByUserId.get(userId) ?? null
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', userId)
        .single()
      const email = profile?.email ?? null
      const name = email ? email.split('@')[0] : 'Trader'
      const result = { email, name }
      profileByUserId.set(userId, result)
      return result
    }

    const attemptAutoCloseFromOrder = async (order: any) => {
      console.log(`[AUTO-CLOSE] attemptAutoCloseFromOrder called for order ${order.order_id}`)
      
      const copiedTraderWallet = order.copied_trader_wallet?.toLowerCase()
      if (!copiedTraderWallet || !order.market_id || !order.outcome || !order.trader_id) {
        console.warn(`[AUTO-CLOSE] Order ${order.order_id} skipped - missing required fields:`, {
          hasCopiedTraderWallet: !!copiedTraderWallet,
          hasMarketId: !!order.market_id,
          hasOutcome: !!order.outcome,
          hasTraderId: !!order.trader_id
        })
        return
      }

      if (order.auto_close_on_trader_close === false) {
        console.log(`[AUTO-CLOSE] Order ${order.order_id} skipped - auto_close_on_trader_close is false`)
        return
      }
      if (order.auto_close_triggered_at) {
        console.log(`[AUTO-CLOSE] Order ${order.order_id} skipped - already triggered at ${order.auto_close_triggered_at}`)
        return
      }
      // Check retry count from error message (format: "RETRY_COUNT:X|error message")
      let retryCount = 0
      if (order.auto_close_error) {
        const retryMatch = order.auto_close_error.match(/^RETRY_COUNT:(\d+)\|/)
        if (retryMatch) {
          retryCount = parseInt(retryMatch[1], 10)
        }
      }
      
      // Cap at 10 retries - after that, user needs to manually close
      if (retryCount >= 10) {
        console.log(`[AUTO-CLOSE] Order ${order.order_id} skipped - already attempted 10 times, user needs to close manually`)
        return
      }
      
      // Progressive cooldown: 5min for first 5 attempts, then 10min
      let cooldownMinutes = retryCount < 5 ? 5 : 10
      
      if (order.auto_close_attempted_at) {
        const lastAttempt = new Date(order.auto_close_attempted_at)
        const cooldownMs = cooldownMinutes * 60 * 1000
        if (Date.now() - lastAttempt.getTime() < cooldownMs) {
          console.log(`[AUTO-CLOSE] Order ${order.order_id} skipped - attempted recently (${Math.round((Date.now() - lastAttempt.getTime()) / 1000)}s ago, cooldown: ${cooldownMinutes}min, retry ${retryCount}/10)`)
          return
        }
      }

      let traderPositionSize: number | null = null
      try {
        traderPositionSize = await fetchWalletPositionSize(
          copiedTraderWallet,
          order.market_id,
          order.outcome
        )
      } catch (error: any) {
        console.error(`[AUTO-CLOSE] Order ${order.order_id}: Failed to fetch trader position size:`, error.message || error)
        return
      }
      
      const currentTraderPositionSize = traderPositionSize !== null && Number.isFinite(Number(traderPositionSize))
        ? Math.max(Number(traderPositionSize), 0)
        : 0
      const priorTraderPositionSize = order.trader_position_size !== null && order.trader_position_size !== undefined && Number.isFinite(Number(order.trader_position_size))
        ? Math.max(Number(order.trader_position_size), 0)
        : null
      const updateTraderPositionSize = async (size: number) => {
        await supabase.from(ordersTable).update({ trader_position_size: size }).eq('order_id', order.order_id)
      }

      console.log(`[AUTO-CLOSE] Checking order ${order.order_id}:`, {
        copiedTraderWallet,
        marketId: order.market_id,
        outcome: order.outcome,
        currentTraderPositionSize,
        priorTraderPositionSize,
        remainingSize: order.remaining_size
      })

      let reductionFraction: number | null = null
      if (priorTraderPositionSize === null) {
        if (currentTraderPositionSize > 0) {
          console.log(`[AUTO-CLOSE] Order ${order.order_id}: No prior position size, updating to ${currentTraderPositionSize}`)
          await updateTraderPositionSize(currentTraderPositionSize)
          return
        }
        console.log(`[AUTO-CLOSE] Order ${order.order_id}: No prior position size, trader has no position - full close`)
        reductionFraction = 1
      } else {
        if (currentTraderPositionSize >= priorTraderPositionSize) {
          console.log(`[AUTO-CLOSE] Order ${order.order_id}: Trader position increased or unchanged (${currentTraderPositionSize} >= ${priorTraderPositionSize}), updating stored size`)
          await updateTraderPositionSize(currentTraderPositionSize)
          return
        }
        reductionFraction =
          priorTraderPositionSize > 0
            ? (priorTraderPositionSize - currentTraderPositionSize) / priorTraderPositionSize
            : 0
        if (!Number.isFinite(reductionFraction) || reductionFraction <= 0) {
          console.log(`[AUTO-CLOSE] Order ${order.order_id}: Invalid reduction fraction (${reductionFraction}), updating stored size`)
          await updateTraderPositionSize(currentTraderPositionSize)
          return
        }
        console.log(`[AUTO-CLOSE] Order ${order.order_id}: Trader position reduced by ${(reductionFraction * 100).toFixed(2)}% (${priorTraderPositionSize} -> ${currentTraderPositionSize})`)
      }

      const userWallet = await resolveUserWalletByTraderId(order.trader_id)
      if (!userWallet) {
        console.warn(`⚠️ Auto-close skipped: missing user wallet for trader ${order.trader_id}`)
        return
      }

      const userId = await resolveUserIdByWallet(userWallet)
      if (!userId) {
        console.warn(`⚠️ Auto-close skipped: missing user id for wallet ${userWallet}`)
        return
      }

      let positionSize: number | null = null
      try {
        positionSize = await fetchWalletPositionSize(userWallet, order.market_id, order.outcome)
      } catch (error: any) {
        console.error(`[AUTO-CLOSE] Order ${order.order_id}: Failed to fetch user position size:`, error.message || error)
        await updateTraderPositionSize(currentTraderPositionSize)
        return
      }
      
      console.log(`[AUTO-CLOSE] Order ${order.order_id}: User position size = ${positionSize}, reductionFraction = ${reductionFraction}`)
      if (!positionSize || positionSize <= 0) {
        console.warn(`⚠️ Auto-close skipped: no open position for user ${userId} (wallet: ${userWallet})`)
        await updateTraderPositionSize(currentTraderPositionSize)
        return
      }

      const closeSizeRaw = Number(positionSize) * (reductionFraction ?? 0)
      let closeSize = Number.isFinite(closeSizeRaw) ? Math.min(closeSizeRaw, positionSize) : 0
      console.log(`[AUTO-CLOSE] Order ${order.order_id}: Calculated close size = ${closeSize} (from user position ${positionSize} * reduction ${reductionFraction})`)
      if (!Number.isFinite(closeSize) || closeSize <= 0) {
        console.warn(`[AUTO-CLOSE] Order ${order.order_id}: Invalid close size (${closeSize}), updating stored trader position size`)
        await updateTraderPositionSize(currentTraderPositionSize)
        return
      }

      const { tokenId, price, tickSize, question } = await fetchMarketTokenData(
        order.market_id,
        order.outcome
      )
      if (!tokenId || !price || price <= 0) {
        console.warn(`⚠️ Auto-close skipped: missing price/token for market ${order.market_id}`)
        return
      }
      
      // For auto-close, always use exact position size without adjustment
      // Adjusting up could cause "not enough balance" errors
      // Adjusting down leaves dust
      // Solution: Use exact size and let Polymarket handle execution
      closeSize = roundDownToStep(closeSize, 0.01)
      console.log(`✅ Auto-close: Using exact position size (${closeSize} contracts)`)

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://polycopy.app'
      const quickTradesUrl = `${appUrl}/portfolio?tab=manual-trades`
      const slippagePercent =
        typeof order.auto_close_slippage_percent === 'number' && order.auto_close_slippage_percent >= 0
          ? order.auto_close_slippage_percent
          : 2
      const normalizedSide = typeof order.side === 'string' ? order.side.toLowerCase() : 'buy'
      const closeSide: 'BUY' | 'SELL' = normalizedSide === 'sell' ? 'BUY' : 'SELL'
      const rawLimitPrice =
        closeSide === 'SELL'
          ? price * (1 - slippagePercent / 100)
          : price * (1 + slippagePercent / 100)
      const limitPrice = roundPriceToTick(rawLimitPrice, tickSize)
      if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
        console.warn(`⚠️ Auto-close skipped: invalid limit price for market ${order.market_id}`)
        return
      }

      type NotificationContext = { email: string; name: string } | null
      let notificationContext: NotificationContext | undefined
      const loadNotificationContext = async (): Promise<NotificationContext> => {
        if (notificationContext !== undefined) return notificationContext
        if (!resend) {
          console.error('Resend not configured, skipping auto-close email notification')
          return (notificationContext = null)
        }
        const profile = await resolveProfile(userId)
        if (!profile?.email) return (notificationContext = null)
        const { data: prefs } = await supabase
          .from('notification_preferences')
          .select('email_notifications_enabled')
          .eq('user_id', userId)
          .single()
        const notificationsEnabled = prefs?.email_notifications_enabled ?? true
        if (!notificationsEnabled) return (notificationContext = null)
        notificationContext = { email: profile.email, name: profile.name }
        return notificationContext
      }

      const marketTitle = question || order.market_id
      const sendFailureEmail = async (reason: string, isFinalAttempt: boolean = false) => {
        // Send email on 3rd, 6th, and 10th (final) attempts
        const shouldSendEmail = (retryCount + 1 === 3) || (retryCount + 1 === 6) || isFinalAttempt
        
        if (!shouldSendEmail) {
          console.log(`[AUTO-CLOSE] Order ${order.order_id}: Not sending failure email yet (retry ${retryCount + 1}/10)`)
          return
        }
        
        const context = await loadNotificationContext()
        if (!context || !resend) return
        const trimmedReason =
          typeof reason === 'string' && reason.trim().length > 0
            ? reason.trim().slice(0, 240)
            : 'The limit price was not hit.'
        
        const subject = isFinalAttempt 
          ? `Auto-close failed after 10 attempts: ${marketTitle}`
          : `Auto-close still trying: ${marketTitle}`
        
        const emailReason = isFinalAttempt
          ? `${trimmedReason}\n\nWe attempted 10 times but were unable to close your position automatically. You can close it manually on your portfolio page.`
          : `${trimmedReason} (Attempt ${retryCount + 1}/10)`
        
        try {
          await resend.emails.send({
            from: 'Polycopy <notifications@polycopy.app>',
            to: context.email,
            subject,
            react: AutoCloseFailedEmail({
              userName: context.name,
              marketTitle,
              outcome: order.outcome,
              reason: emailReason,
              tradeUrl: quickTradesUrl,
              polymarketUrl: `https://polymarket.com/event/${order.market_id}`,
              unsubscribeUrl: quickTradesUrl,
            }),
          })
          console.log(`[AUTO-CLOSE] Order ${order.order_id}: Sent ${isFinalAttempt ? 'final' : 'progress'} email after ${retryCount + 1} attempts`)
        } catch (emailError: any) {
          console.error(`❌ Failed to send auto-close failure email for order ${order.order_id}:`, {
            error: emailError?.message || emailError,
            to: context.email,
          })
        }
      }
      
      const updateErrorWithRetryCount = async (errorMessage: string) => {
        const newRetryCount = retryCount + 1
        const errorWithRetry = `RETRY_COUNT:${newRetryCount}|${errorMessage}`
        await supabase
          .from(ordersTable)
          .update({
            auto_close_error: errorWithRetry,
            auto_close_attempted_at: attemptedAt,
          })
          .eq('order_id', order.order_id)
        console.log(`[AUTO-CLOSE] Order ${order.order_id}: Retry ${newRetryCount}/5 - ${errorMessage}`)
      }

      const attemptedAt = new Date().toISOString()
      await supabase
        .from(ordersTable)
        .update({ auto_close_attempted_at: attemptedAt, auto_close_error: null })
        .eq('order_id', order.order_id)

      const orderIntentId = makeRequestId()
      const requestId = `auto-close-${order.order_id}-${makeRequestId()}`
      const slippageBps = Math.round(slippagePercent * 100)
      const orderEventPayload = {
        user_id: userId,
        wallet_address: userWallet.toLowerCase(),
        order_intent_id: orderIntentId,
        request_id: requestId,
        condition_id: order.market_id,
        token_id: tokenId,
        side: closeSide.toLowerCase(),
        outcome: order.outcome,
        order_type: 'FAK',
        slippage_bps: slippageBps,
        limit_price: limitPrice,
        size: closeSize,
        min_order_size: null,
        tick_size: tickSize,
        best_bid: null,
        best_ask: null,
        input_mode: 'contracts',
        usd_input: null,
        contracts_input: closeSize,
        auto_correct_applied: false,
        status: 'attempted',
        polymarket_order_id: null,
        http_status: null,
        error_code: null,
        error_message: '[AUTO-CLOSE]', // Mark as auto-close in logs
        raw_error: { 
          is_auto_close: true,
          original_order_id: order.order_id,
          retry_count: retryCount + 1
        },
      }

      let orderEventId: string | null = null
      try {
        const { data: insertedEvent, error: eventError } = await supabase
          .from(ORDER_EVENTS_TABLE)
          .insert(orderEventPayload)
          .select('id')
          .single()
        if (eventError) {
          throw eventError
        }
        orderEventId = insertedEvent?.id ?? null
      } catch (eventError) {
        console.error('[AUTO-CLOSE] Failed to persist order event', eventError)
      }

      try {
        await requireEvomiProxyAgent('auto-close')
      } catch (error: any) {
        const message = error?.message || 'Evomi proxy unavailable'
        await updateOrderEventStatus(orderEventId, {
          status: 'rejected',
          http_status: 503,
          error_code: 'evomi_unavailable',
          error_message: `[AUTO-CLOSE] ${truncateMessage(message)}`,
          raw_error: { 
            is_auto_close: true,
            original_order_id: order.order_id,
            retry_count: retryCount + 1,
            message 
          },
        })
        await updateErrorWithRetryCount(message)
        console.warn('[AUTO-CLOSE] Evomi proxy required but unavailable:', message)
        const isFinalAttempt = (retryCount + 1) >= 10
        await sendFailureEmail(message, isFinalAttempt)
        return
      }

      try {
        const { client, signatureType } = await getAuthedClobClientForUserAnyWallet(userId, userWallet)
        const orderPayload = await client.createOrder(
          { tokenID: tokenId, price: limitPrice, size: closeSize, side: closeSide as any },
          { signatureType } as any
        )
        const orderType = 'FAK'
        const rawResult = await client.postOrder(orderPayload, orderType as any, false)
        const evaluation = interpretClobOrderResult(rawResult)

        if (!evaluation.success) {
          const upstreamStatus = evaluation.status ?? 502
          await updateOrderEventStatus(orderEventId, {
            status: 'rejected',
            http_status: upstreamStatus,
            error_code: evaluation.errorType ?? null,
            error_message: `[AUTO-CLOSE] ${truncateMessage(evaluation.message ?? 'Order rejected')}`,
            raw_error: { 
              is_auto_close: true,
              original_order_id: order.order_id,
              retry_count: retryCount + 1,
              ...(evaluation.raw || {})
            },
          })
          const errorMsg = evaluation.message || 'Auto-close order was rejected by the exchange.'
          await updateErrorWithRetryCount(errorMsg)
          console.warn(`⚠️ Auto-close failed for order ${order.order_id}:`, errorMsg)
          const isFinalAttempt = (retryCount + 1) >= 10
          await sendFailureEmail(errorMsg, isFinalAttempt)
          return
        }

        await updateOrderEventStatus(orderEventId, {
          status: 'submitted',
          http_status: 200,
          polymarket_order_id: evaluation.orderId ?? null,
          error_code: null,
          error_message: '[AUTO-CLOSE] Submitted',
          raw_error: { 
            is_auto_close: true,
            original_order_id: order.order_id,
            retry_count: retryCount + 1
          },
        })
        console.log(`[AUTO-CLOSE] ✅ Auto-close submitted for order ${order.order_id}: ${evaluation.orderId}`, {
          size: closeSize,
          price: limitPrice,
          roundingMethod: 'NO_ADJUSTMENT (exact size)',
          retryCount: retryCount + 1,
        })

        const autoCloseOrderId = evaluation.orderId
        
        // Wait 5 seconds for the order to fill before checking status
        console.log(`[AUTO-CLOSE] Waiting 5 seconds for order ${autoCloseOrderId} to fill...`)
        await new Promise(resolve => setTimeout(resolve, 5000))
        
        let filledSize = closeSize
        let executedPrice = limitPrice
        let orderLookupSucceeded = false
        try {
          const fetchedOrder = await fetchOrderWithClient(client as any, autoCloseOrderId)
          if (fetchedOrder) {
            orderLookupSucceeded = true
            if (Number.isFinite(fetchedOrder.filledSize)) {
              filledSize = fetchedOrder.filledSize
            }
            if (Number.isFinite(fetchedOrder.price ?? NaN)) {
              executedPrice = fetchedOrder.price as number
            }
          }
        } catch (error) {
          console.warn(`⚠️ Auto-close order lookup failed for ${autoCloseOrderId}:`, error)
        }

        const hasFill = Number.isFinite(filledSize) && filledSize > 0
        const fillStatus = hasFill 
          ? (filledSize >= closeSize ? 'filled' : 'partial')
          : 'no_fill'
        
        if (orderLookupSucceeded && !hasFill) {
          console.warn(`[AUTO-CLOSE] ⚠️ Auto-close order ${autoCloseOrderId} has no fills yet`)
          const errorMsg = 'Auto-close order submitted but did not fill'
          await supabase
            .from(ordersTable)
            .update({
              auto_close_order_id: autoCloseOrderId,
              auto_close_error: `RETRY_COUNT:${retryCount + 1}|${errorMsg}`,
              auto_close_attempted_at: attemptedAt,
            })
            .eq('order_id', order.order_id)
          console.warn(`[AUTO-CLOSE] Order ${order.order_id}: Retry ${retryCount + 1}/10 - ${errorMsg}`)
          const isFinalAttempt = (retryCount + 1) >= 10
          await sendFailureEmail('Auto-close order submitted but did not fill. Try closing manually at the current market price.', isFinalAttempt)
          return
        }

        // Update order event with fill status
        await updateOrderEventStatus(orderEventId, {
          error_message: `[AUTO-CLOSE] ${fillStatus === 'filled' ? 'Filled' : fillStatus === 'partial' ? 'Partially filled' : 'No fill'}`,
          raw_error: { 
            is_auto_close: true,
            original_order_id: order.order_id,
            retry_count: retryCount + 1,
            fill_status: fillStatus,
            filled_size: hasFill ? filledSize : 0,
            requested_size: closeSize
          },
        })

        const autoCloseUpdate: Record<string, unknown> = {
          auto_close_order_id: autoCloseOrderId,
          auto_close_error: null, // Clear error and retry count on success
          auto_close_attempted_at: attemptedAt,
          trader_position_size: currentTraderPositionSize,
        }
        if (currentTraderPositionSize <= 0) {
          autoCloseUpdate.auto_close_triggered_at = attemptedAt
        }
        await supabase.from(ordersTable).update(autoCloseUpdate).eq('order_id', order.order_id)
        
        console.log(`[AUTO-CLOSE] ✅ Auto-close ${fillStatus === 'filled' ? 'FILLED' : fillStatus === 'partial' ? 'PARTIALLY FILLED' : 'completed'} for order ${order.order_id}`, {
          autoCloseOrderId,
          filledSize,
          requestedSize: closeSize,
          fillStatus,
          retryCount: retryCount + 1,
        })

        const context = await loadNotificationContext()
        if (!context || !resend) return

        const estimatedProceeds =
          Number.isFinite(filledSize) && Number.isFinite(executedPrice)
            ? (filledSize as number) * (executedPrice as number)
            : null

        try {
          await resend.emails.send({
            from: 'Polycopy <notifications@polycopy.app>',
            to: context.email,
            subject: `Auto-close ${closeSide.toLowerCase()} executed: ${marketTitle}`,
            react: AutoCloseExecutedEmail({
              userName: context.name,
              marketTitle,
              outcome: order.outcome,
              side: closeSide,
              filledSize,
              limitPrice: executedPrice,
              estimatedProceeds,
              orderId: autoCloseOrderId,
              tradeUrl: quickTradesUrl,
              polymarketUrl: `https://polymarket.com/event/${order.market_id}`,
              unsubscribeUrl: quickTradesUrl,
            })
          })
        } catch (emailError: any) {
          console.error(`❌ Failed to send auto-close email for order ${autoCloseOrderId}:`, {
            error: emailError?.message || emailError,
            to: context.email,
          })
        }
      } catch (error: any) {
        const message = error?.message || 'Auto-close failed'
        await updateOrderEventStatus(orderEventId, {
          status: 'rejected',
          http_status: 500,
          error_code: error?.code ?? error?.name ?? null,
          error_message: `[AUTO-CLOSE] ${truncateMessage(message)}`,
          raw_error: { 
            is_auto_close: true,
            original_order_id: order.order_id,
            retry_count: retryCount + 1,
            error: error ?? null
          },
        })
        await updateErrorWithRetryCount(message)
        console.warn(`⚠️ Auto-close error for order ${order.order_id}:`, message)
        const isFinalAttempt = (retryCount + 1) >= 10
        await sendFailureEmail(message, isFinalAttempt)
      }
    }

    const normalizedTrades = (trades || []).map((trade) => ({
      ...trade,
      id: trade.copied_trade_id ?? trade.order_id,
      user_id: trade.copy_user_id,
      trader_wallet: trade.copied_trader_wallet,
      trader_username: trade.copied_trader_username,
      market_title: trade.copied_market_title || '',
      copied_at: trade.created_at,
      entry_price: trade.entry_price ?? trade.price_when_copied ?? null,
      invested_usd: trade.invested_usd ?? null,
    }))

    const getTradeIdentifier = (trade: typeof normalizedTrades[number]) => {
      const column = trade.copied_trade_id ? 'copied_trade_id' : 'order_id'
      const value = trade.copied_trade_id || trade.order_id || null
      if (!value) return null
      return { column, value }
    }

    if (normalizedTrades.length === 0) {
      console.log('ℹ️ No copied trades to check for notifications')
    } else {
      // Process trades in parallel with batching (10 at a time to avoid overwhelming APIs)
      const BATCH_SIZE = 10
      const processedResults: Array<{ checked: boolean; sent: boolean }> = []
      
      for (let i = 0; i < normalizedTrades.length; i += BATCH_SIZE) {
        const batch = normalizedTrades.slice(i, i + BATCH_SIZE)
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(normalizedTrades.length / BATCH_SIZE)} (${batch.length} trades)`)
        
        const batchResults = await Promise.allSettled(
          batch.map(async (trade) => {
            try {
              // Check if user has notifications enabled
              const { data: prefs } = await supabase
                .from('notification_preferences')
                .select('email_notifications_enabled')
                .eq('user_id', trade.user_id)
                .single()
              
              // Default to enabled if no preferences set
              const notificationsEnabled = prefs?.email_notifications_enabled ?? true
              
              if (!notificationsEnabled) {
                console.log(`⏭️ Skipping trade ${trade.id} - notifications disabled`)
                return { checked: true, sent: false }
              }
              
              // Get user email
              const { data: profile } = await supabase
                .from('profiles')
                .select('email')
                .eq('id', trade.user_id)
                .single()
              
              if (!profile?.email) {
                console.log(`⏭️ Skipping trade ${trade.id} - no email found`)
                return { checked: true, sent: false }
              }
              
              // Get current status from status API
              const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://polycopy.app'
              const statusResponse = await fetch(
                `${appUrl}/api/copied-trades/${trade.id}/status?userId=${trade.user_id}`,
                {
                  headers: {
                    'Authorization': `Bearer ${process.env.CRON_SECRET}`
                  }
                }
              )
              
              if (!statusResponse.ok) {
                const errorText = await statusResponse.text()
                console.error(`❌ Failed to get status for trade ${trade.id}:`, {
                  status: statusResponse.status,
                  statusText: statusResponse.statusText,
                  error: errorText,
                  url: `${appUrl}/api/copied-trades/${trade.id}/status?userId=${trade.user_id}`
                })
                return { checked: false, sent: false }
              }
              
              const statusData = await statusResponse.json()

              const tradeIdentifier = getTradeIdentifier(trade)
              if (!tradeIdentifier) {
                console.warn(`⚠️ Skipping trade ${trade.id} - missing identifier`)
                return { checked: true, sent: false }
              }
              
              console.log(`✅ Status check for trade ${trade.id}:`, {
                traderHasPosition: statusData.traderStillHasPosition,
                marketResolved: statusData.marketResolved,
                resolvedOutcome: statusData.resolvedOutcome,
                currentPrice: statusData.currentPrice,
                roi: statusData.roi
              })
              
              // Store previous state
              const oldTraderHasPosition = trade.trader_still_has_position
              const oldMarketResolved = trade.market_resolved
              
              // Get new state from status
              const newTraderHasPosition = statusData.traderStillHasPosition
              const newMarketResolved = statusData.marketResolved
              
              let emailSent = false
              
              // PRIORITY 1: Check for "Market Resolved" event (more urgent - affects everyone)
              if (
                !oldMarketResolved && 
                newMarketResolved &&
                !trade.notification_resolved_sent
              ) {
                console.log(`📧 Sending "Market Resolved" email for trade ${trade.id}`)
                
                // Determine if user won based on resolved outcome
                const resolvedOutcome = statusData.resolvedOutcome
                let didUserWin = false
                
                if (resolvedOutcome) {
                  // Case-insensitive comparison
                  didUserWin = resolvedOutcome.toUpperCase() === trade.outcome.toUpperCase()
                } else {
                  // Fallback: use ROI if no resolved outcome available
                  didUserWin = (statusData.roi || 0) > 0
                }
                
                const traderROI = calculateTraderROI(
                  statusData.traderAvgPrice,
                  statusData.currentPrice
                )
                
                // Only send email if we have a resolved outcome
                if (!resolvedOutcome) {
                  console.log(`⚠️ Skipping email for trade ${trade.id} - no resolved outcome yet`)
                  // Update market_resolved but don't mark notification as sent
                  await supabase
                    .from(ordersTable)
                    .update({ market_resolved: true })
                    .eq(tradeIdentifier.column, tradeIdentifier.value)
                    .eq('copy_user_id', trade.user_id)
                  return { checked: true, sent: false }
                }
                
                try {
                  if (!resend) {
                    console.error('Resend not configured, skipping email notification')
                    return { checked: true, sent: false }
                  }
                  
                  await resend.emails.send({
                    from: 'Polycopy <notifications@polycopy.app>',
                    to: profile.email,
                    subject: `Market Resolved: "${trade.market_title}"`,
                    react: MarketResolvedEmail({
                      userName: profile.email.split('@')[0],
                      marketTitle: trade.market_title,
                      resolvedOutcome: resolvedOutcome,
                      userPosition: trade.outcome,
                      userEntryPrice: trade.entry_price ?? trade.price_when_copied,
                      userROI: statusData.roi || 0,
                      betAmount: trade.invested_usd ?? 0,
                      didUserWin,
                      tradeUrl: `${appUrl}/profile`,
                      unsubscribeUrl: `${appUrl}/profile`
                    })
                  })
                  
                  // Mark notification as sent and market as resolved
                  await supabase
                    .from(ordersTable)
                    .update({ 
                      notification_resolved_sent: true,
                      market_resolved: true
                    })
                    .eq(tradeIdentifier.column, tradeIdentifier.value)
                    .eq('copy_user_id', trade.user_id)
                  
                  emailSent = true
                  console.log(`✅ Sent "Market Resolved" email for trade ${trade.id} to ${profile.email}`, {
                    outcome: resolvedOutcome,
                    userWon: didUserWin,
                    userROI: statusData.roi
                  })
                } catch (emailError: any) {
                  console.error(`❌ Failed to send "Market Resolved" email for trade ${trade.id}:`, {
                    error: emailError.message || emailError,
                    to: profile.email,
                    trade: trade.market_title,
                    resolvedOutcome
                  })
                }
              }

              // PRIORITY 2: Check for "Trader Closed Position" event
              // Only send if market is NOT resolved yet (if market resolved, user already got that notification)
              if (
                oldTraderHasPosition === true && 
                newTraderHasPosition === false &&
                !trade.notification_closed_sent
              ) {
                // Skip if market is/was already resolved - user already got resolution notification
                // Check BOTH the existing DB state AND the refreshed status
                const marketAlreadyResolved = trade.market_resolved || newMarketResolved;
                
                if (marketAlreadyResolved) {
                  console.log(`⏭️ Skipping "Trader Closed" email for trade ${trade.id} - market already resolved (DB: ${trade.market_resolved}, API: ${newMarketResolved})`)
                  // Still mark as "sent" so we don't check again
                  await supabase
                    .from(ordersTable)
                    .update({ 
                      notification_closed_sent: true,
                      trader_still_has_position: false
                    })
                    .eq(tradeIdentifier.column, tradeIdentifier.value)
                    .eq('copy_user_id', trade.user_id)
                } else {
                  console.log(`📧 Sending "Trader Closed" email for trade ${trade.id}`)

                const traderROI = calculateTraderROI(
                  statusData.traderAvgPrice,
                  statusData.currentPrice
                )
                
                try {
                  if (!resend) {
                    console.error('Resend not configured, skipping email notification')
                    return { checked: true, sent: false }
                  }
                  
                  await resend.emails.send({
                    from: 'Polycopy <notifications@polycopy.app>',
                    to: profile.email,
                    subject: `${trade.trader_username} closed their position`,
                    react: TraderClosedPositionEmail({
                      userName: profile.email.split('@')[0],
                      traderUsername: trade.trader_username,
                      marketTitle: trade.market_title,
                      outcome: trade.outcome,
                      userEntryPrice: trade.entry_price ?? trade.price_when_copied,
                      traderExitPrice: statusData.currentPrice || 0,
                      userROI: statusData.roi || 0,
                      traderROI,
                      tradeUrl: `${appUrl}/profile`,
                      polymarketUrl: `https://polymarket.com/event/${trade.market_id}`,
                      unsubscribeUrl: `${appUrl}/profile`
                    })
                  })
                  
                  // Mark notification as sent
                  await supabase
                    .from(ordersTable)
                    .update({ 
                      notification_closed_sent: true,
                      trader_still_has_position: false
                    })
                    .eq(tradeIdentifier.column, tradeIdentifier.value)
                    .eq('copy_user_id', trade.user_id)
                  
                  emailSent = true
                  console.log(`✅ Sent "Trader Closed" email for trade ${trade.id} to ${profile.email}`)
                } catch (emailError: any) {
                  console.error(`❌ Failed to send "Trader Closed" email for trade ${trade.id}:`, {
                    error: emailError.message || emailError,
                    to: profile.email,
                    trade: trade.market_title
                  })
                }
                }
              }
              
              // Update last_checked_at timestamp
              await supabase
                .from(ordersTable)
                .update({ last_checked_at: new Date().toISOString() })
                .eq(tradeIdentifier.column, tradeIdentifier.value)
                .eq('copy_user_id', trade.user_id)
              
              return { checked: true, sent: emailSent }
            } catch (err) {
              console.error(`Error processing trade ${trade.id}:`, err)
              return { checked: false, sent: false }
            }
          })
        )
        
        // Count results from this batch
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            if (result.value.checked) tradesChecked++
            if (result.value.sent) notificationsSent++
          }
        }
      }
    }

    console.log(`✅ Finished processing ${tradesChecked} trades. Now starting auto-close check...`)
    console.log(`[AUTO-CLOSE] ========== STARTING AUTO-CLOSE CHECK ==========`)
    console.log(`[AUTO-CLOSE] Orders table: ${ordersTable}`)
    
    try {
      const { data: openOrders, error: queryError } = await supabase
      .from(ordersTable)
      .select(
        'order_id, trader_id, copied_trader_wallet, market_id, outcome, side, status, remaining_size, trader_position_size, auto_close_on_trader_close, auto_close_slippage_percent, auto_close_triggered_at, auto_close_attempted_at, created_at'
      )
      .is('auto_close_triggered_at', null)
      .neq('auto_close_on_trader_close', false)
      .not('copied_trader_wallet', 'is', null)
      .in('status', ['open', 'partial', 'pending', 'submitted', 'processing', 'matched', 'filled'])
      .gt('remaining_size', 0)
      .order('created_at', { ascending: false })
      .limit(500)
    
    if (queryError) {
      console.error(`[AUTO-CLOSE] Query error:`, queryError)
      console.error(`[AUTO-CLOSE] Query error details:`, JSON.stringify(queryError, null, 2))
      throw new Error(`Auto-close query failed: ${queryError.message}`)
    }
    
    console.log(`[AUTO-CLOSE] Found ${openOrders?.length || 0} orders eligible for auto-close check`)
    
    // Log order IDs being checked for debugging
    if (openOrders && openOrders.length > 0) {
      const orderIds = openOrders.map(o => o.order_id).slice(0, 10)
      console.log(`[AUTO-CLOSE] Sample order IDs being checked: ${orderIds.join(', ')}${openOrders.length > 10 ? '...' : ''}`)
    }

    console.log(`[AUTO-CLOSE] Processing ${openOrders?.length || 0} orders for auto-close...`)
    
    if (!openOrders || openOrders.length === 0) {
      console.log(`[AUTO-CLOSE] No orders to process`)
    } else {
      console.log(`[AUTO-CLOSE] Starting loop, will process ${openOrders.length} orders`)
      
      for (const order of openOrders) {
        console.log(`[AUTO-CLOSE] Processing order ${order.order_id}...`)
        try {
          await attemptAutoCloseFromOrder(order)
        } catch (orderError: any) {
          console.error(`[AUTO-CLOSE] Error processing order ${order.order_id}:`, orderError)
          console.error(`[AUTO-CLOSE] Error stack:`, orderError?.stack)
        }
      }
    }
    
    console.log(`[AUTO-CLOSE] Finished processing all orders`)
    } catch (autoCloseError: any) {
      console.error(`[AUTO-CLOSE] ERROR in auto-close section:`, autoCloseError)
      console.error(`[AUTO-CLOSE] Error stack:`, autoCloseError?.stack)
      // Don't throw - continue with the rest of the function
    }
    
    console.log(`✅ Notification check complete. Checked ${tradesChecked}, sent ${notificationsSent} emails.`)
    
    return NextResponse.json({
      success: true,
      tradesChecked,
      notificationsSent
    })
    
  } catch (error: any) {
    console.error('Error in cron job:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
