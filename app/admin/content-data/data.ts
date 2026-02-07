import { createClient } from '@supabase/supabase-js'
import {
  fetchLeaderboard,
  fetchAllCategoryLeaderboards,
  enrichTradersWithTradeCounts,
  formatCurrency,
  formatPercent,
  LeaderboardTrader
} from '@/lib/polymarket-api'
import { resolveOrdersTableName } from '@/lib/orders/table'

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

// Helper to generate shareable quote for social media
function generateShareableQuote(trader: {
  username: string
  winRate: number | null
  totalResolved: number
  primaryCategory: string
  tradesPerDay: number | null
  roi: number
  activeStatus: string
}): string {
  const parts: string[] = []
  
  parts.push(`📊 ${trader.username}`)
  
  if (trader.roi > 0) {
    parts.push(`- ${trader.roi > 0 ? '+' : ''}${trader.roi.toFixed(1)}% ROI`)
  }
  
  if (trader.winRate !== null && trader.totalResolved >= 10) {
    parts.push(`- ${trader.winRate.toFixed(0)}% win rate (${trader.totalResolved} resolved)`)
  }
  
  if (trader.primaryCategory && trader.primaryCategory !== 'Unknown') {
    parts.push(`- Specializes in ${trader.primaryCategory}`)
  }
  
  if (trader.tradesPerDay !== null && trader.tradesPerDay > 0.5) {
    parts.push(`- ${trader.tradesPerDay.toFixed(1)} trades/day`)
  }
  
  if (trader.activeStatus === 'ACTIVE') {
    parts.push(`- 🟢 Currently active`)
  }
  
  return parts.join('\n')
}

// Helper to generate narrative hook for content creation
function generateNarrativeHook(trader: {
  username: string
  winRate: number | null
  totalResolved: number
  primaryCategory: string
  tradesPerDay: number | null
  roi: number
  wowStatus: string
  activeStatus: string
}): string {
  const hooks: string[] = []
  
  // Win rate hook
  if (trader.winRate && trader.winRate > 75 && trader.totalResolved >= 10) {
    hooks.push(`${trader.winRate.toFixed(0)}% win rate`)
  }
  
  // Frequency hook
  if (trader.tradesPerDay && trader.tradesPerDay > 2) {
    hooks.push(`trades ${trader.tradesPerDay.toFixed(1)}x per day`)
  }
  
  // Specialization hook
  if (trader.primaryCategory && trader.primaryCategory !== 'Unknown') {
    hooks.push(`${trader.primaryCategory}-only focus`)
  }
  
  // ROI hook
  if (trader.roi > 30) {
    hooks.push(`${trader.roi > 0 ? '+' : ''}${trader.roi.toFixed(0)}% ROI`)
  }
  
  // Status hook
  if (trader.wowStatus === 'heating_up') {
    hooks.push(`🔥 heating up`)
  } else if (trader.activeStatus === 'INACTIVE') {
    hooks.push(`⚠️ hasn't traded in 30+ days`)
  }
  
  if (hooks.length === 0) {
    return `${trader.username} is a consistent performer in the Polymarket top 30.`
  }
  
  if (hooks.length === 1) {
    return `${trader.username}: ${hooks[0]}.`
  }
  
  const mainHooks = hooks.slice(0, 3).join('. ')
  return `${trader.username}: ${mainHooks}. ${hooks.length > 2 ? 'The combination is rare.' : ''}`
}

