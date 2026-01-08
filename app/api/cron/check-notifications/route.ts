import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import TraderClosedPositionEmail from '@/emails/TraderClosedPosition'
import MarketResolvedEmail from '@/emails/MarketResolved'
import AutoCloseExecutedEmail from '@/emails/AutoCloseExecuted'
import { getAuthedClobClientForUserAnyWallet } from '@/lib/polymarket/authed-client'
import { resolveOrdersTableName } from '@/lib/orders/table'
import { ensureEvomiProxyAgent } from '@/lib/evomi/proxy'
import { interpretClobOrderResult } from '@/lib/polymarket/order-response'
import { fetchOrderWithClient } from '@/lib/polymarket/clobClient'

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
 * Vercel Cron job that runs every 5 minutes to check for notification triggers
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

    // Fetch active trades that need checking
    // Only get trades where:
    // - Market is not resolved yet OR resolved notification not sent
    // - Haven't sent all notifications
    const { data: trades, error } = await supabase
      .from('copied_trades')
      .select('*')
      .or('market_resolved.eq.false,notification_resolved_sent.is.null,notification_resolved_sent.eq.false')
      .or('notification_closed_sent.is.null,notification_closed_sent.eq.false')
      .limit(100)
    
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
      const copiedTraderWallet = order.copied_trader_wallet?.toLowerCase()
      if (!copiedTraderWallet || !order.market_id || !order.outcome || !order.trader_id) {
        return
      }

      if (order.auto_close_on_trader_close === false) return
      if (order.auto_close_triggered_at) return
      if (order.auto_close_attempted_at) {
        const lastAttempt = new Date(order.auto_close_attempted_at)
        if (Date.now() - lastAttempt.getTime() < 5 * 60 * 1000) {
          return
        }
      }

      const traderPositionSize = await fetchWalletPositionSize(
        copiedTraderWallet,
        order.market_id,
        order.outcome
      )
      if (traderPositionSize && traderPositionSize > 0) {
        return
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

      const positionSize = await fetchWalletPositionSize(userWallet, order.market_id, order.outcome)
      if (!positionSize || positionSize <= 0) {
        console.warn(`⚠️ Auto-close skipped: no open position for user ${userId}`)
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

      try {
        await ensureEvomiProxyAgent()
      } catch (error) {
        console.warn('[AUTO-CLOSE] Evomi proxy config failed:', error)
      }

      const attemptedAt = new Date().toISOString()
      await supabase
        .from(ordersTable)
        .update({ auto_close_attempted_at: attemptedAt, auto_close_error: null })
        .eq('order_id', order.order_id)

      try {
        const { client, signatureType } = await getAuthedClobClientForUserAnyWallet(userId, userWallet)
        const orderPayload = await client.createOrder(
          { tokenID: tokenId, price: limitPrice, size: positionSize, side: closeSide as any },
          { signatureType } as any
        )
        const orderType = 'FAK'
        const rawResult = await client.postOrder(orderPayload, orderType as any, false)
        const evaluation = interpretClobOrderResult(rawResult)

        if (!evaluation.success) {
          await supabase
            .from(ordersTable)
            .update({
              auto_close_error: evaluation.message,
              auto_close_attempted_at: attemptedAt,
            })
            .eq('order_id', order.order_id)
          console.warn(`⚠️ Auto-close failed for order ${order.order_id}:`, evaluation.message)
          return
        }

        await supabase
          .from(ordersTable)
          .update({
            auto_close_triggered_at: attemptedAt,
            auto_close_order_id: evaluation.orderId,
            auto_close_error: null,
            auto_close_attempted_at: attemptedAt,
          })
          .eq('order_id', order.order_id)
        console.log(`✅ Auto-close submitted for order ${order.order_id}: ${evaluation.orderId}`)

        const autoCloseOrderId = evaluation.orderId
        let filledSize = positionSize
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
        if (orderLookupSucceeded && !hasFill) {
          console.warn(`⚠️ Auto-close order ${autoCloseOrderId} has no fills yet`)
          return
        }

        if (!resend) {
          console.error('Resend not configured, skipping auto-close email notification')
          return
        }

        const profile = await resolveProfile(userId)
        if (!profile?.email) {
          console.warn(`⚠️ Auto-close email skipped: missing email for user ${userId}`)
          return
        }

        const { data: prefs } = await supabase
          .from('notification_preferences')
          .select('email_notifications_enabled')
          .eq('user_id', userId)
          .single()
        const notificationsEnabled = prefs?.email_notifications_enabled ?? true
        if (!notificationsEnabled) {
          return
        }

        const estimatedProceeds =
          Number.isFinite(filledSize) && Number.isFinite(executedPrice)
            ? (filledSize as number) * (executedPrice as number)
            : null
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://polycopy.app'
        const marketTitle = question || order.market_id

        try {
          await resend.emails.send({
            from: 'Polycopy <notifications@polycopy.app>',
            to: profile.email,
            subject: `Auto-close ${closeSide.toLowerCase()} executed: ${marketTitle}`,
            react: AutoCloseExecutedEmail({
              userName: profile.name,
              marketTitle,
              outcome: order.outcome,
              side: closeSide,
              filledSize,
              limitPrice: executedPrice,
              estimatedProceeds,
              orderId: autoCloseOrderId,
              tradeUrl: `${appUrl}/profile`,
              polymarketUrl: `https://polymarket.com/event/${order.market_id}`,
              unsubscribeUrl: `${appUrl}/profile`
            })
          })
        } catch (emailError: any) {
          console.error(`❌ Failed to send auto-close email for order ${autoCloseOrderId}:`, {
            error: emailError?.message || emailError,
            to: profile.email,
          })
        }
      } catch (error: any) {
        const message = error?.message || 'Auto-close failed'
        await supabase
          .from(ordersTable)
          .update({
            auto_close_error: message,
            auto_close_attempted_at: attemptedAt,
          })
          .eq('order_id', order.order_id)
        console.warn(`⚠️ Auto-close error for order ${order.order_id}:`, message)
      }
    }

    if (!trades || trades.length === 0) {
      console.log('ℹ️ No copied trades to check for notifications')
    } else {
      for (const trade of trades) {
        try {
          tradesChecked++
        
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
          continue
        }
        
        // Get user email
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', trade.user_id)
          .single()
        
        if (!profile?.email) {
          console.log(`⏭️ Skipping trade ${trade.id} - no email found`)
          continue
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
          continue
        }
        
        const statusData = await statusResponse.json()
        
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
        
        // Check for "Trader Closed Position" event
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
              .from('copied_trades')
              .update({ 
                notification_closed_sent: true,
                trader_still_has_position: false
              })
              .eq('id', trade.id)
          } else {
            console.log(`📧 Sending "Trader Closed" email for trade ${trade.id}`)

          const traderROI = calculateTraderROI(
            statusData.traderAvgPrice,
            statusData.currentPrice
          )
          
          try {
            if (!resend) {
              console.error('Resend not configured, skipping email notification')
              continue
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
                userEntryPrice: trade.price_when_copied,
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
              .from('copied_trades')
              .update({ 
                notification_closed_sent: true,
                trader_still_has_position: false
              })
              .eq('id', trade.id)
            
            notificationsSent++
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

        // Check for "Market Resolved" event
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
              .from('copied_trades')
              .update({ market_resolved: true })
              .eq('id', trade.id)
            continue
          }
          
          try {
            if (!resend) {
              console.error('Resend not configured, skipping email notification')
              continue
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
                userEntryPrice: trade.price_when_copied,
                userROI: statusData.roi || 0,
                betAmount: trade.amount_invested,
                didUserWin,
                tradeUrl: `${appUrl}/profile`,
                unsubscribeUrl: `${appUrl}/profile`
              })
            })
            
            // Mark notification as sent and market as resolved
            await supabase
              .from('copied_trades')
              .update({ 
                notification_resolved_sent: true,
                market_resolved: true
              })
              .eq('id', trade.id)
            
            notificationsSent++
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
        
        // Update last_checked_at timestamp
        await supabase
          .from('copied_trades')
          .update({ last_checked_at: new Date().toISOString() })
          .eq('id', trade.id)
        
      } catch (err) {
        console.error(`Error processing trade ${trade.id}:`, err)
        }
      }
    }

    const { data: openOrders } = await supabase
      .from(ordersTable)
      .select(
        'order_id, trader_id, copied_trader_wallet, market_id, outcome, side, status, remaining_size, auto_close_on_trader_close, auto_close_slippage_percent, auto_close_triggered_at, auto_close_attempted_at, created_at'
      )
      .is('auto_close_triggered_at', null)
      .neq('auto_close_on_trader_close', false)
      .not('copied_trader_wallet', 'is', null)
      .in('status', ['open', 'partial', 'pending', 'submitted', 'processing'])
      .gt('remaining_size', 0)
      .order('created_at', { ascending: false })
      .limit(100)

    for (const order of openOrders || []) {
      await attemptAutoCloseFromOrder(order)
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
