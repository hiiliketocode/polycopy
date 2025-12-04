'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { verifyPassword } from './actions'

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
    roi_formatted: string
    date_formatted: string
  }>
  newlyTrackedTraders: Array<{
    trader_username: string
    trader_wallet: string
    first_copied: string
    unique_markets: number
    first_copied_formatted: string
  }>
  platformStats: {
    uniqueTraders: number
    totalCopies: number
    activeUsers: number
    avgRoi: number | null
    winRate: number | null
    avgRoi_formatted: string
    winRate_formatted: string
  }
  mostCopiedMarkets: Array<{
    market_title: string
    copy_count: number
    avg_roi: number | null
    market_title_truncated: string
    avg_roi_formatted: string
  }>
  recentActivity: Array<{
    trader_username: string
    trader_wallet: string
    market_title: string
    outcome: string
    created_at: string
    time_formatted: string
    market_title_truncated: string
  }>
  lastUpdated: string
  errors: string[]
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

  const handleRefresh = () => {
    router.refresh()
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

  return (
    <div className="min-h-screen bg-[#111827] text-white p-4 md:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              🔐 POLYCOPY ADMIN - CONTENT DATA DASHBOARD
            </h1>
            <p className="text-gray-400 text-sm">
              Last Updated: {data.lastUpdated}
            </p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-[#374151] hover:bg-[#4b5563] text-white font-medium rounded-lg transition-colors"
            >
              🔄 Refresh Data
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
        {data.errors.length > 0 && (
          <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg">
            <p className="text-red-400 font-medium">Some data failed to load:</p>
            <ul className="text-red-300 text-sm mt-1">
              {data.errors.map((err, i) => (
                <li key={i}>• {err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Content Sections */}
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Section 1: Most Copied Traders */}
        <Section title="📊 MOST COPIED TRADERS (LAST 7 DAYS)">
          {data.mostCopiedTraders.length === 0 ? (
            <p className="text-gray-500">No data available</p>
          ) : (
            <div className="space-y-1">
              {data.mostCopiedTraders.map((trader, i) => (
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

        {/* Section 2: Top Performing Trades */}
        <Section title="🏆 TOP PERFORMING TRADES (LAST 7 DAYS)">
          {data.topPerformingTrades.length === 0 ? (
            <p className="text-gray-500">No data available</p>
          ) : (
            <div className="space-y-1">
              {data.topPerformingTrades.map((trade, i) => (
                <div key={`${trade.created_at}-${i}`} className="font-mono text-sm">
                  {i + 1}.{' '}
                  <TraderName 
                    username={trade.trader_username} 
                    wallet={(data.mostCopiedTraders.find(t => t.trader_username === trade.trader_username)?.trader_wallet) || ''}
                    onClick={handleTraderClick}
                  />{' '}
                  | {truncateText(trade.market_title, 50)} | {trade.outcome} |{' '}
                  <span className={trade.roi >= 0 ? 'text-green-400' : 'text-red-400'}>
                    ROI: {trade.roi_formatted}
                  </span>{' '}
                  | {trade.date_formatted}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Section 3: Newly Tracked Traders */}
        <Section title="🆕 NEWLY TRACKED TRADERS (LAST 7 DAYS)">
          {data.newlyTrackedTraders.length === 0 ? (
            <p className="text-gray-500">No data available</p>
          ) : (
            <div className="space-y-1">
              {data.newlyTrackedTraders.map((trader, i) => (
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

        {/* Section 4: Platform Stats */}
        <Section title="📈 PLATFORM STATS (ALL TIME)">
          <div className="font-mono text-sm space-y-1">
            <div>Unique Traders Tracked: <span className="text-[#FDB022]">{data.platformStats.uniqueTraders.toLocaleString()}</span></div>
            <div>Total Trades Copied: <span className="text-[#FDB022]">{data.platformStats.totalCopies.toLocaleString()}</span></div>
            <div>Active Copiers: <span className="text-[#FDB022]">{data.platformStats.activeUsers.toLocaleString()}</span></div>
            <div>Avg ROI (Resolved): <span className={data.platformStats.avgRoi && data.platformStats.avgRoi >= 0 ? 'text-green-400' : 'text-red-400'}>{data.platformStats.avgRoi_formatted}</span></div>
            <div>Win Rate: <span className="text-[#FDB022]">{data.platformStats.winRate_formatted}</span></div>
          </div>
        </Section>

        {/* Section 5: Most Copied Markets */}
        <Section title="🔥 MOST COPIED MARKETS (LAST 7 DAYS)">
          {data.mostCopiedMarkets.length === 0 ? (
            <p className="text-gray-500">No data available</p>
          ) : (
            <div className="space-y-1">
              {data.mostCopiedMarkets.map((market, i) => (
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

        {/* Section 6: Recent Activity */}
        <Section title="⏱️ RECENT COPY ACTIVITY (LAST 20)">
          {data.recentActivity.length === 0 ? (
            <p className="text-gray-500">No data available</p>
          ) : (
            <div className="space-y-1">
              {data.recentActivity.map((activity, i) => (
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
        {/* Close Button */}
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
            {/* Header */}
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

            {/* Section 1: Lifetime Stats */}
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

            {/* Section 2: Performance vs Platform */}
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
                  {details.platformStats.platform_win_rate !== null && details.platformStats.platform_win_rate > 0 && (
                    <span className="text-gray-400"> → {formatWinRateMultiplier(details.lifetimeStats.wins, details.lifetimeStats.losses, details.platformStats.platform_win_rate)}</span>
                  )}
                </div>
              </div>
            </ModalSection>

            {/* Section 3: Trade History */}
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

            {/* Section 4: Market Focus */}
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

            {/* Section 5: Recent Activity */}
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

            {/* Section 6: Quick Links */}
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

            {/* Copy All Button */}
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

function formatWinRateMultiplier(wins: number, losses: number, platformRate: number): string {
  const total = wins + losses
  if (total === 0 || platformRate === 0) return '--'
  const traderRate = (wins / total) * 100
  const multiplier = traderRate / platformRate
  const better = traderRate >= platformRate
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
  const lines: string[] = []
  
  lines.push('═══════════════════════════════════════════════')
  lines.push('POLYCOPY CONTENT DATA DASHBOARD')
  lines.push(`Last Updated: ${data.lastUpdated}`)
  lines.push('═══════════════════════════════════════════════')
  lines.push('')
  
  // Section 1
  lines.push('📊 MOST COPIED TRADERS (LAST 7 DAYS)')
  lines.push('───────────────────────────────────────────────')
  if (data.mostCopiedTraders.length === 0) {
    lines.push('No data available')
  } else {
    data.mostCopiedTraders.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.trader_username || 'Anonymous'} — ${trader.copy_count} copies (${trader.trader_wallet.slice(0, 6)}...${trader.trader_wallet.slice(-4)})`)
    })
  }
  lines.push('')
  
  // Section 2
  lines.push('🏆 TOP PERFORMING TRADES (LAST 7 DAYS)')
  lines.push('───────────────────────────────────────────────')
  if (data.topPerformingTrades.length === 0) {
    lines.push('No data available')
  } else {
    data.topPerformingTrades.forEach((trade, i) => {
      lines.push(`${i + 1}. ${trade.trader_username || 'Anonymous'} | ${truncateText(trade.market_title, 50)} | ${trade.outcome} | ROI: ${trade.roi_formatted} | ${trade.date_formatted}`)
    })
  }
  lines.push('')
  
  // Section 3
  lines.push('🆕 NEWLY TRACKED TRADERS (LAST 7 DAYS)')
  lines.push('───────────────────────────────────────────────')
  if (data.newlyTrackedTraders.length === 0) {
    lines.push('No data available')
  } else {
    data.newlyTrackedTraders.forEach((trader, i) => {
      lines.push(`${i + 1}. ${trader.trader_username || 'Anonymous'} | First copied: ${trader.first_copied_formatted} | ${trader.unique_markets} markets traded`)
    })
  }
  lines.push('')
  
  // Section 4
  lines.push('📈 PLATFORM STATS (ALL TIME)')
  lines.push('───────────────────────────────────────────────')
  lines.push(`Unique Traders Tracked: ${data.platformStats.uniqueTraders.toLocaleString()}`)
  lines.push(`Total Trades Copied: ${data.platformStats.totalCopies.toLocaleString()}`)
  lines.push(`Active Copiers: ${data.platformStats.activeUsers.toLocaleString()}`)
  lines.push(`Avg ROI (Resolved): ${data.platformStats.avgRoi_formatted}`)
  lines.push(`Win Rate: ${data.platformStats.winRate_formatted}`)
  lines.push('')
  
  // Section 5
  lines.push('🔥 MOST COPIED MARKETS (LAST 7 DAYS)')
  lines.push('───────────────────────────────────────────────')
  if (data.mostCopiedMarkets.length === 0) {
    lines.push('No data available')
  } else {
    data.mostCopiedMarkets.forEach((market, i) => {
      const roiPart = market.avg_roi !== null ? ` (Avg ROI: ${market.avg_roi_formatted})` : ''
      lines.push(`${i + 1}. ${market.market_title_truncated} — ${market.copy_count} copies${roiPart}`)
    })
  }
  lines.push('')
  
  // Section 6
  lines.push('⏱️ RECENT COPY ACTIVITY (LAST 20)')
  lines.push('───────────────────────────────────────────────')
  if (data.recentActivity.length === 0) {
    lines.push('No data available')
  } else {
    data.recentActivity.forEach((activity) => {
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
  
  // Section 1: Lifetime Stats
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
  
  // Section 2: Performance vs Platform
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
  let winRateComparison = ''
  if (platformStats.platform_win_rate !== null && platformStats.platform_win_rate > 0) {
    winRateComparison = ` → ${formatWinRateMultiplier(lifetimeStats.wins, lifetimeStats.losses, platformStats.platform_win_rate)}`
  }
  lines.push(`Trader Win Rate: ${traderWinRateStr} | Platform Avg: ${platformWinRateStr}${winRateComparison}`)
  lines.push('')
  
  // Section 3: Trade History
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
  
  // Section 4: Market Focus
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
  
  // Section 5: Recent Activity
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
  
  // Section 6: Quick Links
  lines.push('🔗 QUICK LINKS')
  lines.push('───────────────────────────────────────────────')
  lines.push(`Profile: polycopy.app/trader/${lifetimeStats.trader_wallet}`)
  lines.push('')
  lines.push('═══════════════════════════════════════════════')
  
  return lines.join('\n')
}
