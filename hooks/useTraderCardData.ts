import { useState, useEffect } from 'react'
import type { TimePeriod } from '@/lib/time-period-utils'
import {
  filterByTimePeriod,
  calculatePeriodStats,
  getTimePeriodLabel,
  formatChartData,
  type DailyPnlRow,
} from '@/lib/time-period-utils'

export interface TraderCardData {
  displayName: string
  walletAddress: string
  profileImage?: string | null
  isTopHundred: boolean
  memberSince?: string
  totalPnL: number
  roi: number
  winRate: number
  volume: number
  trades: number
  avgReturn: number
  dailyPnlData: Array<{ date: string; pnl: number; cumulative: number }>
  timePeriod: TimePeriod
  timePeriodLabel: string
  rank?: number | null
}

interface RealizedPnlResponse {
  daily: DailyPnlRow[]
  summaries: any[]
  volume: number | null
  rankings: Record<string, { rank: number | null; total: number | null; delta: number | null }>
}

interface TraderResponse {
  wallet: string
  displayName: string
  pnl: number | null
  roi: number | null
  winRate: number | null
  volume: number | null
  followerCount: number
  profileImage?: string | null
  hasStats: boolean
  source: string
}

export function useTraderCardData(walletAddress: string, timePeriod: TimePeriod) {
  const [data, setData] = useState<TraderCardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      setError(null)

      try {
        // Fetch trader basic info and realized P&L data in parallel
        const [traderResponse, realizedPnlResponse] = await Promise.all([
          fetch(`/api/trader/${walletAddress}?timePeriod=all`),
          fetch(`/api/trader/${walletAddress}/realized-pnl`),
        ])

        if (!traderResponse.ok || !realizedPnlResponse.ok) {
          throw new Error('Failed to fetch trader data')
        }

        const traderInfo: TraderResponse = await traderResponse.json()
        const realizedPnl: RealizedPnlResponse = await realizedPnlResponse.json()

        // Filter data by time period
        const filteredData = filterByTimePeriod(realizedPnl.daily, timePeriod)

        // Calculate stats for time period
        const stats = calculatePeriodStats(filteredData, realizedPnl.volume)

        // Check if trader is in top 100 (from rankings data)
        const allTimeRank = realizedPnl.rankings?.ALL?.rank
        const isTopHundred = allTimeRank !== null && allTimeRank !== undefined && allTimeRank <= 100

        // Get rank for the selected time period
        const timePeriodKey = timePeriod === 'ALL' ? 'ALL' : 
                              timePeriod === '1D' ? '1D' :
                              timePeriod === '7D' ? '7D' :
                              timePeriod === '30D' ? '30D' :
                              timePeriod === '3M' ? '3M' :
                              timePeriod === '6M' ? '6M' : 'ALL'
        
        const periodRank = realizedPnl.rankings?.[timePeriodKey]?.rank

        // Format member since date (first trade date)
        let memberSince: string | undefined
        if (filteredData.length > 0) {
          const firstDate = new Date(filteredData[0].date)
          memberSince = firstDate.toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          })
        }

        // Format chart data
        const chartData = formatChartData(filteredData)

        // Get time period label
        const timePeriodLabel = getTimePeriodLabel(timePeriod)

        // Proxy S3 images through our API to avoid CORS issues
        let proxiedProfileImage = traderInfo.profileImage
        if (proxiedProfileImage && proxiedProfileImage.includes('polymarket-upload.s3.us-east-2.amazonaws.com')) {
          proxiedProfileImage = `/api/proxy-image?url=${encodeURIComponent(proxiedProfileImage)}`
        }

        setData({
          displayName: traderInfo.displayName,
          walletAddress,
          profileImage: proxiedProfileImage,
          isTopHundred,
          memberSince,
          totalPnL: stats.totalPnL,
          roi: stats.roi,
          winRate: stats.winRate,
          volume: stats.volume,
          trades: stats.trades,
          avgReturn: stats.avgReturn,
          dailyPnlData: chartData,
          timePeriod,
          timePeriodLabel,
          rank: periodRank,
        })
      } catch (err) {
        console.error('Error fetching trader card data:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [walletAddress, timePeriod])

  return { data, isLoading, error }
}
