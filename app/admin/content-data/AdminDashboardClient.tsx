'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

// Formatted trader from Polymarket leaderboard
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
  profileImage?: string | null
  last_trade_date?: string | null
  days_since_last_trade?: number | null
  active_status?: 'ACTIVE' | 'RECENT' | 'INACTIVE'
}

// Section A: Polymarket API Data
interface SectionAData {
  topTraders: FormattedTrader[]
  categoryLeaderboards: {
    [key: string]: FormattedTrader[]
  }
  traderAnalytics: Array<{
    trader_wallet: string
    trader_username: string
    win_rate: number | null
    win_rate_formatted: string
    total_resolved: number
    wins: number
    losses: number
    categories: Array<{
      category: string
      count: number
      percentage: number
    }>
    primary_category: string
    avg_position_size: number | null
    avg_position_formatted: string
    total_invested: number
    trades_per_day: number | null
    trades_per_day_formatted: string
    first_trade_date: string | null
    last_trade_date: string | null
    days_since_last_trade: number | null
    active_status: 'ACTIVE' | 'RECENT' | 'INACTIVE'
    total_trades: number
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
    recent_wins: Array<{
      market_title: string
      entry_price: number
      outcome: string
      roi: number
      roi_formatted: string
      trade_date: string
      trade_date_formatted: string
    }>
    profile_url: string
    shareable_quote: string
    narrative_hook: string
  }>
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
  topByPnl: FormattedTrader[]
  topByRoi: FormattedTrader[]
  topByVolume: FormattedTrader[]
  topByTradeCount: FormattedTrader[]
  apiErrors: string[]
}

// Section B: Polycopy Database Data
interface SectionBData {
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

interface DashboardData {
  sectionA: SectionAData
  sectionB: SectionBData
  lastUpdated: string
}

interface TraderDetails {
  lifetimeStats: {
    trader_username: string
    trader_wallet: string
    total_trades: number
    total_pnl: number
    total_pnl_formatted: string
    total_volume: number
    total_volume_formatted: string
    roi: number
    roi_formatted: string
    markets_traded: number
    first_trade: string | null
  }
  tradeHistory: Array<{
    market_title: string
    outcome: string
    side: string
    price: number
    size: number
    value: number
    market_resolved: boolean
    created_at: string
    category: string
  }>
  marketFocus: Array<{
    category: string
    trade_count: number
    percentage: number
    avg_value: number
  }>
  copyMetrics: {
    unique_copiers: number
    total_copies: number
    first_copy: string | null
    last_copy: string | null
  }
  recentActivity: Array<{
    market_title: string
    outcome: string
    side: string
    price: number
    size: number
    value: number
    market_resolved: boolean
    created_at: string
    category: string
  }>
  tradingStyle: string
  primaryCategory: string
}

interface AdminDashboardClientProps {
  data: DashboardData
  onRefresh?: () => Promise<void> | void
}

// Sort options for leaderboard
type SortBy = 'roi' | 'pnl' | 'volume'

// Category display names
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  'politics': 'Politics',
  'sports': 'Sports',
  'crypto': 'Crypto',
  'finance': 'Business/Finance',
  'tech': 'Tech',
  'weather': 'Weather',
  'economics': 'Economics',
  'culture': 'Pop Culture'
}

