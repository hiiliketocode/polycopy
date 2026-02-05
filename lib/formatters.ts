/**
 * Centralized formatting utilities for consistent display across the app
 * 
 * Standard formats:
 * - ROI/Percentage: 1 decimal place with sign (e.g., +15.3%, -2.1%)
 * - PnL/Currency: 2 decimal places with sign (e.g., +$39.29, -$15.00)
 * - Win Rate: 1 decimal place (e.g., 59.3%)
 * - Prices: 2-4 decimal places depending on value
 * - Large numbers: Abbreviated with K/M suffixes
 */

/**
 * Format a percentage value with sign
 * @param value - The percentage value (can be decimal like 0.15 or already multiplied like 15)
 * @param decimals - Number of decimal places (default: 1)
 * @param alreadyPercent - Whether the value is already in percent form (default: false)
 * @returns Formatted string like "+15.3%" or "-2.1%"
 */
export function formatROI(
  value: number | null | undefined,
  decimals: number = 1,
  alreadyPercent: boolean = false
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  const pctValue = alreadyPercent ? value : value * 100
  const sign = pctValue >= 0 ? '+' : ''
  return `${sign}${pctValue.toFixed(decimals)}%`
}

/**
 * Format a percentage value without sign (for win rate, etc.)
 * @param value - The percentage value (can be decimal like 0.593 or already multiplied like 59.3)
 * @param decimals - Number of decimal places (default: 1)
 * @param alreadyPercent - Whether the value is already in percent form (default: false)
 * @returns Formatted string like "59.3%"
 */
export function formatWinRate(
  value: number | null | undefined,
  decimals: number = 1,
  alreadyPercent: boolean = false
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  const pctValue = alreadyPercent ? value : value * 100
  return `${pctValue.toFixed(decimals)}%`
}

/**
 * Format a currency value with sign
 * @param value - The dollar amount
 * @param decimals - Number of decimal places (default: 2)
 * @param showSign - Whether to show + sign for positive values (default: true)
 * @returns Formatted string like "+$39.29" or "-$15.00"
 */
export function formatPnL(
  value: number | null | undefined,
  decimals: number = 2,
  showSign: boolean = true
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  const sign = showSign ? (value >= 0 ? '+' : '-') : (value < 0 ? '-' : '')
  return `${sign}$${Math.abs(value).toFixed(decimals)}`
}

/**
 * Format a currency value without sign
 * @param value - The dollar amount
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string like "$39.29"
 */
export function formatCurrency(
  value: number | null | undefined,
  decimals: number = 2
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  return `$${Math.abs(value).toFixed(decimals)}`
}

/**
 * Format a large number with K/M suffix
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string like "1.5M" or "250K"
 */
export function formatCompactNumber(
  value: number | null | undefined,
  decimals: number = 1
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  const absValue = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  
  if (absValue >= 1_000_000) {
    return `${sign}${(absValue / 1_000_000).toFixed(decimals)}M`
  }
  if (absValue >= 1_000) {
    return `${sign}${(absValue / 1_000).toFixed(decimals)}K`
  }
  return `${sign}${absValue.toFixed(decimals)}`
}

/**
 * Format a large currency value with K/M suffix
 * @param value - The dollar amount
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted string like "$1.5M" or "$250K"
 */
export function formatCompactCurrency(
  value: number | null | undefined,
  decimals: number = 1
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  const absValue = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  
  if (absValue >= 1_000_000) {
    return `${sign}$${(absValue / 1_000_000).toFixed(decimals)}M`
  }
  if (absValue >= 1_000) {
    return `${sign}$${(absValue / 1_000).toFixed(decimals)}K`
  }
  return `${sign}$${absValue.toFixed(0)}`
}

/**
 * Format a price value (adaptive decimal places based on value)
 * @param value - The price (0-1 for prediction markets)
 * @returns Formatted string like "$0.53" or "$0.0532"
 */
export function formatPrice(
  value: number | null | undefined
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A'
  
  // Use more decimals for very small or precise prices
  if (Math.abs(value) < 0.01) {
    return `$${value.toFixed(4)}`
  }
  return `$${value.toFixed(2)}`
}

/**
 * Format a multiplier (e.g., conviction)
 * @param value - The multiplier value
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string like "1.25x" or "0.75x"
 */
export function formatMultiplier(
  value: number | null | undefined,
  decimals: number = 2
): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) return 'N/A'
  return `${value.toFixed(decimals)}x`
}

/**
 * Format an integer with locale separators
 * @param value - The integer value
 * @returns Formatted string like "1,234" or "0"
 */
export function formatInteger(
  value: number | null | undefined
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0'
  return Math.trunc(value).toLocaleString()
}
