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

// Category detection function
function detectCategory(marketTitle: string): string {
  const title = marketTitle?.toLowerCase() || ''
  
  if (title.includes('bitcoin') || title.includes('btc') || title.includes('crypto') || title.includes('ethereum') || title.includes('eth')) {
    return 'Crypto'
  }
  if (title.includes('election') || title.includes('president') || title.includes('vote') || title.includes('congress') || title.includes('senate') || title.includes('trump') || title.includes('biden')) {
    return 'Politics'
  }
  if (title.includes('sport') || title.includes(' vs ') || title.includes('nba') || title.includes('nfl') || title.includes('soccer') || title.includes('game')) {
    return 'Sports'
  }
  if (title.includes('stock') || title.includes('msft') || title.includes('tsla') || title.includes('aapl') || title.includes('spy') || title.includes('s&p')) {
    return 'Finance'
  }
  if (title.includes('ai') || title.includes('tech') || title.includes('openai') || title.includes('google') || title.includes('apple') || title.includes('microsoft')) {
    return 'AI & Tech'
  }
  if (title.includes('temperature') || title.includes('weather') || title.includes('°f') || title.includes('°c')) {
    return 'Weather'
  }
  return 'Other'
}

interface DashboardData {
  // Section A: Polymarket Trader Data
  topPerformingTraders: Array<{
    trader_username: string
    trader_wallet: string
    trade_count: number
    avg_roi: number | null
    wins: number
    losses: number
  }>
  topPerformingTrades: Array<{
    trader_username: string
    trader_wallet: string
    market_title: string
    outcome: string
    roi: number
    created_at: string
  }>
  mostCopiedTraders: Array<{
    trader_username: string
    trader_wallet: string
    copy_count: number
  }>
  categoryBreakdown: Array<{
    category: string
    trade_count: number
    avg_roi: number | null
  }>
  mostPopularMarkets: Array<{
    market_title: string
    copy_count: number
    avg_roi: number | null
    resolved_count: number
  }>
  categoryLeaderboards: {
    [key: string]: Array<{
      trader_username: string
      trader_wallet: string
      positions_opened: number
      avg_roi: number | null
    }>
  }
  
