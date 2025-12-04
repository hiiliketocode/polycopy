import { createClient } from '@supabase/supabase-js'
import { checkAuth } from './actions'
import AdminDashboardClient from './AdminDashboardClient'

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Create service role client for admin queries
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

// Helper to format date as "MMM DD"
function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Helper to format date with time
function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

// Helper to truncate text
function truncate(text: string, maxLength: number = 80): string {
  if (!text) return '--'
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

// Helper to format ROI
function formatROI(roi: number | null): string {
  if (roi === null || roi === undefined) return '--'
  const sign = roi >= 0 ? '+' : ''
  return `${sign}${roi.toFixed(1)}%`
}

interface DashboardData {
  mostCopiedTraders: Array<{
    trader_username: string
    trader_wallet: string
    copy_count: number
  }>
  topPerformingTrades: Array<{
    trader_username: string
    market_title: string
    outcome: string
    roi: number
    created_at: string
  }>
  newlyTrackedTraders: Array<{
    trader_username: string
    trader_wallet: string
    first_copied: string
    unique_markets: number
  }>
  platformStats: {
    uniqueTraders: number
    totalCopies: number
    activeUsers: number
    avgRoi: number | null
    winRate: number | null
  }
  mostCopiedMarkets: Array<{
    market_title: string
    copy_count: number
    avg_roi: number | null
  }>
  recentActivity: Array<{
    trader_username: string
    market_title: string
    outcome: string
    created_at: string
  }>
  lastUpdated: string
  errors: string[]
}

async function fetchDashboardData(): Promise<DashboardData> {
  const supabase = createServiceClient()
  const errors: string[] = []
  const now = new Date().toISOString()

  // Initialize with empty data
  let mostCopiedTraders: DashboardData['mostCopiedTraders'] = []
  let topPerformingTrades: DashboardData['topPerformingTrades'] = []
  let newlyTrackedTraders: DashboardData['newlyTrackedTraders'] = []
  let mostCopiedMarkets: DashboardData['mostCopiedMarkets'] = []
  let recentActivity: DashboardData['recentActivity'] = []
  let platformStats: DashboardData['platformStats'] = {
    uniqueTraders: 0,
    totalCopies: 0,
    activeUsers: 0,
    avgRoi: null,
    winRate: null
  }

  // SECTION 1: Most Copied Traders (Last 7 Days)
  try {
    const { data, error } = await supabase
      .from('copied_trades')
      .select('trader_username, trader_wallet')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    if (error) throw error

    // Group and count manually
    const traderCounts = new Map<string, { username: string, wallet: string, count: number }>()
    data?.forEach(trade => {
      const key = trade.trader_wallet
      if (traderCounts.has(key)) {
        traderCounts.get(key)!.count++
      } else {
        traderCounts.set(key, {
          username: trade.trader_username,
          wallet: trade.trader_wallet,
          count: 1
        })
      }
    })

    mostCopiedTraders = Array.from(traderCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(t => ({
        trader_username: t.username,
        trader_wallet: t.wallet,
        copy_count: t.count
      }))
  } catch (err) {
    console.error('Error fetching most copied traders:', err)
    errors.push('Failed to fetch most copied traders')
  }

  // SECTION 2: Top Performing Trades (Last 7 Days)
  try {
    const { data, error } = await supabase
      .from('copied_trades')
      .select('trader_username, market_title, outcome, roi, created_at')
      .eq('market_resolved', true)
      .not('roi', 'is', null)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('roi', { ascending: false })
      .limit(10)

    if (error) throw error
    topPerformingTrades = data || []
  } catch (err) {
    console.error('Error fetching top performing trades:', err)
    errors.push('Failed to fetch top performing trades')
  }

  // SECTION 3: Newly Tracked Traders (Last 7 Days)
  try {
    const { data, error } = await supabase
      .from('copied_trades')
      .select('trader_username, trader_wallet, created_at, market_title')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    if (error) throw error

    // Group by trader and get first copy date + unique markets
    const traderData = new Map<string, { 
      username: string, 
      wallet: string, 
      firstCopied: string, 
      markets: Set<string> 
    }>()

    data?.forEach(trade => {
      const key = trade.trader_wallet
      if (!traderData.has(key)) {
        traderData.set(key, {
          username: trade.trader_username,
          wallet: trade.trader_wallet,
          firstCopied: trade.created_at,
          markets: new Set([trade.market_title])
        })
      } else {
        const existing = traderData.get(key)!
        if (trade.created_at < existing.firstCopied) {
          existing.firstCopied = trade.created_at
        }
        existing.markets.add(trade.market_title)
      }
    })

    newlyTrackedTraders = Array.from(traderData.values())
      .sort((a, b) => new Date(b.firstCopied).getTime() - new Date(a.firstCopied).getTime())
      .slice(0, 10)
      .map(t => ({
        trader_username: t.username,
        trader_wallet: t.wallet,
        first_copied: t.firstCopied,
        unique_markets: t.markets.size
      }))
  } catch (err) {
    console.error('Error fetching newly tracked traders:', err)
    errors.push('Failed to fetch newly tracked traders')
  }

  // SECTION 4: Platform Stats (All Time)
  try {
    // Unique traders
    const { data: tradersData, error: tradersError } = await supabase
      .from('copied_trades')
      .select('trader_username')

    if (tradersError) throw tradersError
    const uniqueTraders = new Set(tradersData?.map(t => t.trader_username)).size

    // Total copies
    const { count: totalCopies, error: copiesError } = await supabase
      .from('copied_trades')
      .select('*', { count: 'exact', head: true })

    if (copiesError) throw copiesError

    // Active users
    const { data: usersData, error: usersError } = await supabase
      .from('copied_trades')
      .select('user_id')

    if (usersError) throw usersError
    const activeUsers = new Set(usersData?.map(u => u.user_id)).size

    // Avg ROI (resolved)
    const { data: roiData, error: roiError } = await supabase
      .from('copied_trades')
      .select('roi')
      .eq('market_resolved', true)
      .not('roi', 'is', null)

    if (roiError) throw roiError
    
    let avgRoi: number | null = null
    let winRate: number | null = null
    
    if (roiData && roiData.length > 0) {
      const totalRoi = roiData.reduce((sum, t) => sum + (t.roi || 0), 0)
      avgRoi = totalRoi / roiData.length
      
      const wins = roiData.filter(t => t.roi && t.roi > 0).length
      winRate = (wins / roiData.length) * 100
    }

    platformStats = {
      uniqueTraders,
      totalCopies: totalCopies || 0,
      activeUsers,
      avgRoi,
      winRate
    }
  } catch (err) {
    console.error('Error fetching platform stats:', err)
    errors.push('Failed to fetch platform stats')
  }

  // SECTION 5: Most Copied Markets (Last 7 Days)
  try {
    const { data, error } = await supabase
      .from('copied_trades')
      .select('market_title, roi, market_resolved')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    if (error) throw error

    // Group by market
    const marketData = new Map<string, { 
      count: number, 
      rois: number[] 
    }>()

    data?.forEach(trade => {
      const key = trade.market_title
      if (!marketData.has(key)) {
        marketData.set(key, { count: 0, rois: [] })
      }
      const market = marketData.get(key)!
      market.count++
      if (trade.market_resolved && trade.roi !== null) {
        market.rois.push(trade.roi)
      }
    })

    mostCopiedMarkets = Array.from(marketData.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([title, data]) => ({
        market_title: title,
        copy_count: data.count,
        avg_roi: data.rois.length > 0 
          ? data.rois.reduce((a, b) => a + b, 0) / data.rois.length 
          : null
      }))
  } catch (err) {
    console.error('Error fetching most copied markets:', err)
    errors.push('Failed to fetch most copied markets')
  }

  // SECTION 6: Recent Activity (Last 20)
  try {
    const { data, error } = await supabase
      .from('copied_trades')
      .select('trader_username, market_title, outcome, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error
    recentActivity = data || []
  } catch (err) {
    console.error('Error fetching recent activity:', err)
    errors.push('Failed to fetch recent activity')
  }

  return {
    mostCopiedTraders,
    topPerformingTrades,
    newlyTrackedTraders,
    platformStats,
    mostCopiedMarkets,
    recentActivity,
    lastUpdated: now,
    errors
  }
}

export default async function AdminContentDataPage() {
  const isAuthenticated = await checkAuth()
  
  if (!isAuthenticated) {
    return <AdminDashboardClient isAuthenticated={false} data={null} />
  }

  const data = await fetchDashboardData()
  
  // Format data for display
  const formattedData = {
    ...data,
    lastUpdated: formatDateTime(data.lastUpdated),
    topPerformingTrades: data.topPerformingTrades.map(t => ({
      ...t,
      roi_formatted: formatROI(t.roi),
      date_formatted: formatDate(t.created_at)
    })),
    newlyTrackedTraders: data.newlyTrackedTraders.map(t => ({
      ...t,
      first_copied_formatted: formatDate(t.first_copied)
    })),
    platformStats: {
      ...data.platformStats,
      avgRoi_formatted: formatROI(data.platformStats.avgRoi),
      winRate_formatted: data.platformStats.winRate !== null 
        ? `${data.platformStats.winRate.toFixed(1)}%` 
        : '--'
    },
    mostCopiedMarkets: data.mostCopiedMarkets.map(m => ({
      ...m,
      market_title_truncated: truncate(m.market_title),
      avg_roi_formatted: formatROI(m.avg_roi)
    })),
    recentActivity: data.recentActivity.map(a => ({
      ...a,
      time_formatted: formatDateTime(a.created_at),
      market_title_truncated: truncate(a.market_title, 60)
    }))
  }

  return <AdminDashboardClient isAuthenticated={true} data={formattedData} />
}