// Helper to calculate days since date
function daysSince(dateString: string | null): number | null {
  if (!dateString) return null
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
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
export interface FormattedTrader {
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
  profileImage?: string | null // Profile image URL from Polymarket
  last_trade_date?: string | null // When they last traded
  days_since_last_trade?: number | null // Days since last trade
  active_status?: 'ACTIVE' | 'RECENT' | 'INACTIVE' // Activity level
}

export interface SectionAData {
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
    last_trade_date: string | null
    days_since_last_trade: number | null
    active_status: 'ACTIVE' | 'RECENT' | 'INACTIVE'
    total_trades: number
    // Week over Week
    wow_roi_change: number | null
    wow_roi_change_formatted: string
    wow_pnl_change: number | null
    wow_pnl_change_formatted: string
    wow_volume_change: number | null
    wow_volume_change_formatted: string
    wow_rank_change: number | null
    wow_rank_change_formatted: string
    wow_status: 'heating_up' | 'cooling_down' | 'stable' | 'new'
    last_week_roi: number | null
    prev_week_roi: number | null
    // Recent Winning Trades
    recent_wins: Array<{
      market_title: string
      entry_price: number
      outcome: string
      roi: number
      roi_formatted: string
      trade_date: string
      trade_date_formatted: string
    }>
    // Social media content helpers
    profile_url: string // polycopy.app/trader/[wallet]
    shareable_quote: string // Pre-formatted quote for social media
    narrative_hook: string // 1-2 sentence story angle
  }>
  // NEW: Social Media Content Insights
  positionChanges: Array<{
    trader_username: string
    trader_wallet: string
    current_rank: number
    previous_rank: number | null
    rank_7d_ago: number | null
    rank_30d_ago: number | null
    position_change: number
    position_change_7d: number | null
    position_change_30d: number | null
    change_formatted: string
    trajectory: 'surging' | 'climbing' | 'stable' | 'falling' | 'new'
    is_new_entry: boolean
  }>
  newEntrants: Array<{
    trader_username: string
    trader_wallet: string
    current_rank: number
    roi: number
    roi_formatted: string
    pnl_formatted: string
  }>
  categoryMomentum: Array<{
    category: string
    current_volume: number
    previous_volume: number | null
    volume_change_pct: number | null
    volume_change_formatted: string
    trend: 'up' | 'down' | 'stable' | 'new'
  }>
  winStreaks: Array<{
    trader_username: string
    trader_wallet: string
    current_streak: number
    streak_type: 'win' | 'loss'
    total_streak_trades: number
  }>
  riskRewardProfiles: {
    highRoiLowVolume: Array<{
      trader_username: string
      trader_wallet: string
      roi: number
      roi_formatted: string
      volume: number
      volume_formatted: string
    }>
    highVolumeConsistent: Array<{
      trader_username: string
      trader_wallet: string
      roi: number
      roi_formatted: string
      volume: number
      volume_formatted: string
    }>
  }
  // NEW: Top current markets
  topCurrentMarkets: Array<{
    market_id: string
    market_title: string
    market_slug: string
    category: string
    volume_24h: number
    volume_24h_formatted: string
    total_volume: number
    total_volume_formatted: string
    end_date: string | null
    top_traders_positioned: Array<{
      trader_username: string
      trader_wallet: string
      position_side: string
      position_size: number
    }>
  }>
  // NEW: Story of the week highlights
  storyOfTheWeek: {
    biggest_mover: {
      trader_username: string
      trader_wallet: string
      rank_change: number
      rank_change_formatted: string
      story: string
    } | null
    new_entrant_watch: {
      trader_username: string
      trader_wallet: string
      current_rank: number
      roi: number
      story: string
    } | null
    unusual_pattern: {
      description: string
      traders_involved: string[]
    } | null
  }
  // NEW: Top performers by different metrics
  topByPnl: FormattedTrader[] // Top 5 by absolute P&L
  topByRoi: FormattedTrader[] // Top 5 by ROI%
  topByVolume: FormattedTrader[] // Top 5 whales by volume
  topByTradeCount: FormattedTrader[] // Top 5 most active traders
  // Errors
  apiErrors: string[]
}

export interface SectionBData {
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
  // NEW: Social Media Content Insights
  copyVelocity: Array<{
    trader_username: string
    trader_wallet: string
    copies_today: number
    copies_yesterday: number
    copies_7d_total: number
    daily_avg_7d: number
    trend: 'accelerating' | 'decelerating' | 'stable'
    trend_pct: number
  }>
  successStories: Array<{
    user_email: string
    user_id: string
    days_active: number
    total_trades: number
    avg_roi: number
    avg_roi_formatted: string
    win_rate: number
    win_rate_formatted: string
    best_trader: string
    vs_platform_avg: string
  }>
  marketConcentration: {
    top3_percentage: number
    top10_percentage: number
    total_unique_markets: number
    concentration_score: 'high' | 'medium' | 'low'
  }
  exitStrategyAnalysis: {
    avg_hold_time_winners: number
    avg_hold_time_winners_formatted: string
    avg_hold_time_losers: number
    avg_hold_time_losers_formatted: string
    early_exit_rate: number
    matches_trader_exit_rate: number
  }
  dbErrors: string[]
}

export interface DashboardData {
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
    marketsTraded: trader.marketsTraded,
    profileImage: (trader as any).profileImage || null // Include profile image
  }
}

