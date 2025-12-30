"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import { useState, useEffect } from "react"
import Link from "next/link"

interface TraderDiscoveryCardProps {
  trader: {
    id: string
    name: string
    handle: string
    avatar?: string
    roi: number
    profit: number
    volume: number
    winRate?: number
    isFollowing?: boolean
  }
  onFollowToggle?: (traderId: string, isFollowing: boolean) => void
}

export function TraderDiscoveryCard({ trader, onFollowToggle }: TraderDiscoveryCardProps) {
  const [isFollowing, setIsFollowing] = useState(trader.isFollowing || false)
  
  // Sync internal state with prop changes
  useEffect(() => {
    setIsFollowing(trader.isFollowing || false)
  }, [trader.isFollowing])

  const handleFollowClick = () => {
    const newFollowingState = !isFollowing
    setIsFollowing(newFollowingState)
    onFollowToggle?.(trader.id, newFollowingState)
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
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
      <div className="group bg-slate-50 hover:bg-white rounded-lg border border-slate-200/60 hover:shadow-md transition-all duration-200 p-4 cursor-pointer">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <div className="flex items-center gap-3 min-w-0 sm:min-w-[200px]">
            <Avatar className="h-12 w-12 border-2 border-white shadow-sm flex-shrink-0">
              <AvatarImage src={trader.avatar || "/placeholder.svg"} alt={trader.name} />
              <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 font-semibold">
                {getInitials(trader.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-slate-900 text-base truncate">{trader.name}</h3>
              <p className="text-sm text-slate-500 truncate font-mono">{trader.handle}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 flex-1 sm:flex sm:gap-8 sm:justify-center">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">ROI</span>
              <span
                className={`text-sm sm:text-lg font-semibold tabular-nums ${
                  trader.roi > 0 ? "text-emerald-600" : trader.roi < 0 ? "text-red-500" : "text-slate-900"
                }`}
              >
                {formatPercentage(trader.roi)}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">P&L</span>
              <span
                className={`text-sm sm:text-lg font-semibold tabular-nums ${
                  trader.profit > 0 ? "text-emerald-600" : trader.profit < 0 ? "text-red-500" : "text-slate-900"
                }`}
              >
                {formatCurrency(trader.profit)}
              </span>
            </div>

            {trader.winRate !== undefined && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Win Rate</span>
                <span className="text-sm sm:text-lg font-semibold text-slate-900 tabular-nums">{trader.winRate}%</span>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Volume</span>
              <span className="text-sm sm:text-lg font-semibold text-slate-900 tabular-nums">
                {formatCurrency(trader.volume)}
              </span>
            </div>
          </div>

          <div className="flex sm:justify-end sm:ml-auto w-full sm:w-auto">
            {isFollowing ? (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
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
