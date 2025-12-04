import { createClient } from '@supabase/supabase-js'
import { checkAuth } from './actions'
import AdminDashboardClient from './AdminDashboardClient'
import {
  fetchLeaderboard,
  fetchAllCategoryLeaderboards,
  formatCurrency,
  formatPercent,
  formatWallet,
  getCategoryDisplayName,
  LeaderboardTrader
} from '@/lib/polymarket-api'

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

// Dashboard data types
interface FormattedTrader {
  wallet: string
  displayName: string
  pnl: number
  pnl_formatted: string
  volume: number
  volume_formatted: string
  roi: number
  roi_formatted: string
  rank: number
  marketsTraded: number
}

interface SectionAData {
  // Overall leaderboard (top 30)
  topTraders: FormattedTrader[]
  // Category leaderboards (top 10 each)
  categoryLeaderboards: {
    [key: string]: FormattedTrader[]
  }
  // Errors
  apiErrors: string[]
}

interface SectionBData {
  // Polycopy Supabase data
  mostCopiedTraders: Array<{
    trader_username: string
    trader_wallet: string
    copy_count: number
  }>
  platformStats: {
    uniqueTraders: number
    totalCopies: number
    activeUsers: number
    avgRoi: number | null
    avgRoi_formatted: string
    winRate: number | null
    winRate_formatted: string
  }
  newlyTrackedTraders: Array<{
    trader_username: string
    trader_wallet: string
    first_copied: string
    first_copied_formatted: string
    unique_markets: number
  }>
  mostCopiedMarkets: Array<{
    market_title: string
    market_title_truncated: string
    copy_count: number
    avg_roi: number | null
    avg_roi_formatted: string
  }>
  recentActivity: Array<{
    trader_username: string
    trader_wallet: string
    market_title: string
    market_title_truncated: string
    outcome: string
    created_at: string
    time_formatted: string
  }>
  dbErrors: string[]
}

interface DashboardData {
  sectionA: SectionAData
  sectionB: SectionBData
  lastUpdated: string
}

// Format a trader for display
function formatTrader(trader: LeaderboardTrader): FormattedTrader {
  return {
    wallet: trader.wallet,
    displayName: trader.displayName,
    pnl: trader.pnl,
    pnl_formatted: formatCurrency(trader.pnl),
    volume: trader.volume,
    volume_formatted: formatCurrency(trader.volume),
    roi: trader.roi,
    roi_formatted: formatPercent(trader.roi),
    rank: trader.rank,
    marketsTraded: trader.marketsTraded
  }
}

async function fetchPolymarketData(): Promise<SectionAData> {
  const apiErrors: string[] = []
  
  console.log('🔄 Fetching Polymarket data using leaderboard API...')
  
  // Fetch overall leaderboard and all category leaderboards in parallel
  const [overallResult, categoriesResult] = await Promise.allSettled([
    fetchLeaderboard({ limit: 30, orderBy: 'PNL', category: 'overall' }),
    fetchAllCategoryLeaderboards(10)
  ])

  // Process overall leaderboard
  let topTraders: FormattedTrader[] = []
  if (overallResult.status === 'fulfilled' && overallResult.value.length > 0) {
    // Sort by ROI (same as discover page)
    const sortedByROI = [...overallResult.value].sort((a, b) => b.roi - a.roi)
    topTraders = sortedByROI.map(formatTrader)
    console.log(`✅ Got ${topTraders.length} top traders`)
  } else {
    apiErrors.push('Failed to fetch Polymarket leaderboard')
    console.error('❌ Failed to fetch overall leaderboard')
  }

  // Process category leaderboards
  let categoryLeaderboards: { [key: string]: FormattedTrader[] } = {}
  if (categoriesResult.status === 'fulfilled') {
    for (const [category, traders] of Object.entries(categoriesResult.value)) {
      if (traders.length > 0) {
        categoryLeaderboards[category] = traders.map(formatTrader)
      }
    }
    console.log(`✅ Got ${Object.keys(categoryLeaderboards).length} category leaderboards`)
  } else {
    apiErrors.push('Failed to fetch category leaderboards')
    console.error('❌ Failed to fetch category leaderboards')
  }

  return {
    topTraders,
    categoryLeaderboards,
    apiErrors
  }
}

