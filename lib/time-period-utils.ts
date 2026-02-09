/**
 * Time period utilities for filtering and calculating trader stats
 */

export type TimePeriod = '1D' | '7D' | '30D' | '3M' | '6M' | 'ALL'

export interface DailyPnlRow {
  date: string
  realized_pnl: number
  pnl_to_date: number | null
}

export interface PeriodStats {
  totalPnL: number
  roi: number
  winRate: number
  volume: number
  trades: number
  avgReturn: number
  daysActive: number
  daysUp: number
  daysDown: number
}

/**
 * Filter daily PnL data by time period
 */
export function filterByTimePeriod(
  data: DailyPnlRow[],
  period: TimePeriod
): DailyPnlRow[] {
  if (period === 'ALL' || !data.length) {
    return data
  }

  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const cutoffDate = new Date(now)

  switch (period) {
    case '1D':
      cutoffDate.setDate(now.getDate() - 1)
      break
    case '7D':
      cutoffDate.setDate(now.getDate() - 7)
      break
    case '30D':
      cutoffDate.setDate(now.getDate() - 30)
      break
    case '3M':
      cutoffDate.setMonth(now.getMonth() - 3)
      break
    case '6M':
      cutoffDate.setMonth(now.getMonth() - 6)
      break
  }

  return data.filter((d) => {
    const rowDate = new Date(d.date)
    rowDate.setHours(0, 0, 0, 0)
    return rowDate >= cutoffDate
  })
}

/**
 * Calculate stats for a time period from filtered daily PnL data
 */
export function calculatePeriodStats(
  data: DailyPnlRow[],
  totalVolume: number | null
): PeriodStats {
  if (!data.length) {
    return {
      totalPnL: 0,
      roi: 0,
      winRate: 0,
      volume: totalVolume || 0,
      trades: 0,
      avgReturn: 0,
      daysActive: 0,
      daysUp: 0,
      daysDown: 0,
    }
  }

  // Calculate total P&L
  const totalPnL = data.reduce((sum, row) => sum + (row.realized_pnl || 0), 0)

  // Count days
  const daysActive = data.length
  const daysUp = data.filter((row) => row.realized_pnl > 0).length
  const daysDown = data.filter((row) => row.realized_pnl < 0).length

  // Calculate win rate (days up / days active)
  const winRate = daysActive > 0 ? (daysUp / daysActive) * 100 : 0

  // Calculate ROI
  const volume = totalVolume || 0
  const roi = volume > 0 ? (totalPnL / volume) * 100 : 0

  // Calculate average return
  const avgReturn = daysActive > 0 ? totalPnL / daysActive : 0

  // For trader cards, we don't have exact trade count per period
  // This would need to come from actual trade data
  const trades = daysActive // Approximate

  return {
    totalPnL,
    roi,
    winRate,
    volume,
    trades,
    avgReturn,
    daysActive,
    daysUp,
    daysDown,
  }
}

/**
 * Get display label for time period
 */
export function getTimePeriodLabel(period: TimePeriod): string {
  const labels: Record<TimePeriod, string> = {
    '1D': 'Last 24 Hours',
    '7D': 'Last 7 Days',
    '30D': 'Last 30 Days',
    '3M': 'Last 3 Months',
    '6M': 'Last 6 Months',
    'ALL': 'All Time',
  }
  return labels[period]
}

/**
 * Format P&L data for charting (with cumulative values)
 */
export function formatChartData(data: DailyPnlRow[]): Array<{
  date: string
  pnl: number
  cumulative: number
}> {
  let cumulative = 0
  return data.map((row) => {
    cumulative += row.realized_pnl || 0
    return {
      date: row.date,
      pnl: row.realized_pnl || 0,
      cumulative,
    }
  })
}
