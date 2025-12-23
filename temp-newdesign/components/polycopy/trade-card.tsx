"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowUpRight, ArrowDownRight } from "lucide-react"
import Link from "next/link"

interface TradeCardProps {
  trader: {
    name: string
    avatar?: string
    address: string
    id?: string
  }
  market: string
  position: "YES" | "NO"
  action: "Buy" | "Sell"
  price: number
  size: number
  total: number
  timestamp: string
  onCopyTrade?: () => void
  onMarkAsCopied?: () => void
}

export function TradeCard({
  trader,
  market,
  position,
  action,
  price,
  size,
  total,
  timestamp,
  onCopyTrade,
  onMarkAsCopied,
}: TradeCardProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US").format(value)
  }

  return (
    <div className="group bg-white border border-slate-200 rounded-xl p-5 md:p-6 transition-all hover:shadow-lg">
      {/* Header Row */}
      <div className="flex items-center justify-between mb-4">
        <Link
          href={`/trader/${trader.id || "1"}`}
          className="flex items-center gap-3 min-w-0 hover:opacity-70 transition-opacity"
        >
          <Avatar className="h-10 w-10 ring-2 ring-slate-100 transition-all">
            <AvatarImage src={trader.avatar || "/placeholder.svg"} alt={trader.name} />
            <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 text-sm font-semibold">
              {trader.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="font-medium text-slate-900 text-sm">{trader.name}</p>
            <p className="text-xs text-slate-500 font-mono truncate">{trader.address}</p>
          </div>
        </Link>
        <span className="text-xs text-slate-500 font-medium whitespace-nowrap ml-3">{timestamp}</span>
      </div>

      <h3 className="text-base md:text-lg font-medium text-slate-900 leading-snug mb-4">{market}</h3>

      <div className="border border-slate-200 rounded-lg p-4 mb-4 bg-slate-50/50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 relative">
          <div className="text-center">
            <p className="text-xs text-slate-500 mb-1 font-medium">Position</p>
            <div className="flex flex-wrap md:flex-row md:items-center md:justify-center items-center justify-center gap-1">
              <Badge
                variant="secondary"
                className={`font-semibold text-xs ${
                  position === "YES"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-red-50 text-red-700 border-red-200"
                }`}
              >
                {position}
              </Badge>
              <div className="flex items-center gap-0.5 text-xs text-slate-600">
                {action === "Buy" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                <span className="font-medium">{action}</span>
              </div>
            </div>
          </div>
          <div className="text-center md:border-l border-slate-200">
            <p className="text-xs text-slate-500 mb-1 font-medium">Entry</p>
            <p className="text-sm md:text-base font-semibold text-slate-900">{formatCurrency(price)}</p>
          </div>
          <div className="text-center md:border-l border-slate-200">
            <p className="text-xs text-slate-500 mb-1 font-medium">Size</p>
            <p className="text-sm md:text-base font-semibold text-slate-900">{formatNumber(size)}</p>
          </div>
          <div className="text-center md:border-l border-slate-200">
            <p className="text-xs text-slate-500 mb-1 font-medium">Total</p>
            <p className="text-sm md:text-base font-semibold text-slate-900">{formatCurrency(total)}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={onCopyTrade}
          className="bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900 font-semibold shadow-sm text-sm"
          size="lg"
        >
          Copy Trade
        </Button>
        <Button
          onClick={onMarkAsCopied}
          variant="outline"
          className="border-slate-300 text-slate-700 hover:bg-slate-50 font-medium bg-transparent text-sm transition-all"
          size="lg"
        >
          Mark as Copied
        </Button>
      </div>
    </div>
  )
}
