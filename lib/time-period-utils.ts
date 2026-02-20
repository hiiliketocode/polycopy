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
 * Filter daily PnL data by time period using the same logic as trader profile page
 * This matches the sophisticated filtering logic in trader/[wallet]/page.tsx
 */
export function filterByTimePeriodTraderProfile(
  data: DailyPnlRow[],
  period: TimePeriod
): DailyPnlRow[] {
  if (!data.length) {
    return data
  }

  if (period === 'ALL') {
    return data
  }

  // Get the number of days for the period
  const daysMap: Record<Exclude<TimePeriod, 'ALL'>, number> = {
    '1D': 1,
    '7D': 7,
    '30D': 30,
    '3M': 90,
    '6M': 180,
  }
  
  const days = daysMap[period]
  
  // Helper to convert date string to Date object in UTC
  const toDateObj = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`)
  
  const lastIndex = data.length - 1
  const todayStr = new Date().toISOString().slice(0, 10)
  const latestRowDate = data[lastIndex].date
  
  // For date windows, use the latest row date as anchor (not the previous day)
  // This ensures "Yesterday" includes today's data if it's the most recent available
  let anchorDate = toDateObj(latestRowDate)
  
  // Only use previous day as anchor if:
  // 1. Latest row is today AND
  // 2. There's a previous row AND  
  // 3. We're NOT looking at "Yesterday" (1D) - for 1D, we want to include today's data
  if (latestRowDate === todayStr && lastIndex > 0 && period !== '1D') {
    anchorDate = toDateObj(data[lastIndex - 1].date)
  }

  // Calculate start date by going back (days - 1) from anchor
  // This means 30 days includes the anchor date plus 29 days back
  const start = new Date(Date.UTC(
    anchorDate.getUTCFullYear(),
    anchorDate.getUTCMonth(),
    anchorDate.getUTCDate()
  ))
  start.setUTCDate(start.getUTCDate() - (days - 1))
  const startDate = start
  const endDate = anchorDate

  // Filter and sort
  const filtered = data
    .filter((row) => {
      const day = toDateObj(row.date)
      if (day < startDate) return false
      if (day > endDate) return false
      return true
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  
  return filtered
}

/**
 * Calculate stats for a time period from filtered daily PnL data.
 * @param tradingDaysOverride - if provided and greater than the PnL-row count,
 *   use it as `daysActive` (derived from trade activity data).
 */
export function calculatePeriodStats(
  data: DailyPnlRow[],
  totalVolume: number | null,
  tradingDaysOverride?: number
): PeriodStats {
  if (!data.length) {
    return {
      totalPnL: 0,
      roi: 0,
      winRate: 0,
      volume: totalVolume || 0,
      trades: 0,
      avgReturn: 0,
      daysActive: tradingDaysOverride || 0,
      daysUp: 0,
      daysDown: 0,
    }
  }

  const totalPnL = data.reduce((sum, row) => sum + (row.realized_pnl || 0), 0)

  const pnlDaysActive = data.filter((row) => row.realized_pnl !== 0).length
  const daysActive = Math.max(pnlDaysActive, tradingDaysOverride || 0)
  const daysUp = data.filter((row) => row.realized_pnl > 0).length
  const daysDown = data.filter((row) => row.realized_pnl < 0).length

  const winRate = daysActive > 0 ? (daysUp / daysActive) * 100 : 0

  const volume = totalVolume || 0
  const roi = volume > 0 ? (totalPnL / volume) * 100 : 0

  const avgReturn = daysActive > 0 ? totalPnL / daysActive : 0

  const trades = daysActive

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
