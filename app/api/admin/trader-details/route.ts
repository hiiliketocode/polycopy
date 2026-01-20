import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createAuthClient } from '@/lib/supabase/server'
import { resolveOrdersTableName } from '@/lib/orders/table'

/**
 * SECURITY: Service Role Usage - ADMIN ENDPOINT
 * 
 * Why service role is required:
 * - Admin viewing OTHER traders' data (not their own)
 * - Needs to query orders table for copy metrics across all users
 * - RLS policies restrict users to their own data
 * 
 * Security measures:
 * - ✅ Verifies user is authenticated via Supabase
 * - ✅ Checks user has `is_admin` flag in profiles table
 * - ✅ Returns 401 if not admin
 * - ✅ Service role only used AFTER admin check passes
 * 
 * RLS policies bypassed:
 * - orders table (to count copiers across all users)
 * 
 * Reviewed: January 10, 2025
 * Status: SECURE (proper admin authorization)
 */

// Create service role client (only used after admin check)
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
 * SECURITY FIX: Proper admin authentication
 * - Checks Supabase auth (not just cookie)
 * - Verifies is_admin flag in database
 * - Returns user object for audit logging
 */
async function verifyAdminAuth(): Promise<{ isAdmin: boolean; userId?: string; error?: string }> {
  try {
    // Get authenticated user from Supabase
    const supabase = await createAuthClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return { isAdmin: false, error: 'Not authenticated' }
    }
    
    // Check if user has admin role in database
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
    
    if (profileError || !profile) {
      console.error('[ADMIN] Failed to fetch profile:', profileError)
      return { isAdmin: false, error: 'Profile not found' }
    }
    
    if (!profile.is_admin) {
      console.warn('[ADMIN] Unauthorized access attempt by user:', user.id)
      return { isAdmin: false, userId: user.id, error: 'Not authorized - admin access required' }
    }
    
    // Log successful admin access
    console.log('[ADMIN] Authorized admin access:', user.id)
    return { isAdmin: true, userId: user.id }
    
  } catch (error) {
    console.error('[ADMIN] Auth check error:', error)
    return { isAdmin: false, error: 'Authentication failed' }
  }
}

// Helper to categorize markets
function categorizeMarket(title: string): string {
  const lowerTitle = title.toLowerCase()
  
  if (lowerTitle.includes('temperature') || lowerTitle.includes('weather') || lowerTitle.includes('°f') || lowerTitle.includes('°c') || lowerTitle.includes('snow') || lowerTitle.includes('rain')) {
    return 'Weather'
  } else if (lowerTitle.includes('bitcoin') || lowerTitle.includes('btc') || lowerTitle.includes('crypto') || lowerTitle.includes('eth') || lowerTitle.includes('ethereum')) {
    return 'Crypto'
  } else if (lowerTitle.includes('election') || lowerTitle.includes('vote') || lowerTitle.includes('president') || lowerTitle.includes('trump') || lowerTitle.includes('biden') || lowerTitle.includes('democrat') || lowerTitle.includes('republican')) {
    return 'Politics'
  } else if (lowerTitle.includes('stock') || lowerTitle.includes('earnings') || lowerTitle.includes('ipo') || lowerTitle.includes('ceo') || lowerTitle.includes('company')) {
    return 'Business/Finance'
  } else if (lowerTitle.includes('vs.') || lowerTitle.includes(' vs ') || lowerTitle.includes('sports') || lowerTitle.includes('nfl') || lowerTitle.includes('nba') || lowerTitle.includes('mlb') || lowerTitle.includes('nhl') || lowerTitle.includes('soccer')) {
    return 'Sports'
  } else if (lowerTitle.includes('ai') || lowerTitle.includes('tech') || lowerTitle.includes('apple') || lowerTitle.includes('google') || lowerTitle.includes('microsoft')) {
    return 'Tech'
  }
  
  return 'Other'
}

