'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { verifyPassword } from './actions'

// Section A: Polymarket API Data
interface SectionAData {
  topTraders: Array<{
    address: string
    username: string
    totalPnL: string
    volume: string
    roi: string
    marketsTraded: number
  }>
  recentTrades: Array<{
    id: string
    trader: string
    market: string
    outcome: string
    size: string
    price: string
    date: string
  }>
  categoryBreakdown: Array<{
    category: string
    marketCount: number
    volume24h: string
  }>
  topMarketsByVolume: Array<{
    id: string
    question: string
    volume24h: string
    category: string
  }>
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
    avg_roi: number | null
    best_roi: number | null
    worst_roi: number | null
    wins: number
    losses: number
    breakeven: number
    first_tracked: string | null
  }
  tradeHistory: Array<{
    market_title: string
    outcome: string
    roi: number | null
    market_resolved: boolean
    created_at: string
  }>
  marketFocus: Array<{
    category: string
    trade_count: number
    percentage: number
    avg_roi: number | null
  }>
  copyMetrics: {
    unique_copiers: number
    total_copies: number
    first_copy: string | null
    last_copy: string | null
  }
  platformStats: {
    platform_avg_roi: number | null
    platform_win_rate: number | null
  }
  recentActivity: Array<{
    market_title: string
    outcome: string
    roi: number | null
    market_resolved: boolean
    created_at: string
  }>
  tradingStyle: string
  primaryCategory: string
}

interface AdminDashboardClientProps {
  isAuthenticated: boolean
  data: DashboardData | null
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
  const router = useRouter()

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
    const content = buildAllContent(data)
    
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
          <h2 className="text-2xl font-bold text-black">📈 SECTION A: POLYMARKET PLATFORM DATA</h2>
          <p className="text-black/70 text-sm">Real-time data from Polymarket APIs (cached 10 min)</p>
        </div>
        
        <div className="space-y-6 border-2 border-[#FDB022]/30 rounded-b-lg p-4 md:p-6">
          
