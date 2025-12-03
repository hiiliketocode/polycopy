// Copied trades status API - uses userId passed from client

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

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

    // Rate limit: 200 status checks per hour per user
    if (!checkRateLimit(`status-check:${userId}`, 200, 3600000)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' }, 
        { status: 429 }
      )
    }

    // Use service role client to bypass RLS
    const supabase = createServiceClient()

    // Fetch the copied trade and verify ownership in one query
    const { data: trade, error: fetchError } = await supabase
      .from('copied_trades')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (fetchError || !trade) {
      console.error('❌ Trade not found or unauthorized:', fetchError?.message)
      return NextResponse.json({ error: 'Trade not found or unauthorized' }, { status: 403 })
    }

    // Check if trade was recently copied (< 5 minutes ago)
    const copiedAt = new Date(trade.copied_at)
    const now = new Date()
    const minutesSinceCopied = (now.getTime() - copiedAt.getTime()) / (1000 * 60)
    const isRecentlyCopied = minutesSinceCopied < 5

    // Initialize update fields
    let traderStillHasPosition = trade.trader_still_has_position
    let traderClosedAt = trade.trader_closed_at
    let currentPrice: number | null = null
    let roi: number | null = null
    let priceSource: string = 'none'
    let traderAvgPrice: number | null = null
    let marketResolved: boolean = trade.market_resolved || false
    let resolvedOutcome: string | null = null

    // STEP 1: Fetch trader's current positions from Polymarket
    try {
      const positionsUrl = `https://data-api.polymarket.com/positions?user=${trade.trader_wallet}`
      const positionsResponse = await fetch(positionsUrl, { cache: 'no-store' })

      if (positionsResponse.ok) {
        const positions: PolymarketPosition[] = await positionsResponse.json()

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
          }
        }
      }
    } catch (err: any) {
      console.error('❌ Error fetching positions:', err.message)
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
            
            // Check if market is resolved
            if (market.closed || market.resolved) {
              marketResolved = true
              
              // Get the winning outcome
              if (market.winningOutcome) {
                resolvedOutcome = market.winningOutcome
              } else if (market.resolutionSource) {
                resolvedOutcome = market.resolutionSource
              }
            }
            
            // Get price if we don't have one yet
            if (currentPrice === null) {
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
    if (currentPrice === null) {
      if (trade.current_price !== null && trade.current_price > 0) {
        currentPrice = trade.current_price
        priceSource = 'db.last_known'
      } else if (isRecentlyCopied && trade.price_when_copied !== null && trade.price_when_copied > 0) {
        currentPrice = trade.price_when_copied
        priceSource = 'entry_price_fallback'
      }
    }
    
    // SAFETY: Never set price to 0 unless valid
    if (currentPrice !== null && currentPrice === 0) {
      if (trade.current_price !== null && trade.current_price > 0) {
        currentPrice = trade.current_price
        priceSource = 'safety_fallback'
      } else if (trade.price_when_copied !== null && trade.price_when_copied > 0) {
        currentPrice = trade.price_when_copied
        priceSource = 'safety_entry_fallback'
      }
    }

    // STEP 4: Calculate ROI
    if (currentPrice !== null && trade.price_when_copied) {
      const entryPrice = parseFloat(String(trade.price_when_copied))
      if (entryPrice > 0) {
        roi = ((currentPrice - entryPrice) / entryPrice) * 100
        roi = parseFloat(roi.toFixed(2))
      }
    }

    // STEP 5: Update the database
    const updateData: Record<string, any> = {
      trader_still_has_position: traderStillHasPosition,
      trader_closed_at: traderClosedAt,
      current_price: currentPrice,
      roi: roi,
      last_checked_at: new Date().toISOString(),
      market_resolved: marketResolved,
    }
    
    // Only set resolved_outcome if we have one
    if (resolvedOutcome) {
      updateData.resolved_outcome = resolvedOutcome
    }
    
    const { data: updatedTrade, error: updateError } = await supabase
      .from('copied_trades')
      .update(updateData)
      .eq('id', id)
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
    console.log(`✅ Status updated: ${trade.market_title?.slice(0, 30)}... | ${trade.outcome} | ${currentPrice !== null ? Math.round(currentPrice * 100) + '¢' : 'no price'} | ROI: ${roi !== null ? roi + '%' : 'n/a'} | source: ${priceSource}`)

    return NextResponse.json({
      trade: updatedTrade,
      status: {
        checked: true,
        traderStillHasPosition,
        currentPrice,
        roi,
        traderAvgPrice,
        marketResolved,
        resolvedOutcome,
      },
      // Also expose at top level for easier access by cron
      traderStillHasPosition,
      currentPrice,
      roi,
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