export async function GET(request: NextRequest) {
  // SECURITY: Verify admin auth BEFORE any service role operations
  const authResult = await verifyAdminAuth()
  
  if (!authResult.isAdmin) {
    console.warn('[ADMIN] Unauthorized access attempt:', authResult.error)
    return NextResponse.json(
      { error: authResult.error || 'Unauthorized - admin access required' },
      { status: 401 }
    )
  }
  
  console.log('[ADMIN] Processing trader details request by admin:', authResult.userId)

  const { searchParams } = new URL(request.url)
  const wallet = searchParams.get('wallet')

  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
  }

  // NOW safe to use service role (admin verified)
  const supabase = createServiceClient()

  try {
    // Fetch REAL Polymarket data from Data API
    const tradesResponse = await fetch(
      `https://data-api.polymarket.com/trades?limit=100&user=${wallet}`
    )
    
    if (!tradesResponse.ok) {
      throw new Error('Failed to fetch Polymarket trades')
    }
    
    const realTrades = await tradesResponse.json()
    
    // Fetch positions for current P&L
    const positionsResponse = await fetch(
      `https://data-api.polymarket.com/positions?user=${wallet}`
    )
    
    let positions = []
    if (positionsResponse.ok) {
      positions = await positionsResponse.json()
    }
    
    // Get trader displayName from leaderboard
    let displayName = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
    try {
      const leaderboardRes = await fetch(
        'https://data-api.polymarket.com/leaderboard?limit=1000&orderBy=PNL&timePeriod=all'
      )
      if (leaderboardRes.ok) {
        const leaderboardData = await leaderboardRes.json()
        const traderInfo = leaderboardData.traders?.find(
          (t: any) => t.wallet.toLowerCase() === wallet.toLowerCase()
        )
        if (traderInfo?.displayName) {
          displayName = traderInfo.displayName
        }
      }
    } catch (err) {
      console.warn('Failed to fetch trader displayName:', err)
    }
    
    // Calculate stats from REAL Polymarket trades
    const categoryData = new Map<string, { count: number, totalValue: number }>()
    let totalTradeValue = 0
    
    // Format trade history
    const tradeHistory = realTrades.map((trade: any) => {
      const timestampMs = (trade.timestamp || Date.now() / 1000) * 1000
      const tradeDate = new Date(timestampMs)
      const category = categorizeMarket(trade.market || '')
      const tradeValue = parseFloat(trade.price || 0) * parseFloat(trade.size || 0)
      
      // Track category stats
      if (!categoryData.has(category)) {
        categoryData.set(category, { count: 0, totalValue: 0 })
      }
      const cat = categoryData.get(category)!
      cat.count++
      cat.totalValue += tradeValue
      
      totalTradeValue += tradeValue
      
      return {
        market_title: trade.market || 'Unknown Market',
        outcome: trade.outcome || trade.option || 'YES',
        side: (trade.side || 'BUY').toUpperCase(),
        price: parseFloat(trade.price || 0),
        size: parseFloat(trade.size || 0),
        value: tradeValue,
        market_resolved: false, // We don't have resolution data from trades API
        created_at: tradeDate.toISOString(),
        category
      }
    }).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    
    // Find earliest trade date
    const earliestTradeDate = tradeHistory.length > 0 
      ? tradeHistory[tradeHistory.length - 1].created_at 
      : null
    
    // Market Focus breakdown
    const marketFocus = Array.from(categoryData.entries())
      .map(([category, data]) => ({
        category,
        trade_count: data.count,
        percentage: Math.round((data.count / (realTrades.length || 1)) * 100),
        avg_value: data.totalValue / data.count
      }))
      .sort((a, b) => b.trade_count - a.trade_count)
    
    // Infer trading style from primary category
    const primaryCategory = marketFocus[0]?.category || 'General'
    let tradingStyle = 'Diversified trader'
    
    if (primaryCategory === 'Weather' && marketFocus[0]?.percentage >= 50) {
      tradingStyle = 'High-precision weather predictions'
    } else if (primaryCategory === 'Crypto' && marketFocus[0]?.percentage >= 50) {
      tradingStyle = 'Crypto price speculation'
    } else if (primaryCategory === 'Politics' && marketFocus[0]?.percentage >= 50) {
      tradingStyle = 'Political event forecasting'
    } else if (primaryCategory === 'Business/Finance' && marketFocus[0]?.percentage >= 50) {
      tradingStyle = 'Financial market predictions'
    } else if (primaryCategory === 'Sports' && marketFocus[0]?.percentage >= 50) {
      tradingStyle = 'Sports betting predictions'
    } else if (primaryCategory === 'Tech' && marketFocus[0]?.percentage >= 50) {
      tradingStyle = 'Tech industry forecasting'
    }
    
    // Calculate P&L from positions
    let totalPnl = 0
    let totalVolume = 0
    let marketsTraded = 0
    
    if (positions && positions.length > 0) {
      totalPnl = positions.reduce((sum: number, pos: any) => {
        const pnl = parseFloat(pos.pnl || 0)
        return sum + pnl
      }, 0)
      
      totalVolume = positions.reduce((sum: number, pos: any) => {
        const volume = parseFloat(pos.notional || 0)
        return sum + volume
      }, 0)
      
      marketsTraded = positions.length
    }
    
    const roi = totalVolume > 0 ? (totalPnl / totalVolume) * 100 : 0
    
    // Lifetime Stats from REAL Polymarket data
    const lifetimeStats = {
      trader_username: displayName,
      trader_wallet: wallet,
      total_trades: realTrades.length,
      total_pnl: totalPnl,
      total_pnl_formatted: `$${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}`,
      total_volume: totalVolume,
      total_volume_formatted: `$${(totalVolume / 1000).toFixed(1)}K`,
      roi: roi,
      roi_formatted: `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`,
      markets_traded: marketsTraded,
      first_trade: earliestTradeDate
    }
    
    // Recent Activity (Last 7 Days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const recentActivity = tradeHistory
      .filter((t: any) => new Date(t.created_at) >= sevenDaysAgo)
      .slice(0, 10)
    
    // POLYCOPY copy metrics (internal tracking)
    const ordersTable = await resolveOrdersTableName(supabase)
    const { data: copyData, error: copyError } = await supabase
      .from(ordersTable)
      .select('copy_user_id, created_at')
      .eq('copied_trader_wallet', wallet)
      .not('copied_trade_id', 'is', null)
    
    const uniqueCopiers = new Set(copyData?.map(c => c.copy_user_id) || []).size
    const copyDates = copyData?.map(c => new Date(c.created_at).getTime()) || []
    
    const copyMetrics = {
      unique_copiers: uniqueCopiers,
      total_copies: copyData?.length || 0,
      first_copy: copyDates.length > 0 ? new Date(Math.min(...copyDates)).toISOString() : null,
      last_copy: copyDates.length > 0 ? new Date(Math.max(...copyDates)).toISOString() : null
    }

    return NextResponse.json({
      lifetimeStats,
      tradeHistory,
      marketFocus,
      copyMetrics,
      recentActivity,
      tradingStyle,
      primaryCategory
    })

  } catch (error: any) {
    console.error('Error fetching trader details:', error)
    return NextResponse.json(
      { error: 'Failed to fetch trader details', details: error.message },
      { status: 500 }
    )
  }
}