async function fetchPolycopyData(): Promise<SectionBData> {
  const supabase = createServiceClient()
  const dbErrors: string[] = []
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Initialize with empty data
  let mostCopiedTraders: SectionBData['mostCopiedTraders'] = []
  let newlyTrackedTraders: SectionBData['newlyTrackedTraders'] = []
  let mostCopiedMarkets: SectionBData['mostCopiedMarkets'] = []
  let recentActivity: SectionBData['recentActivity'] = []
  let platformStats: SectionBData['platformStats'] = {
    uniqueTraders: 0,
    totalCopies: 0,
    activeUsers: 0,
    avgRoi: null,
    avgRoi_formatted: '--',
    winRate: null,
    winRate_formatted: '--'
  }

  // Run all queries in parallel
  const queries = await Promise.allSettled([
    // Query 1: Most copied traders (7 days)
    supabase
      .from('copied_trades')
      .select('trader_username, trader_wallet')
      .gte('created_at', sevenDaysAgo),

    // Query 2: Platform stats (all time)
    supabase
      .from('copied_trades')
      .select('trader_username, user_id, roi, market_resolved'),

    // Query 3: Recent activity
    supabase
      .from('copied_trades')
      .select('trader_username, trader_wallet, market_title, outcome, created_at')
      .order('created_at', { ascending: false })
      .limit(20),

    // Query 4: Newly tracked traders + markets (7 days)
    supabase
      .from('copied_trades')
      .select('trader_username, trader_wallet, market_title, roi, market_resolved, created_at')
      .gte('created_at', sevenDaysAgo),
  ])

  // Process Query 1: Most Copied Traders
  if (queries[0].status === 'fulfilled' && !queries[0].value.error) {
    const data = queries[0].value.data || []
    const traderCounts = new Map<string, { username: string; wallet: string; count: number }>()
    
    data.forEach((trade: any) => {
      const key = trade.trader_wallet
      if (!traderCounts.has(key)) {
        traderCounts.set(key, {
          username: trade.trader_username,
          wallet: trade.trader_wallet,
          count: 0
        })
      }
      traderCounts.get(key)!.count++
    })

    mostCopiedTraders = Array.from(traderCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(t => ({
        trader_username: t.username,
        trader_wallet: t.wallet,
        copy_count: t.count
      }))
  } else {
    dbErrors.push('Failed to fetch most copied traders')
  }

  // Process Query 2: Platform Stats
  if (queries[1].status === 'fulfilled' && !queries[1].value.error) {
    const data = queries[1].value.data || []
    
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

    platformStats = {
      uniqueTraders,
      totalCopies,
      activeUsers,
      avgRoi,
      avgRoi_formatted: formatROI(avgRoi),
      winRate,
      winRate_formatted: winRate !== null ? `${winRate.toFixed(1)}%` : '--'
    }
  } else {
    dbErrors.push('Failed to fetch platform stats')
  }

  // Process Query 3: Recent Activity
  if (queries[2].status === 'fulfilled' && !queries[2].value.error) {
    recentActivity = (queries[2].value.data || []).map((a: any) => ({
      trader_username: a.trader_username,
      trader_wallet: a.trader_wallet || '',
      market_title: a.market_title,
      market_title_truncated: truncate(a.market_title, 60),
      outcome: a.outcome,
      created_at: a.created_at,
      time_formatted: formatDateTime(a.created_at)
    }))
  } else {
    dbErrors.push('Failed to fetch recent activity')
  }

  // Process Query 4: Newly tracked traders + Most copied markets
  if (queries[3].status === 'fulfilled' && !queries[3].value.error) {
    const data = queries[3].value.data || []

    // Newly tracked traders
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
          firstCopied: trade.created_at,
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
        first_copied_formatted: formatDate(t.firstCopied),
        unique_markets: t.markets.size
      }))

    // Most copied markets
    const marketData = new Map<string, { count: number; rois: number[] }>()
    data.forEach((trade: any) => {
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
      .map(([title, data]) => {
        const avgRoi = data.rois.length > 0 
          ? data.rois.reduce((a, b) => a + b, 0) / data.rois.length 
          : null
        return {
          market_title: title,
          market_title_truncated: truncate(title),
          copy_count: data.count,
          avg_roi: avgRoi,
          avg_roi_formatted: formatROI(avgRoi)
        }
      })
      .sort((a, b) => b.copy_count - a.copy_count)
      .slice(0, 10)
  } else {
    dbErrors.push('Failed to fetch trader/market data')
  }

  return {
    mostCopiedTraders,
    platformStats,
    newlyTrackedTraders,
    mostCopiedMarkets,
    recentActivity,
    dbErrors
  }
}

export default async function AdminContentDataPage() {
  const isAuthenticated = await checkAuth()
  
  if (!isAuthenticated) {
    return <AdminDashboardClient isAuthenticated={false} data={null} />
  }

  // Fetch both data sources in parallel
  const [sectionA, sectionB] = await Promise.all([
    fetchPolymarketData(),
    fetchPolycopyData()
  ])

  const data: DashboardData = {
    sectionA,
    sectionB,
    lastUpdated: formatDateTime(new Date().toISOString())
  }

  return <AdminDashboardClient isAuthenticated={true} data={data} />
}
