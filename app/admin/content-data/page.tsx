import { createClient } from '@supabase/supabase-js'
import AdminDashboardClient from './AdminDashboardClient'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  fetchLeaderboard,
  fetchAllCategoryLeaderboards,
  enrichTradersWithTradeCounts,
  formatCurrency,
  formatPercent,
  formatWallet,
  getCategoryDisplayName,
  LeaderboardTrader
} from '@/lib/polymarket-api'
import { resolveOrdersTableName } from '@/lib/orders/table'

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

// Helper to categorize markets (same logic as trader-details API)
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
  // NEW: Enriched trader analytics (Phase 2)
  traderAnalytics: Array<{
    trader_wallet: string
    trader_username: string
    // Win Rate
    win_rate: number | null
    win_rate_formatted: string
    total_resolved: number
    wins: number
    losses: number
    // Category Breakdown
    categories: Array<{
      category: string
      count: number
      percentage: number
    }>
    primary_category: string
    // Position Sizing
    avg_position_size: number | null
    avg_position_formatted: string
    total_invested: number
    // Trading Activity
    trades_per_day: number | null
    trades_per_day_formatted: string
    first_trade_date: string | null
    total_trades: number
    // Week over Week
    wow_roi_change: number | null
    wow_roi_change_formatted: string
    wow_status: 'heating_up' | 'cooling_down' | 'stable' | 'new'
    last_week_roi: number | null
    prev_week_roi: number | null
  }>
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
  // NEW: Phase 1 Analytics
  fastestGrowingTraders: Array<{
    trader_username: string
    trader_wallet: string
    new_followers_7d: number
    total_followers: number
    growth_rate: string
  }>
  copierPerformance: Array<{
    user_email: string
    user_id: string
    total_copies: number
    avg_roi: number | null
    avg_roi_formatted: string
    win_rate: number | null
    win_rate_formatted: string
    best_trader: string | null
  }>
  roiByFollowerCount: Array<{
    follower_bucket: string
    trader_count: number
    avg_roi: number | null
    avg_roi_formatted: string
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
    // Enrich with actual trade counts
    const enrichedTraders = await enrichTradersWithTradeCounts(overallResult.value)
    
    // Sort by ROI (same as discover page)
    const sortedByROI = [...enrichedTraders].sort((a, b) => b.roi - a.roi)
    topTraders = sortedByROI.map(formatTrader)
    console.log(`✅ Got ${topTraders.length} top traders with trade counts`)
  } else {
    apiErrors.push('Failed to fetch Polymarket leaderboard')
    console.error('❌ Failed to fetch overall leaderboard')
  }

  // Process category leaderboards
  let categoryLeaderboards: { [key: string]: FormattedTrader[] } = {}
  if (categoriesResult.status === 'fulfilled') {
    for (const [category, traders] of Object.entries(categoriesResult.value)) {
      if (traders.length > 0) {
        // Enrich category traders with trade counts (same as overall leaderboard)
        const enrichedCategoryTraders = await enrichTradersWithTradeCounts(traders)
        categoryLeaderboards[category] = enrichedCategoryTraders.map(formatTrader)
      }
    }
    console.log(`✅ Got ${Object.keys(categoryLeaderboards).length} category leaderboards with trade counts`)
  } else {
    apiErrors.push('Failed to fetch category leaderboards')
    console.error('❌ Failed to fetch category leaderboards')
  }

  // NEW: Fetch enriched trader analytics (Phase 2)
  let traderAnalytics: SectionAData['traderAnalytics'] = []
  
  try {
    console.log('🔄 Fetching Phase 2 trader analytics from Polycopy database...')
    const supabase = createServiceClient()
    const ordersTable = await resolveOrdersTableName(supabase)
    
    // Get all unique trader wallets from the leaderboard
    const traderWallets = topTraders.map(t => t.wallet)
    
    if (traderWallets.length > 0) {
      // Fetch all copied trades for these traders (from orders)
      const { data: allTrades, error } = await supabase
        .from(ordersTable)
        .select(
          'copied_trader_wallet, copied_trader_username, copied_market_title, roi, market_resolved, amount_invested, created_at'
        )
        .in('copied_trader_wallet', traderWallets)
        .not('copied_trade_id', 'is', null)
      
      if (!error && allTrades) {
        const normalizedTrades = allTrades.map((trade: any) => ({
          trader_wallet: trade.copied_trader_wallet || trade.trader_wallet || '',
          trader_username: trade.copied_trader_username || null,
          market_title: trade.copied_market_title || '',
          roi: trade.roi,
          market_resolved: trade.market_resolved,
          amount_invested: trade.amount_invested,
          copied_at: trade.created_at
        }))

        // Group trades by trader
        const traderData = new Map<string, any[]>()
        normalizedTrades.forEach((trade: any) => {
          if (!traderData.has(trade.trader_wallet)) {
            traderData.set(trade.trader_wallet, [])
          }
          traderData.get(trade.trader_wallet)!.push(trade)
        })
        
        // Calculate analytics for each trader
        traderAnalytics = Array.from(traderData.entries()).map(([wallet, trades]) => {
          // Win Rate calculation
          const resolvedTrades = trades.filter(t => t.market_resolved && t.roi !== null)
          const wins = resolvedTrades.filter(t => t.roi > 0).length
          const losses = resolvedTrades.length - wins
          const winRate = resolvedTrades.length > 0 ? (wins / resolvedTrades.length) * 100 : null
          
          // Category Breakdown
          const categoryCount = new Map<string, number>()
          trades.forEach(t => {
            const category = categorizeMarket(t.market_title)
            categoryCount.set(category, (categoryCount.get(category) || 0) + 1)
          })
          
          const categories = Array.from(categoryCount.entries())
            .map(([category, count]) => ({
              category,
              count,
              percentage: Math.round((count / trades.length) * 100)
            }))
            .sort((a, b) => b.count - a.count)
          
          const primaryCategory = categories[0]?.category || 'Unknown'
          
          // Average Position Size
          const tradesWithAmount = trades.filter(t => t.amount_invested && t.amount_invested > 0)
          const avgPositionSize = tradesWithAmount.length > 0
            ? tradesWithAmount.reduce((sum, t) => sum + parseFloat(t.amount_invested || 0), 0) / tradesWithAmount.length
            : null
          const totalInvested = tradesWithAmount.reduce((sum, t) => sum + parseFloat(t.amount_invested || 0), 0)
          
          // Trade Frequency (trades per day)
          const tradeDates = trades.map(t => new Date(t.copied_at).getTime()).sort((a, b) => a - b)
          const firstTradeDate = tradeDates.length > 0 ? new Date(tradeDates[0]).toISOString() : null
          const daysSinceFirst = tradeDates.length > 0 
            ? (Date.now() - tradeDates[0]) / (1000 * 60 * 60 * 24)
            : null
          const tradesPerDay = daysSinceFirst && daysSinceFirst > 0 ? trades.length / daysSinceFirst : null
          
          // Week-over-Week Performance
          const now = Date.now()
          const lastWeekStart = now - (7 * 24 * 60 * 60 * 1000)
          const prevWeekStart = now - (14 * 24 * 60 * 60 * 1000)
          
          // Try with resolved trades first (most accurate)
          const lastWeekResolved = resolvedTrades.filter(t => {
            const tradeTime = new Date(t.copied_at).getTime()
            return tradeTime >= lastWeekStart && tradeTime < now
          })
          
          const prevWeekResolved = resolvedTrades.filter(t => {
            const tradeTime = new Date(t.copied_at).getTime()
            return tradeTime >= prevWeekStart && tradeTime < lastWeekStart
          })
          
          // Fall back to all trades if not enough resolved trades
          const lastWeekAllTrades = trades.filter(t => {
            const tradeTime = new Date(t.copied_at).getTime()
            return tradeTime >= lastWeekStart && tradeTime < now
          })
          
          const prevWeekAllTrades = trades.filter(t => {
            const tradeTime = new Date(t.copied_at).getTime()
            return tradeTime >= prevWeekStart && tradeTime < lastWeekStart
          })
          
          // Calculate ROI change from resolved trades if possible
          const lastWeekRoi = lastWeekResolved.length >= 2
            ? lastWeekResolved.reduce((sum, t) => sum + t.roi, 0) / lastWeekResolved.length
            : null
          
          const prevWeekRoi = prevWeekResolved.length >= 2
            ? prevWeekResolved.reduce((sum, t) => sum + t.roi, 0) / prevWeekResolved.length
            : null
          
          const wowRoiChange = lastWeekRoi !== null && prevWeekRoi !== null
            ? lastWeekRoi - prevWeekRoi
            : null
          
          // Determine status
          let wowStatus: 'heating_up' | 'cooling_down' | 'stable' | 'new' = 'new'
          
          if (wowRoiChange !== null) {
            // Have resolved trades data - use ROI change
            if (wowRoiChange > 5) wowStatus = 'heating_up'
            else if (wowRoiChange < -5) wowStatus = 'cooling_down'
            else wowStatus = 'stable'
          } else if (lastWeekAllTrades.length > prevWeekAllTrades.length && prevWeekAllTrades.length > 0) {
            // Increasing activity (but not enough resolved trades yet)
            wowStatus = 'heating_up'
          } else if (prevWeekAllTrades.length > lastWeekAllTrades.length && prevWeekAllTrades.length > 0) {
            // Decreasing activity
            wowStatus = 'cooling_down'
          } else if (prevWeekAllTrades.length > 0) {
            // Similar activity
            wowStatus = 'stable'
          } else if (lastWeekAllTrades.length > 0) {
            // Active this week but not previous week
            wowStatus = 'new'
          }
          
          // Find trader username
          const traderUsername = trades[0]?.trader_username || `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
          
          return {
            trader_wallet: wallet,
            trader_username: traderUsername,
            win_rate: winRate,
            win_rate_formatted: winRate !== null ? `${winRate.toFixed(1)}%` : '--',
            total_resolved: resolvedTrades.length,
            wins,
            losses,
            categories,
            primary_category: primaryCategory,
            avg_position_size: avgPositionSize,
            avg_position_formatted: avgPositionSize !== null ? `$${avgPositionSize.toFixed(0)}` : '--',
            total_invested: totalInvested,
            trades_per_day: tradesPerDay,
            trades_per_day_formatted: tradesPerDay !== null ? `${tradesPerDay.toFixed(1)}/day` : '--',
            first_trade_date: firstTradeDate,
            total_trades: trades.length,
            wow_roi_change: wowRoiChange,
            wow_roi_change_formatted: wowRoiChange !== null ? formatROI(wowRoiChange) : '--',
            wow_status: wowStatus,
            last_week_roi: lastWeekRoi,
            prev_week_roi: prevWeekRoi
          }
        })
        
        console.log(`✅ Generated analytics for ${traderAnalytics.length} traders`)
      } else {
        console.warn('⚠️ Failed to fetch trader analytics:', error)
      }
    }
  } catch (err) {
    console.error('❌ Error fetching trader analytics:', err)
    apiErrors.push('Failed to generate trader analytics')
  }

  return {
    topTraders,
    categoryLeaderboards,
    traderAnalytics,
    apiErrors
  }
}

async function fetchPolycopyData(): Promise<SectionBData> {
  const supabase = createServiceClient()
  const ordersTable = await resolveOrdersTableName(supabase)
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
      .from(ordersTable)
      .select('copied_trader_username, copied_trader_wallet')
      .gte('created_at', sevenDaysAgo)
      .not('copied_trade_id', 'is', null),

    // Query 2: Platform stats (all time)
    supabase
      .from(ordersTable)
      .select('copied_trader_username, copy_user_id, roi, market_resolved')
      .not('copied_trade_id', 'is', null),

    // Query 3: Recent activity (only copied trades)
    supabase
      .from(ordersTable)
      .select('copied_trader_username, copied_trader_wallet, copied_market_title, outcome, created_at')
      .not('copied_trade_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20),

    // Query 4: Newly tracked traders + markets (7 days)
    supabase
      .from(ordersTable)
      .select('copied_trader_username, copied_trader_wallet, copied_market_title, roi, market_resolved, created_at')
      .gte('created_at', sevenDaysAgo)
      .not('copied_trade_id', 'is', null),
  ])

  // Process Query 1: Most Copied Traders
  if (queries[0].status === 'fulfilled' && !queries[0].value.error) {
    const data = queries[0].value.data || []
    const traderCounts = new Map<string, { username: string; wallet: string; count: number }>()
    
    data.forEach((trade: any) => {
      const key = trade.copied_trader_wallet
      if (!traderCounts.has(key)) {
        traderCounts.set(key, {
          username: trade.copied_trader_username,
          wallet: trade.copied_trader_wallet,
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
    
    const uniqueTraders = new Set(data.map((t: any) => t.copied_trader_username)).size
    const activeUsers = new Set(data.map((t: any) => t.copy_user_id)).size
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
    recentActivity = (queries[2].value.data || []).map((a: any) => {
      const marketTitle = a.copied_market_title || ''
      return {
      trader_username: a.copied_trader_username,
      trader_wallet: a.copied_trader_wallet || '',
      market_title: marketTitle,
      market_title_truncated: truncate(marketTitle, 60),
      outcome: a.outcome,
      created_at: a.created_at,
      time_formatted: formatDateTime(a.created_at)
    }})
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
      const key = trade.copied_trader_wallet
      const marketTitle = trade.copied_market_title || ''
      if (!traderFirstSeen.has(key)) {
        traderFirstSeen.set(key, {
          username: trade.copied_trader_username,
          wallet: trade.copied_trader_wallet,
          firstCopied: trade.created_at,
          markets: new Set([marketTitle])
        })
      } else {
        const existing = traderFirstSeen.get(key)!
        if (trade.created_at && trade.created_at < existing.firstCopied) {
          existing.firstCopied = trade.created_at
        }
        existing.markets.add(marketTitle)
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
      const key = trade.copied_market_title || ''
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

  // NEW: Query for fastest growing traders (follower growth)
  let fastestGrowingTraders: SectionBData['fastestGrowingTraders'] = []
  try {
    // Get all follows
    const { data: allFollows, error: followsError } = await supabase
      .from('follows')
      .select('trader_wallet, created_at')

    if (!followsError && allFollows) {
      const now = new Date()
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      
      // Group by trader
      const traderFollowers = new Map<string, { total: number, recent: number }>()
      
      allFollows.forEach((follow: any) => {
        const wallet = follow.trader_wallet
        if (!traderFollowers.has(wallet)) {
          traderFollowers.set(wallet, { total: 0, recent: 0 })
        }
        const stats = traderFollowers.get(wallet)!
        stats.total++
        
        if (new Date(follow.created_at) >= sevenDaysAgo) {
          stats.recent++
        }
      })
      
      // Get unique wallets for username lookup (lowercase for consistency)
      const uniqueWallets = Array.from(traderFollowers.keys()).map(w => w.toLowerCase())
      
      // Query copied trades for usernames (case-insensitive)
    const { data: traderNames } = await supabase
        .from(ordersTable)
        .select('copied_trader_wallet, copied_trader_username')
        .in('copied_trader_wallet', uniqueWallets)
        .not('copied_trade_id', 'is', null)
      
      // Create username map (case-insensitive keys)
      const usernameMap = new Map<string, string>()
      traderNames?.forEach((trade: any) => {
        const walletLower = trade.copied_trader_wallet?.toLowerCase()
        if (trade.copied_trader_username && walletLower && !usernameMap.has(walletLower)) {
          usernameMap.set(walletLower, trade.copied_trader_username)
        }
      })
      
      console.log(`📝 Found ${usernameMap.size} usernames from copied trades`)
      
      // For wallets still missing names, fetch from Polymarket trades API
      const walletsNeedingNames = uniqueWallets.filter(w => !usernameMap.has(w))
      console.log(`🔍 Need to fetch ${walletsNeedingNames.length} names from Polymarket API`)
      
      if (walletsNeedingNames.length > 0) {
        try {
          // Fetch in optimized batches
          const batchSize = 5 // Increased from 3
          for (let i = 0; i < walletsNeedingNames.length; i += batchSize) {
            const batch = walletsNeedingNames.slice(i, i + batchSize)
            
            const results = await Promise.allSettled(
              batch.map(async (wallet) => {
                try {
                  const res = await fetch(
                    `https://data-api.polymarket.com/trades?limit=1&user=${wallet}`,
                    { signal: AbortSignal.timeout(5000) } // Add timeout
                  )
                  if (res.ok) {
                    const trades = await res.json()
                    if (Array.isArray(trades) && trades.length > 0) {
                      const name = trades[0].name || trades[0].userName
                      if (name) {
                        usernameMap.set(wallet, name)
                        console.log(`✅ Found name for ${wallet.slice(0, 10)}...: ${name}`)
                        return { wallet, name }
                      }
                    }
                  }
                } catch (err) {
                  console.warn(`Failed to fetch name for ${wallet.slice(0, 10)}...`, err)
                }
                return null
              })
            )
            
            // Reduced delay between batches
            if (i + batchSize < walletsNeedingNames.length) {
              await new Promise(resolve => setTimeout(resolve, 150)) // Reduced from 300ms
            }
          }
          
          console.log(`📝 Total usernames found: ${usernameMap.size}/${uniqueWallets.length}`)
        } catch (err) {
          console.error('Error fetching trader names:', err)
        }
      }
      
      // Filter traders with new followers and sort
      fastestGrowingTraders = Array.from(traderFollowers.entries())
        .filter(([_, stats]) => stats.recent > 0)
        .sort((a, b) => b[1].recent - a[1].recent)
        .slice(0, 10)
        .map(([wallet, stats]) => {
          // Case-insensitive lookup
          const walletLower = wallet.toLowerCase()
          const username = usernameMap.get(walletLower) || `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
          
          return {
            trader_username: username,
            trader_wallet: wallet,
            new_followers_7d: stats.recent,
            total_followers: stats.total,
            growth_rate: `+${stats.recent} this week`
          }
        })
    }
  } catch (err) {
    console.error('Failed to fetch fastest growing traders:', err)
    dbErrors.push('Failed to fetch fastest growing traders')
  }

  // NEW: Query for copier performance leaderboard
  let copierPerformance: SectionBData['copierPerformance'] = []
  try {
    // Get all resolved trades with ROI
    const { data: resolvedTrades, error: resolvedError } = await supabase
      .from(ordersTable)
      .select('copy_user_id, copied_trader_username, roi, market_resolved')
      .eq('market_resolved', true)
      .not('roi', 'is', null)
      .not('copied_trade_id', 'is', null)

    if (!resolvedError && resolvedTrades) {
      // Group by user
      const userStats = new Map<string, { 
        trades: number
        rois: number[]
        traders: Set<string>
      }>()
      
      resolvedTrades.forEach((trade: any) => {
        if (!userStats.has(trade.copy_user_id)) {
          userStats.set(trade.copy_user_id, { trades: 0, rois: [], traders: new Set() })
        }
        const stats = userStats.get(trade.copy_user_id)!
        stats.trades++
        stats.rois.push(trade.roi)
        if (trade.copied_trader_username) {
          stats.traders.add(trade.copied_trader_username)
        }
      })
      
      // Get user emails
      const userIds = Array.from(userStats.keys())
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds)
      
      const emailMap = new Map(profiles?.map(p => [p.id, p.email]) || [])
      
      // Calculate performance and sort
      copierPerformance = Array.from(userStats.entries())
        .map(([userId, stats]) => {
          const avgRoi = stats.rois.reduce((a, b) => a + b, 0) / stats.rois.length
          const wins = stats.rois.filter(r => r > 0).length
          const winRate = (wins / stats.rois.length) * 100
          const bestTrader = Array.from(stats.traders)[0] || null
          
          return {
            user_email: emailMap.get(userId) || 'Unknown',
            user_id: userId,
            total_copies: stats.trades,
            avg_roi: avgRoi,
            avg_roi_formatted: formatROI(avgRoi),
            win_rate: winRate,
            win_rate_formatted: `${winRate.toFixed(1)}%`,
            best_trader: bestTrader
          }
        })
        .filter(u => u.total_copies >= 3) // At least 3 resolved trades
        .sort((a, b) => (b.avg_roi || 0) - (a.avg_roi || 0))
        .slice(0, 10)
    }
  } catch (err) {
    console.error('Failed to fetch copier performance:', err)
    dbErrors.push('Failed to fetch copier performance')
  }

  // NEW: Query for ROI by follower count analysis
  let roiByFollowerCount: SectionBData['roiByFollowerCount'] = []
  try {
    // Get all follows to count followers per trader
    const { data: allFollows } = await supabase
      .from('follows')
      .select('trader_wallet')
    
    const followerCounts = new Map<string, number>()
    allFollows?.forEach((f: any) => {
      followerCounts.set(f.trader_wallet, (followerCounts.get(f.trader_wallet) || 0) + 1)
    })
    
    // Get resolved trades with ROI
    const { data: resolvedTrades } = await supabase
      .from(ordersTable)
      .select('copied_trader_wallet, roi, market_resolved')
      .eq('market_resolved', true)
      .not('roi', 'is', null)
      .not('copied_trade_id', 'is', null)
    
    // Bucket traders by follower count
    const buckets = {
      '0 followers': { traders: new Set(), rois: [] as number[] },
      '1-2 followers': { traders: new Set(), rois: [] as number[] },
      '3-5 followers': { traders: new Set(), rois: [] as number[] },
      '6-10 followers': { traders: new Set(), rois: [] as number[] },
      '11+ followers': { traders: new Set(), rois: [] as number[] }
    }
    
    resolvedTrades?.forEach((trade: any) => {
      const followers = followerCounts.get(trade.copied_trader_wallet) || 0
      let bucket: keyof typeof buckets
      
      if (followers === 0) bucket = '0 followers'
      else if (followers <= 2) bucket = '1-2 followers'
      else if (followers <= 5) bucket = '3-5 followers'
      else if (followers <= 10) bucket = '6-10 followers'
      else bucket = '11+ followers'
      
      buckets[bucket].traders.add(trade.copied_trader_wallet)
      buckets[bucket].rois.push(trade.roi)
    })
    
    // Calculate average ROI per bucket
    roiByFollowerCount = Object.entries(buckets)
      .map(([bucket, data]) => ({
        follower_bucket: bucket,
        trader_count: data.traders.size,
        avg_roi: data.rois.length > 0 
          ? data.rois.reduce((a, b) => a + b, 0) / data.rois.length
          : null,
        avg_roi_formatted: data.rois.length > 0
          ? formatROI(data.rois.reduce((a, b) => a + b, 0) / data.rois.length)
          : '--'
      }))
      .filter(b => b.trader_count > 0)
  } catch (err) {
    console.error('Failed to fetch ROI by follower count:', err)
    dbErrors.push('Failed to fetch ROI analysis')
  }

  return {
    mostCopiedTraders,
    platformStats,
    newlyTrackedTraders,
    mostCopiedMarkets,
    recentActivity,
    fastestGrowingTraders,
    copierPerformance,
    roiByFollowerCount,
    dbErrors
  }
}

async function getAdminSession() {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return null
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile?.is_admin) {
    return null
  }

  return user
}

export default async function AdminContentDataPage() {
  const adminUser = await getAdminSession()

  if (!adminUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#05070E] text-white">
        <p className="max-w-md text-center text-lg">
          Access denied. Please log in with an admin account to view this dashboard.
        </p>
      </div>
    )
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

  return <AdminDashboardClient data={data} />
}
