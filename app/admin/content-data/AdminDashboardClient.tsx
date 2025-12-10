'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { verifyPassword } from './actions'

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
}

// Section A: Polymarket API Data
interface SectionAData {
  topTraders: FormattedTrader[]
  categoryLeaderboards: {
    [key: string]: FormattedTrader[]
  }
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
  isAuthenticated: boolean
  data: DashboardData | null
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

export default function AdminDashboardClient({ isAuthenticated, data }: AdminDashboardClientProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    startTransition(async () => {
      const result = await verifyPassword(password)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error || 'Invalid password')
        setPassword('')
      }
    })
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshSuccess(false)
    
    startTransition(() => {
      router.refresh()
    })
    
    setTimeout(() => {
      setRefreshing(false)
      setRefreshSuccess(true)
      setTimeout(() => setRefreshSuccess(false), 2000)
    }, 1000)
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
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#111827] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">🔐 Admin Dashboard</h1>
            <p className="text-gray-400">Enter password to access content data</p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full px-4 py-3 bg-[#1f2937] border border-[#374151] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#FDB022] focus:border-transparent"
              autoFocus
            />
            
            {error && (
              <p className="text-red-500 text-sm text-center">{error}</p>
            )}
            
            <button
              type="submit"
              disabled={isPending || !password}
              className="w-full py-3 bg-[#FDB022] hover:bg-[#F59E0B] text-black font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Verifying...' : 'Access Dashboard'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Dashboard
  if (!data) return null

  const { sectionA, sectionB } = data
  const allErrors = [...sectionA.apiErrors, ...sectionB.dbErrors]

  return (
    <div className="min-h-screen bg-[#111827] text-white p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
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
          <p className="text-black/70 text-sm">Real-time leaderboard from Polymarket (same as Discover page)</p>
        </div>
        
        <div className="space-y-6 border-2 border-[#FDB022]/30 rounded-b-lg p-4 md:p-6">
          
          {/* 1. Top 30 Traders (Overall Leaderboard) with Sort Options */}
          <Section title="🏆 TOP 30 TRADERS (OVERALL LEADERBOARD) - Last 30 Days">
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
                    | Volume: <span className="text-[#FDB022]">{trader.volume_formatted}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 2. Category Leaderboards */}
          {Object.keys(sectionA.categoryLeaderboards).length > 0 && (
            <Section title="📊 CATEGORY LEADERBOARDS (TOP 10 BY ROI) - Last 30 Days">
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
                          | ROI: <span className={trader.roi >= 0 ? 'text-green-400' : 'text-red-400'}>{trader.roi_formatted}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}
          
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
              <a
                href={`https://polymarket.com/profile/${wallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-[#FDB022] hover:bg-[#F59E0B] text-black font-bold rounded-lg"
              >
                View on Polymarket →
              </a>
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
                  href={`https://polymarket.com/profile/${wallet}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[#FDB022] hover:underline"
                >
                  View on Polymarket →
                </a>
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
  lines.push('🏆 TOP 30 TRADERS (OVERALL LEADERBOARD) - Last 30 Days')
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
      lines.push(`${i + 1}. ${trader.displayName} (${wallet}) — P&L: ${trader.pnl_formatted} | ROI: ${trader.roi_formatted} | Volume: ${trader.volume_formatted}`)
    })
    
    // Sort by P&L
    lines.push('')
    lines.push('💰 SORTED BY P&L:')
    lines.push('')
    const byPNL = [...traders].sort((a, b) => b.pnl - a.pnl)
    byPNL.forEach((trader, i) => {
      const wallet = trader.wallet ? `${trader.wallet.slice(0, 6)}...${trader.wallet.slice(-4)}` : 'Unknown'
      lines.push(`${i + 1}. ${trader.displayName} (${wallet}) — P&L: ${trader.pnl_formatted} | ROI: ${trader.roi_formatted} | Volume: ${trader.volume_formatted}`)
    })
    
    // Sort by Volume
    lines.push('')
    lines.push('📈 SORTED BY VOLUME:')
    lines.push('')
    const byVolume = [...traders].sort((a, b) => b.volume - a.volume)
    byVolume.forEach((trader, i) => {
      const wallet = trader.wallet ? `${trader.wallet.slice(0, 6)}...${trader.wallet.slice(-4)}` : 'Unknown'
      lines.push(`${i + 1}. ${trader.displayName} (${wallet}) — P&L: ${trader.pnl_formatted} | ROI: ${trader.roi_formatted} | Volume: ${trader.volume_formatted}`)
    })
  }
  lines.push('')
  lines.push('')
  
  // 2. Category Leaderboards
  const categoryCount = Object.keys(sectionA.categoryLeaderboards).length
  if (categoryCount > 0) {
    lines.push('📊 CATEGORY LEADERBOARDS (TOP 10 BY ROI) - Last 30 Days')
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
          lines.push(`${i + 1}. ${trader.displayName} — P&L: ${trader.pnl_formatted} | ROI: ${trader.roi_formatted}`)
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
  lines.push(`Polymarket Profile: polymarket.com/profile/${lifetimeStats.trader_wallet}`)
  lines.push('')
  lines.push('═══════════════════════════════════════════════')
  
  return lines.join('\n')
}
