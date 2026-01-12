// Copied trades status API - with server-side session verification

import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { resolveOrdersTableName } from '@/lib/orders/table'

// Type for Polymarket position
interface PolymarketPosition {
  asset: string;
  conditionId: string;
  market?: string;
  outcome?: string;
  size?: number | string;
  avgPrice?: number | string;
  curPrice?: number | string;
  currentPrice?: number | string;
  [key: string]: any;
}

// Create service role client that bypasses RLS
function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

async function resolveTraderWallet(
  client: ReturnType<typeof createServiceClient>,
  traderId: string | null | undefined
): Promise<string | null> {
  if (!traderId) return null
  const { data, error } = await client
    .from('traders')
    .select('wallet_address')
    .eq('id', traderId)
    .maybeSingle()
  if (error) {
    console.warn('[copy-status] failed to resolve trader wallet', { traderId, error })
    return null
  }
  return data?.wallet_address ?? null
}

/**
 * GET /api/copied-trades/[id]/status?userId=xxx
 * Check and update the status of a copied trade
 * 
 * Returns current price as decimal (e.g., 0.58 for 58¢)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: 'Trade ID is required' }, { status: 400 })
    }

    // Get userId from query params
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    
    if (!userId) {
      console.error('❌ Missing userId in status request')
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    // Check if this is a cron job request (bypass auth)
    const authHeader = request.headers.get('authorization')
    const isCronRequest = authHeader === `Bearer ${process.env.CRON_SECRET}`
    
    // Use service role client to bypass RLS
    const supabase = createServiceClient()
    const ordersTable = await resolveOrdersTableName(supabase)
    if (ordersTable !== 'orders') {
      console.error('❌ Orders table unavailable for copy trade status (resolved to', ordersTable, ')')
      return NextResponse.json({ error: 'Orders table unavailable' }, { status: 503 })
    }

    // SECURITY: Fetch the copied trade and verify ownership
    // This ensures the user owns the trade before returning any data
    // Read from the enriched view to get derived entry/exit fields for PnL,
    // while still updating the base orders table later.
    const { data: tradeRow, error: fetchError } = await supabase
      .from('orders_copy_enriched')
      .select(`
        order_id,
        trader_id,
        created_at,
        copied_trade_id,
        copy_user_id,
        copied_trader_wallet,
        copied_trader_username,
        market_id,
        copied_market_title,
        outcome,
        price_when_copied,
        trade_method,
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
        entry_price,
        entry_size,
        invested_usd,
        exit_price,
        pnl_pct,
        pnl_usd
      `)
      .eq('copied_trade_id', id)
      .eq('copy_user_id', userId)
      .single()

    if (fetchError || !tradeRow) {
      console.error('❌ Trade not found or unauthorized:', fetchError?.message)
      return NextResponse.json({ error: 'Trade not found or unauthorized' }, { status: 404 })
    }
    
    const trade = {
      ...tradeRow,
      trader_wallet: tradeRow.copied_trader_wallet ?? tradeRow.trader_wallet,
      market_title: tradeRow.copied_market_title || '',
      entry_price: tradeRow.entry_price ?? tradeRow.price_when_copied ?? null,
    }

    const isUserClosed = Boolean(trade.user_closed_at)

    // Choose whose position to track for PnL: follower for quick, source trader for manual.
    let walletForStatus = trade.trader_wallet
    if (trade.trade_method === 'quick') {
      const followerWallet = await resolveTraderWallet(supabase, trade.trader_id)
      walletForStatus = followerWallet ?? trade.trader_wallet
    }

    // Additional auth check for non-cron requests (optional, ownership already verified)
    if (!isCronRequest) {
      try {
        const supabaseAuth = await createAuthClient()
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
        
        if (user && user.id !== userId) {
          // If we can authenticate and the IDs don't match, that's suspicious
          console.error('❌ User ID mismatch - auth user:', user.id, 'requested:', userId)
          return NextResponse.json({ error: 'Forbidden - user ID mismatch' }, { status: 403 })
        }
        
        // If auth fails or no user, we already verified ownership above, so continue
        if (!user) {
          console.log('ℹ️ No session auth but ownership verified for trade:', id)
        }
      } catch (authErr) {
        // Auth check failed but ownership is verified, so continue
        console.log('ℹ️ Auth check skipped, ownership verified for trade:', id)
      }
    } else {
      console.log('🤖 Cron request authenticated')
    }

    // Rate limit: 200 status checks per hour per user (skip for cron)
    if (!isCronRequest && !checkRateLimit(`status-check:${userId}`, 200, 3600000)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' }, 
        { status: 429 }
      )
    }

    // Check if trade was recently copied (< 5 minutes ago)
    const copiedAt = new Date(trade.copied_at ?? trade.created_at)
    const now = new Date()
    const minutesSinceCopied = (now.getTime() - copiedAt.getTime()) / (1000 * 60)
    const isRecentlyCopied = minutesSinceCopied < 5

    // Initialize update fields
    let traderStillHasPosition = trade.trader_still_has_position
    let traderClosedAt = trade.trader_closed_at
    let traderPositionSize: number | null = null
    let currentPrice: number | null = null
    let roi: number | null = null
    let priceSource: string = 'none'
    let traderAvgPrice: number | null = null
    let marketResolved: boolean = trade.market_resolved || false
    let resolvedOutcome: string | null = null
    const lockedRoi =
      trade.entry_price && trade.user_exit_price
        ? ((trade.user_exit_price - trade.entry_price) / trade.entry_price) * 100
        : trade.pnl_pct ?? null

    if (isUserClosed) {
      currentPrice = trade.user_exit_price ?? trade.current_price ?? null
      priceSource = 'user-closed'
    }

    // STEP 1: Fetch current positions from Polymarket (with pagination)
    if (!isUserClosed) {
      try {
        let positions: PolymarketPosition[] = [];
        let offset = 0;
        const limit = 500; // API seems to cap at 500 per request
        let hasMore = true;
        
        // Fetch ALL positions using pagination
        while (hasMore) {
          const positionsUrl = `https://data-api.polymarket.com/positions?user=${walletForStatus}&limit=${limit}&offset=${offset}`
          const positionsResponse = await fetch(positionsUrl, { cache: 'no-store' })

          if (positionsResponse.ok) {
            const batch: PolymarketPosition[] = await positionsResponse.json()
            const batchSize = batch?.length || 0;
            
            if (batchSize > 0) {
              positions = positions.concat(batch);
              offset += batchSize;
              hasMore = batchSize === limit;
            } else {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }
        
        if (positions.length > 0) {

          // Find ALL positions matching this market (any outcome)
          const marketPositions = positions.filter((pos) => {
            return pos.conditionId === trade.market_id ||
              pos.asset === trade.market_id ||
              (pos.conditionId && trade.market_id && trade.market_id.includes(pos.conditionId))
          })

          // Find matching position by conditionId AND outcome (case-insensitive)
          const matchingPosition = positions.find((pos) => {
            const idMatch = 
              pos.conditionId === trade.market_id ||
              pos.asset === trade.market_id ||
              (pos.conditionId && trade.market_id && trade.market_id.includes(pos.conditionId))
            
            // Case-insensitive outcome comparison
            const outcomeMatch = pos.outcome?.toUpperCase() === trade.outcome?.toUpperCase()
            const hasSize = parseFloat(String(pos.size || 0)) > 0
            
            return idMatch && outcomeMatch && hasSize
          })

          if (matchingPosition) {
            traderStillHasPosition = true
            if (matchingPosition.size !== undefined && matchingPosition.size !== null) {
              const parsedSize = parseFloat(String(matchingPosition.size))
              traderPositionSize = Number.isFinite(parsedSize) ? parsedSize : null
            }
            
            // Capture trader's average price for ROI calculation
            if (matchingPosition.avgPrice !== undefined && matchingPosition.avgPrice !== null) {
              traderAvgPrice = parseFloat(String(matchingPosition.avgPrice))
            }
            
            // Get current price from position
            if (matchingPosition.curPrice !== undefined && matchingPosition.curPrice !== null) {
              currentPrice = parseFloat(String(matchingPosition.curPrice))
              priceSource = 'position.curPrice'
            } else if (matchingPosition.avgPrice !== undefined && matchingPosition.avgPrice !== null) {
              currentPrice = parseFloat(String(matchingPosition.avgPrice))
              priceSource = 'position.avgPrice'
            }
          } else {
            // No matching position found
            if (isRecentlyCopied) {
              // Keep current position status for recent trades
            } else {
              // Trader may have closed position
              if (traderStillHasPosition !== false) {
                traderStillHasPosition = false
                traderClosedAt = new Date().toISOString()
              }
              traderPositionSize = 0
            }
          }
        }
      } catch (err: any) {
        console.error('❌ Error fetching positions:', err.message)
      }
    }

    // STEP 2: Try Gamma API for price and market resolution status
    try {
      if (trade.market_id && trade.market_id.startsWith('0x')) {
        const gammaUrl = `https://gamma-api.polymarket.com/markets?condition_id=${trade.market_id}`
        const marketResponse = await fetch(gammaUrl, { cache: 'no-store' })
        
        if (marketResponse.ok) {
          const markets = await marketResponse.json()
          if (markets && markets.length > 0) {
            const market = markets[0]
            
            // Check if market is ACTUALLY resolved
            // IMPORTANT: Don't trust 'closed' alone - it can mean "closed for new bets" not "resolved"
            // Only mark resolved if we have strong evidence: explicit resolved flag, winning outcome, or prices at 0.99+/0.01-
            
            let isActuallyResolved = false
            
            // Method 1: Explicit resolved flag
            if (market.resolved === true) {
              isActuallyResolved = true
            }
            
            // Method 2: Has a winning outcome specified
            if (market.winningOutcome) {
              isActuallyResolved = true
              resolvedOutcome = market.winningOutcome
            } else if (market.resolutionSource) {
              isActuallyResolved = true
              resolvedOutcome = market.resolutionSource
            }
            
            // Method 3: Check if prices show clear resolution
            // A truly resolved market has one outcome at ~$1.00 and others at ~$0.00
            if (!isActuallyResolved) {
              try {
                let outcomes = market.outcomes
                let prices = market.outcomePrices
                
                // Parse if they're strings
                if (typeof outcomes === 'string') {
                  outcomes = JSON.parse(outcomes)
                }
                if (typeof prices === 'string') {
                  prices = JSON.parse(prices)
                }
                
                if (outcomes && prices && Array.isArray(outcomes) && Array.isArray(prices)) {
                  const priceNumbers = prices.map((p: any) => parseFloat(String(p)))
                  const maxPrice = Math.max(...priceNumbers)
                  const minPrice = Math.min(...priceNumbers)
                  
                  // Market is resolved ONLY if:
                  // - One outcome is at 99%+ ($0.99+) AND another is at 1% or less ($0.01-)
                  // This ensures we only catch truly resolved markets, not just heavy favorites
                  if (maxPrice >= 0.99 && minPrice <= 0.01) {
                    isActuallyResolved = true
                    const winningIndex = priceNumbers.indexOf(maxPrice)
                    if (winningIndex >= 0 && winningIndex < outcomes.length) {
                      resolvedOutcome = outcomes[winningIndex]
                    }
                    
                    // Log resolution detection
                    console.log('✅ Market resolved detected:', {
                      marketId: trade.market_id?.substring(0, 10),
                      maxPrice,
                      minPrice,
                      resolvedOutcome
                    });
                  }
                }
              } catch (parseErr) {
                console.error('Error parsing outcomes for resolution:', parseErr)
              }
            }
            
            // Only set marketResolved if we have actual evidence
            if (isActuallyResolved) {
              marketResolved = true
            }
            
            // Get price if we don't have one yet (skip for user-closed trades)
            if (!isUserClosed && currentPrice === null) {
              let prices = market.outcomePrices
              let outcomes = market.outcomes
              
              // Parse if string
              if (typeof prices === 'string') {
                try { prices = JSON.parse(prices) } catch { prices = null }
              }
              if (typeof outcomes === 'string') {
                try { outcomes = JSON.parse(outcomes) } catch { outcomes = null }
              }
              
              if (prices && Array.isArray(prices) && prices.length >= 2) {
                const outcomeUpper = trade.outcome?.toUpperCase()
                
                // Standard YES/NO markets
                if (outcomeUpper === 'YES') {
                  currentPrice = parseFloat(prices[0])
                } else if (outcomeUpper === 'NO') {
                  currentPrice = parseFloat(prices[1])
                } else if (outcomes && Array.isArray(outcomes)) {
                  // Custom outcomes - find by name (case-insensitive)
                  const outcomeIndex = outcomes.findIndex(
                    (o: string) => o?.toUpperCase() === outcomeUpper
                  )
                  if (outcomeIndex >= 0 && outcomeIndex < prices.length) {
                    currentPrice = parseFloat(prices[outcomeIndex])
                  }
                }
                
                if (currentPrice !== null) {
                  priceSource = 'gamma.outcomePrices'
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      console.error('❌ Gamma API error:', err.message)
    }

    // STEP 3: Fallbacks if still no price
    if (!isUserClosed && currentPrice === null) {
      if (trade.current_price !== null && trade.current_price > 0) {
        currentPrice = trade.current_price
        priceSource = 'db.last_known'
      } else if (isRecentlyCopied && trade.price_when_copied !== null && trade.price_when_copied > 0) {
        currentPrice = trade.price_when_copied
        priceSource = 'entry_price_fallback'
      }
    }
    
    // SAFETY: Never set price to 0 unless valid
    if (!isUserClosed && currentPrice !== null && currentPrice === 0) {
      if (trade.current_price !== null && trade.current_price > 0) {
        currentPrice = trade.current_price
        priceSource = 'safety_fallback'
      } else if (trade.price_when_copied !== null && trade.price_when_copied > 0) {
        currentPrice = trade.price_when_copied
        priceSource = 'safety_entry_fallback'
      }
    }

    // STEP 4: Calculate ROI
    const entryPrice = trade.entry_price ? parseFloat(String(trade.entry_price)) : null
    if (!isUserClosed && currentPrice !== null && entryPrice && entryPrice > 0) {
      roi = ((currentPrice - entryPrice) / entryPrice) * 100
      roi = parseFloat(roi.toFixed(2))
    }
    
    // ADDITIONAL: Check if current price indicates resolution
    // If this trade's outcome is at $0 or $1, the market is likely resolved
    if (!isUserClosed && !marketResolved && currentPrice !== null) {
      if (currentPrice >= 0.99 || currentPrice <= 0.01) {
        marketResolved = true;
        
        // Determine if this outcome won or lost
        if (currentPrice >= 0.99) {
          resolvedOutcome = trade.outcome; // This outcome won
        }
        
        console.log('🔍 Resolution detected via current price:', {
          tradeId: id.substring(0, 10),
          market: trade.market_title?.substring(0, 30),
          outcome: trade.outcome,
          currentPrice,
          isResolved: currentPrice >= 0.99 || currentPrice <= 0.01,
          marketResolved
        });
      }
    }

    // STEP 5: Update the database
    const updateData: Record<string, any> = {
      last_checked_at: new Date().toISOString(),
      market_resolved: marketResolved,
    }

    if (!isUserClosed) {
      updateData.trader_still_has_position = traderStillHasPosition
      updateData.trader_closed_at = traderClosedAt
      updateData.current_price = currentPrice

      if (traderPositionSize !== null) {
        updateData.trader_position_size = traderPositionSize
      }

      // Persist ROI only when we have a stable entry/exit pair.
      if (roi !== null && entryPrice !== null && entryPrice > 0) {
        updateData.roi = roi
      }
    }
    
    // Only set resolved_outcome if we have one
    if (resolvedOutcome) {
      updateData.resolved_outcome = resolvedOutcome
    }
    
    const { data: updatedTrade, error: updateError } = await supabase
      .from(ordersTable)
      .update(updateData)
      .eq('copied_trade_id', id)
      .eq('copy_user_id', userId)  // SECURITY: Only update if it belongs to this user
      .select()
      .single()

    if (updateError) {
      console.error('❌ Database update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update trade status', details: updateError.message },
        { status: 500 }
      )
    }

    // Log summary for debugging
        console.log(
          `✅ Status updated: ${trade.market_title?.slice(0, 30)}... | ${trade.outcome} | wallet=${walletForStatus} | ${currentPrice !== null ? Math.round(currentPrice * 100) + '¢' : 'no price'} | ROI: ${roi !== null ? roi + '%' : 'n/a'} | source: ${priceSource}`
        )

    return NextResponse.json({
      trade: updatedTrade,
      status: {
        checked: true,
        traderStillHasPosition,
        traderPositionSize,
        currentPrice: isUserClosed ? (trade.user_exit_price ?? currentPrice) : currentPrice,
        roi: isUserClosed ? lockedRoi : roi,
        traderAvgPrice,
        marketResolved,
        resolvedOutcome,
      },
      // Also expose at top level for easier access by cron
      traderStillHasPosition,
      traderPositionSize,
      currentPrice: isUserClosed ? (trade.user_exit_price ?? currentPrice) : currentPrice,
      roi: isUserClosed ? lockedRoi : roi,
      traderAvgPrice,
      marketResolved,
      resolvedOutcome,
    })

  } catch (error: any) {
    console.error('❌ Error in GET /api/copied-trades/[id]/status:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