  // Section B: Polycopy Platform Data
  platformStats: {
    uniqueTraders: number
    totalCopies: number
    activeUsers: number
    avgRoi: number | null
    winRate: number | null
  }
  newlyTrackedTraders: Array<{
    trader_username: string
    trader_wallet: string
    first_copied: string
    unique_markets: number
  }>
  mostCopiedMarkets: Array<{
    market_title: string
    copy_count: number
    avg_roi: number | null
  }>
  recentActivity: Array<{
    trader_username: string
    trader_wallet: string
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
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Initialize with empty data
  let topPerformingTraders: DashboardData['topPerformingTraders'] = []
  let topPerformingTrades: DashboardData['topPerformingTrades'] = []
  let mostCopiedTraders: DashboardData['mostCopiedTraders'] = []
  let categoryBreakdown: DashboardData['categoryBreakdown'] = []
  let mostPopularMarkets: DashboardData['mostPopularMarkets'] = []
  let categoryLeaderboards: DashboardData['categoryLeaderboards'] = {}
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

  // Run all queries in parallel for better performance
  const queries = await Promise.allSettled([
    // Query 1: Top Performing Traders (30)
    supabase
      .from('copied_trades')
      .select('trader_username, trader_wallet, roi')
      .gte('created_at', sevenDaysAgo),

    // Query 2: Top Performing Trades (50)
    supabase
      .from('copied_trades')
      .select('trader_username, trader_wallet, market_title, outcome, roi, created_at')
      .eq('market_resolved', true)
      .not('roi', 'is', null)
      .gte('created_at', sevenDaysAgo)
      .order('roi', { ascending: false })
      .limit(50),

    // Query 3: All trades for category breakdown and leaderboards
    supabase
      .from('copied_trades')
      .select('trader_username, trader_wallet, market_title, roi, market_resolved')
      .gte('created_at', sevenDaysAgo),

    // Query 4: Platform stats - all trades
    supabase
      .from('copied_trades')
      .select('trader_username, user_id, roi, market_resolved'),

    // Query 5: Recent activity
    supabase
      .from('copied_trades')
      .select('trader_username, trader_wallet, market_title, outcome, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  // Process Query 1: Top Performing Traders
  if (queries[0].status === 'fulfilled' && !queries[0].value.error) {
    const data = queries[0].value.data || []
    
    // Group by trader and calculate stats
    const traderStats = new Map<string, {
      username: string
      wallet: string
      trades: number
      rois: number[]
      wins: number
      losses: number
    }>()

    data.forEach((trade: any) => {
      const key = trade.trader_wallet
      if (!traderStats.has(key)) {
        traderStats.set(key, {
          username: trade.trader_username,
          wallet: trade.trader_wallet,
          trades: 0,
          rois: [],
          wins: 0,
          losses: 0
        })
      }
      const stats = traderStats.get(key)!
      stats.trades++
      if (trade.roi !== null) {
        stats.rois.push(trade.roi)
        if (trade.roi > 0) stats.wins++
        else if (trade.roi < 0) stats.losses++
      }
    })

    topPerformingTraders = Array.from(traderStats.values())
      .map(t => ({
        trader_username: t.username,
        trader_wallet: t.wallet,
        trade_count: t.trades,
        avg_roi: t.rois.length > 0 ? t.rois.reduce((a, b) => a + b, 0) / t.rois.length : null,
        wins: t.wins,
        losses: t.losses
      }))
      .filter(t => t.avg_roi !== null)
      .sort((a, b) => (b.avg_roi || 0) - (a.avg_roi || 0))
      .slice(0, 30)

    // Also calculate most copied traders from this data
    mostCopiedTraders = Array.from(traderStats.values())
      .map(t => ({
        trader_username: t.username,
        trader_wallet: t.wallet,
        copy_count: t.trades
      }))
      .sort((a, b) => b.copy_count - a.copy_count)
      .slice(0, 10)
  } else {
    errors.push('Failed to fetch top performing traders')
  }

  // Process Query 2: Top Performing Trades
  if (queries[1].status === 'fulfilled' && !queries[1].value.error) {
    topPerformingTrades = queries[1].value.data || []
  } else {
    errors.push('Failed to fetch top performing trades')
  }

  // Process Query 3: Category breakdown and leaderboards
  if (queries[2].status === 'fulfilled' && !queries[2].value.error) {
    const data = queries[2].value.data || []

    // Category breakdown
    const categoryData = new Map<string, { count: number, rois: number[] }>()
    
    data.forEach((trade: any) => {
      const category = detectCategory(trade.market_title)
      if (!categoryData.has(category)) {
        categoryData.set(category, { count: 0, rois: [] })
      }
      const cat = categoryData.get(category)!
      cat.count++
      if (trade.roi !== null) {
        cat.rois.push(trade.roi)
      }
    })

    categoryBreakdown = Array.from(categoryData.entries())
      .map(([category, data]) => ({
        category,
        trade_count: data.count,
        avg_roi: data.rois.length > 0 ? data.rois.reduce((a, b) => a + b, 0) / data.rois.length : null
      }))
      .sort((a, b) => b.trade_count - a.trade_count)

    // Most Popular Markets
    const marketData = new Map<string, { count: number, rois: number[], resolved: number }>()
    
    data.forEach((trade: any) => {
      const key = trade.market_title
      if (!marketData.has(key)) {
        marketData.set(key, { count: 0, rois: [], resolved: 0 })
      }
      const market = marketData.get(key)!
      market.count++
      if (trade.market_resolved) {
        market.resolved++
        if (trade.roi !== null) {
          market.rois.push(trade.roi)
        }
      }
    })

    mostPopularMarkets = Array.from(marketData.entries())
      .map(([title, data]) => ({
        market_title: title,
        copy_count: data.count,
        avg_roi: data.rois.length > 0 ? data.rois.reduce((a, b) => a + b, 0) / data.rois.length : null,
        resolved_count: data.resolved
      }))
      .sort((a, b) => b.copy_count - a.copy_count)
      .slice(0, 30)

    // Category Leaderboards
    const categories = ['Crypto', 'Politics', 'Sports', 'Finance', 'Weather', 'AI & Tech']
    
    for (const category of categories) {
      const categoryTrades = data.filter((t: any) => detectCategory(t.market_title) === category)
      
      if (categoryTrades.length === 0) continue

      const traderStats = new Map<string, {
        username: string
        wallet: string
        positions: number
        rois: number[]
      }>()

      categoryTrades.forEach((trade: any) => {
        const key = trade.trader_wallet
        if (!traderStats.has(key)) {
          traderStats.set(key, {
            username: trade.trader_username,
            wallet: trade.trader_wallet,
            positions: 0,
            rois: []
          })
        }
        const stats = traderStats.get(key)!
        stats.positions++
        if (trade.roi !== null) {
          stats.rois.push(trade.roi)
        }
      })

      const leaderboard = Array.from(traderStats.values())
        .map(t => ({
          trader_username: t.username,
          trader_wallet: t.wallet,
          positions_opened: t.positions,
          avg_roi: t.rois.length > 0 ? t.rois.reduce((a, b) => a + b, 0) / t.rois.length : null
        }))
        .filter(t => t.avg_roi !== null)
        .sort((a, b) => (b.avg_roi || 0) - (a.avg_roi || 0))
        .slice(0, 10)

      if (leaderboard.length > 0) {
        categoryLeaderboards[category] = leaderboard
      }
    }

    // Newly Tracked Traders
    const traderFirstSeen = new Map<string, {
      username: string
      wallet: string
      firstCopied: string
      markets: Set<string>
    }>()

    data.forEach((trade: any) => {
      const key = trade.trader_wallet
      if (!traderFirstSeen.has(key)) {
        traderFirstSeen.set(key, {
          username: trade.trader_username,
          wallet: trade.trader_wallet,
          firstCopied: trade.created_at || now,
          markets: new Set([trade.market_title])
        })
      } else {
        const existing = traderFirstSeen.get(key)!
        if (trade.created_at && trade.created_at < existing.firstCopied) {
          existing.firstCopied = trade.created_at
        }
        existing.markets.add(trade.market_title)
      }
    })

    newlyTrackedTraders = Array.from(traderFirstSeen.values())
      .sort((a, b) => new Date(b.firstCopied).getTime() - new Date(a.firstCopied).getTime())
      .slice(0, 10)
      .map(t => ({
        trader_username: t.username,
        trader_wallet: t.wallet,
        first_copied: t.firstCopied,
        unique_markets: t.markets.size
      }))

    // Most Copied Markets (different from popular - this is what users actually copied)
    mostCopiedMarkets = Array.from(marketData.entries())
      .map(([title, data]) => ({
        market_title: title,
        copy_count: data.count,
        avg_roi: data.rois.length > 0 ? data.rois.reduce((a, b) => a + b, 0) / data.rois.length : null
      }))
      .sort((a, b) => b.copy_count - a.copy_count)
      .slice(0, 10)
  } else {
    errors.push('Failed to fetch category data')
  }

  // Process Query 4: Platform Stats
  if (queries[3].status === 'fulfilled' && !queries[3].value.error) {
    const data = queries[3].value.data || []
    
    const uniqueTraders = new Set(data.map((t: any) => t.trader_username)).size
    const activeUsers = new Set(data.map((t: any) => t.user_id)).size
    const totalCopies = data.length

    const resolvedTrades = data.filter((t: any) => t.market_resolved && t.roi !== null)
    let avgRoi: number | null = null
    let winRate: number | null = null

    if (resolvedTrades.length > 0) {
      const rois = resolvedTrades.map((t: any) => t.roi as number)
      avgRoi = rois.reduce((a: number, b: number) => a + b, 0) / rois.length
      const wins = rois.filter((r: number) => r > 0).length
      winRate = (wins / rois.length) * 100
    }

    platformStats = { uniqueTraders, totalCopies, activeUsers, avgRoi, winRate }
  } else {
    errors.push('Failed to fetch platform stats')
  }

  // Process Query 5: Recent Activity
  if (queries[4].status === 'fulfilled' && !queries[4].value.error) {
    recentActivity = queries[4].value.data || []
  } else {
    errors.push('Failed to fetch recent activity')
  }

  return {
    topPerformingTraders,
    topPerformingTrades,
    mostCopiedTraders,
    categoryBreakdown,
    mostPopularMarkets,
    categoryLeaderboards,
    platformStats,
    newlyTrackedTraders,
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
    topPerformingTraders: data.topPerformingTraders.map(t => ({
      ...t,
      avg_roi_formatted: formatROI(t.avg_roi)
    })),
    topPerformingTrades: data.topPerformingTrades.map(t => ({
      ...t,
      roi_formatted: formatROI(t.roi),
      date_formatted: formatDate(t.created_at),
      market_title_truncated: truncate(t.market_title, 60)
    })),
    categoryBreakdown: data.categoryBreakdown.map(c => ({
      ...c,
      avg_roi_formatted: formatROI(c.avg_roi)
    })),
    mostPopularMarkets: data.mostPopularMarkets.map(m => ({
      ...m,
      market_title_truncated: truncate(m.market_title),
      avg_roi_formatted: formatROI(m.avg_roi)
    })),
    categoryLeaderboards: Object.fromEntries(
      Object.entries(data.categoryLeaderboards).map(([category, traders]) => [
        category,
        traders.map(t => ({
          ...t,
          avg_roi_formatted: formatROI(t.avg_roi)
        }))
      ])
    ),
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