          {/* 1. Top Traders (Leaderboard) */}
          <Section title="🏆 TOP TRADERS (POLYMARKET LEADERBOARD)">
            {sectionA.topTraders.length === 0 ? (
              <ErrorMessage message="Polymarket leaderboard data unavailable" />
            ) : (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {sectionA.topTraders.map((trader, i) => (
                  <div key={trader.address || i} className="font-mono text-sm">
                    {i + 1}.{' '}
                    <span className="text-white font-medium">{trader.username}</span>{' '}
                    — P&L: <span className="text-green-400">{trader.totalPnL}</span>{' '}
                    | Volume: <span className="text-[#FDB022]">{trader.volume}</span>{' '}
                    | ROI: <span className={trader.roi.startsWith('+') ? 'text-green-400' : trader.roi.startsWith('-') ? 'text-red-400' : 'text-gray-400'}>{trader.roi}</span>{' '}
                    | <span className="text-gray-500">{trader.marketsTraded} markets</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 2. Recent Platform Trades */}
          <Section title="🔄 RECENT PLATFORM TRADES">
            {sectionA.recentTrades.length === 0 ? (
              <ErrorMessage message="Polymarket trades data unavailable" />
            ) : (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {sectionA.recentTrades.map((trade, i) => (
                  <div key={trade.id || i} className="font-mono text-sm">
                    {i + 1}. <span className="text-gray-400">{trade.trader}</span>{' '}
                    | {truncateText(trade.market, 40)}{' '}
                    | <span className="text-[#FDB022]">{trade.outcome}</span>{' '}
                    | Size: <span className="text-green-400">{trade.size}</span>{' '}
                    | Price: {trade.price}{' '}
                    | <span className="text-gray-500">{trade.date}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 3. Market Category Breakdown */}
          <Section title="📊 MARKET CATEGORY BREAKDOWN">
            {sectionA.categoryBreakdown.length === 0 ? (
              <ErrorMessage message="Market category data unavailable" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-sm">
                  <thead>
                    <tr className="border-b border-[#374151]">
                      <th className="text-left py-2 px-3 text-[#FDB022]">Category</th>
                      <th className="text-right py-2 px-3 text-[#FDB022]">Active Markets</th>
                      <th className="text-right py-2 px-3 text-[#FDB022]">24h Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionA.categoryBreakdown.map((cat) => (
                      <tr key={cat.category} className="border-b border-[#374151]/50">
                        <td className="py-2 px-3">{cat.category}</td>
                        <td className="py-2 px-3 text-right text-[#FDB022]">{cat.marketCount}</td>
                        <td className="py-2 px-3 text-right text-green-400">{cat.volume24h}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* 4. Top Markets by Volume */}
          <Section title="🏆 TOP MARKETS BY 24H VOLUME">
            {sectionA.topMarketsByVolume.length === 0 ? (
              <ErrorMessage message="Market volume data unavailable" />
            ) : (
              <div className="space-y-1 max-h-[400px] overflow-y-auto">
                {sectionA.topMarketsByVolume.map((market, i) => (
                  <div key={market.id || i} className="font-mono text-sm">
                    {i + 1}. {market.question}{' '}
                    — Volume: <span className="text-green-400">{market.volume24h}</span>{' '}
                    | <span className="text-gray-500 text-xs">{market.category}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* 5. Category Leaderboards - Coming Soon */}
          <Section title="📊 CATEGORY LEADERBOARDS">
            <div className="text-gray-400 italic">
              <p>🚧 Coming soon - requires trader-level filtering by category</p>
              <p className="text-sm mt-2">This feature will show top traders per category (Crypto, Politics, Sports, etc.) and requires aggregating trade data by market category.</p>
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
                    — {trader.copy_count} {trader.copy_count === 1 ? 'copy' : 'copies'}{' '}
                    <span className="text-gray-500">({trader.trader_wallet.slice(0, 6)}...{trader.trader_wallet.slice(-4)})</span>
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
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[#374151] hover:bg-[#4b5563] text-white rounded-lg"
            >
              Close
            </button>
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
            </div>

            <ModalSection title="📊 LIFETIME STATS">
              <div className="space-y-1 text-sm">
                <div>Total Trades Copied: <span className="text-[#FDB022]">{details.lifetimeStats.total_trades}</span></div>
                <div>Average ROI: <span className={getRoiColor(details.lifetimeStats.avg_roi)}>{formatROI(details.lifetimeStats.avg_roi)}</span></div>
                <div>Win Rate: <span className="text-[#FDB022]">{formatWinRate(details.lifetimeStats.wins, details.lifetimeStats.losses)}</span> ({details.lifetimeStats.wins} wins, {details.lifetimeStats.losses} losses, {details.lifetimeStats.breakeven} breakeven)</div>
                <div>Best Trade: <span className="text-green-400">{formatROI(details.lifetimeStats.best_roi)}</span></div>
                <div>Worst Trade: <span className={getRoiColor(details.lifetimeStats.worst_roi)}>{formatROI(details.lifetimeStats.worst_roi)}</span></div>
                <div>Times Copied: <span className="text-[#FDB022]">{details.copyMetrics.total_copies}</span> by <span className="text-[#FDB022]">{details.copyMetrics.unique_copiers}</span> users</div>
                <div>First Tracked: <span className="text-gray-300">{formatDateLong(details.lifetimeStats.first_tracked)}</span></div>
              </div>
            </ModalSection>

            <ModalSection title="📈 PERFORMANCE VS PLATFORM">
              <div className="space-y-2 text-sm">
                <div>
                  Trader ROI: <span className={getRoiColor(details.lifetimeStats.avg_roi)}>{formatROI(details.lifetimeStats.avg_roi)}</span> | 
                  Platform Avg: <span className={getRoiColor(details.platformStats.platform_avg_roi)}>{formatROI(details.platformStats.platform_avg_roi)}</span>
                  {details.lifetimeStats.avg_roi !== null && details.platformStats.platform_avg_roi !== null && details.platformStats.platform_avg_roi !== 0 && (
                    <span className="text-gray-400"> → {formatMultiplier(details.lifetimeStats.avg_roi, details.platformStats.platform_avg_roi)}</span>
                  )}
                </div>
                <div>
                  Trader Win Rate: <span className="text-[#FDB022]">{formatWinRate(details.lifetimeStats.wins, details.lifetimeStats.losses)}</span> | 
                  Platform Avg: <span className="text-[#FDB022]">{details.platformStats.platform_win_rate !== null ? `${details.platformStats.platform_win_rate.toFixed(1)}%` : '--'}</span>
                </div>
              </div>
            </ModalSection>

            <ModalSection title="📋 TRADE HISTORY (All Time)">
              {details.tradeHistory.length === 0 ? (
                <p className="text-gray-500">No trades found</p>
              ) : (
                <div className="space-y-1 text-sm max-h-[200px] overflow-y-auto">
                  {details.tradeHistory.map((trade, i) => (
                    <div key={`${trade.created_at}-${i}`}>
                      {i + 1}. {truncateText(trade.market_title, 60)} | {trade.outcome} | {formatROI(trade.roi)} | {formatDateShort(trade.created_at)} {getStatusEmoji(trade.roi, trade.market_resolved)}
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
                      {cat.category}: <span className="text-[#FDB022]">{cat.trade_count}</span> trades ({cat.percentage}%) - Avg ROI: <span className={getRoiColor(cat.avg_roi)}>{formatROI(cat.avg_roi)}</span>
                    </div>
                  ))}
                  <div className="mt-3 pt-3 border-t border-[#374151]">
                    <div>Primary Markets: <span className="text-[#FDB022]">{details.primaryCategory}</span></div>
                    <div>Trading Style: <span className="text-gray-300">{details.tradingStyle}</span></div>
                  </div>
                </div>
              )}
            </ModalSection>

            <ModalSection title="⏱️ RECENT ACTIVITY (Last 7 Days)">
              {details.recentActivity.length === 0 ? (
                <p className="text-gray-500">No recent activity</p>
              ) : (
                <div className="space-y-1 text-sm">
                  {details.recentActivity.map((activity, i) => (
                    <div key={`${activity.created_at}-${i}`}>
                      <span className="text-gray-500">[{formatDateTime(activity.created_at)}]</span>{' '}
                      {truncateText(activity.market_title, 50)} | {activity.outcome} | {activity.market_resolved ? 'Resolved' : 'Open'} {getStatusEmoji(activity.roi, activity.market_resolved)}
                    </div>
                  ))}
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

function formatMultiplier(traderRoi: number, platformRoi: number): string {
  if (platformRoi === 0) return '--'
  const multiplier = Math.abs(traderRoi / platformRoi)
  const better = traderRoi >= platformRoi
  return `${multiplier.toFixed(1)}x ${better ? 'better' : 'worse'}`
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

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

function getStatusEmoji(roi: number | null, resolved: boolean): string {
  if (!resolved) return '⚪'
  if (roi === null || roi === undefined) return '⚪'
  if (roi > 0) return '✅'
  if (roi < 0) return '❌'
  return '⚪'
}

// Build all content as copyable text
function buildAllContent(data: DashboardData): string {
  const { sectionA, sectionB } = data
  const lines: string[] = []
  
  lines.push('═══════════════════════════════════════════════')
  lines.push('POLYCOPY CONTENT DATA DASHBOARD')
  lines.push(`Last Updated: ${data.lastUpdated}`)
  lines.push('═══════════════════════════════════════════════')
  lines.push('')
  
  // SECTION A: POLYMARKET PLATFORM DATA
  lines.push('═══════════════════════════════════════════════')
  lines.push('SECTION A: POLYMARKET PLATFORM DATA')
  lines.push('(Real-time data from Polymarket APIs)')
  lines.push('═══════════════════════════════════════════════')
  lines.push('')
  
  // 1. Top Traders
  lines.push('🏆 TOP TRADERS (POLYMARKET LEADERBOARD)')
  lines.push('───────────────────────────────────────────────')
  if (sectionA.topTraders.length === 0) {
    lines.push('Data unavailable')
  } else {
    sectionA.topTraders.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.username} — P&L: ${trader.totalPnL} | Volume: ${trader.volume} | ROI: ${trader.roi} | ${trader.marketsTraded} markets`)
    })
  }
  lines.push('')
  
  // 2. Recent Trades
  lines.push('🔄 RECENT PLATFORM TRADES')
  lines.push('───────────────────────────────────────────────')
  if (sectionA.recentTrades.length === 0) {
    lines.push('Data unavailable')
  } else {
    sectionA.recentTrades.forEach((trade, i) => {
      lines.push(`${i + 1}. ${trade.trader} | ${trade.market} | ${trade.outcome} | Size: ${trade.size} | Price: ${trade.price} | ${trade.date}`)
    })
  }
  lines.push('')
  
  // 3. Category Breakdown
  lines.push('📊 MARKET CATEGORY BREAKDOWN')
  lines.push('───────────────────────────────────────────────')
  if (sectionA.categoryBreakdown.length === 0) {
    lines.push('Data unavailable')
  } else {
    sectionA.categoryBreakdown.forEach((cat) => {
      lines.push(`${cat.category}: ${cat.marketCount} markets, Volume: ${cat.volume24h}`)
    })
  }
  lines.push('')
  
  // 4. Top Markets
  lines.push('🏆 TOP MARKETS BY 24H VOLUME')
  lines.push('───────────────────────────────────────────────')
  if (sectionA.topMarketsByVolume.length === 0) {
    lines.push('Data unavailable')
  } else {
    sectionA.topMarketsByVolume.forEach((market, i) => {
      lines.push(`${i + 1}. ${market.question} — Volume: ${market.volume24h} | ${market.category}`)
    })
  }
  lines.push('')
  
  // SECTION B: POLYCOPY PLATFORM DATA
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
      lines.push(`${i + 1}. ${trader.trader_username || 'Anonymous'} — ${trader.copy_count} copies (${trader.trader_wallet.slice(0, 6)}...${trader.trader_wallet.slice(-4)})`)
    })
  }
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
  
  // 3. Newly Tracked Traders
  lines.push('🆕 NEWLY TRACKED TRADERS (LAST 7 DAYS)')
  lines.push('───────────────────────────────────────────────')
  if (sectionB.newlyTrackedTraders.length === 0) {
    lines.push('No data available')
  } else {
    sectionB.newlyTrackedTraders.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.trader_username || 'Anonymous'} | First copied: ${trader.first_copied_formatted} | ${trader.unique_markets} markets traded`)
    })
  }
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
  
  // 5. Recent Activity
  lines.push('⏱️ RECENT COPY ACTIVITY (LAST 20)')
  lines.push('───────────────────────────────────────────────')
  if (sectionB.recentActivity.length === 0) {
    lines.push('No data available')
  } else {
    sectionB.recentActivity.forEach((activity) => {
      lines.push(`[${activity.time_formatted}] ${activity.trader_username || 'Anonymous'} copied on ${activity.market_title_truncated} (${activity.outcome})`)
    })
  }
  
  return lines.join('\n')
}

// Build trader detail content as copyable text
function buildTraderContent(details: TraderDetails): string {
  const lines: string[] = []
  const { lifetimeStats, tradeHistory, marketFocus, copyMetrics, platformStats, recentActivity, tradingStyle, primaryCategory } = details
  
  lines.push('═══════════════════════════════════════════════')
  lines.push(`TRADER DEEP DIVE: ${lifetimeStats.trader_username || 'Anonymous'}`)
  lines.push(`Full Wallet: ${lifetimeStats.trader_wallet}`)
  lines.push('═══════════════════════════════════════════════')
  lines.push('')
  
  lines.push('📊 LIFETIME STATS')
  lines.push('───────────────────────────────────────────────')
  lines.push(`Total Trades Copied: ${lifetimeStats.total_trades}`)
  lines.push(`Average ROI: ${formatROI(lifetimeStats.avg_roi)}`)
  lines.push(`Win Rate: ${formatWinRate(lifetimeStats.wins, lifetimeStats.losses)} (${lifetimeStats.wins} wins, ${lifetimeStats.losses} losses, ${lifetimeStats.breakeven} breakeven)`)
  lines.push(`Best Trade: ${formatROI(lifetimeStats.best_roi)}`)
  lines.push(`Worst Trade: ${formatROI(lifetimeStats.worst_roi)}`)
  lines.push(`Times Copied: ${copyMetrics.total_copies} by ${copyMetrics.unique_copiers} users`)
  lines.push(`First Tracked: ${formatDateLong(lifetimeStats.first_tracked)}`)
  lines.push('')
  
  lines.push('📈 PERFORMANCE VS PLATFORM')
  lines.push('───────────────────────────────────────────────')
  const traderRoiStr = formatROI(lifetimeStats.avg_roi)
  const platformRoiStr = formatROI(platformStats.platform_avg_roi)
  let roiComparison = ''
  if (lifetimeStats.avg_roi !== null && platformStats.platform_avg_roi !== null && platformStats.platform_avg_roi !== 0) {
    roiComparison = ` → ${formatMultiplier(lifetimeStats.avg_roi, platformStats.platform_avg_roi)}`
  }
  lines.push(`Trader ROI: ${traderRoiStr} | Platform Avg: ${platformRoiStr}${roiComparison}`)
  
  const traderWinRateStr = formatWinRate(lifetimeStats.wins, lifetimeStats.losses)
  const platformWinRateStr = platformStats.platform_win_rate !== null ? `${platformStats.platform_win_rate.toFixed(1)}%` : '--'
  lines.push(`Trader Win Rate: ${traderWinRateStr} | Platform Avg: ${platformWinRateStr}`)
  lines.push('')
  
  lines.push('📋 TRADE HISTORY (All Time)')
  lines.push('───────────────────────────────────────────────')
  if (tradeHistory.length === 0) {
    lines.push('No trades found')
  } else {
    tradeHistory.forEach((trade, i) => {
      lines.push(`${i + 1}. ${truncateText(trade.market_title, 60)} | ${trade.outcome} | ${formatROI(trade.roi)} | ${formatDateShort(trade.created_at)} ${getStatusEmoji(trade.roi, trade.market_resolved)}`)
    })
  }
  lines.push('')
  
  lines.push('🎯 MARKET FOCUS')
  lines.push('───────────────────────────────────────────────')
  if (marketFocus.length === 0) {
    lines.push('No data available')
  } else {
    marketFocus.forEach((cat) => {
      lines.push(`${cat.category}: ${cat.trade_count} trades (${cat.percentage}%) - Avg ROI: ${formatROI(cat.avg_roi)}`)
    })
  }
  lines.push('')
  lines.push(`Primary Markets: ${primaryCategory}`)
  lines.push(`Trading Style: ${tradingStyle}`)
  lines.push('')
  
  lines.push('⏱️ RECENT ACTIVITY (Last 7 Days)')
  lines.push('───────────────────────────────────────────────')
  if (recentActivity.length === 0) {
    lines.push('No recent activity')
  } else {
    recentActivity.forEach((activity) => {
      lines.push(`[${formatDateTime(activity.created_at)}] ${truncateText(activity.market_title, 50)} | ${activity.outcome} | ${activity.market_resolved ? 'Resolved' : 'Open'} ${getStatusEmoji(activity.roi, activity.market_resolved)}`)
    })
  }
  lines.push('')
  
  lines.push('🔗 QUICK LINKS')
  lines.push('───────────────────────────────────────────────')
  lines.push(`Profile: polycopy.app/trader/${lifetimeStats.trader_wallet}`)
  lines.push('')
  lines.push('═══════════════════════════════════════════════')
  
  return lines.join('\n')
}
