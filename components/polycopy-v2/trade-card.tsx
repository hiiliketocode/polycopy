"use client"

import { useState } from "react"
import {
  Star,
  Sparkles,
  Lock,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Copy,
  ExternalLink,
  Check,
  Clock,
  Activity,
  Zap,
  BarChart3,
} from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui-v2/avatar"
import { cn } from "@/lib/utils"

/* ═══════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════ */

export type PolySignalRecommendation =
  | "STRONG_BUY"
  | "BUY"
  | "NEUTRAL"
  | "AVOID"
  | "TOXIC"

export interface PositionTradeSummary {
  side: "BUY" | "SELL"
  outcome: string
  size: number | null
  price: number | null
  amountUsd: number | null
  timestamp?: number | null
}

export interface PositionBadgeData {
  label: string
  trades: PositionTradeSummary[]
  variant: "trader" | "user"
}

export interface TraderInsights {
  trades: number
  globalTrades?: number
  winRate: number | null
  globalWinRate?: number | null
  avgPnl: number | null
  roiPct: number | null
  conviction: number | null
  momentum?: string
  isHot?: boolean
  currentStreak?: number
  aiEdgePct?: number
  timing?: string
  niche?: string
}

export interface GameEvent {
  liveScore?: string
  eventStartTime?: string
  eventEndTime?: string
  eventStatus?: "live" | "scheduled" | "final" | "ended" | "open" | "resolved" | "unknown"
  gameTimeInfo?: string
}

export interface TradeData {
  id: string
  trader: {
    name: string
    wallet: string
    avatar?: string
    isPremium?: boolean
  }
  market: {
    title: string
    token: string
    condition_id: string
    slug?: string
    icon?: string
    category?: string
    subtype?: string
    betStructure?: string
    tags?: string[]
    polymarketUrl?: string
  }
  side: "BUY" | "SELL"
  entry_price: number
  size_usd: number
  conviction: number
  timestamp: string
  polyscore?: number
  polySignalRecommendation?: PolySignalRecommendation

  /* Position badges */
  traderPositionBadge?: PositionBadgeData
  userPositionBadge?: PositionBadgeData

  /* Trader insights (shown in drawer) */
  traderInsights?: TraderInsights

  /* Game / sports event data */
  gameEvent?: GameEvent

  /* Current market state */
  currentMarketPrice?: number
  marketIsOpen?: boolean | null

  /* Fire indicators */
  fireScore?: number
  fireReasons?: string[]
}

interface TradeCardProps {
  trade: TradeData
  onCopy?: () => void
  onManualCopy?: () => void
  onMarkAsCopied?: (entryPrice: number, amountUsd?: number) => void
  isPremiumUser?: boolean
  isWalletConnected?: boolean
  className?: string
}

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */

function formatPrice(price: number): string {
  return (price * 100).toFixed(1)
}

function formatUSD(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1000) return `$${(abs / 1000).toFixed(1)}K`
  return `$${abs.toFixed(0)}`
}

function formatSignedUSD(value: number): string {
  const prefix = value >= 0 ? "+" : "-"
  return `${prefix}${formatUSD(value)}`
}

