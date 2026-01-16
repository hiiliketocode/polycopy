"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { TradeTableHeader } from "@/components/polycopy/trade-table"
import { cn } from "@/lib/utils"
import type { OrderRow } from "@/lib/orders/types"

type ManualTradesFeedProps = {
  displayName?: string | null
  avatarUrl?: string | null
  walletAddress?: string | null
}

type TradeMetrics = {
  actionLabel: "Buy" | "Sell"
  invested: number | null
  contracts: number | null
  entryPrice: number | null
  currentPrice: number | null
  roi: number | null
}

const INVESTED_DECIMALS = { minimumFractionDigits: 2, maximumFractionDigits: 2 } as const

export function ManualTradesFeed({ displayName, avatarUrl, walletAddress }: ManualTradesFeedProps) {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadOrders = useCallback(async () => {
    setRefreshing(true)
    setError(null)
    try {
      const response = await fetch("/api/orders", { cache: "no-store" })
      const payload = await response.json()

      if (!response.ok) {
        setError(payload?.error || "Failed to load trades")
        setOrders([])
        return
      }

      const nextOrders = Array.isArray(payload?.orders) ? (payload.orders as OrderRow[]) : []
      setOrders(nextOrders)
    } catch (err) {
      console.error("[ManualTradesFeed] failed to load orders", err)
      setError("Failed to load trades")
      setOrders([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadOrders()
  }, [loadOrders, walletAddress])

  const visibleOrders = useMemo(() => {
    const ignoredStatuses = new Set(["failed", "canceled", "expired"])
    const sorted = [...orders].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime()
      const bTime = new Date(b.createdAt).getTime()
      return bTime - aTime
    })

    return sorted.filter((order) => !ignoredStatuses.has(order.status))
  }, [orders])

  const walletDisplay = formatWallet(walletAddress)
  const headerName = displayName?.trim() || walletDisplay || "You"

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-slate-900">Manual Trades</h3>
          <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200">
            Orders data
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadOrders}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="p-4 border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          {error}
        </Card>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <TradeTableHeader showActions={false} />
              <tbody>
                {Array.from({ length: 3 }).map((_, idx) => (
                  <tr key={idx} className="border-b border-slate-100 animate-pulse">
                    {Array.from({ length: 9 }).map((__, cellIndex) => (
                      <td key={cellIndex} className="px-4 py-4">
                        <div className="h-3 w-full max-w-[120px] rounded-full bg-slate-200" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : visibleOrders.length === 0 ? (
        <Card className="p-6 text-center border border-dashed border-slate-200 bg-white shadow-sm">
          <p className="text-slate-700 font-medium">No manual trades yet.</p>
          <p className="text-sm text-slate-500 mt-2">
            Executed trades from your orders will appear here using the same layout as the trade feed.
          </p>
        </Card>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <TradeTableHeader showActions={false} />
              <tbody>
                {visibleOrders.map((order) => (
                  <ManualTradeRow
                    key={order.orderId}
                    order={order}
                    metrics={deriveTradeMetrics(order)}
                    headerName={headerName}
                    avatarUrl={avatarUrl}
                    walletDisplay={walletDisplay}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

type ManualTradeRowProps = {
  order: OrderRow
  metrics: TradeMetrics
  headerName: string
  avatarUrl?: string | null
  walletDisplay: string | null
}

function ManualTradeRow({ order, metrics, headerName, avatarUrl, walletDisplay }: ManualTradeRowProps) {
  const createdAt = safeDate(order.createdAt)
  const absoluteTime = createdAt ? formatAbsoluteTime(createdAt) : null
  const relativeTime = createdAt ? formatRelative(createdAt) : null
  const marketTitle = order.marketTitle || "Unknown market"
  const userAvatar = avatarUrl || order.traderAvatarUrl || "/placeholder.svg"
  const marketAvatar = order.marketImageUrl || "/placeholder.svg"
  const outcomeLabel = formatOutcome(order.outcome)

  const roiClass = metrics.roi === null
    ? "text-slate-400"
    : metrics.roi > 0
      ? "text-emerald-600"
      : metrics.roi < 0
        ? "text-red-600"
        : "text-slate-600"

  return (
    <tr className="border-b border-slate-100 bg-white">
      <td className="px-4 py-4 align-top">
        <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Trader</span>
        <div className="mt-1 flex items-center gap-3 min-w-0">
          <Avatar className="h-10 w-10 ring-2 ring-slate-100 bg-slate-50 text-slate-700 text-xs font-semibold uppercase">
            <AvatarImage src={userAvatar} alt={headerName} />
            <AvatarFallback className="bg-amber-400 text-slate-900 text-sm font-semibold uppercase">
              {initials(headerName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm truncate">{headerName}</p>
            {walletDisplay && (
              <p className="text-xs text-slate-500 font-mono truncate">{walletDisplay}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Market</span>
        <div className="mt-1 flex items-start gap-3 min-w-[220px]">
          <Avatar className="h-11 w-11 ring-2 ring-slate-100 bg-slate-50 text-slate-700 text-xs font-semibold uppercase">
            <AvatarImage src={marketAvatar} alt={marketTitle} />
            <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-semibold uppercase">
              {marketTitle.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h3 className="text-sm md:text-base font-semibold text-slate-900 leading-snug truncate">
              {marketTitle}
            </h3>
          </div>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Trade</span>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge
            variant="secondary"
            className={cn(
              "font-semibold text-xs",
              metrics.actionLabel === "Buy"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-red-50 text-red-700 border-red-200"
            )}
          >
            {metrics.actionLabel}
          </Badge>
          <span className="text-xs text-slate-400 font-semibold">|</span>
          <Badge
            variant="secondary"
            className="font-semibold text-xs bg-slate-100 text-slate-700 border-slate-200 max-w-[160px] whitespace-normal break-words text-center leading-snug"
          >
            {outcomeLabel}
          </Badge>
        </div>
      </td>
      <td className="px-4 py-4 align-top">
        <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Invested</span>
        <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(metrics.invested)}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Contracts</span>
        <p className="mt-1 text-sm font-semibold text-slate-900">{formatContracts(metrics.contracts)}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Entry</span>
        <p className="mt-1 text-sm font-semibold text-slate-900">{formatPrice(metrics.entryPrice)}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Current</span>
        <p className="mt-1 text-sm font-semibold text-slate-900">{formatPrice(metrics.currentPrice)}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">ROI</span>
        <p className={cn("mt-1 text-sm font-semibold", roiClass)}>
          {metrics.roi === null ? "--" : `${metrics.roi > 0 ? "+" : ""}${metrics.roi.toFixed(1)}%`}
        </p>
      </td>
      <td className="px-4 py-4 align-top">
        <span className="text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Time</span>
        {absoluteTime && (
          <div className="mt-1 inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
            {absoluteTime}
          </div>
        )}
        {relativeTime && <div className="text-[11px] text-slate-500 mt-1">{relativeTime}</div>}
      </td>
    </tr>
  )
}

function deriveTradeMetrics(order: OrderRow): TradeMetrics {
  const actionLabel: "Buy" | "Sell" = (order.side || "").toLowerCase() === "sell" ? "Sell" : "Buy"
  const contracts = resolveContracts(order)
  const entryPrice = resolveNumber(order.priceOrAvgPrice)
  const currentPrice = resolveNumber(order.currentPrice ?? order.priceOrAvgPrice)
  const invested =
    entryPrice !== null && contracts !== null
      ? Math.abs(entryPrice * contracts)
      : null
  const roi =
    entryPrice !== null &&
    entryPrice !== 0 &&
    currentPrice !== null
      ? (((actionLabel === "Sell" ? entryPrice - currentPrice : currentPrice - entryPrice) / entryPrice) * 100)
      : null

  return {
    actionLabel,
    invested,
    contracts,
    entryPrice,
    currentPrice,
    roi,
  }
}

function resolveContracts(order: OrderRow): number | null {
  const value = Number.isFinite(order.filledSize) && order.filledSize > 0 ? order.filledSize : order.size
  return Number.isFinite(value) && value > 0 ? Number(value) : null
}

function resolveNumber(value: unknown): number | null {
  if (typeof value !== "number") return null
  return Number.isFinite(value) ? value : null
}

function formatOutcome(outcome: string | null | undefined): string {
  if (!outcome) return "Outcome"
  const trimmed = outcome.trim()
  if (!trimmed) return "Outcome"
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function formatCurrency(value: number | null) {
  if (value === null || Number.isNaN(value)) return "--"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    ...INVESTED_DECIMALS,
  }).format(value)
}

function formatContracts(value: number | null) {
  if (value === null || Number.isNaN(value)) return "--"
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatPrice(value: number | null) {
  if (value === null || Number.isNaN(value)) return "--"
  const fixed = value.toFixed(4)
  const trimmed = fixed.replace(/\.?0+$/, "")
  return `$${trimmed}`
}

function formatWallet(value?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length <= 10) return trimmed
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`
}

function initials(value: string | null | undefined) {
  if (!value) return "UU"
  const words = value.trim().split(" ").filter(Boolean)
  if (words.length === 0) return "UU"
  if (words.length === 1) {
    const word = words[0]
    return (word.slice(0, 2) || "UU").toUpperCase()
  }
  return (words[0][0] + words[1][0]).toUpperCase()
}

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatAbsoluteTime(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatRelative(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)

  if (diffSeconds < 60) return "Just now"
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