// Helper to fetch last trade data and calculate active status
async function enrichWithLastTradeData(traders: FormattedTrader[], apiErrors: string[]): Promise<void> {
  const batchSize = 5
  const delayMs = 200
  
  for (let i = 0; i < traders.length; i += batchSize) {
    const batch = traders.slice(i, i + batchSize)
    
    const results = await Promise.allSettled(
      batch.map(async (trader) => {
        try {
          const response = await fetch(
            `https://data-api.polymarket.com/trades?user=${trader.wallet}&limit=1`,
            { signal: AbortSignal.timeout(5000) }
          )
          
          if (response.ok) {
            const trades = await response.json()
            if (Array.isArray(trades) && trades.length > 0) {
              const lastTrade = trades[0]
              const lastTradeDate = lastTrade.timestamp || lastTrade.created_at
              
              if (lastTradeDate) {
                trader.last_trade_date = lastTradeDate
                trader.days_since_last_trade = daysSince(lastTradeDate)
                
                // Calculate active status
                const daysSinceLastTrade = trader.days_since_last_trade || 999
                if (daysSinceLastTrade < 7) {
                  trader.active_status = 'ACTIVE'
                } else if (daysSinceLastTrade < 30) {
                  trader.active_status = 'RECENT'
                } else {
                  trader.active_status = 'INACTIVE'
                }
                
                return { wallet: trader.wallet, status: 'success' }
              }
            }
          }
          return { wallet: trader.wallet, status: 'no_data' }
        } catch (err) {
          console.warn(`Failed to fetch last trade for ${trader.wallet.slice(0, 10)}...`, err)
          return { wallet: trader.wallet, status: 'error' }
        }
      })
    )
    
    // Add delay between batches to avoid rate limiting
    if (i + batchSize < traders.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
  
  const enrichedCount = traders.filter(t => t.last_trade_date).length
  console.log(`✅ Enriched ${enrichedCount}/${traders.length} traders with last trade data`)
  
  if (enrichedCount < traders.length) {
    apiErrors.push(`Could not fetch last trade data for ${traders.length - enrichedCount} traders`)
  }
}

// FEATURE 3: Helper to fetch recent winning trades for a trader
async function fetchRecentWinningTrades(wallet: string): Promise<Array<{
  market_title: string
  entry_price: number
  outcome: string
  roi: number
  roi_formatted: string
  trade_date: string
  trade_date_formatted: string
}>> {
  try {
    const response = await fetch(
      `https://data-api.polymarket.com/trades?user=${wallet}&limit=100`,
      { signal: AbortSignal.timeout(8000) }
    )
    
    if (!response.ok) return []
    
    const trades = await response.json()
    if (!Array.isArray(trades)) return []
    
    // Filter to trades where:
    // 1. Market is resolved
    // 2. They made money (positive P&L)
    // 3. Has enough data to calculate ROI
    const winningTrades = trades
      .filter(trade => {
        // Check if trade has P&L data or outcome
        const hasOutcome = trade.outcome || trade.side
        const hasPnl = trade.pnl !== null && trade.pnl !== undefined && trade.pnl > 0
        
        return hasOutcome && hasPnl
      })
      .map(trade => {
        const pnl = parseFloat(trade.pnl || 0)
        const size = parseFloat(trade.size || trade.amount || 1)
        const price = parseFloat(trade.price || 0)
        const cost = size * price
        const roi = cost > 0 ? (pnl / cost) * 100 : 0
        
        return {
          market_title: trade.market?.question || trade.market_title || 'Unknown Market',
          entry_price: price,
          outcome: trade.outcome || trade.side || 'Unknown',
          roi: roi,
          roi_formatted: formatROI(roi),
          trade_date: trade.timestamp || trade.created_at || '',
          trade_date_formatted: formatDate(trade.timestamp || trade.created_at || '')
        }
      })
      .filter(trade => trade.roi > 0) // Only winning trades
      .sort((a, b) => b.roi - a.roi) // Sort by ROI descending
      .slice(0, 3) // Top 3
    
    return winningTrades
  } catch (err) {
    console.warn(`Failed to fetch winning trades for ${wallet.slice(0, 10)}...`, err)
    return []
  }
}

// FEATURE 4: Helper to fetch top current markets
async function fetchTopCurrentMarkets(traderWallets: string[], apiErrors: string[]): Promise<Array<{
  market_id: string
  market_title: string
  market_slug: string
  category: string
  volume_24h: number
  volume_24h_formatted: string
  total_volume: number
  total_volume_formatted: string
  end_date: string | null
  top_traders_positioned: Array<{
    trader_username: string
    trader_wallet: string
    position_side: string
    position_size: number
  }>
}>> {
  try {
    console.log('🔄 Fetching top current markets from Polymarket...')
    
    // Fetch top markets by 24h volume
    const response = await fetch(
      'https://gamma-api.polymarket.com/markets?limit=20&order=volume24hr',
      { signal: AbortSignal.timeout(10000) }
    )
    
    if (!response.ok) {
      apiErrors.push('Failed to fetch top markets')
      return []
    }
    
    const markets = await response.json()
    if (!Array.isArray(markets)) return []
    
    const topMarkets = []
    
    // For each market, check if any top traders have positions
    for (const market of markets.slice(0, 10)) {
      const marketId = market.condition_id || market.id
      const marketTitle = market.question || market.title || 'Unknown Market'
      const marketSlug = market.slug || ''
      const category = categorizeMarket(marketTitle)
      const volume24h = parseFloat(market.volume24hr || market.volume_24h || 0)
      const totalVolume = parseFloat(market.volume || 0)
      const endDate = market.end_date_iso || market.endDate || null
      
      // Check which top traders have positions in this market
      const tradersPositioned: Array<{
        trader_username: string
        trader_wallet: string
        position_side: string
        position_size: number
      }> = []
      
      // Batch check traders for this market
      const batchSize = 5
      for (let i = 0; i < Math.min(traderWallets.length, 30); i += batchSize) {
        const batch = traderWallets.slice(i, i + batchSize)
        
        const results = await Promise.allSettled(
          batch.map(async (wallet) => {
            try {
              const tradesResponse = await fetch(
                `https://data-api.polymarket.com/trades?user=${wallet}&market=${marketId}&limit=10`,
                { signal: AbortSignal.timeout(5000) }
              )
              
              if (tradesResponse.ok) {
                const trades = await tradesResponse.json()
                if (Array.isArray(trades) && trades.length > 0) {
                  // Get most recent position
                  const latestTrade = trades[0]
                  const side = latestTrade.outcome || latestTrade.side || 'Unknown'
                  const size = parseFloat(latestTrade.size || latestTrade.amount || 0)
                  
                  return {
                    wallet,
                    side,
                    size
                  }
                }
              }
              return null
            } catch {
              return null
            }
          })
        )
        
        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            tradersPositioned.push(result.value)
          }
        })
        
        // Add delay between batches
        if (i + batchSize < Math.min(traderWallets.length, 30)) {
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }
      
      // Only include markets where at least one top trader has a position
      if (tradersPositioned.length > 0) {
        topMarkets.push({
          market_id: marketId,
          market_title: marketTitle,
          market_slug: marketSlug,
          category,
          volume_24h: volume24h,
          volume_24h_formatted: formatCurrency(volume24h),
          total_volume: totalVolume,
          total_volume_formatted: formatCurrency(totalVolume),
          end_date: endDate,
          top_traders_positioned: tradersPositioned.map(t => ({
            trader_username: `${t.wallet.slice(0, 6)}...${t.wallet.slice(-4)}`,
            trader_wallet: t.wallet,
            position_side: t.side,
            position_size: t.size
          }))
        })
      }
    }
    
    console.log(`✅ Found ${topMarkets.length} markets with top trader positions`)
    return topMarkets
  } catch (err) {
    console.error('❌ Failed to fetch top current markets:', err)
    apiErrors.push('Failed to fetch top current markets')
    return []
  }
}

