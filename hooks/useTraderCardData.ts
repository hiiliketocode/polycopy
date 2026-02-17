import { useState, useEffect } from 'react'
import type { TimePeriod } from '@/lib/time-period-utils'
import {
  filterByTimePeriodTraderProfile,
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

export function useTraderCardData(walletAddress: string, timePeriod: TimePeriod) {
  const [data, setData] = useState<TraderCardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/v3/trader/${walletAddress}/profile`)
        if (!res.ok) throw new Error('Failed to fetch trader data')
        const v3: any = await res.json()

        // Build DailyPnlRow[] from v3 dailyPnl
        const dailyRows: DailyPnlRow[] = (v3.dailyPnl ?? []).map((r: any) => ({
          date: r.date,
          realized_pnl: Number(r.realized_pnl ?? 0),
          pnl_to_date: r.pnl_to_date != null ? Number(r.pnl_to_date) : null,
        }))

        // Filter data by time period
        const filteredData = filterByTimePeriodTraderProfile(dailyRows, timePeriod)

        // Calculate stats for time period
        const allPerf = v3.performance?.all
        const totalVolume = allPerf?.volume ?? 0
        const stats = calculatePeriodStats(filteredData, totalVolume)

        // Override totalPnL with leaderboard value (includes realized + unrealized)
        const periodPerf =
          timePeriod === '1D' ? v3.performance?.day :
          timePeriod === '7D' ? v3.performance?.week :
          timePeriod === '30D' ? v3.performance?.month :
          allPerf
        if (periodPerf?.pnl != null) {
          stats.totalPnL = periodPerf.pnl
          // Recalculate ROI with authoritative P&L
          stats.roi = totalVolume > 0 ? (stats.totalPnL / totalVolume) * 100 : 0
        }

        // Use win rate from closed positions (authoritative) instead of daily rows
        if (v3.winRate != null) {
          stats.winRate = v3.winRate
        }

        // Check if trader is in top 100 (from all-time rank)
        const allTimeRank = allPerf?.rank ?? 0
        const isTopHundred = allTimeRank > 0 && allTimeRank <= 100

        // Get rank for the selected time period
        const periodRank =
          timePeriod === '1D' ? v3.performance?.day?.rank :
          timePeriod === '7D' ? v3.performance?.week?.rank :
          timePeriod === '30D' ? v3.performance?.month?.rank :
          allPerf?.rank

        // Format member since date — prefer accountCreated (actual join date)
        let memberSince: string | undefined
        if (v3.profile?.accountCreated) {
          const created = new Date(v3.profile.accountCreated)
          memberSince = created.toLocaleDateString('en-US', {
            month: 'short',
            year: 'numeric',
          })
        } else if (dailyRows.length > 0) {
          const firstDate = new Date(dailyRows[0].date)
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
        let proxiedProfileImage = v3.profile?.profileImage ?? null
        if (proxiedProfileImage && proxiedProfileImage.includes('polymarket-upload.s3.us-east-2.amazonaws.com')) {
          proxiedProfileImage = `/api/proxy-image?url=${encodeURIComponent(proxiedProfileImage)}`
        }

        setData({
          displayName: v3.profile?.displayName ?? walletAddress,
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
          rank: periodRank ?? null,
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