function formatPercent(value: number | null): string {
  if (value == null) return "N/A"
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`
}

function formatMultiplier(value: number | null): string {
  if (value == null) return "N/A"
  return `${value.toFixed(2)}x`
}

function formatTimeAgo(timestamp: string): string {
  const diffMs = Date.now() - new Date(timestamp).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  return `${Math.floor(diffHr / 24)}d`
}

function walletShort(wallet: string): string {
  return wallet.length > 10 ? `${wallet.slice(0, 6)}...` : wallet
}

function initials(name: string): string {
  return name
    .split(/[\s_]+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}

function getScoreColor(score: number) {
  if (score >= 75)
    return { text: "text-profit-green", border: "border-profit-green", bg: "bg-profit-green/10" }
  if (score >= 60)
    return { text: "text-poly-yellow", border: "border-poly-yellow", bg: "bg-poly-yellow/10" }
  if (score >= 45)
    return { text: "text-neutral-grey", border: "border-neutral-grey", bg: "bg-neutral-grey/10" }
  return { text: "text-loss-red", border: "border-loss-red", bg: "bg-loss-red/10" }
}

function getRecommendationStyle(rec: PolySignalRecommendation) {
  switch (rec) {
    case "STRONG_BUY":
      return { text: "text-profit-green", bg: "bg-profit-green/10", label: "Strong Buy" }
    case "BUY":
      return { text: "text-profit-green", bg: "bg-profit-green/10", label: "Buy" }
    case "NEUTRAL":
      return { text: "text-neutral-grey", bg: "bg-neutral-grey/10", label: "Neutral" }
    case "AVOID":
      return { text: "text-poly-coral", bg: "bg-poly-coral/10", label: "Avoid" }
    case "TOXIC":
      return { text: "text-loss-red", bg: "bg-loss-red/10", label: "Toxic" }
  }
}

function getEventStatusStyle(status: string) {
  switch (status) {
    case "live":
      return "bg-profit-green/10 text-profit-green border-profit-green/30"
    case "ended":
    case "final":
    case "resolved":
      return "bg-loss-red/10 text-loss-red border-loss-red/30"
    case "scheduled":
      return "bg-poly-yellow/10 text-poly-yellow border-poly-yellow/30"
    default:
      return "bg-neutral-grey/10 text-neutral-grey border-neutral-grey/30"
  }
}

/* ═══════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════ */

/* ── PolyScore badge (compact, for header) ── */
function PolyScoreBadge({ score, recommendation }: { score?: number; recommendation?: PolySignalRecommendation }) {
  if (score != null) {
    const colors = getScoreColor(score)
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 border px-2 py-1 font-sans text-[11px] font-semibold uppercase tracking-wide",
          colors.bg,
          colors.border,
          colors.text,
        )}
      >
        <Sparkles className="h-3 w-3" />
        <span>{score}</span>
      </div>
    )
  }
  if (recommendation) {
    const style = getRecommendationStyle(recommendation)
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 px-2 py-1 font-sans text-[11px] font-semibold uppercase tracking-wide",
          style.bg,
          style.text,
        )}
      >
        <Sparkles className="h-3 w-3" />
        <span>{style.label}</span>
      </div>
    )
  }
  return null
}

/* ── Locked feature badge ── */
function LockedBadge() {
  return (
    <div className="inline-flex items-center gap-1 border border-gray-200 bg-gray-50 px-2 py-1 font-sans text-[11px] font-semibold uppercase tracking-wide text-neutral-grey">
      <Lock className="h-3 w-3" />
      <span>Score</span>
    </div>
  )
}

/* ── Token badge (YES/NO) ── */
function TokenBadge({ token }: { token: string }) {
  const isYes = token.toUpperCase() === "YES"
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center px-2.5 py-1 font-sans text-xs font-bold uppercase tracking-wide",
        isYes
          ? "bg-profit-green/10 text-profit-green"
          : "bg-loss-red/10 text-loss-red",
      )}
    >
      {token}
    </span>
  )
}

/* ── Game / Event status badge ── */
function GameEventBadge({ event }: { event: GameEvent }) {
  const { liveScore, eventStatus, gameTimeInfo, eventStartTime } = event

  if (!eventStatus && !liveScore && !eventStartTime) return null

  const status = eventStatus || "open"
  const styleClass = getEventStatusStyle(status)

  // Format event start time
  let timeLabel = ""
  if (eventStartTime && (status === "scheduled" || status === "open")) {
    const d = new Date(eventStartTime)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const isTomorrow = d.toDateString() === tomorrow.toDateString()

    if (isToday) {
      timeLabel = `Today ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    } else if (isTomorrow) {
      timeLabel = `Tomorrow ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
    } else {
      timeLabel = d.toLocaleDateString([], { month: "short", day: "numeric" })
    }
  }

  // Live game with score
  if (liveScore && (status === "live" || status === "final")) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 border px-2 py-1 font-sans text-[11px] font-bold uppercase tracking-wide",
          styleClass,
        )}
      >
        {status === "live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-profit-green" />}
        <span>{status === "live" ? "Live" : "Final"}</span>
        <span className="font-body">{liveScore}</span>
      </div>
    )
  }

  // Game time info
  if (gameTimeInfo) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 border px-2 py-1 font-sans text-[11px] font-semibold uppercase tracking-wide",
          styleClass,
        )}
      >
        <Clock className="h-3 w-3" />
        <span>{gameTimeInfo}</span>
      </div>
    )
  }

  // Scheduled event with start time
  if (timeLabel) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1 border px-2 py-1 font-sans text-[11px] font-semibold uppercase tracking-wide",
          styleClass,
        )}
      >
        <Clock className="h-3 w-3" />
        <span>{timeLabel}</span>
      </div>
    )
  }

  return null
}

/* ── Flags row (clickable, opens drawer) ── */
function FlagsRow({
  trade,
  isDrawerOpen,
  onToggle,
}: {
  trade: TradeData
  isDrawerOpen: boolean
  onToggle: () => void
}) {
  const isSell = trade.side === "SELL"
  const hasTraderPos = Boolean(trade.traderPositionBadge?.trades?.length)
  const hasUserPos = Boolean(trade.userPositionBadge?.trades?.length)
  const hasInsights = Boolean(trade.traderInsights)
  const hasTags = Boolean(trade.market.subtype || trade.market.betStructure)
  const hasAnyFlag = hasTraderPos || hasUserPos || hasInsights || hasTags

  if (!hasAnyFlag) return null

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2 border-t border-border/50 px-1 py-2.5 text-left transition-colors hover:bg-accent/50",
        isDrawerOpen && "bg-accent/30",
      )}
      aria-expanded={isDrawerOpen}
    >
      {/* Position flags */}
      {(hasTraderPos || hasUserPos) && (
        <span className="inline-flex items-center gap-1 border border-gray-200 bg-gray-50 px-2 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide text-gray-600">
          <Star className="h-3 w-3" />
          {isSell ? "Exiting" : "Existing"} Positions
          {hasUserPos && (
            <span className="rounded-sm bg-gray-200 px-1 py-px text-[10px]">You</span>
          )}
          {hasTraderPos && (
            <span className="rounded-sm bg-gray-200 px-1 py-px text-[10px]">Trader</span>
          )}
        </span>
      )}

      {/* Market type tags */}
      {hasTags && (
        <span className="inline-flex items-center gap-1 border border-gray-200 bg-gray-50 px-2 py-0.5 font-sans text-[10px] font-semibold text-gray-500">
          {trade.market.subtype && <span>{trade.market.subtype}</span>}
          {trade.market.subtype && trade.market.betStructure && <span>/</span>}
          {trade.market.betStructure && <span>{trade.market.betStructure}</span>}
        </span>
      )}

      {/* Expand chevron */}
      <span className="ml-auto text-muted-foreground">
        {isDrawerOpen ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </span>
    </button>
  )
}

/* ── Trader Insights Drawer ── */
function InsightsDrawer({
  trade,
}: {
  trade: TradeData
}) {
  const insights = trade.traderInsights
  const hasTraderPos = Boolean(trade.traderPositionBadge?.trades?.length)
  const hasUserPos = Boolean(trade.userPositionBadge?.trades?.length)

  return (
    <div className="border-t border-border/50 bg-accent/30 px-1 pb-3 pt-2">
      {/* Trader Insights Grid */}
      {insights && (
        <div className="mb-3">
          <div className="mb-2 flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Trader Insights
            </span>
            {insights.niche && (
              <span className="border border-gray-200 bg-gray-50 px-1.5 py-px font-sans text-[11px] font-semibold text-gray-500">
                {insights.niche}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border">
            {/* Trades */}
            <div className="bg-card py-2 text-center">
              <p className="font-body text-sm font-semibold tabular-nums text-foreground">
                {insights.trades}
              </p>
              <p className="font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Trades
              </p>
              {insights.globalTrades != null && (
                <p className="font-body text-[11px] text-muted-foreground">
                  (All: {insights.globalTrades})
                </p>
              )}
            </div>

            {/* Win Rate */}
            <div className="bg-card py-2 text-center">
              <p
                className={cn(
                  "font-body text-sm font-semibold tabular-nums",
                  insights.winRate != null && insights.winRate >= 55
                    ? "text-profit-green"
                    : insights.winRate != null && insights.winRate < 48
                      ? "text-loss-red"
                      : "text-foreground",
                )}
              >
                {insights.winRate != null ? `${insights.winRate.toFixed(0)}%` : "N/A"}
              </p>
              <p className="font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Win Rate
              </p>
              {insights.globalWinRate != null && (
                <p className="font-body text-[11px] text-muted-foreground">
                  (All: {insights.globalWinRate.toFixed(0)}%)
                </p>
              )}
            </div>

            {/* Avg PnL */}
            <div className="bg-card py-2 text-center">
              <p
                className={cn(
                  "font-body text-sm font-semibold tabular-nums",
                  insights.avgPnl != null && insights.avgPnl > 0
                    ? "text-profit-green"
                    : insights.avgPnl != null && insights.avgPnl < 0
                      ? "text-loss-red"
                      : "text-foreground",
                )}
              >
                {insights.avgPnl != null ? formatSignedUSD(insights.avgPnl) : "N/A"}
                {insights.roiPct != null && (
                  <span className="text-[10px]"> ({formatPercent(insights.roiPct)})</span>
                )}
              </p>
              <p className="font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Ave PnL
              </p>
            </div>

            {/* Conviction */}
            <div className="bg-card py-2 text-center">
              <p
                className={cn(
                  "font-body text-sm font-semibold tabular-nums",
                  insights.conviction != null && insights.conviction >= 1.5
                    ? "text-profit-green"
                    : insights.conviction != null && insights.conviction < 0.5
                      ? "text-loss-red"
                      : "text-foreground",
                )}
              >
                {formatMultiplier(insights.conviction)}
              </p>
              <p className="font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Conviction
              </p>
            </div>
          </div>

          {/* Secondary insights row */}
          {(insights.momentum || insights.aiEdgePct != null || insights.timing) && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              {insights.momentum != null && (
                <div className="flex items-center gap-1 bg-card px-2 py-1.5">
                  <Activity className="h-3 w-3 text-muted-foreground" />
                  <div>
                    <p className="font-sans text-[11px] text-muted-foreground">Momentum</p>
                    <p
                      className={cn(
                        "font-body text-[11px] font-semibold",
                        insights.isHot ? "text-poly-coral" : "text-foreground",
                      )}
                    >
                      {insights.isHot
                        ? `${insights.currentStreak || 0} streak`
                        : "Normal"}
                    </p>
                  </div>
                </div>
              )}
              {insights.aiEdgePct != null && (
                <div className="flex items-center gap-1 bg-card px-2 py-1.5">
                  <Zap className="h-3 w-3 text-muted-foreground" />
                  <div>
                    <p className="font-sans text-[11px] text-muted-foreground">AI Edge</p>
                    <p
                      className={cn(
                        "font-body text-[11px] font-semibold",
                        insights.aiEdgePct > 5
                          ? "text-profit-green"
                          : insights.aiEdgePct < -5
                            ? "text-loss-red"
                            : "text-foreground",
                      )}
                    >
                      {insights.aiEdgePct >= 0 ? "+" : ""}
                      {insights.aiEdgePct.toFixed(1)}%
                    </p>
                  </div>
                </div>
              )}
              {insights.timing && (
                <div className="flex items-center gap-1 bg-card px-2 py-1.5">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <div>
                    <p className="font-sans text-[11px] text-muted-foreground">Timing</p>
                    <p className="font-body text-[11px] font-semibold text-foreground truncate">
                      {insights.timing}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Position details */}
      {(hasTraderPos || hasUserPos) && (
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Positions
            </span>
          </div>

          {/* Trader positions */}
          {hasTraderPos && trade.traderPositionBadge && (
            <div className="mb-2">
              <p className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Trader
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body text-xs">
                  <thead>
                    <tr className="border-b border-border/50 text-[11px] uppercase tracking-widest text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">Side</th>
                      <th className="py-1 pr-2 font-medium">Outcome</th>
                      <th className="py-1 pr-2 font-medium text-right">Size</th>
                      <th className="py-1 font-medium text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trade.traderPositionBadge.trades.map((t, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className={cn("py-1 pr-2 font-semibold", t.side === "BUY" ? "text-profit-green" : "text-loss-red")}>
                          {t.side}
                        </td>
                        <td className="py-1 pr-2">{t.outcome}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">
                          {t.amountUsd != null ? formatUSD(t.amountUsd) : "—"}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {t.price != null ? `${(t.price * 100).toFixed(1)}\u00A2` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* User positions */}
          {hasUserPos && trade.userPositionBadge && (
            <div>
              <p className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Your Positions
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body text-xs">
                  <thead>
                    <tr className="border-b border-border/50 text-[11px] uppercase tracking-widest text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">Side</th>
                      <th className="py-1 pr-2 font-medium">Outcome</th>
                      <th className="py-1 pr-2 font-medium text-right">Size</th>
                      <th className="py-1 font-medium text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trade.userPositionBadge.trades.map((t, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className={cn("py-1 pr-2 font-semibold", t.side === "BUY" ? "text-profit-green" : "text-loss-red")}>
                          {t.side}
                        </td>
                        <td className="py-1 pr-2">{t.outcome}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">
                          {t.amountUsd != null ? formatUSD(t.amountUsd) : "—"}
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {t.price != null ? `${(t.price * 100).toFixed(1)}\u00A2` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */

export function TradeCard({
  trade,
  onCopy,
  onManualCopy,
  onMarkAsCopied,
  isPremiumUser = false,
  isWalletConnected = false,
  className,
}: TradeCardProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const isSell = trade.side === "SELL"
  const hasFlags =
    Boolean(trade.traderPositionBadge?.trades?.length) ||
    Boolean(trade.userPositionBadge?.trades?.length) ||
    Boolean(trade.traderInsights) ||
    Boolean(trade.market.subtype || trade.market.betStructure)

  return (
    <article
      className={cn(
        "border border-border/50 bg-card shadow-sm transition-all duration-150 hover:border-border hover:shadow-md",
        className,
      )}
      aria-label={`Trade by ${trade.trader.name} on ${trade.market.title}`}
    >
      {/* ── Header: Avatar + Name | PolyScore + Timestamp ── */}
      <div className="flex items-start justify-between px-4 pt-4 sm:px-5">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 rounded-none">
            {trade.trader.avatar ? (
              <AvatarImage src={trade.trader.avatar} alt={trade.trader.name} />
            ) : null}
            <AvatarFallback className="rounded-none bg-poly-indigo font-sans text-xs font-bold text-white">
              {initials(trade.trader.name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-sans text-sm font-bold leading-tight text-foreground">
                {trade.trader.name}
              </p>
              {trade.trader.isPremium && (
                <span className="badge-premium" style={{ fontSize: "9px", padding: "1px 4px", gap: "2px" }}>
                  <Zap className="h-2.5 w-2.5" />
                  PRO
                </span>
              )}
            </div>
            <p className="font-body text-xs text-muted-foreground">
              @{walletShort(trade.trader.wallet)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isPremiumUser && (trade.polyscore != null || trade.polySignalRecommendation) ? (
            <PolyScoreBadge
              score={trade.polyscore}
              recommendation={trade.polySignalRecommendation}
            />
          ) : (
            <LockedBadge />
          )}
          <span className="font-body text-xs text-muted-foreground">
            {formatTimeAgo(trade.timestamp)}
          </span>
        </div>
      </div>

      {/* ── Market Title + Game Event Badge ── */}
      <div className="px-4 pt-3 sm:px-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-sans text-[15px] font-semibold leading-snug text-foreground">
            {trade.market.title}
          </h3>
          {trade.market.polymarketUrl && (
            <a
              href={trade.market.polymarketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 flex-shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="View on Polymarket"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {/* Game event badge */}
        {trade.gameEvent && (
          <div className="mt-1.5">
            <GameEventBadge event={trade.gameEvent} />
          </div>
        )}
      </div>

      {/* ── Metrics Row: Token + Entry + Size + Conviction ── */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-px bg-border mx-4 sm:mx-5">
        {/* Token (YES/NO) */}
        <div className="bg-card py-2.5 text-center">
          <div className="flex items-center justify-center">
            <TokenBadge token={trade.market.token} />
          </div>
          <p className="mt-0.5 font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {isSell ? "SELLING" : "BUYING"}
          </p>
        </div>

        {/* Entry Price */}
        <div className="bg-card py-2.5 text-center">
          <p className="font-body text-lg font-semibold tabular-nums text-foreground sm:text-xl">
            {formatPrice(trade.entry_price)}&cent;
          </p>
          <p className="mt-0.5 font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Entry
          </p>
        </div>

        {/* Size */}
        <div className="bg-card py-2.5 text-center">
          <p className="font-body text-lg font-semibold tabular-nums text-foreground sm:text-xl">
            {formatUSD(trade.size_usd)}
          </p>
          <p className="mt-0.5 font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Size
          </p>
        </div>

        {/* Conviction */}
        <div className="bg-card py-2.5 text-center">
          <p className="font-body text-lg font-semibold tabular-nums text-foreground sm:text-xl">
            {trade.conviction.toFixed(1)}x
          </p>
          <p className="mt-0.5 font-sans text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Conviction
          </p>
        </div>
      </div>

      {/* ── Flags Row (expandable) ── */}
      {hasFlags && (
        <div className="mx-4 sm:mx-5">
          <FlagsRow
            trade={trade}
            isDrawerOpen={isDrawerOpen}
            onToggle={() => setIsDrawerOpen(!isDrawerOpen)}
          />
        </div>
      )}

      {/* ── Insights Drawer ── */}
      {isDrawerOpen && hasFlags && (
        <div className="mx-4 sm:mx-5">
          <InsightsDrawer trade={trade} />
        </div>
      )}

      {/* ── CTA Footer ── */}
      <div className="px-4 pb-4 pt-3 sm:px-5">
        {isWalletConnected ? (
          /* Quick Trade — single button */
          <button
            type="button"
            className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm"
            onClick={onCopy}
          >
            <Copy className="h-4 w-4" />
            COPY TRADE
          </button>
        ) : (
          /* Manual Trade — two-step buttons */
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary flex flex-1 items-center justify-center gap-2 py-3 text-xs"
              onClick={onManualCopy || onCopy}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center bg-poly-black font-sans text-[10px] font-bold text-poly-yellow">
                1
              </span>
              COPY TRADE
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="btn-ghost flex flex-1 items-center justify-center gap-2 border border-gray-300 py-3 text-xs"
              onClick={() => onMarkAsCopied?.(trade.entry_price)}
            >
              <span className="inline-flex h-5 w-5 items-center justify-center bg-poly-black font-sans text-[10px] font-bold text-white">
                2
              </span>
              MARK COPIED
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