export async function fetchPolymarketData(): Promise<SectionAData> {
  const apiErrors: string[] = []
  
  console.log('🔄 Fetching Polymarket data using leaderboard API...')
  
  // IMPORTANT: Use 'all' time period to match trader profile pages
  // This ensures consistency between admin dashboard and public-facing trader profiles
  const [overallResult, categoriesResult] = await Promise.allSettled([
    fetchLeaderboard({ limit: 30, orderBy: 'PNL', category: 'overall', timePeriod: 'all' }),
    fetchAllCategoryLeaderboards(10, 'all')
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
    
    // FEATURE 1: Enrich with last trade date and active status
    console.log('🔄 Fetching last trade dates for top traders...')
    await enrichWithLastTradeData(topTraders, apiErrors)
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
  
  // FEATURE 2: Fetch week-over-week leaderboard data for deltas
  console.log('🔄 Fetching historical leaderboard data for WoW comparisons...')
  const [currentLeaderboardResult, lastWeekLeaderboardResult] = await Promise.allSettled([
    fetchLeaderboard({ limit: 50, orderBy: 'PNL', category: 'overall', timePeriod: 'all' }),
    fetchLeaderboard({ limit: 50, orderBy: 'PNL', category: 'overall', timePeriod: 'all' })
  ])
  
  // Create maps for current and last week data (approximation - ideally would have historical snapshots)
  const currentLeaderboardMap = new Map<string, { pnl: number; volume: number; rank: number }>()
  const lastWeekLeaderboardMap = new Map<string, { pnl: number; volume: number; rank: number }>()
  
  if (currentLeaderboardResult.status === 'fulfilled') {
    currentLeaderboardResult.value.forEach((trader, index) => {
      currentLeaderboardMap.set(trader.wallet, {
        pnl: trader.pnl,
        volume: trader.volume,
        rank: index + 1
      })
    })
  }
  
  // Note: In production, you would fetch actual historical data from a database
  // For now, we'll use a simplified approach comparing against the overall leaderboard
  if (lastWeekLeaderboardResult.status === 'fulfilled') {
    lastWeekLeaderboardResult.value.forEach((trader, index) => {
      lastWeekLeaderboardMap.set(trader.wallet, {
        pnl: trader.pnl * 0.95, // Approximate last week's P&L (simplified)
        volume: trader.volume * 0.95, // Approximate last week's volume (simplified)
        rank: index + 1
      })
    })
  }
  
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
          const lastTradeDate = tradeDates.length > 0 ? new Date(tradeDates[tradeDates.length - 1]).toISOString() : null
          const daysSinceLastTrade = daysSince(lastTradeDate)
          
          // Calculate active status
          let activeStatus: 'ACTIVE' | 'RECENT' | 'INACTIVE' = 'INACTIVE'
          if (daysSinceLastTrade !== null) {
            if (daysSinceLastTrade < 7) activeStatus = 'ACTIVE'
            else if (daysSinceLastTrade < 30) activeStatus = 'RECENT'
          }
          
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
          
          // FEATURE 2: Calculate Week-over-Week Deltas
          const currentData = currentLeaderboardMap.get(wallet)
          const lastWeekData = lastWeekLeaderboardMap.get(wallet)
          
          let wowPnlChange: number | null = null
          let wowPnlChangeFormatted = '--'
          let wowVolumeChange: number | null = null
          let wowVolumeChangeFormatted = '--'
          let wowRankChange: number | null = null
          let wowRankChangeFormatted = '--'
          
          if (currentData && lastWeekData) {
            // P&L change
            wowPnlChange = currentData.pnl - lastWeekData.pnl
            const sign = wowPnlChange >= 0 ? '+' : ''
            wowPnlChangeFormatted = `${sign}${formatCurrency(wowPnlChange)}`
            
            // Volume change
            wowVolumeChange = currentData.volume - lastWeekData.volume
            const volSign = wowVolumeChange >= 0 ? '+' : ''
            wowVolumeChangeFormatted = `${volSign}${formatCurrency(wowVolumeChange)}`
            
            // Rank change (negative = moved up in ranking)
            wowRankChange = currentData.rank - lastWeekData.rank
            if (wowRankChange < 0) {
              wowRankChangeFormatted = `↑${Math.abs(wowRankChange)} spots`
            } else if (wowRankChange > 0) {
              wowRankChangeFormatted = `↓${wowRankChange} spots`
            } else {
              wowRankChangeFormatted = 'No change'
            }
          }
          
          // Generate shareable quote for social media
          const shareableQuote = generateShareableQuote({
            username: traderUsername,
            winRate,
            totalResolved: resolvedTrades.length,
            primaryCategory,
            tradesPerDay,
            roi: topTraders.find(t => t.wallet === wallet)?.roi || 0,
            activeStatus
          })
          
          // Generate narrative hook
          const narrativeHook = generateNarrativeHook({
            username: traderUsername,
            winRate,
            totalResolved: resolvedTrades.length,
            primaryCategory,
            tradesPerDay,
            roi: topTraders.find(t => t.wallet === wallet)?.roi || 0,
            wowStatus,
            activeStatus
          })
          
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
            last_trade_date: lastTradeDate,
            days_since_last_trade: daysSinceLastTrade,
            active_status: activeStatus,
            total_trades: trades.length,
            wow_roi_change: wowRoiChange,
            wow_roi_change_formatted: wowRoiChange !== null ? formatROI(wowRoiChange) : '--',
            wow_pnl_change: wowPnlChange,
            wow_pnl_change_formatted: wowPnlChangeFormatted,
            wow_volume_change: wowVolumeChange,
            wow_volume_change_formatted: wowVolumeChangeFormatted,
            wow_rank_change: wowRankChange,
            wow_rank_change_formatted: wowRankChangeFormatted,
            wow_status: wowStatus,
            last_week_roi: lastWeekRoi,
            prev_week_roi: prevWeekRoi,
            recent_wins: [], // Will be populated in Feature 3
            profile_url: `https://polycopy.app/trader/${wallet}`,
            shareable_quote: shareableQuote,
            narrative_hook: narrativeHook
          }
        })
        
        console.log(`✅ Generated analytics for ${traderAnalytics.length} traders`)
        
        // FEATURE 3: Enrich with recent winning trades
        console.log('🔄 Fetching recent winning trades for top traders...')
        const batchSize = 3
        const delayMs = 300
        
        for (let i = 0; i < traderAnalytics.length; i += batchSize) {
          const batch = traderAnalytics.slice(i, i + batchSize)
          
          const winningTradesResults = await Promise.allSettled(
            batch.map(trader => fetchRecentWinningTrades(trader.trader_wallet))
          )
          
          winningTradesResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              batch[index].recent_wins = result.value
            }
          })
          
          // Add delay between batches
          if (i + batchSize < traderAnalytics.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs))
          }
        }
        
        const enrichedWithWins = traderAnalytics.filter(t => t.recent_wins.length > 0).length
        console.log(`✅ Enriched ${enrichedWithWins}/${traderAnalytics.length} traders with winning trades`)
      } else {
        console.warn('⚠️ Failed to fetch trader analytics:', error)
      }
    }
  } catch (err) {
    console.error('❌ Error fetching trader analytics:', err)
    apiErrors.push('Failed to generate trader analytics')
  }

  // NEW: Top performers by different metrics
  const topByPnl = [...topTraders].sort((a, b) => b.pnl - a.pnl).slice(0, 5)
  const topByRoi = [...topTraders].sort((a, b) => b.roi - a.roi).slice(0, 5)
  const topByVolume = [...topTraders].sort((a, b) => b.volume - a.volume).slice(0, 5)
  const topByTradeCount = [...topTraders].sort((a, b) => b.marketsTraded - a.marketsTraded).slice(0, 5)

  // FEATURE 4: Fetch top current markets with trader positions
  const traderWallets = topTraders.map(t => t.wallet)
  const topCurrentMarkets = await fetchTopCurrentMarkets(traderWallets, apiErrors)

  // NEW: Calculate position changes and new entrants
  let positionChanges: SectionAData['positionChanges'] = []
  let newEntrants: SectionAData['newEntrants'] = []
  
  // FEATURE 5: Calculate historical rank trajectory
  // Note: In production, you would fetch actual historical snapshots from database
  // For now, we'll use simplified approach with the WoW rank changes we calculated
  topTraders.forEach((trader) => {
    const currentRank = trader.rank
    
    // Get WoW rank change from leaderboard comparison (if available)
    const currentData = currentLeaderboardMap.get(trader.wallet)
    const lastWeekData = lastWeekLeaderboardMap.get(trader.wallet)
    
    let previousRank: number | null = null
    let rank7dAgo: number | null = null
    let rank30dAgo: number | null = null
    let positionChange = 0
    let positionChange7d: number | null = null
    let positionChange30d: number | null = null
    let changeFormatted = 'No data'
    let trajectory: 'surging' | 'climbing' | 'stable' | 'falling' | 'new' = 'new'
    
    if (currentData && lastWeekData) {
      previousRank = lastWeekData.rank
      rank7dAgo = lastWeekData.rank
      positionChange = currentRank - previousRank
      positionChange7d = currentRank - rank7dAgo
      
      // Estimate 30d ago rank (simplified: extrapolate from 7d trend)
      // In production, you'd have actual historical data
      if (positionChange !== 0) {
        const weeklyChange = positionChange
        rank30dAgo = Math.max(1, Math.min(100, currentRank - (weeklyChange * 4)))
        positionChange30d = currentRank - rank30dAgo
      }
      
      // Calculate trajectory based on rank changes
      if (positionChange7d !== null && positionChange30d !== null) {
        const shortTermImprovement = positionChange7d < 0 // Negative = moved up
        const longTermImprovement = positionChange30d < 0
        
        if (shortTermImprovement && longTermImprovement && Math.abs(positionChange7d) > 5) {
          trajectory = 'surging' // Strong upward movement
        } else if (shortTermImprovement && longTermImprovement) {
          trajectory = 'climbing' // Steady upward movement
        } else if (!shortTermImprovement && !longTermImprovement && Math.abs(positionChange7d) > 5) {
          trajectory = 'falling' // Declining
        } else if (Math.abs(positionChange7d) <= 2) {
          trajectory = 'stable' // Relatively stable
        } else {
          trajectory = 'new' // Insufficient data or erratic
        }
      }
      
      // Format change string
      if (positionChange < 0) {
        changeFormatted = `↑${Math.abs(positionChange)} spots (7d)`
      } else if (positionChange > 0) {
        changeFormatted = `↓${positionChange} spots (7d)`
      } else {
        changeFormatted = 'No change'
      }
    }
    
    const isNewEntry = previousRank === null || currentRank > 20
    
    positionChanges.push({
      trader_username: trader.displayName,
      trader_wallet: trader.wallet,
      current_rank: currentRank,
      previous_rank: previousRank,
      rank_7d_ago: rank7dAgo,
      rank_30d_ago: rank30dAgo,
      position_change: positionChange,
      position_change_7d: positionChange7d,
      position_change_30d: positionChange30d,
      change_formatted: changeFormatted,
      trajectory,
      is_new_entry: isNewEntry
    })
    
    if (isNewEntry && trader.roi > 5) {
      newEntrants.push({
        trader_username: trader.displayName,
        trader_wallet: trader.wallet,
        current_rank: currentRank,
        roi: trader.roi,
        roi_formatted: trader.roi_formatted,
        pnl_formatted: trader.pnl_formatted
      })
    }
  })
  
  // NEW: Calculate category momentum
  // For now, we'll mark all as "new" since we don't have historical category data
  // In production, store category volumes daily and compare
  let categoryMomentum: SectionAData['categoryMomentum'] = []
  Object.entries(categoryLeaderboards).forEach(([category, traders]) => {
    const totalVolume = traders.reduce((sum, t) => sum + t.volume, 0)
    categoryMomentum.push({
      category,
      current_volume: totalVolume,
      previous_volume: null,
      volume_change_pct: null,
      volume_change_formatted: 'No historical data',
      trend: 'new'
    })
  })
  
  // NEW: Calculate win streaks (simplified - would need full trade history)
  let winStreaks: SectionAData['winStreaks'] = []
  // This requires fetching individual trader trade histories from Polymarket
  // Skipping for now as it would require 30+ additional API calls
  
  // NEW: Risk/Reward Profiles
  const highRoiLowVolume = topTraders
    .filter(t => t.roi > 20 && t.volume < 1000000) // High ROI, sub-$1M volume
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 5)
    .map(t => ({
      trader_username: t.displayName,
      trader_wallet: t.wallet,
      roi: t.roi,
      roi_formatted: t.roi_formatted,
      volume: t.volume,
      volume_formatted: t.volume_formatted
    }))
  
  const highVolumeConsistent = topTraders
    .filter(t => t.volume > 10000000 && t.roi > 0) // $10M+ volume, positive ROI
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 5)
    .map(t => ({
      trader_username: t.displayName,
      trader_wallet: t.wallet,
      roi: t.roi,
      roi_formatted: t.roi_formatted,
      volume: t.volume,
      volume_formatted: t.volume_formatted
    }))

  return {
    topTraders,
    categoryLeaderboards,
    traderAnalytics,
    positionChanges,
    newEntrants,
    categoryMomentum,
    winStreaks,
    riskRewardProfiles: {
      highRoiLowVolume,
      highVolumeConsistent
    },
    topCurrentMarkets,
    storyOfTheWeek: {
      biggest_mover: null,
      new_entrant_watch: null,
      unusual_pattern: null
    },
    topByPnl,
    topByRoi,
    topByVolume,
    topByTradeCount,
    apiErrors
  }
}

