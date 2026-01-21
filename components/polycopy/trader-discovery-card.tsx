"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import { useState, useEffect } from "react"
import Link from "next/link"
import { getTraderAvatarInitials } from "@/lib/trader-name"

interface TraderDiscoveryCardProps {
  trader: {
    id: string
    name: string
    handle: string
    avatar?: string
    wallet?: string
    roi: number
    profit: number
    volume: number
    winRate?: number
    isFollowing?: boolean
  }
  density?: "default" | "compact"
  onFollowToggle?: (traderId: string, isFollowing: boolean) => void
}

export function TraderDiscoveryCard({ trader, density = "default", onFollowToggle }: TraderDiscoveryCardProps) {
  const [isFollowing, setIsFollowing] = useState(trader.isFollowing || false)
  const isCompact = density === "compact"
  
  // Sync internal state with prop changes
  useEffect(() => {
    setIsFollowing(trader.isFollowing || false)
  }, [trader.isFollowing])

  const handleFollowClick = () => {
    const newFollowingState = !isFollowing
    setIsFollowing(newFollowingState)
    onFollowToggle?.(trader.id, newFollowingState)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatPercentage = (value: number) => {
    return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`
  }

  return (
    <Link href={`/trader/${trader.id}`} className="block">
      <div
        className={`group bg-slate-50 hover:bg-white rounded-lg border border-slate-200/60 hover:shadow-md transition-all duration-200 cursor-pointer ${
          isCompact ? "p-3" : "p-4"
        }`}
      >
        <div className={`flex flex-col sm:flex-row sm:items-center ${isCompact ? "gap-3 sm:gap-4" : "gap-4 sm:gap-6"}`}>
          <div className={`flex items-center gap-3 min-w-0 sm:flex-shrink-0 ${isCompact ? "sm:w-[220px]" : "sm:w-[240px]"}`}>
            <Avatar className={`${isCompact ? "h-10 w-10" : "h-12 w-12"} border-2 border-white shadow-sm flex-shrink-0`}>
              {trader.avatar ? <AvatarImage src={trader.avatar} alt={trader.name} /> : null}
              <AvatarFallback className="bg-white text-slate-700 font-semibold">
                {getTraderAvatarInitials({ displayName: trader.name, wallet: trader.wallet })}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-slate-900 text-base truncate">{trader.name}</h3>
              <p className="text-sm text-slate-500 truncate font-mono">{trader.handle}</p>
            </div>
          </div>

          <div
            className={`grid grid-cols-2 flex-1 sm:flex sm:justify-center ${
              isCompact ? "gap-x-3 gap-y-2 sm:gap-5" : "gap-x-4 gap-y-3 sm:gap-8"
            }`}
          >
            <div className={`flex flex-col ${isCompact ? "gap-0.5" : "gap-1"}`}>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">ROI</span>
              <span
                className={`text-sm sm:text-lg font-semibold tabular-nums ${
                  trader.roi > 0 ? "text-emerald-600" : trader.roi < 0 ? "text-red-500" : "text-slate-900"
                }`}
              >
                {formatPercentage(trader.roi)}
              </span>
            </div>

            <div className={`flex flex-col ${isCompact ? "gap-0.5" : "gap-1"}`}>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">P&L</span>
              <span
                className={`text-sm sm:text-lg font-semibold tabular-nums ${
                  trader.profit > 0 ? "text-emerald-600" : trader.profit < 0 ? "text-red-500" : "text-slate-900"
                }`}
              >
                {formatCurrency(trader.profit)}
              </span>
            </div>

            <div className={`flex flex-col ${isCompact ? "gap-0.5" : "gap-1"}`}>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Volume</span>
              <span className="text-sm sm:text-lg font-semibold text-slate-900 tabular-nums">
                {formatCurrency(trader.volume)}
              </span>
            </div>
          </div>

          <div className="flex sm:justify-end sm:ml-auto w-full sm:w-auto relative z-10">
            {isFollowing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleFollowClick()
                }}
                className="border-slate-300 text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400 gap-2 px-4 h-9 bg-transparent w-full sm:w-auto"
              >
                <Check className="h-4 w-4" />
                Following
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleFollowClick()
                }}
                className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold shadow-sm px-5 h-9 w-full sm:w-auto"
              >
                Follow
              </Button>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}
