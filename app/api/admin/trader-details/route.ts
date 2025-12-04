import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Create service role client
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

// Check admin auth
async function isAuthenticated() {
  const cookieStore = await cookies()
  const authCookie = cookieStore.get('admin_dashboard_auth')
  return authCookie?.value === 'authenticated'
}

export async function GET(request: NextRequest) {
  // Verify admin auth
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const wallet = searchParams.get('wallet')

  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  try {
    // QUERY 1: Lifetime Stats
    const { data: tradesData, error: tradesError } = await supabase
      .from('copied_trades')
      .select('trader_username, trader_wallet, roi, market_resolved, created_at')
      .eq('trader_wallet', wallet)

    if (tradesError) throw tradesError

    // Calculate lifetime stats
    let lifetimeStats = {
      trader_username: tradesData?.[0]?.trader_username || 'Unknown',
      trader_wallet: wallet,
      total_trades: tradesData?.length || 0,
      avg_roi: null as number | null,
      best_roi: null as number | null,
      worst_roi: null as number | null,
      wins: 0,
      losses: 0,
      breakeven: 0,
      first_tracked: tradesData?.[0]?.created_at || null
    }

    if (tradesData && tradesData.length > 0) {
      const roiValues = tradesData.filter(t => t.roi !== null).map(t => t.roi as number)
      
      if (roiValues.length > 0) {
        lifetimeStats.avg_roi = roiValues.reduce((a, b) => a + b, 0) / roiValues.length
        lifetimeStats.best_roi = Math.max(...roiValues)
        lifetimeStats.worst_roi = Math.min(...roiValues)
      }

      tradesData.forEach(t => {
        if (t.roi !== null) {
          if (t.roi > 0) lifetimeStats.wins++
          else if (t.roi < 0) lifetimeStats.losses++
          else lifetimeStats.breakeven++
        }
      })

      // Get first tracked date
      const dates = tradesData.map(t => new Date(t.created_at).getTime())
      lifetimeStats.first_tracked = new Date(Math.min(...dates)).toISOString()
    }

    // QUERY 2: All Trade History
    const { data: tradeHistory, error: historyError } = await supabase
      .from('copied_trades')
      .select('market_title, outcome, roi, market_resolved, created_at')
      .eq('trader_wallet', wallet)
      .order('created_at', { ascending: false })

    if (historyError) throw historyError

    // QUERY 3: Market Focus (Category Breakdown)
    const categoryData = new Map<string, { count: number, rois: number[] }>()
    
    tradeHistory?.forEach(trade => {
      const title = trade.market_title?.toLowerCase() || ''
      let category = 'Other'
      
      if (title.includes('temperature') || title.includes('weather') || title.includes('°f') || title.includes('°c')) {
        category = 'Weather'
      } else if (title.includes('bitcoin') || title.includes('btc') || title.includes('crypto') || title.includes('eth')) {
        category = 'Crypto'
      } else if (title.includes('election') || title.includes('vote') || title.includes('president') || title.includes('trump') || title.includes('biden')) {
        category = 'Politics'
      } else if (title.includes('stock') || title.includes('msft') || title.includes('tsla') || title.includes('spy') || title.includes('aapl')) {
        category = 'Stocks'
      } else if (title.includes('vs.') || title.includes('sports') || title.includes('nfl') || title.includes('nba')) {
        category = 'Sports'
      }

      if (!categoryData.has(category)) {
        categoryData.set(category, { count: 0, rois: [] })
      }
      const cat = categoryData.get(category)!
      cat.count++
      if (trade.roi !== null) {
        cat.rois.push(trade.roi)
      }
    })

    const marketFocus = Array.from(categoryData.entries())
      .map(([category, data]) => ({
        category,
        trade_count: data.count,
        percentage: Math.round((data.count / (tradeHistory?.length || 1)) * 100),
        avg_roi: data.rois.length > 0 
          ? data.rois.reduce((a, b) => a + b, 0) / data.rois.length 
          : null
      }))
      .sort((a, b) => b.trade_count - a.trade_count)

    // QUERY 4: Copy Metrics
    const { data: copyData, error: copyError } = await supabase
      .from('copied_trades')
      .select('user_id, created_at')
      .eq('trader_wallet', wallet)

    if (copyError) throw copyError

    const uniqueCopiers = new Set(copyData?.map(c => c.user_id)).size
    const copyDates = copyData?.map(c => new Date(c.created_at).getTime()) || []
    
    const copyMetrics = {
      unique_copiers: uniqueCopiers,
      total_copies: copyData?.length || 0,
      first_copy: copyDates.length > 0 ? new Date(Math.min(...copyDates)).toISOString() : null,
      last_copy: copyDates.length > 0 ? new Date(Math.max(...copyDates)).toISOString() : null
    }

    // QUERY 5: Platform Comparison
    const { data: platformData, error: platformError } = await supabase
      .from('copied_trades')
      .select('roi')
      .not('roi', 'is', null)

    if (platformError) throw platformError

    let platformStats = {
      platform_avg_roi: null as number | null,
      platform_win_rate: null as number | null
    }

    if (platformData && platformData.length > 0) {
      const platformRois = platformData.map(p => p.roi as number)
      platformStats.platform_avg_roi = platformRois.reduce((a, b) => a + b, 0) / platformRois.length
      const platformWins = platformRois.filter(r => r > 0).length
      platformStats.platform_win_rate = (platformWins / platformRois.length) * 100
    }

    // Recent Activity (Last 7 Days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const recentActivity = tradeHistory
      ?.filter(t => new Date(t.created_at) >= new Date(sevenDaysAgo))
      .slice(0, 10) || []

    // Infer trading style
    const primaryCategory = marketFocus[0]?.category || 'General'
    let tradingStyle = 'Diversified trader'
    
    if (primaryCategory === 'Weather' && marketFocus[0]?.percentage >= 50) {
      tradingStyle = 'High-precision narrow temperature ranges'
    } else if (primaryCategory === 'Crypto' && marketFocus[0]?.percentage >= 50) {
      tradingStyle = 'Short-term crypto price predictions'
    } else if (primaryCategory === 'Politics' && marketFocus[0]?.percentage >= 50) {
      tradingStyle = 'Political event forecasting'
    } else if (primaryCategory === 'Stocks' && marketFocus[0]?.percentage >= 50) {
      tradingStyle = 'Stock market movements'
    } else if (primaryCategory === 'Sports' && marketFocus[0]?.percentage >= 50) {
      tradingStyle = 'Sports betting predictions'
    }

    return NextResponse.json({
      lifetimeStats,
      tradeHistory: tradeHistory || [],
      marketFocus,
      copyMetrics,
      platformStats,
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