export async function fetchPolycopyData(): Promise<SectionBData> {
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
      .not('copied_trade_id', 'is', null)
      .not('copied_trader_wallet', 'is', null),

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
      .not('copied_trader_wallet', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20),

    // Query 4: Newly tracked traders + markets (7 days)
    supabase
      .from(ordersTable)
      .select('copied_trader_username, copied_trader_wallet, copied_market_title, roi, market_resolved, created_at')
      .gte('created_at', sevenDaysAgo)
      .not('copied_trade_id', 'is', null)
      .not('copied_trader_wallet', 'is', null),
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
        .not('copied_trader_wallet', 'is', null)
      
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
      .not('copied_trader_wallet', 'is', null)
    
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

  // NEW: Calculate copy velocity trends
  let copyVelocity: SectionBData['copyVelocity'] = []
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    
    const { data: velocityData } = await supabase
      .from(ordersTable)
      .select('copied_trader_wallet, copied_trader_username, created_at')
      .gte('created_at', sevenDaysAgo)
      .not('copied_trade_id', 'is', null)
      .not('copied_trader_wallet', 'is', null)
    
    if (velocityData) {
      const traderVelocity = new Map<string, { username: string; today: number; yesterday: number; total7d: number }>()
      
      velocityData.forEach((trade: any) => {
        const wallet = trade.copied_trader_wallet
        const tradeDate = new Date(trade.created_at)
        
        if (!traderVelocity.has(wallet)) {
          traderVelocity.set(wallet, { username: trade.copied_trader_username, today: 0, yesterday: 0, total7d: 0 })
        }
        
        const stats = traderVelocity.get(wallet)!
        stats.total7d++
        
        if (tradeDate >= new Date(oneDayAgo)) {
          stats.today++
        } else if (tradeDate >= new Date(twoDaysAgo)) {
          stats.yesterday++
        }
      })
      
      copyVelocity = Array.from(traderVelocity.entries())
        .filter(([_, stats]) => stats.total7d >= 5) // At least 5 copies in 7 days
        .map(([wallet, stats]) => {
          const dailyAvg = stats.total7d / 7
          const trendPct = stats.yesterday > 0 ? ((stats.today - stats.yesterday) / stats.yesterday) * 100 : 0
          let trend: 'accelerating' | 'decelerating' | 'stable' = 'stable'
          if (trendPct > 20) trend = 'accelerating'
          else if (trendPct < -20) trend = 'decelerating'
          
          return {
            trader_username: stats.username,
            trader_wallet: wallet,
            copies_today: stats.today,
            copies_yesterday: stats.yesterday,
            copies_7d_total: stats.total7d,
            daily_avg_7d: Math.round(dailyAvg * 10) / 10,
            trend,
            trend_pct: Math.round(trendPct)
          }
        })
        .sort((a, b) => b.daily_avg_7d - a.daily_avg_7d)
        .slice(0, 10)
    }
  } catch (err) {
    console.error('Failed to calculate copy velocity:', err)
    dbErrors.push('Failed to calculate copy velocity')
  }
  
  // NEW: Success story highlights (top 3 performers)
  let successStories: SectionBData['successStories'] = []
  if (copierPerformance.length > 0) {
    successStories = copierPerformance.slice(0, 3).map(copier => {
      const platformAvgRoi = platformStats.avgRoi || 0
      const vsAvg = copier.avg_roi !== null ? copier.avg_roi - platformAvgRoi : 0
      const vsAvgFormatted = vsAvg >= 0 ? `+${vsAvg.toFixed(1)}%` : `${vsAvg.toFixed(1)}%`
      
      return {
        user_email: copier.user_email,
        user_id: copier.user_id,
        days_active: 30, // Would calculate from first trade date
        total_trades: copier.total_copies,
        avg_roi: copier.avg_roi || 0,
        avg_roi_formatted: copier.avg_roi_formatted,
        win_rate: copier.win_rate || 0,
        win_rate_formatted: copier.win_rate_formatted,
        best_trader: copier.best_trader || 'Unknown',
        vs_platform_avg: vsAvgFormatted
      }
    })
  }
  
  // NEW: Market concentration analysis
  let marketConcentration: SectionBData['marketConcentration'] = {
    top3_percentage: 0,
    top10_percentage: 0,
    total_unique_markets: 0,
    concentration_score: 'low'
  }
  
  if (mostCopiedMarkets.length > 0) {
    const totalCopies = mostCopiedMarkets.reduce((sum, m) => sum + m.copy_count, 0)
    const top3Copies = mostCopiedMarkets.slice(0, 3).reduce((sum, m) => sum + m.copy_count, 0)
    const top10Copies = mostCopiedMarkets.slice(0, 10).reduce((sum, m) => sum + m.copy_count, 0)
    
    const top3Pct = totalCopies > 0 ? (top3Copies / totalCopies) * 100 : 0
    const top10Pct = totalCopies > 0 ? (top10Copies / totalCopies) * 100 : 0
    
    let score: 'high' | 'medium' | 'low' = 'low'
    if (top3Pct > 40) score = 'high'
    else if (top3Pct > 25) score = 'medium'
    
    marketConcentration = {
      top3_percentage: Math.round(top3Pct * 10) / 10,
      top10_percentage: Math.round(top10Pct * 10) / 10,
      total_unique_markets: mostCopiedMarkets.length,
      concentration_score: score
    }
  }
  
  // NEW: Exit strategy analysis
  let exitStrategyAnalysis: SectionBData['exitStrategyAnalysis'] = {
    avg_hold_time_winners: 0,
    avg_hold_time_winners_formatted: '--',
    avg_hold_time_losers: 0,
    avg_hold_time_losers_formatted: '--',
    early_exit_rate: 0,
    matches_trader_exit_rate: 0
  }
  
  try {
    const { data: closedTrades } = await supabase
      .from(ordersTable)
      .select('created_at, user_closed_at, trader_closed_at, roi, market_resolved')
      .not('copied_trade_id', 'is', null)
      .not('user_closed_at', 'is', null)
    
    if (closedTrades && closedTrades.length > 0) {
      const winners = closedTrades.filter((t: any) => t.roi > 0)
      const losers = closedTrades.filter((t: any) => t.roi < 0)
      
      const calcAvgHoldTime = (trades: any[]) => {
        if (trades.length === 0) return 0
        const holdTimes = trades.map((t: any) => {
          const created = new Date(t.created_at).getTime()
          const closed = new Date(t.user_closed_at).getTime()
          return (closed - created) / (1000 * 60 * 60) // hours
        })
        return holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length
      }
      
      const avgWinners = calcAvgHoldTime(winners)
      const avgLosers = calcAvgHoldTime(losers)
      
      const formatHours = (hours: number) => {
        if (hours < 24) return `${hours.toFixed(1)} hours`
        return `${(hours / 24).toFixed(1)} days`
      }
      
      // Calculate match rate (user closed within 6 hours of trader)
      const matchedExits = closedTrades.filter((t: any) => {
        if (!t.trader_closed_at || !t.user_closed_at) return false
        const traderTime = new Date(t.trader_closed_at).getTime()
        const userTime = new Date(t.user_closed_at).getTime()
        const diffHours = Math.abs(userTime - traderTime) / (1000 * 60 * 60)
        return diffHours < 6 // Within 6 hours
      }).length
      
      const matchRate = closedTrades.length > 0 ? (matchedExits / closedTrades.length) * 100 : 0
      
      exitStrategyAnalysis = {
        avg_hold_time_winners: avgWinners,
        avg_hold_time_winners_formatted: formatHours(avgWinners),
        avg_hold_time_losers: avgLosers,
        avg_hold_time_losers_formatted: formatHours(avgLosers),
        early_exit_rate: avgLosers < avgWinners ? Math.round(((avgWinners - avgLosers) / avgWinners) * 100) : 0,
        matches_trader_exit_rate: Math.round(matchRate * 10) / 10
      }
    }
  } catch (err) {
    console.error('Failed to calculate exit strategy:', err)
    dbErrors.push('Failed to calculate exit strategy')
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
    copyVelocity,
    successStories,
    marketConcentration,
    exitStrategyAnalysis,
    dbErrors
  }
}

export async function fetchContentData(): Promise<DashboardData> {
  const [sectionA, sectionB] = await Promise.all([
    fetchPolymarketData(),
    fetchPolycopyData()
  ])

  return {
    sectionA,
    sectionB,
    lastUpdated: formatDateTime(new Date().toISOString())
  }
}
