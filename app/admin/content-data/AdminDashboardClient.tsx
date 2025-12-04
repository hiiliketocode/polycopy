'use client'

import { useState, useTransition } from 'react'
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
    market_title: string
    outcome: string
    created_at: string
    time_formatted: string
    market_title_truncated: string
  }>
  lastUpdated: string
  errors: string[]
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
  const router = useRouter()

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

    // Build all content as text
    const content = buildAllContent(data)
    
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
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
                  {i + 1}. {trader.trader_username || 'Anonymous'} — {trader.copy_count} {trader.copy_count === 1 ? 'copy' : 'copies'}{' '}
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
                  {i + 1}. {trade.trader_username || 'Anonymous'} | {truncateText(trade.market_title, 50)} | {trade.outcome} |{' '}
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
                  {i + 1}. {trader.trader_username || 'Anonymous'} | First copied: {trader.first_copied_formatted} | {trader.unique_markets} {trader.unique_markets === 1 ? 'market' : 'markets'} traded
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
                  {activity.trader_username || 'Anonymous'} copied on{' '}
                  {activity.market_title_truncated}{' '}
                  <span className="text-[#FDB022]">({activity.outcome})</span>
                </div>
              ))}
            </div>
          )}
        </Section>

      </div>
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

// Helper to truncate text
function truncateText(text: string, maxLength: number): string {
  if (!text) return '--'
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
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

