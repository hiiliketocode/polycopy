"use client"

import { Zap, Settings, Lock } from "lucide-react"
import { cn } from "@/lib/utils"

/* ───── Types ───── */

export interface BotData {
  id: string
  name: string
  description: string
  performance: {
    return_pct: number
    win_rate: number
    total_trades: number
    sparkline_data: number[]
  }
  risk_level: "LOW" | "MEDIUM" | "HIGH"
  volume: string
  is_premium: boolean
  is_active: boolean
  /** Chart line color override */
  chartColor?: string
}

interface BotCardProps {
  bot: BotData
  onCopyBot?: () => void
  onManage?: () => void
  onAnalysis?: () => void
  isPremiumUser?: boolean
  /** Whether the user has an active subscription for this bot */
  isSubscribed?: boolean
  className?: string
}

/* ───── Risk Config ───── */

const riskConfig = {
  LOW: { label: "LOW", color: "text-profit-green" },
  MEDIUM: { label: "MEDIUM", color: "text-poly-yellow" },
  HIGH: { label: "HIGH", color: "text-loss-red" },
}

/* ───── Sparkline with gradient fill ───── */

function SparklineChart({
  data,
  color = "#22C55E",
}: {
  data: number[]
  color?: string
}) {
  if (!data.length) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const h = 100
  const w = 300
  const padding = 4

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = padding + (h - 2 * padding) - ((v - min) / range) * (h - 2 * padding)
    return { x, y }
  })

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`

  const gradientId = `bot-spark-${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-full w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label="Performance chart"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ───── Format Helpers ───── */

function formatTrades(n: number): string {
  if (n >= 100000) return `${(n / 1000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}K`
  return n.toLocaleString()
}

/* ───── Main Component ───── */

export function BotCard({
  bot,
  onCopyBot,
  onManage,
  onAnalysis,
  isPremiumUser = false,
  isSubscribed = false,
  className,
}: BotCardProps) {
  const risk = riskConfig[bot.risk_level]
  const isPositive = bot.performance.return_pct >= 0
  const chartColor = bot.chartColor || (isPositive ? "#22C55E" : "#EF4444")

  return (
    <article
      className={cn(
        "flex flex-col border border-border bg-card",
        className,
      )}
      aria-label={`Strategy bot: ${bot.name}`}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between px-5 pt-5">
        <div className="flex-1">
          <h3 className="font-sans text-lg font-bold uppercase tracking-wide text-foreground">
            {bot.name}
          </h3>
          <p className="mt-1 font-body text-xs leading-relaxed text-muted-foreground">
            {bot.description}
          </p>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          {/* Access badge */}
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 font-sans text-[9px] font-bold uppercase tracking-widest",
              bot.is_premium
                ? "bg-poly-black text-white"
                : "bg-poly-yellow text-poly-black"
            )}
          >
            <Zap className="h-2.5 w-2.5" />
            {bot.is_premium ? "PREMIUM" : "FREE"}
          </span>
        </div>
      </div>

      {/* ── ROI + Chart ── */}
      <div className="px-5 pt-4">
        <p className="font-sans text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          ROI_30D
        </p>
        <p
          className={cn(
            "font-sans text-2xl font-bold tabular-nums",
            isPositive ? "text-profit-green" : "text-loss-red"
          )}
        >
          {isPositive ? "+" : ""}
          {bot.performance.return_pct.toFixed(1)}%
        </p>
      </div>
      <div className="h-24 px-5 py-2">
        <SparklineChart data={bot.performance.sparkline_data} color={chartColor} />
      </div>

      {/* ── Stats Row ── */}
      <div className="mx-5 grid grid-cols-4 border-t border-border py-3">
        <div>
          <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            WIN_RATE
          </p>
          <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-foreground">
            {bot.performance.win_rate.toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            TRADES
          </p>
          <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-foreground">
            {formatTrades(bot.performance.total_trades)}
          </p>
        </div>
        <div>
          <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            RISK
          </p>
          <p className={cn("mt-0.5 font-sans text-sm font-bold uppercase", risk.color)}>
            {risk.label}
          </p>
        </div>
        <div>
          <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
            VOLUME
          </p>
          <p className="mt-0.5 font-body text-sm font-semibold tabular-nums text-foreground">
            {bot.volume}
          </p>
        </div>
      </div>

      {/* ── Active Badge (if subscribed) ── */}
      {isSubscribed && (
        <div className="mx-5 flex items-center gap-2 border-t border-border py-2">
          <span className="h-2 w-2 rounded-full bg-profit-green" />
          <span className="font-sans text-[9px] font-bold uppercase tracking-widest text-profit-green">
            ACTIVE — COPYING
          </span>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="mt-auto grid grid-cols-2 border-t border-border">
        <button
          type="button"
          onClick={onAnalysis}
          className="flex items-center justify-center gap-2 border-r border-border py-3 font-sans text-[10px] font-bold uppercase tracking-widest text-foreground transition-colors hover:bg-accent"
        >
          ANALYSIS
        </button>
        {bot.is_premium && !isPremiumUser && !isSubscribed ? (
          <button
            type="button"
            disabled
            className="flex items-center justify-center gap-2 py-3 font-sans text-[10px] font-bold uppercase tracking-widest bg-muted text-muted-foreground cursor-not-allowed"
          >
            <Zap className="h-3.5 w-3.5" /> PREMIUM ONLY
          </button>
        ) : (
          <button
            type="button"
            onClick={isSubscribed ? onManage : onCopyBot}
            className={cn(
              "flex items-center justify-center gap-2 py-3 font-sans text-[10px] font-bold uppercase tracking-widest transition-colors",
              isSubscribed
                ? "bg-accent text-foreground hover:bg-accent/80"
                : "bg-poly-yellow text-poly-black hover:bg-poly-yellow/90"
            )}
          >
            {isSubscribed ? (
              <>
                <Settings className="h-3.5 w-3.5" /> MANAGE
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" /> COPY_BOT
              </>
            )}
          </button>
        )}
      </div>
    </article>
  )
}
