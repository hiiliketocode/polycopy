"use client"

import { useMemo } from "react"
import { RefreshCw } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type ManualCopiedTrade = {
  id: string
  trader_wallet: string
  trader_username: string | null
  trader_profile_image_url: string | null
  market_id?: string | null
  market_title: string
  market_avatar_url: string | null
  outcome: string
  price_when_copied: number
  amount_invested: number | null
  current_price: number | null
  roi: number | null
  copied_at: string
}

type LiveMarketData = Map<string, { price: number; score?: string; closed?: boolean }>

type ManualCopiedTradesFeedProps = {
  trades: ManualCopiedTrade[]
  loading?: boolean
  onRefresh?: () => void
  refreshing?: boolean
  liveMarketData?: LiveMarketData
}

export function ManualCopiedTradesFeed({
  trades,
  loading = false,
  onRefresh,
  refreshing = false,
  liveMarketData,
}: ManualCopiedTradesFeedProps) {
  const sortedTrades = useMemo(
    () => [...trades].sort((a, b) => new Date(b.copied_at).getTime() - new Date(a.copied_at).getTime()),
    [trades]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-slate-900">Manual Trades</h3>
          <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-slate-200">
            Orders data
          </Badge>
        </div>
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Card key={idx} className="p-4 sm:p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-full bg-slate-200 animate-pulse" />
                <div className="space-y-2 flex-1">
                  <div className="h-3 w-32 bg-slate-200 rounded-full animate-pulse" />
                  <div className="h-3 w-24 bg-slate-200 rounded-full animate-pulse" />
                </div>
              </div>
              <div className="h-10 w-10 rounded-full bg-slate-200 animate-pulse mb-3" />
              <div className="h-16 bg-slate-100 rounded-lg animate-pulse" />
            </Card>
          ))}
        </div>
      ) : sortedTrades.length === 0 ? (
        <Card className="p-6 text-center border border-dashed border-slate-200 bg-white shadow-sm">
          <p className="text-slate-700 font-medium">No manual trades yet.</p>
          <p className="text-sm text-slate-500 mt-2">
            Executed trades from your orders will appear here using the same layout as the trade feed.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedTrades.map((trade) => (
            <ManualCopiedTradeCard key={trade.id} trade={trade} liveMarketData={liveMarketData} />
          ))}
        </div>
      )}
    </div>
  )
}

function ManualCopiedTradeCard({
  trade,
  liveMarketData,
}: {
  trade: ManualCopiedTrade
  liveMarketData?: LiveMarketData
}) {
  const marketData = (() => {
    const rawKeys = [trade.market_id, trade.market_title].filter(Boolean) as string[]
    for (const key of rawKeys) {
      const direct = liveMarketData?.get(key)
      if (direct) return direct
      const lower = liveMarketData?.get(key.toLowerCase())
      if (lower) return lower
    }
    return undefined
  })()
  const currentPrice = marketData?.price ?? trade.current_price ?? trade.price_when_copied
  const roi =
    trade.roi ??
    (trade.price_when_copied
      ? (((currentPrice - trade.price_when_copied) / trade.price_when_copied) * 100)
      : null)
  const invested = trade.amount_invested
  const contracts =
    invested && trade.price_when_copied ? invested / trade.price_when_copied : null
  const roiClass =
    roi === null
      ? "text-slate-400"
      : roi > 0
        ? "text-emerald-600"
        : roi < 0
          ? "text-red-600"
          : "text-slate-600"

  return (
    <Card className="p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar className="h-11 w-11 ring-2 ring-slate-100 bg-slate-50 text-slate-700 text-xs font-semibold uppercase">
            <AvatarImage src={trade.trader_profile_image_url || "/placeholder.svg"} alt={trade.trader_username || trade.trader_wallet} />
            <AvatarFallback className="bg-white text-slate-700 text-sm font-semibold uppercase">
              {initials(trade.trader_username || trade.trader_wallet)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm truncate">
              {trade.trader_username || formatWallet(trade.trader_wallet)}
            </p>
            <p className="text-xs text-slate-500 font-mono truncate">
              {formatWallet(trade.trader_wallet)}
            </p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500 space-y-1 shrink-0">
          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700">
            {formatAbsoluteTime(trade.copied_at)}
          </span>
          <div className="text-[11px]">{formatRelative(trade.copied_at)}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <Avatar className="h-12 w-12 ring-2 ring-slate-100 bg-slate-50 text-slate-700 text-xs font-semibold uppercase">
          <AvatarImage src={trade.market_avatar_url || "/placeholder.svg"} alt={trade.market_title} />
          <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-semibold uppercase">
            {trade.market_title.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 flex items-center gap-2 flex-wrap">
          <h3 className="text-base md:text-lg font-semibold text-slate-900 leading-snug truncate">
            {trade.market_title}
          </h3>
          <Badge
            variant="secondary"
            className={cn(
              "font-semibold",
              trade.outcome?.toLowerCase() === "yes"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : trade.outcome?.toLowerCase() === "no"
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-slate-100 text-slate-700 border-slate-200"
            )}
          >
            {trade.outcome || "Outcome"}
          </Badge>
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg px-4 py-3 mt-3 bg-slate-50/50">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Stat label="Trade" value={<TradeValue trade={trade} />} />
          <Stat label="Invested" value={formatCurrency(invested)} divider />
          <Stat label="Contracts" value={formatNumber(contracts)} divider />
          <Stat label="Entry" value={formatPrice(trade.price_when_copied)} divider />
          <Stat label="Current" value={formatPrice(currentPrice)} divider />
          <Stat
            label="ROI"
            value={roi === null ? "--" : `${roi > 0 ? "+" : ""}${roi.toFixed(1)}%`}
            valueClass={roiClass}
            divider
          />
        </div>
      </div>
    </Card>
  )
}

function Stat({
  label,
  value,
  valueClass,
  divider = false,
}: {
  label: string
  value: React.ReactNode
  valueClass?: string
  divider?: boolean
}) {
  return (
    <div className={cn("text-center", divider && "md:border-l border-slate-200")}>
      <p className="text-xs text-slate-500 mb-1 font-medium">{label}</p>
      <p className={cn("text-sm md:text-base font-semibold text-slate-900", valueClass)}>{value}</p>
    </div>
  )
}

function TradeValue({ trade }: { trade: ManualCopiedTrade }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 max-w-full">
      <Badge
        variant="secondary"
        className={cn(
          "font-semibold text-xs",
          "bg-emerald-50 text-emerald-700 border-emerald-200"
        )}
      >
        Buy
      </Badge>
      <span className="text-xs text-slate-400 font-semibold">|</span>
      <Badge
        variant="secondary"
        className="font-semibold text-xs bg-slate-100 text-slate-700 border-slate-200 max-w-[160px] whitespace-normal break-words text-center leading-snug"
      >
        {trade.outcome || "Outcome"}
      </Badge>
    </div>
  )
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

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--"
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--"
  const fixed = value.toFixed(4)
  const trimmed = fixed.replace(/\.?0+$/, "")
  return `$${trimmed}`
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--"
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)
}

function formatAbsoluteTime(dateString: string) {
  const date = new Date(dateString)
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function formatRelative(dateString: string) {
  const date = new Date(dateString)
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
