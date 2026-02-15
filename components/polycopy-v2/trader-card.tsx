"use client"

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui-v2/avatar"
import { cn } from "@/lib/utils"

/* ───── Types ───── */

export interface TraderData {
  wallet: string
  name?: string
  avatar?: string
  stats: {
    pnl: number
    win_rate: number
    total_trades: number
    roi: number
  }
  isFollowed: boolean
}

interface TraderCardProps {
  trader: TraderData
  onFollow?: () => void
  onViewProfile?: () => void
  className?: string
}

/* ───── Helpers ───── */

function formatUSD(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${value >= 0 ? "+" : "-"}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1000) return `${value >= 0 ? "+" : "-"}$${(abs / 1000).toFixed(1)}K`
  return `${value >= 0 ? "+" : "-"}$${abs.toFixed(0)}`
}

function walletShort(wallet: string): string {
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
}

function initials(name?: string, wallet?: string): string {
  if (name) {
    return name
      .split(/[\s_]+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }
  return wallet ? wallet.slice(2, 4).toUpperCase() : "??"
}

/* ───── Main Component ───── */

export function TraderCard({
  trader,
  onFollow,
  onViewProfile,
  className,
}: TraderCardProps) {
  const displayName = trader.name || "Anonymous"
  const isProfitable = trader.stats.pnl >= 0

  return (
    <article
      className={cn(
        "flex flex-col border border-border/50 bg-card p-4 shadow-sm transition-all duration-150 hover:border-border hover:shadow-md",
        className,
      )}
      aria-label={`Trader: ${displayName}`}
    >
      {/* ── Avatar + Name ── */}
      <div className="mb-3 flex flex-col items-center text-center">
        <Avatar className="mb-2 h-14 w-14 rounded-none">
          {trader.avatar ? (
            <AvatarImage src={trader.avatar} alt={displayName} />
          ) : null}
          <AvatarFallback className="rounded-none bg-poly-indigo font-sans text-lg font-bold text-white">
            {initials(trader.name, trader.wallet)}
          </AvatarFallback>
        </Avatar>
        <h3 className="font-sans text-sm font-bold leading-tight text-foreground">
          {displayName}
        </h3>
        <p className="mt-0.5 font-body text-[11px] text-muted-foreground">
          @{walletShort(trader.wallet)}
        </p>
      </div>

      {/* ── Stats Grid ── */}
      <div className="mb-3 grid grid-cols-2 gap-px bg-border">
        <div className="bg-accent py-2 text-center">
          <p
            className={cn(
              "font-body text-sm font-semibold tabular-nums",
              isProfitable ? "text-profit-green" : "text-loss-red",
            )}
          >
            {formatUSD(trader.stats.pnl)}
          </p>
          <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
            PnL
          </p>
        </div>
        <div className="bg-accent py-2 text-center">
          <p className="font-body text-sm font-semibold tabular-nums text-foreground">
            {trader.stats.win_rate}%
          </p>
          <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
            WIN RATE
          </p>
        </div>
        <div className="bg-accent py-2 text-center">
          <p className="font-body text-sm font-semibold tabular-nums text-foreground">
            {trader.stats.total_trades}
          </p>
          <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
            TRADES
          </p>
        </div>
        <div className="bg-accent py-2 text-center">
          <p className="font-body text-sm font-semibold tabular-nums text-foreground">
            {trader.stats.roi.toFixed(1)}x
          </p>
          <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
            ROI
          </p>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="mt-auto flex gap-1.5">
        <button
          type="button"
          className={cn(
            "flex-1 py-2 text-[11px]",
            trader.isFollowed ? "btn-ghost" : "btn-primary",
          )}
          onClick={onFollow}
        >
          {trader.isFollowed ? "FOLLOWING" : "FOLLOW"}
        </button>
        <button
          type="button"
          className="btn-ghost flex-1 py-2 text-[11px]"
          onClick={onViewProfile}
        >
          PROFILE
        </button>
      </div>
    </article>
  )
}