export default function AdminDashboardClient({ data, onRefresh }: AdminDashboardClientProps) {
  const [, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null)
  const [traderDetails, setTraderDetails] = useState<TraderDetails | null>(null)
  const [loadingTrader, setLoadingTrader] = useState(false)
  const [traderError, setTraderError] = useState<string | null>(null)
  const [modalCopied, setModalCopied] = useState(false)
  const [walletCopied, setWalletCopied] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshSuccess, setRefreshSuccess] = useState(false)
  const [sortBy, setSortBy] = useState<SortBy>('roi')
  const router = useRouter()

  // Sort traders based on selected criteria
  const sortedTraders = useMemo(() => {
    if (!data?.sectionA.topTraders) return []
    
    const traders = [...data.sectionA.topTraders]
    
    switch (sortBy) {
      case 'pnl':
        return traders.sort((a, b) => b.pnl - a.pnl)
      case 'volume':
        return traders.sort((a, b) => b.volume - a.volume)
      case 'roi':
      default:
        return traders.sort((a, b) => b.roi - a.roi)
    }
  }, [data?.sectionA.topTraders, sortBy])

  // Fetch trader details when wallet is selected
  useEffect(() => {
    if (!selectedWallet) {
      setTraderDetails(null)
      return
    }

    const fetchTraderDetails = async () => {
      setLoadingTrader(true)
      setTraderError(null)
      
      try {
        const res = await fetch(`/api/admin/trader-details?wallet=${encodeURIComponent(selectedWallet)}`)
        if (!res.ok) {
          throw new Error('Failed to fetch trader details')
        }
        const data = await res.json()
        setTraderDetails(data)
      } catch (err: any) {
        setTraderError(err.message || 'Failed to load trader data')
      } finally {
        setLoadingTrader(false)
      }
    }

    fetchTraderDetails()
  }, [selectedWallet])

  // Close modal on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedWallet(null)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshSuccess(false)

    try {
      if (onRefresh) {
        await onRefresh()
      } else {
        startTransition(() => {
          router.refresh()
        })
      }
      setRefreshSuccess(true)
    } finally {
      setRefreshing(false)
      setTimeout(() => setRefreshSuccess(false), 2000)
    }
  }

  const handleCopyAll = async () => {
    if (!data) return
    const content = buildAllContent(data, sortedTraders)
    
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleTraderClick = (wallet: string) => {
    setSelectedWallet(wallet)
  }

  const handleCopyModalData = async () => {
    if (!traderDetails) return
    const content = buildTraderContent(traderDetails)
    
    try {
      await navigator.clipboard.writeText(content)
      setModalCopied(true)
      setTimeout(() => setModalCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleCopyWallet = async () => {
    if (!selectedWallet) return
    try {
      await navigator.clipboard.writeText(selectedWallet)
      setWalletCopied(true)
      setTimeout(() => setWalletCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleCopyProfileUrl = async () => {
    if (!selectedWallet) return
    const url = `https://polycopy.app/trader/${selectedWallet}`
    try {
      await navigator.clipboard.writeText(url)
      setUrlCopied(true)
      setTimeout(() => setUrlCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Password Form
  // Dashboard
  if (!data) return null

  const { sectionA, sectionB } = data
  const allErrors = [...sectionA.apiErrors, ...sectionB.dbErrors]

  return (
    <div className="min-h-screen bg-[#111827] text-white p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Back</span>
        </button>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              🔐 POLYCOPY ADMIN - CONTENT DATA DASHBOARD
            </h1>
            <p className="text-gray-400 text-sm">
              Last Updated: {data.lastUpdated}
            </p>
          </div>
          
          <div className="flex gap-3 items-center">
            {refreshSuccess && (
              <div className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg animate-pulse">
                ✓ Data refreshed!
              </div>
            )}
            
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-4 py-2 bg-[#374151] hover:bg-[#4b5563] text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {refreshing ? (
                <>
                  <span className="animate-spin">⟳</span>
                  Refreshing...
                </>
              ) : (
                <>🔄 Refresh Data</>
              )}
            </button>
            <button
              onClick={handleCopyAll}
              className="px-4 py-2 bg-[#FDB022] hover:bg-[#F59E0B] text-black font-bold rounded-lg transition-colors"
            >
              {copied ? '✓ Copied!' : '📋 Copy All Data'}
            </button>
          </div>
        </div>
        
        {/* Errors */}
        {allErrors.length > 0 && (
          <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg">
            <p className="text-red-400 font-medium">Some data failed to load:</p>
            <ul className="text-red-300 text-sm mt-1">
              {allErrors.map((err, i) => (
                <li key={i}>• {err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Content Sections */}
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* ═══════════════════════════════════════════════ */}
        {/* SECTION A: POLYMARKET TRADER DATA */}
        {/* ═══════════════════════════════════════════════ */}
        
        <div className="bg-[#FDB022] p-4 rounded-t-lg -mb-4">
          <h2 className="text-2xl font-bold text-black">📈 SECTION A: POLYMARKET TRADER DATA</h2>
          <p className="text-black/70 text-sm">Real-time leaderboard from Polymarket (all-time stats, same as trader profiles)</p>
        </div>
        
        <div className="space-y-6 border-2 border-[#FDB022]/30 rounded-b-lg p-4 md:p-6">
          
          {/* 1. Top 30 Traders (Overall Leaderboard) with Sort Options */}
          <Section title="🏆 TOP 30 TRADERS (OVERALL LEADERBOARD) - All-Time Stats">
            {/* Sort Buttons */}
            <div className="flex gap-2 mb-4">
              <span className="text-gray-400 text-sm mr-2">Sort by:</span>
              <SortButton active={sortBy === 'roi'} onClick={() => setSortBy('roi')}>ROI</SortButton>
              <SortButton active={sortBy === 'pnl'} onClick={() => setSortBy('pnl')}>P&L</SortButton>
              <SortButton active={sortBy === 'volume'} onClick={() => setSortBy('volume')}>Volume</SortButton>
            </div>
            
            {sortedTraders.length === 0 ? (
              <ErrorMessage message="Polymarket leaderboard data unavailable" />
            ) : (
              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {sortedTraders.map((trader, i) => (
                  <div key={trader.wallet || i} className="font-mono text-sm">
                    {i + 1}.{' '}
                    <button
                      onClick={() => handleTraderClick(trader.wallet)}
                      className="text-white hover:text-[#FDB022] hover:underline cursor-pointer transition-colors"
                    >
                      {trader.displayName}
                    </button>{' '}
                    <span className="text-gray-500">({trader.wallet.slice(0, 6)}...{trader.wallet.slice(-4)})</span>{' '}
                    — P&L: <span className={trader.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>{trader.pnl_formatted}</span>{' '}
                    | ROI: <span className={trader.roi >= 0 ? 'text-green-400' : 'text-red-400'}>{trader.roi_formatted}</span>{' '}
                    | Volume: <span className="text-[#FDB022]">{trader.volume_formatted}</span>{' '}
                    | Trades: <span className="text-blue-400">{trader.marketsTraded}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 2. Category Leaderboards */}
          {Object.keys(sectionA.categoryLeaderboards).length > 0 && (
            <Section title="📊 CATEGORY LEADERBOARDS (TOP 10 BY ROI) - All-Time Stats">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(sectionA.categoryLeaderboards).map(([category, traders]) => (
                  <div key={category} className="border border-[#374151] rounded-lg p-4">
                    <h4 className="text-[#FDB022] font-bold mb-3">
                      🏆 {CATEGORY_DISPLAY_NAMES[category] || category.toUpperCase()} TOP 10
                    </h4>
                    <div className="space-y-1">
                      {traders.slice(0, 10).map((trader, i) => (
                        <div key={trader.wallet} className="font-mono text-sm">
                          {i + 1}.{' '}
                          <button
                            onClick={() => handleTraderClick(trader.wallet)}
                            className="text-white hover:text-[#FDB022] hover:underline cursor-pointer transition-colors"
                          >
                            {trader.displayName}
                          </button>{' '}
                          — P&L: <span className={trader.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>{trader.pnl_formatted}</span>{' '}
                          | ROI: <span className={trader.roi >= 0 ? 'text-green-400' : 'text-red-400'}>{trader.roi_formatted}</span>{' '}
                          | Trades: <span className="text-blue-400">{trader.marketsTraded}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 3. PHASE 2: Trader Deep Analytics */}
          {sectionA.traderAnalytics.length > 0 && (
            <Section title="🔬 PHASE 2: TRADER DEEP ANALYTICS (Top 30 Enriched Data)">
              <p className="text-sm text-gray-400 mb-4">
                💡 Detailed performance metrics for content creation: win rates, category specialization, position sizing, trade frequency, and momentum
              </p>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {sectionA.traderAnalytics.map((trader) => {
                  const wowIcon = trader.wow_status === 'heating_up' ? '🔥' : 
                                  trader.wow_status === 'cooling_down' ? '❄️' : 
                                  trader.wow_status === 'new' ? '🆕' : '➡️'
                  
                  return (
                    <div key={trader.trader_wallet} className="border border-[#374151] rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <button
                            onClick={() => handleTraderClick(trader.trader_wallet)}
                            className="text-[#FDB022] font-bold text-lg hover:underline"
                          >
                            {trader.trader_username}
                          </button>
                          <div className="text-xs text-gray-500 mt-1">
                            {trader.trader_wallet.slice(0, 10)}...{trader.trader_wallet.slice(-6)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold">
                            {wowIcon} {trader.wow_status === 'heating_up' && 'HEATING UP'}
                            {trader.wow_status === 'cooling_down' && 'COOLING DOWN'}
                            {trader.wow_status === 'stable' && 'STABLE'}
                            {trader.wow_status === 'new' && 'NEW'}
                          </div>
                          {trader.wow_roi_change !== null && (
                            <div className={`text-xs ${trader.wow_roi_change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              WoW: {trader.wow_roi_change_formatted}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-sm">
                        {/* Win Rate */}
                        <div>
                          <div className="text-gray-400 text-xs mb-1">Win Rate</div>
                          <div className="text-white font-bold">
                            {trader.win_rate_formatted}
                          </div>
                          <div className="text-gray-500 text-xs">
                            {trader.wins}W / {trader.losses}L ({trader.total_resolved} resolved)
                          </div>
                        </div>
                        
                        {/* Category Specialization */}
                        <div>
                          <div className="text-gray-400 text-xs mb-1">Specialization</div>
                          <div className="text-white font-bold">
                            {trader.primary_category}
                          </div>
                          <div className="text-gray-500 text-xs">
                            {trader.categories[0]?.percentage}% of trades
                          </div>
                        </div>
                        
                        {/* Avg Position Size */}
                        <div>
                          <div className="text-gray-400 text-xs mb-1">Avg Position</div>
                          <div className="text-white font-bold">
                            {trader.avg_position_formatted}
                          </div>
                          <div className="text-gray-500 text-xs">
                            ${(trader.total_invested / 1000).toFixed(1)}K total
                          </div>
                        </div>
                        
                        {/* Trade Frequency */}
                        <div>
                          <div className="text-gray-400 text-xs mb-1">Frequency</div>
                          <div className="text-white font-bold">
                            {trader.trades_per_day_formatted}
                          </div>
                          <div className="text-gray-500 text-xs">
                            {trader.total_trades} total trades
                          </div>
                        </div>
                      </div>
                      
                      {/* Category Breakdown */}
                      {trader.categories.length > 1 && (
                        <div className="mt-3 pt-3 border-t border-[#374151]">
                          <div className="text-gray-400 text-xs mb-2">Full Category Breakdown:</div>
                          <div className="flex flex-wrap gap-2">
                            {trader.categories.map((cat) => (
                              <span key={cat.category} className="text-xs bg-[#374151] px-2 py-1 rounded">
                                {cat.category}: {cat.percentage}% <span className="text-gray-500">({cat.count})</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Social Media Quick Links */}
                      <div className="mt-3 pt-3 border-t border-[#374151]">
                        <div className="text-gray-400 text-xs mb-2">📱 Social Media Content:</div>
                        <pre className="text-xs bg-black/30 p-2 rounded whitespace-pre-wrap font-mono">
                          {trader.shareable_quote}
                          {'\n\n'}📈 Track them: {trader.profile_url}
                        </pre>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* 4. New Entrants to Top 30 */}
          {sectionA.newEntrants.length > 0 && (
            <Section title="🆕 NEW ENTRANTS TO TOP 30 (HIGH PERFORMERS)">
              <p className="text-sm text-gray-400 mb-4">
                💡 Fresh faces in the leaderboard with impressive stats
              </p>
              <div className="space-y-1">
                {sectionA.newEntrants.map((trader, i) => (
                  <div key={trader.trader_wallet} className="font-mono text-sm">
                    <button
                      onClick={() => handleTraderClick(trader.trader_wallet)}
                      className="text-white hover:text-[#FDB022] hover:underline cursor-pointer transition-colors"
                    >
                      {trader.trader_username}
                    </button>{' '}
                    <span className="text-gray-500">({trader.trader_wallet.slice(0, 6)}...{trader.trader_wallet.slice(-4)})</span>{' '}
                    — Rank #{trader.current_rank} | ROI: <span className="text-green-400">{trader.roi_formatted}</span>{' '}
                    | P&L: <span className="text-[#FDB022]">{trader.pnl_formatted}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 5. Risk/Reward Profiles */}
          {(sectionA.riskRewardProfiles.highRoiLowVolume.length > 0 || sectionA.riskRewardProfiles.highVolumeConsistent.length > 0) && (
            <Section title="💎 RISK/REWARD TRADER PROFILES">
              <p className="text-sm text-gray-400 mb-4">
                💡 Different trader archetypes for different strategies
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* High ROI, Low Volume (Hidden Gems) */}
                {sectionA.riskRewardProfiles.highRoiLowVolume.length > 0 && (
                  <div className="border border-[#374151] rounded-lg p-4">
                    <h4 className="text-[#FDB022] font-bold mb-3">
                      💎 HIGH ROI, LOW VOLUME (Hidden Gems)
                    </h4>
                    <div className="space-y-1">
                      {sectionA.riskRewardProfiles.highRoiLowVolume.map((trader) => (
                        <div key={trader.trader_wallet} className="font-mono text-sm">
                          <button
                            onClick={() => handleTraderClick(trader.trader_wallet)}
                            className="text-white hover:text-[#FDB022] hover:underline cursor-pointer transition-colors"
                          >
                            {trader.trader_username}
                          </button>{' '}
                          — ROI: <span className="text-green-400">{trader.roi_formatted}</span>{' '}
                          | Vol: <span className="text-gray-400">{trader.volume_formatted}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* High Volume, Consistent */}
                {sectionA.riskRewardProfiles.highVolumeConsistent.length > 0 && (
                  <div className="border border-[#374151] rounded-lg p-4">
                    <h4 className="text-[#FDB022] font-bold mb-3">
                      📊 HIGH VOLUME, CONSISTENT (Reliable)
                    </h4>
                    <div className="space-y-1">
                      {sectionA.riskRewardProfiles.highVolumeConsistent.map((trader) => (
                        <div key={trader.trader_wallet} className="font-mono text-sm">
                          <button
                            onClick={() => handleTraderClick(trader.trader_wallet)}
                            className="text-white hover:text-[#FDB022] hover:underline cursor-pointer transition-colors"
                          >
                            {trader.trader_username}
                          </button>{' '}
                          — ROI: <span className="text-green-400">{trader.roi_formatted}</span>{' '}
                          | Vol: <span className="text-[#FDB022]">{trader.volume_formatted}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* 6. Category Momentum */}
          {sectionA.categoryMomentum.length > 0 && (
            <Section title="📈 CATEGORY MOMENTUM & TRENDS">
              <p className="text-sm text-gray-400 mb-4">
                💡 Shows where volume and activity is moving
              </p>
              <div className="space-y-2">
                {sectionA.categoryMomentum.map((cat) => (
                  <div key={cat.category} className="font-mono text-sm">
                    <span className="text-white font-bold">{cat.category}:</span>{' '}
                    <span className="text-gray-400">${(cat.current_volume / 1000000).toFixed(1)}M volume</span>{' '}
                    {cat.volume_change_pct !== null && (
                      <span className={cat.volume_change_pct >= 0 ? 'text-green-400' : 'text-red-400'}>
                        ({cat.volume_change_formatted})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 7. NEW: Top Performers by Metric */}
          <Section title="🎯 TOP PERFORMERS BY METRIC">
            <p className="text-sm text-gray-400 mb-4">
              💡 Different ways to rank traders - useful for diverse content angles
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top by P&L */}
              <div className="border border-[#374151] rounded-lg p-4">
                <h4 className="text-[#FDB022] font-bold mb-3">💰 TOP 5 BY P&L (Absolute Profits)</h4>
                <div className="space-y-1">
                  {sectionA.topByPnl.map((trader, i) => (
                    <div key={trader.wallet} className="font-mono text-sm">
                      {i + 1}.{' '}
                      <button
                        onClick={() => handleTraderClick(trader.wallet)}
                        className="text-white hover:text-[#FDB022] hover:underline cursor-pointer transition-colors"
                      >
                        {trader.displayName}
                      </button>{' '}
                      — <span className="text-green-400 font-bold">{trader.pnl_formatted}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top by ROI */}
              <div className="border border-[#374151] rounded-lg p-4">
                <h4 className="text-[#FDB022] font-bold mb-3">📊 TOP 5 BY ROI% (Best Returns)</h4>
                <div className="space-y-1">
                  {sectionA.topByRoi.map((trader, i) => (
                    <div key={trader.wallet} className="font-mono text-sm">
                      {i + 1}.{' '}
                      <button
                        onClick={() => handleTraderClick(trader.wallet)}
                        className="text-white hover:text-[#FDB022] hover:underline cursor-pointer transition-colors"
                      >
                        {trader.displayName}
                      </button>{' '}
                      — <span className="text-green-400 font-bold">{trader.roi_formatted}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top by Volume */}
              <div className="border border-[#374151] rounded-lg p-4">
                <h4 className="text-[#FDB022] font-bold mb-3">🐋 TOP 5 WHALES (By Volume)</h4>
                <div className="space-y-1">
                  {sectionA.topByVolume.map((trader, i) => (
                    <div key={trader.wallet} className="font-mono text-sm">
                      {i + 1}.{' '}
                      <button
                        onClick={() => handleTraderClick(trader.wallet)}
                        className="text-white hover:text-[#FDB022] hover:underline cursor-pointer transition-colors"
                      >
                        {trader.displayName}
                      </button>{' '}
                      — <span className="text-[#FDB022] font-bold">{trader.volume_formatted}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top by Trade Count */}
              <div className="border border-[#374151] rounded-lg p-4">
                <h4 className="text-[#FDB022] font-bold mb-3">⚡ TOP 5 MOST ACTIVE (By Trades)</h4>
                <div className="space-y-1">
                  {sectionA.topByTradeCount.map((trader, i) => (
                    <div key={trader.wallet} className="font-mono text-sm">
                      {i + 1}.{' '}
                      <button
                        onClick={() => handleTraderClick(trader.wallet)}
                        className="text-white hover:text-[#FDB022] hover:underline cursor-pointer transition-colors"
                      >
                        {trader.displayName}
                      </button>{' '}
                      — <span className="text-blue-400 font-bold">{trader.marketsTraded} trades</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>
          
        </div>

        {/* ═══════════════════════════════════════════════ */}
        {/* SECTION B: POLYCOPY PLATFORM DATA */}
        {/* ═══════════════════════════════════════════════ */}
        
        <div className="bg-[#3b82f6] p-4 rounded-t-lg -mb-4 mt-12">
          <h2 className="text-2xl font-bold text-white">📊 SECTION B: POLYCOPY PLATFORM DATA</h2>
          <p className="text-white/70 text-sm">User activity and copied trades from Polycopy database</p>
        </div>
        
        <div className="space-y-6 border-2 border-[#3b82f6]/30 rounded-b-lg p-4 md:p-6">

          {/* 1. Most Copied Traders (Polycopy) */}
          <Section title="📊 MOST COPIED TRADERS (LAST 7 DAYS)">
            {sectionB.mostCopiedTraders.length === 0 ? (
              <p className="text-gray-500">No data available</p>
            ) : (
              <div className="space-y-1">
                {sectionB.mostCopiedTraders.map((trader, i) => (
                  <div key={trader.trader_wallet} className="font-mono text-sm">
                    {i + 1}.{' '}
                    <TraderName 
                      username={trader.trader_username} 
                      wallet={trader.trader_wallet}
                      onClick={handleTraderClick}
                    />{' '}
                    <span className="text-gray-500">({trader.trader_wallet})</span>{' '}
                    — {trader.copy_count} {trader.copy_count === 1 ? 'copy' : 'copies'}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 2. Platform Stats */}
          <Section title="📈 PLATFORM STATS (ALL TIME)">
            <div className="font-mono text-sm space-y-1">
              <div>Unique Traders Tracked: <span className="text-[#FDB022]">{sectionB.platformStats.uniqueTraders.toLocaleString()}</span></div>
              <div>Total Trades Copied: <span className="text-[#FDB022]">{sectionB.platformStats.totalCopies.toLocaleString()}</span></div>
              <div>Active Copiers: <span className="text-[#FDB022]">{sectionB.platformStats.activeUsers.toLocaleString()}</span></div>
              <div>Avg ROI (Resolved): <span className={sectionB.platformStats.avgRoi !== null && sectionB.platformStats.avgRoi >= 0 ? 'text-green-400' : 'text-red-400'}>{sectionB.platformStats.avgRoi_formatted}</span></div>
              <div>Win Rate: <span className="text-[#FDB022]">{sectionB.platformStats.winRate_formatted}</span></div>
            </div>
          </Section>

          {/* 3. Newly Tracked Traders */}
          <Section title="🆕 NEWLY TRACKED TRADERS (LAST 7 DAYS)">
            {sectionB.newlyTrackedTraders.length === 0 ? (
              <p className="text-gray-500">No data available</p>
            ) : (
              <div className="space-y-1">
                {sectionB.newlyTrackedTraders.map((trader, i) => (
                  <div key={trader.trader_wallet} className="font-mono text-sm">
                    {i + 1}.{' '}
                    <TraderName 
                      username={trader.trader_username} 
                      wallet={trader.trader_wallet}
                      onClick={handleTraderClick}
                    />{' '}
                    <span className="text-gray-500">({trader.trader_wallet})</span>{' '}
                    | First copied: {trader.first_copied_formatted} | {trader.unique_markets} {trader.unique_markets === 1 ? 'market' : 'markets'} traded
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 4. Most Copied Markets */}
          <Section title="🔥 MOST COPIED MARKETS (LAST 7 DAYS)">
            {sectionB.mostCopiedMarkets.length === 0 ? (
              <p className="text-gray-500">No data available</p>
            ) : (
              <div className="space-y-1">
                {sectionB.mostCopiedMarkets.map((market, i) => (
                  <div key={`${market.market_title}-${i}`} className="font-mono text-sm">
                    {i + 1}. {market.market_title_truncated} — {market.copy_count} {market.copy_count === 1 ? 'copy' : 'copies'}{' '}
                    {market.avg_roi !== null && (
                      <span className={market.avg_roi >= 0 ? 'text-green-400' : 'text-red-400'}>
                        (Avg ROI: {market.avg_roi_formatted})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 5. Recent Activity */}
          <Section title="⏱️ RECENT COPY ACTIVITY (LAST 20)">
            {sectionB.recentActivity.length === 0 ? (
              <p className="text-gray-500">No data available</p>
            ) : (
              <div className="space-y-1">
                {sectionB.recentActivity.map((activity, i) => (
                  <div key={`${activity.created_at}-${i}`} className="font-mono text-sm">
                    <span className="text-gray-500">[{activity.time_formatted}]</span>{' '}
                    <TraderName 
                      username={activity.trader_username} 
                      wallet={activity.trader_wallet || ''}
                      onClick={handleTraderClick}
                    />{' '}
                    <span className="text-gray-500">({activity.trader_wallet})</span>{' '}
                    copied on {activity.market_title_truncated}{' '}
                    <span className="text-[#FDB022]">({activity.outcome})</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 6. Fastest Growing Traders */}
          <Section title="🚀 FASTEST GROWING TRADERS (BY NEW FOLLOWERS)">
            {sectionB.fastestGrowingTraders.length === 0 ? (
              <p className="text-gray-500">No new followers this week</p>
            ) : (
              <div className="space-y-1">
                {sectionB.fastestGrowingTraders.map((trader, i) => (
                  <div key={trader.trader_wallet} className="font-mono text-sm">
                    {i + 1}.{' '}
                    <TraderName 
                      username={trader.trader_username} 
                      wallet={trader.trader_wallet}
                      onClick={handleTraderClick}
                    />{' '}
                    <span className="text-gray-500">({trader.trader_wallet})</span>{' '}
                    — <span className="text-green-400 font-bold">{trader.growth_rate}</span>{' '}
                    | Total: {trader.total_followers} {trader.total_followers === 1 ? 'follower' : 'followers'}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 7. Copier Performance Leaderboard */}
          <Section title="👥 TOP COPIER PERFORMANCE (BEST ROI)">
            {sectionB.copierPerformance.length === 0 ? (
              <p className="text-gray-500">No resolved trades yet (need 3+ resolved trades per user)</p>
            ) : (
              <div className="space-y-1">
                {sectionB.copierPerformance.map((copier, i) => (
                  <div key={copier.user_id} className="font-mono text-sm">
                    {i + 1}.{' '}
                    <span className="text-white">{copier.user_email}</span>{' '}
                    — Avg ROI: <span className={copier.avg_roi !== null && copier.avg_roi >= 0 ? 'text-green-400' : 'text-red-400'}>{copier.avg_roi_formatted}</span>{' '}
                    | Win Rate: <span className="text-blue-400">{copier.win_rate_formatted}</span>{' '}
                    | {copier.total_copies} {copier.total_copies === 1 ? 'trade' : 'trades'}{' '}
                    {copier.best_trader && (
                      <span className="text-gray-500">| Copying: {copier.best_trader}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 8. ROI Analysis by Follower Count */}
          <Section title="📊 ROI ANALYSIS BY POPULARITY">
            {sectionB.roiByFollowerCount.length === 0 ? (
              <p className="text-gray-500">No data available</p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-gray-400 mb-3">
                  💡 Shows if more popular traders perform better (social proof validation)
                </p>
                {sectionB.roiByFollowerCount.map((bucket) => (
                  <div key={bucket.follower_bucket} className="font-mono text-sm">
                    <span className="text-white">{bucket.follower_bucket}:</span>{' '}
                    <span className="text-gray-400">{bucket.trader_count} {bucket.trader_count === 1 ? 'trader' : 'traders'}</span>{' '}
                    — Avg ROI: <span className={bucket.avg_roi !== null && bucket.avg_roi >= 0 ? 'text-green-400' : 'text-red-400'}>{bucket.avg_roi_formatted}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 9. Copy Velocity Trends */}
          {sectionB.copyVelocity.length > 0 && (
            <Section title="⚡ COPY VELOCITY TRENDS (Last 7 Days)">
              <p className="text-sm text-gray-400 mb-4">
                💡 Shows which traders are gaining momentum on the platform
              </p>
              <div className="space-y-2">
                {sectionB.copyVelocity.map((trader, i) => (
                  <div key={trader.trader_wallet} className="font-mono text-sm">
                    {i + 1}.{' '}
                    <button
                      onClick={() => handleTraderClick(trader.trader_wallet)}
                      className="text-white hover:text-[#FDB022] hover:underline cursor-pointer transition-colors"
                    >
                      {trader.trader_username}
                    </button>{' '}
                    — <span className="text-[#FDB022]">{trader.daily_avg_7d}/day avg</span>{' '}
                    | Today: <span className="text-white">{trader.copies_today}</span>{' '}
                    | Total 7d: <span className="text-gray-400">{trader.copies_7d_total}</span>{' '}
                    {trader.trend === 'accelerating' && <span className="text-green-400">🚀 +{trader.trend_pct}% trending</span>}
                    {trader.trend === 'decelerating' && <span className="text-red-400">📉 {trader.trend_pct}% slowing</span>}
                    {trader.trend === 'stable' && <span className="text-gray-400">➡️ Stable</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 10. Success Story Highlights */}
          {sectionB.successStories.length > 0 && (
            <Section title="🏆 SUCCESS STORY HIGHLIGHTS (Top Performers)">
              <p className="text-sm text-gray-400 mb-4">
                💡 Real user success stories for social proof & inspiration
              </p>
              <div className="space-y-4">
                {sectionB.successStories.map((story, i) => (
                  <div key={story.user_id} className="border border-[#374151] rounded-lg p-4">
                    <div className="font-bold text-white mb-2">
                      #{i + 1} Top Performer: {story.user_email}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-sm">
                      <div>
                        <div className="text-gray-400 text-xs">Total Trades</div>
                        <div className="text-[#FDB022] font-bold">{story.total_trades}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-xs">Avg ROI</div>
                        <div className="text-green-400 font-bold">{story.avg_roi_formatted}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-xs">Win Rate</div>
                        <div className="text-[#FDB022] font-bold">{story.win_rate_formatted}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 text-xs">vs Platform Avg</div>
                        <div className="text-white font-bold">{story.vs_platform_avg}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-gray-400">
                      Following: <span className="text-white">{story.best_trader}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 11. Market Concentration */}
          <Section title="🎯 MARKET CONCENTRATION ANALYSIS">
            <p className="text-sm text-gray-400 mb-4">
              💡 Shows how diverse or concentrated copy trading activity is
            </p>
            <div className="font-mono text-sm space-y-2">
              <div>
                Concentration Score: <span className={`font-bold ${
                  sectionB.marketConcentration.concentration_score === 'high' ? 'text-red-400' :
                  sectionB.marketConcentration.concentration_score === 'medium' ? 'text-yellow-400' :
                  'text-green-400'
                }`}>{sectionB.marketConcentration.concentration_score.toUpperCase()}</span>
              </div>
              <div>
                Top 3 markets: <span className="text-[#FDB022]">{sectionB.marketConcentration.top3_percentage}%</span> of all copies
              </div>
              <div>
                Top 10 markets: <span className="text-[#FDB022]">{sectionB.marketConcentration.top10_percentage}%</span> of all copies
              </div>
              <div>
                Total unique markets: <span className="text-white">{sectionB.marketConcentration.total_unique_markets}</span>
              </div>
              <div className="mt-3 pt-3 border-t border-[#374151] text-gray-400 text-xs">
                {sectionB.marketConcentration.concentration_score === 'high' && '⚠️ High concentration: Most users copying same few markets'}
                {sectionB.marketConcentration.concentration_score === 'medium' && '👍 Moderate diversity: Good balance of popular & diverse markets'}
                {sectionB.marketConcentration.concentration_score === 'low' && '✅ High diversity: Users exploring many different markets'}
              </div>
            </div>
          </Section>

          {/* 12. Exit Strategy Analysis */}
          <Section title="⏱️ EXIT STRATEGY ANALYSIS">
            <p className="text-sm text-gray-400 mb-4">
              💡 How copiers manage their exit timing vs traders
            </p>
            <div className="font-mono text-sm space-y-2">
              <div>
                Winners hold time: <span className="text-green-400 font-bold">{sectionB.exitStrategyAnalysis.avg_hold_time_winners_formatted}</span>
              </div>
              <div>
                Losers hold time: <span className="text-red-400 font-bold">{sectionB.exitStrategyAnalysis.avg_hold_time_losers_formatted}</span>
              </div>
              <div>
                Matches trader exits: <span className="text-[#FDB022]">{sectionB.exitStrategyAnalysis.matches_trader_exit_rate}%</span> of trades
              </div>
              <div className="mt-3 pt-3 border-t border-[#374151]">
                {sectionB.exitStrategyAnalysis.avg_hold_time_losers > 0 && sectionB.exitStrategyAnalysis.avg_hold_time_losers < sectionB.exitStrategyAnalysis.avg_hold_time_winners && (
                  <div className="text-yellow-400 text-xs">
                    ⚠️ Users are panic-selling losers too early (hold {sectionB.exitStrategyAnalysis.early_exit_rate}% less time than winners)
                  </div>
                )}
                {sectionB.exitStrategyAnalysis.avg_hold_time_winners > 0 && sectionB.exitStrategyAnalysis.avg_hold_time_losers >= sectionB.exitStrategyAnalysis.avg_hold_time_winners && (
                  <div className="text-green-400 text-xs">
                    ✅ Good discipline: Holding losers as long as winners
                  </div>
                )}
              </div>
            </div>
          </Section>

        </div>

      </div>

      {/* Trader Detail Modal */}
      {selectedWallet && (
        <TraderModal
          wallet={selectedWallet}
          details={traderDetails}
          loading={loadingTrader}
          error={traderError}
          onClose={() => setSelectedWallet(null)}
          onCopyAll={handleCopyModalData}
          onCopyWallet={handleCopyWallet}
          onCopyUrl={handleCopyProfileUrl}
          modalCopied={modalCopied}
          walletCopied={walletCopied}
          urlCopied={urlCopied}
        />
      )}
    </div>
  )
}

// Sort button component
function SortButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-sm rounded transition-colors ${
        active 
          ? 'bg-[#FDB022] text-black font-bold' 
          : 'bg-[#374151] text-gray-300 hover:bg-[#4b5563]'
      }`}
    >
      {children}
    </button>
  )
}

// Error message component
function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">
      ⚠️ {message}
    </div>
  )
}

// Clickable Trader Name component
function TraderName({ 
  username, 
  wallet, 
  onClick 
}: { 
  username: string
  wallet: string
  onClick: (wallet: string) => void 
}) {
  if (!wallet) {
    return <span>{username || 'Anonymous'}</span>
  }
  
  return (
    <button
      onClick={() => onClick(wallet)}
      className="text-white hover:text-[#FDB022] hover:underline cursor-pointer transition-colors"
    >
      {username || 'Anonymous'}
    </button>
  )
}

// Trader Detail Modal component
function TraderModal({
  wallet,
  details,
  loading,
  error,
  onClose,
  onCopyAll,
  onCopyWallet,
  onCopyUrl,
  modalCopied,
  walletCopied,
  urlCopied
}: {
  wallet: string
  details: TraderDetails | null
  loading: boolean
  error: string | null
  onClose: () => void
  onCopyAll: () => void
  onCopyWallet: () => void
  onCopyUrl: () => void
  modalCopied: boolean
  walletCopied: boolean
  urlCopied: boolean
}) {
  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[#111827] border-2 border-[#374151] rounded-lg w-full max-w-[900px] max-h-[90vh] overflow-y-auto p-6 md:p-8 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl font-bold"
        >
          ×
        </button>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#FDB022] mx-auto mb-4"></div>
            <p className="text-gray-400">Loading trader data...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-400 mb-4">❌ {error}</p>
            <p className="text-gray-500 text-sm mb-4">This trader may not have been copied on Polycopy yet.</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-[#374151] hover:bg-[#4b5563] text-white rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        ) : details ? (
          <div className="space-y-6 font-mono">
            <div className="border-b border-[#374151] pb-4">
              <h2 className="text-[#FDB022] text-xl font-bold mb-2">
                TRADER DEEP DIVE: {details.lifetimeStats.trader_username || 'Anonymous'}
              </h2>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400">Full Wallet:</span>
                <span className="text-white">{wallet}</span>
                <button
                  onClick={onCopyWallet}
                  className="px-2 py-1 bg-[#374151] hover:bg-[#4b5563] text-white text-xs rounded transition-colors"
                >
                  {walletCopied ? '✓' : '📋'}
                </button>
              </div>
              <div className="flex gap-3 mt-3">
                <a
                  href={`/trader/${wallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#3b82f6] hover:underline"
                >
                  View on Polycopy →
                </a>
              </div>
            </div>

            <ModalSection title="📊 LIFETIME STATS (REAL POLYMARKET DATA)">
              <div className="space-y-1 text-sm">
                <div>Total Trades: <span className="text-[#FDB022]">{details.lifetimeStats.total_trades}</span></div>
                <div>P&L: <span className={getRoiColor(details.lifetimeStats.total_pnl)}>{details.lifetimeStats.total_pnl_formatted}</span></div>
                <div>Volume: <span className="text-[#FDB022]">{details.lifetimeStats.total_volume_formatted}</span></div>
                <div>ROI: <span className={getRoiColor(details.lifetimeStats.roi)}>{details.lifetimeStats.roi_formatted}</span></div>
                <div>Markets Traded: <span className="text-[#FDB022]">{details.lifetimeStats.markets_traded}</span></div>
                <div>Times Copied on Polycopy: <span className="text-[#3b82f6]">{details.copyMetrics.total_copies}</span> by <span className="text-[#3b82f6]">{details.copyMetrics.unique_copiers}</span> users</div>
                <div>First Trade: <span className="text-gray-300">{formatDateLong(details.lifetimeStats.first_trade)}</span></div>
              </div>
            </ModalSection>

            <ModalSection title="📋 RECENT TRADE HISTORY (Last 100)">
              {details.tradeHistory.length === 0 ? (
                <p className="text-gray-500">No trades found</p>
              ) : (
                <div className="space-y-1 text-sm max-h-[200px] overflow-y-auto">
                  {details.tradeHistory.slice(0, 20).map((trade, i) => (
                    <div key={`${trade.created_at}-${i}`}>
                      {i + 1}. {truncateText(trade.market_title, 50)} | <span className={trade.side === 'BUY' ? 'text-green-400' : 'text-red-400'}>{trade.side}</span> {trade.outcome} @ ${trade.price.toFixed(2)} | ${trade.value.toFixed(0)} | {formatDateShort(trade.created_at)} | <span className="text-gray-500">{trade.category}</span>
                    </div>
                  ))}
                </div>
              )}
            </ModalSection>

            <ModalSection title="🎯 MARKET FOCUS">
              {details.marketFocus.length === 0 ? (
                <p className="text-gray-500">No data available</p>
              ) : (
                <div className="space-y-1 text-sm">
                  {details.marketFocus.map((cat) => (
                    <div key={cat.category}>
                      {cat.category}: <span className="text-[#FDB022]">{cat.trade_count}</span> trades ({cat.percentage}%) - Avg Value: <span className="text-green-400">${cat.avg_value.toFixed(0)}</span>
                    </div>
                  ))}
                  <div className="mt-3 pt-3 border-t border-[#374151]">
                    <div>Primary Markets: <span className="text-[#FDB022]">{details.primaryCategory}</span></div>
                    <div>Trading Style: <span className="text-gray-300">{details.tradingStyle}</span></div>
                  </div>
                </div>
              )}
            </ModalSection>

            <ModalSection title="🔗 QUICK LINKS">
              <div className="flex items-center gap-2 text-sm">
                <span>Profile: polycopy.app/trader/{wallet.slice(0, 8)}...</span>
                <button
                  onClick={onCopyUrl}
                  className="px-3 py-1 bg-[#374151] hover:bg-[#4b5563] text-white text-xs rounded transition-colors"
                >
                  {urlCopied ? '✓ Copied!' : 'Copy URL'}
                </button>
              </div>
            </ModalSection>

            <div className="pt-4 border-t border-[#374151]">
              <button
                onClick={onCopyAll}
                className="w-full py-3 bg-[#FDB022] hover:bg-[#F59E0B] text-black font-bold rounded-lg transition-colors text-lg"
              >
                {modalCopied ? '✓ Copied All Data!' : '📋 Copy All Data'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// Modal Section component
function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[#374151] rounded-lg p-4">
      <h3 className="text-[#FDB022] font-bold mb-3">{title}</h3>
      <div className="select-text">{children}</div>
    </div>
  )
}

// Section component
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[#374151] rounded-lg p-4 md:p-6">
      <h2 className="text-[#FDB022] font-bold text-lg mb-4">{title}</h2>
      <div className="select-text">{children}</div>
    </div>
  )
}

// Helper functions
function truncateText(text: string, maxLength: number): string {
  if (!text) return '--'
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

function formatROI(roi: number | null): string {
  if (roi === null || roi === undefined) return '--'
  const sign = roi >= 0 ? '+' : ''
  return `${sign}${roi.toFixed(2)}%`
}

function getRoiColor(roi: number | null): string {
  if (roi === null || roi === undefined) return 'text-gray-400'
  return roi >= 0 ? 'text-green-400' : 'text-red-400'
}

function formatWinRate(wins: number, losses: number): string {
  const total = wins + losses
  if (total === 0) return '--'
  return `${((wins / total) * 100).toFixed(1)}%`
}

function formatDateLong(dateStr: string | null): string {
  if (!dateStr) return '--'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getStatusEmoji(roi: number | null, resolved: boolean): string {
  if (!resolved) return '⚪'
  if (roi === null || roi === undefined) return '⚪'
  if (roi > 0) return '✅'
  if (roi < 0) return '❌'
  return '⚪'
}

// Build all content as copyable text (markdown format)
function buildAllContent(data: DashboardData, sortedTraders: FormattedTrader[]): string {
  const { sectionA, sectionB } = data
  const lines: string[] = []
  
  // Header
  lines.push('═══════════════════════════════════════════════')
  lines.push('POLYCOPY CONTENT DATA DASHBOARD')
  lines.push(`Last Updated: ${data.lastUpdated}`)
  lines.push('═══════════════════════════════════════════════')
  lines.push('')
  lines.push('')
  
  // ═══════════════════════════════════════════════
  // SECTION A: POLYMARKET TRADER DATA
  // ═══════════════════════════════════════════════
  lines.push('═══════════════════════════════════════════════')
  lines.push('SECTION A: POLYMARKET TRADER DATA')
  lines.push('(Real-time leaderboard from Polymarket)')
  lines.push('═══════════════════════════════════════════════')
  lines.push('')
  
  // 1. Top 30 Traders (Overall Leaderboard) - Show all 3 sort variants
  lines.push('🏆 TOP 30 TRADERS (OVERALL LEADERBOARD) - All-Time Stats')
  lines.push('───────────────────────────────────────────────')
  
  if (sectionA.topTraders.length === 0) {
    lines.push('Data unavailable')
  } else {
    const traders = sectionA.topTraders
    
    // Sort by ROI
    lines.push('')
    lines.push('📊 SORTED BY ROI:')
    lines.push('')
    const byROI = [...traders].sort((a, b) => b.roi - a.roi)
    byROI.forEach((trader, i) => {
      const wallet = trader.wallet ? `${trader.wallet.slice(0, 6)}...${trader.wallet.slice(-4)}` : 'Unknown'
      lines.push(`${i + 1}. ${trader.displayName} (${wallet}) — P&L: ${trader.pnl_formatted} | ROI: ${trader.roi_formatted} | Volume: ${trader.volume_formatted} | Trades: ${trader.marketsTraded}`)
    })
    
    // Sort by P&L
    lines.push('')
    lines.push('💰 SORTED BY P&L:')
    lines.push('')
    const byPNL = [...traders].sort((a, b) => b.pnl - a.pnl)
    byPNL.forEach((trader, i) => {
      const wallet = trader.wallet ? `${trader.wallet.slice(0, 6)}...${trader.wallet.slice(-4)}` : 'Unknown'
      lines.push(`${i + 1}. ${trader.displayName} (${wallet}) — P&L: ${trader.pnl_formatted} | ROI: ${trader.roi_formatted} | Volume: ${trader.volume_formatted} | Trades: ${trader.marketsTraded}`)
    })
    
    // Sort by Volume
    lines.push('')
    lines.push('📈 SORTED BY VOLUME:')
    lines.push('')
    const byVolume = [...traders].sort((a, b) => b.volume - a.volume)
    byVolume.forEach((trader, i) => {
      const wallet = trader.wallet ? `${trader.wallet.slice(0, 6)}...${trader.wallet.slice(-4)}` : 'Unknown'
      lines.push(`${i + 1}. ${trader.displayName} (${wallet}) — P&L: ${trader.pnl_formatted} | ROI: ${trader.roi_formatted} | Volume: ${trader.volume_formatted} | Trades: ${trader.marketsTraded}`)
    })
  }
  lines.push('')
  lines.push('')
  
  // 2. Category Leaderboards
  const categoryCount = Object.keys(sectionA.categoryLeaderboards).length
  if (categoryCount > 0) {
    lines.push('📊 CATEGORY LEADERBOARDS (TOP 10 BY ROI) - All-Time Stats')
    lines.push('───────────────────────────────────────────────')
    lines.push('')
    
    // Define category order for consistent output
    const categoryOrder = ['politics', 'sports', 'crypto', 'finance', 'tech', 'weather', 'economics', 'culture']
    
    for (const category of categoryOrder) {
      const traders = sectionA.categoryLeaderboards[category]
      if (traders && traders.length > 0) {
        const displayName = CATEGORY_DISPLAY_NAMES[category] || category.toUpperCase()
        lines.push(`🏆 ${displayName} TOP 10`)
        lines.push('─────────────────────────')
        traders.slice(0, 10).forEach((trader, i) => {
          lines.push(`${i + 1}. ${trader.displayName} (${trader.wallet}) — P&L: ${trader.pnl_formatted} | ROI: ${trader.roi_formatted} | Trades: ${trader.marketsTraded}`)
        })
        lines.push('')
      }
    }
  } else {
    lines.push('📊 CATEGORY LEADERBOARDS')
    lines.push('───────────────────────────────────────────────')
    lines.push('No category data available')
    lines.push('')
  }
  lines.push('')
  
  // 3. Phase 2: Trader Deep Analytics
  if (sectionA.traderAnalytics.length > 0) {
    lines.push('🔬 PHASE 2: TRADER DEEP ANALYTICS')
    lines.push('───────────────────────────────────────────────')
    lines.push('Detailed performance metrics for content creation')
    lines.push('')
    
    sectionA.traderAnalytics.forEach((trader) => {
      const wowLabel = trader.wow_status === 'heating_up' ? '🔥 HEATING UP' :
                       trader.wow_status === 'cooling_down' ? '❄️ COOLING DOWN' :
                       trader.wow_status === 'new' ? '🆕 NEW' : '➡️ STABLE'
      
      lines.push(`${trader.trader_username} (${trader.trader_wallet})`)
      lines.push(`  Status: ${wowLabel} | WoW Change: ${trader.wow_roi_change_formatted}`)
      lines.push(`  Win Rate: ${trader.win_rate_formatted} (${trader.wins}W / ${trader.losses}L, ${trader.total_resolved} resolved)`)
      lines.push(`  Specialization: ${trader.primary_category} (${trader.categories[0]?.percentage}% of trades)`)
      lines.push(`  Avg Position: ${trader.avg_position_formatted} | Total Invested: $${(trader.total_invested / 1000).toFixed(1)}K`)
      lines.push(`  Frequency: ${trader.trades_per_day_formatted} | Total: ${trader.total_trades} trades`)
      
      if (trader.categories.length > 1) {
        const catBreakdown = trader.categories.map(c => `${c.category}: ${c.percentage}%`).join(', ')
        lines.push(`  Categories: ${catBreakdown}`)
      }
      
      // Add shareable quote
      lines.push(`  📱 Social Media Quote:`)
      lines.push(`  ${trader.shareable_quote.split('\n').join('\n  ')}`)
      lines.push(`  📈 Track: ${trader.profile_url}`)
      
      lines.push('')
    })
  } else {
    lines.push('🔬 PHASE 2: TRADER DEEP ANALYTICS')
    lines.push('───────────────────────────────────────────────')
    lines.push('No analytics data available')
    lines.push('')
  }
  lines.push('')
  
  // 4. New Entrants
  if (sectionA.newEntrants.length > 0) {
    lines.push('🆕 NEW ENTRANTS TO TOP 30 (HIGH PERFORMERS)')
    lines.push('───────────────────────────────────────────────')
    sectionA.newEntrants.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.trader_username} (${trader.trader_wallet}) — Rank #${trader.current_rank} | ROI: ${trader.roi_formatted} | P&L: ${trader.pnl_formatted}`)
    })
    lines.push('')
    lines.push('')
  }
  
  // 5. Risk/Reward Profiles
  lines.push('💎 RISK/REWARD TRADER PROFILES')
  lines.push('───────────────────────────────────────────────')
  if (sectionA.riskRewardProfiles.highRoiLowVolume.length > 0) {
    lines.push('')
    lines.push('💎 HIGH ROI, LOW VOLUME (Hidden Gems)')
    sectionA.riskRewardProfiles.highRoiLowVolume.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.trader_username} — ROI: ${trader.roi_formatted} | Volume: ${trader.volume_formatted}`)
    })
  }
  if (sectionA.riskRewardProfiles.highVolumeConsistent.length > 0) {
    lines.push('')
    lines.push('📊 HIGH VOLUME, CONSISTENT (Reliable)')
    sectionA.riskRewardProfiles.highVolumeConsistent.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.trader_username} — ROI: ${trader.roi_formatted} | Volume: ${trader.volume_formatted}`)
    })
  }
  lines.push('')
  lines.push('')
  
  // 6. Category Momentum
  if (sectionA.categoryMomentum.length > 0) {
    lines.push('📈 CATEGORY MOMENTUM & TRENDS')
    lines.push('───────────────────────────────────────────────')
    sectionA.categoryMomentum.forEach((cat) => {
      const volFormatted = `$${(cat.current_volume / 1000000).toFixed(1)}M`
      const change = cat.volume_change_pct !== null ? ` (${cat.volume_change_formatted})` : ''
      lines.push(`${cat.category}: ${volFormatted} volume${change}`)
    })
    lines.push('')
    lines.push('')
  }
  
  // 7. Top Performers by Metric
  lines.push('🎯 TOP PERFORMERS BY METRIC')
  lines.push('───────────────────────────────────────────────')
  lines.push('')
  
  if (sectionA.topByPnl.length > 0) {
    lines.push('💰 TOP 5 BY P&L (Absolute Profits)')
    sectionA.topByPnl.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.displayName} — ${trader.pnl_formatted}`)
    })
    lines.push('')
  }
  
  if (sectionA.topByRoi.length > 0) {
    lines.push('📊 TOP 5 BY ROI% (Best Returns)')
    sectionA.topByRoi.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.displayName} — ${trader.roi_formatted}`)
    })
    lines.push('')
  }
  
  if (sectionA.topByVolume.length > 0) {
    lines.push('🐋 TOP 5 WHALES (By Volume)')
    sectionA.topByVolume.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.displayName} — ${trader.volume_formatted}`)
    })
    lines.push('')
  }
  
  if (sectionA.topByTradeCount.length > 0) {
    lines.push('⚡ TOP 5 MOST ACTIVE (By Trades)')
    sectionA.topByTradeCount.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.displayName} — ${trader.marketsTraded} trades`)
    })
    lines.push('')
  }
  
  lines.push('')
  
  // ═══════════════════════════════════════════════
  // SECTION B: POLYCOPY PLATFORM DATA
  // ═══════════════════════════════════════════════
  lines.push('═══════════════════════════════════════════════')
  lines.push('SECTION B: POLYCOPY PLATFORM DATA')
  lines.push('(User activity from Polycopy database)')
  lines.push('═══════════════════════════════════════════════')
  lines.push('')
  
  // 1. Most Copied Traders
  lines.push('📊 MOST COPIED TRADERS (LAST 7 DAYS)')
  lines.push('───────────────────────────────────────────────')
  if (sectionB.mostCopiedTraders.length === 0) {
    lines.push('No data available')
  } else {
    sectionB.mostCopiedTraders.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.trader_username || 'Anonymous'} (${trader.trader_wallet}) — ${trader.copy_count} copies`)
    })
  }
  lines.push('')
  lines.push('')
  
  // 2. Platform Stats
  lines.push('📈 PLATFORM STATS (ALL TIME)')
  lines.push('───────────────────────────────────────────────')
  lines.push(`Unique Traders Tracked: ${sectionB.platformStats.uniqueTraders.toLocaleString()}`)
  lines.push(`Total Trades Copied: ${sectionB.platformStats.totalCopies.toLocaleString()}`)
  lines.push(`Active Copiers: ${sectionB.platformStats.activeUsers.toLocaleString()}`)
  lines.push(`Avg ROI (Resolved): ${sectionB.platformStats.avgRoi_formatted}`)
  lines.push(`Win Rate: ${sectionB.platformStats.winRate_formatted}`)
  lines.push('')
  lines.push('')
  
  // 3. Newly Tracked Traders
  lines.push('🆕 NEWLY TRACKED TRADERS (LAST 7 DAYS)')
  lines.push('───────────────────────────────────────────────')
  if (sectionB.newlyTrackedTraders.length === 0) {
    lines.push('No data available')
  } else {
    sectionB.newlyTrackedTraders.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.trader_username || 'Anonymous'} (${trader.trader_wallet}) | First copied: ${trader.first_copied_formatted} | ${trader.unique_markets} markets traded`)
    })
  }
  lines.push('')
  lines.push('')
  
  // 4. Most Copied Markets
  lines.push('🔥 MOST COPIED MARKETS (LAST 7 DAYS)')
  lines.push('───────────────────────────────────────────────')
  if (sectionB.mostCopiedMarkets.length === 0) {
    lines.push('No data available')
  } else {
    sectionB.mostCopiedMarkets.forEach((market, i) => {
      const roiPart = market.avg_roi !== null ? ` (Avg ROI: ${market.avg_roi_formatted})` : ''
      lines.push(`${i + 1}. ${market.market_title_truncated} — ${market.copy_count} copies${roiPart}`)
    })
  }
  lines.push('')
  lines.push('')
  
  // 5. Recent Activity
  lines.push('⏱️ RECENT COPY ACTIVITY (LAST 20)')
  lines.push('───────────────────────────────────────────────')
  if (sectionB.recentActivity.length === 0) {
    lines.push('No data available')
  } else {
    sectionB.recentActivity.forEach((activity) => {
      lines.push(`[${activity.time_formatted}] ${activity.trader_username || 'Anonymous'} (${activity.trader_wallet}) copied on ${activity.market_title_truncated} (${activity.outcome})`)
    })
  }
  lines.push('')
  lines.push('')
  
  // 6. Fastest Growing Traders
  lines.push('🚀 FASTEST GROWING TRADERS (BY NEW FOLLOWERS)')
  lines.push('───────────────────────────────────────────────')
  if (sectionB.fastestGrowingTraders.length === 0) {
    lines.push('No new followers this week')
  } else {
    sectionB.fastestGrowingTraders.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.trader_username || 'Anonymous'} (${trader.trader_wallet}) — ${trader.growth_rate} | Total: ${trader.total_followers} followers`)
    })
  }
  lines.push('')
  lines.push('')
  
  // 7. Copier Performance
  lines.push('👥 TOP COPIER PERFORMANCE (BEST ROI)')
  lines.push('───────────────────────────────────────────────')
  if (sectionB.copierPerformance.length === 0) {
    lines.push('No resolved trades yet')
  } else {
    sectionB.copierPerformance.forEach((copier, i) => {
      const traderInfo = copier.best_trader ? ` | Copying: ${copier.best_trader}` : ''
      lines.push(`${i + 1}. ${copier.user_email} — Avg ROI: ${copier.avg_roi_formatted} | Win Rate: ${copier.win_rate_formatted} | ${copier.total_copies} trades${traderInfo}`)
    })
  }
  lines.push('')
  lines.push('')
  
  // 8. ROI by Follower Count
  lines.push('📊 ROI ANALYSIS BY POPULARITY')
  lines.push('───────────────────────────────────────────────')
  lines.push('Shows if more popular traders perform better (social proof validation)')
  lines.push('')
  if (sectionB.roiByFollowerCount.length === 0) {
    lines.push('No data available')
  } else {
    sectionB.roiByFollowerCount.forEach((bucket) => {
      lines.push(`${bucket.follower_bucket}: ${bucket.trader_count} traders — Avg ROI: ${bucket.avg_roi_formatted}`)
    })
  }
  lines.push('')
  lines.push('')
  
  // 9. Copy Velocity Trends
  if (sectionB.copyVelocity.length > 0) {
    lines.push('⚡ COPY VELOCITY TRENDS (Last 7 Days)')
    lines.push('───────────────────────────────────────────────')
    sectionB.copyVelocity.forEach((trader, i) => {
      const trendIcon = trader.trend === 'accelerating' ? '🚀' : trader.trend === 'decelerating' ? '📉' : '➡️'
      lines.push(`${i + 1}. ${trader.trader_username} — ${trader.daily_avg_7d}/day avg | Today: ${trader.copies_today} | Total 7d: ${trader.copies_7d_total} ${trendIcon}`)
    })
    lines.push('')
    lines.push('')
  }
  
  // 10. Success Stories
  if (sectionB.successStories.length > 0) {
    lines.push('🏆 SUCCESS STORY HIGHLIGHTS (Top Performers)')
    lines.push('───────────────────────────────────────────────')
    sectionB.successStories.forEach((story, i) => {
      lines.push(`#${i + 1}: ${story.user_email}`)
      lines.push(`  Total Trades: ${story.total_trades} | Avg ROI: ${story.avg_roi_formatted} | Win Rate: ${story.win_rate_formatted}`)
      lines.push(`  Following: ${story.best_trader} | vs Platform Avg: ${story.vs_platform_avg}`)
      lines.push('')
    })
    lines.push('')
  }
  
  // 11. Market Concentration
  lines.push('🎯 MARKET CONCENTRATION ANALYSIS')
  lines.push('───────────────────────────────────────────────')
  lines.push(`Concentration Score: ${sectionB.marketConcentration.concentration_score.toUpperCase()}`)
  lines.push(`Top 3 markets: ${sectionB.marketConcentration.top3_percentage}% of all copies`)
  lines.push(`Top 10 markets: ${sectionB.marketConcentration.top10_percentage}% of all copies`)
  lines.push(`Total unique markets: ${sectionB.marketConcentration.total_unique_markets}`)
  lines.push('')
  lines.push('')
  
  // 12. Exit Strategy Analysis
  lines.push('⏱️ EXIT STRATEGY ANALYSIS')
  lines.push('───────────────────────────────────────────────')
  lines.push(`Winners hold time: ${sectionB.exitStrategyAnalysis.avg_hold_time_winners_formatted}`)
  lines.push(`Losers hold time: ${sectionB.exitStrategyAnalysis.avg_hold_time_losers_formatted}`)
  lines.push(`Matches trader exits: ${sectionB.exitStrategyAnalysis.matches_trader_exit_rate}% of trades`)
  if (sectionB.exitStrategyAnalysis.avg_hold_time_losers > 0 && sectionB.exitStrategyAnalysis.avg_hold_time_losers < sectionB.exitStrategyAnalysis.avg_hold_time_winners) {
    lines.push(`⚠️ Users panic-selling losers ${sectionB.exitStrategyAnalysis.early_exit_rate}% earlier than winners`)
  }
  lines.push('')
  lines.push('')
  
  // Footer
  lines.push('═══════════════════════════════════════════════')
  lines.push('END OF DASHBOARD DATA')
  lines.push('═══════════════════════════════════════════════')
  
  return lines.join('\n')
}

// Build trader detail content as copyable text
function buildTraderContent(details: TraderDetails): string {
  const lines: string[] = []
  const { lifetimeStats, tradeHistory, marketFocus, copyMetrics, tradingStyle, primaryCategory } = details
  
  lines.push('═══════════════════════════════════════════════')
  lines.push(`TRADER DEEP DIVE: ${lifetimeStats.trader_username || 'Anonymous'}`)
  lines.push(`Full Wallet: ${lifetimeStats.trader_wallet}`)
  lines.push('═══════════════════════════════════════════════')
  lines.push('')
  
  lines.push('📊 LIFETIME STATS (REAL POLYMARKET DATA)')
  lines.push('───────────────────────────────────────────────')
  lines.push(`Total Trades: ${lifetimeStats.total_trades}`)
  lines.push(`P&L: ${lifetimeStats.total_pnl_formatted}`)
  lines.push(`Volume: ${lifetimeStats.total_volume_formatted}`)
  lines.push(`ROI: ${lifetimeStats.roi_formatted}`)
  lines.push(`Markets Traded: ${lifetimeStats.markets_traded}`)
  lines.push(`Times Copied on Polycopy: ${copyMetrics.total_copies} by ${copyMetrics.unique_copiers} users`)
  lines.push(`First Trade: ${formatDateLong(lifetimeStats.first_trade)}`)
  lines.push('')
  
  lines.push('📋 RECENT TRADE HISTORY (Last 100)')
  lines.push('───────────────────────────────────────────────')
  if (tradeHistory.length === 0) {
    lines.push('No trades found')
  } else {
    tradeHistory.slice(0, 20).forEach((trade, i) => {
      lines.push(`${i + 1}. ${truncateText(trade.market_title, 50)} | ${trade.side} ${trade.outcome} @ $${trade.price.toFixed(2)} | $${trade.value.toFixed(0)} | ${formatDateShort(trade.created_at)} | ${trade.category}`)
    })
  }
  lines.push('')
  
  lines.push('🎯 MARKET FOCUS')
  lines.push('───────────────────────────────────────────────')
  if (marketFocus.length === 0) {
    lines.push('No data available')
  } else {
    marketFocus.forEach((cat) => {
      lines.push(`${cat.category}: ${cat.trade_count} trades (${cat.percentage}%) - Avg Value: $${cat.avg_value.toFixed(0)}`)
    })
  }
  lines.push('')
  lines.push(`Primary Markets: ${primaryCategory}`)
  lines.push(`Trading Style: ${tradingStyle}`)
  lines.push('')
  
  lines.push('🔗 QUICK LINKS')
  lines.push('───────────────────────────────────────────────')
  lines.push(`Polycopy Profile: polycopy.app/trader/${lifetimeStats.trader_wallet}`)
  lines.push('')
  lines.push('═══════════════════════════════════════════════')
  
  return lines.join('\n')
}
