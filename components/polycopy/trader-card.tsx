"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface TraderCardProps {
  name: string
  username: string
  avatar?: string
  winRate: number
  totalReturn: number
  followers: number
  isFollowing?: boolean
  volume?: number
  trades?: number
  onFollowClick?: () => void
  onCopyClick?: () => void
}

export function TraderCard({
  name,
  username,
  avatar,
  winRate,
  totalReturn,
  followers,
  isFollowing = false,
  volume,
  trades,
  onFollowClick,
  onCopyClick,
}: TraderCardProps) {
  return (
    <Card className="bg-white border-slate-200 overflow-hidden hover:shadow-lg transition-shadow duration-200">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14 ring-2 ring-slate-100">
            <AvatarImage src={avatar || "/placeholder.svg"} alt={name} />
            <AvatarFallback className="bg-white text-slate-700 text-base font-semibold">
              {name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-950 text-lg leading-tight">{name}</h3>
            <p className="text-slate-500 text-sm mt-0.5">@{username}</p>
          </div>

          <Button
            variant={isFollowing ? "outline" : "ghost"}
            size="sm"
            onClick={onFollowClick}
            className={cn(
              "shrink-0",
              isFollowing
                ? "border-slate-200 text-slate-700 hover:bg-slate-50"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
            )}
          >
            {isFollowing ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1.5" />
                Following
              </>
            ) : (
              "Follow"
            )}
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="px-6 pb-5">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">Win Rate</div>
            <div className="text-lg font-semibold text-slate-950">{winRate}%</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">Return</div>
            <div
              className={cn(
                "text-lg font-semibold flex items-center gap-1",
                totalReturn >= 0 ? "text-[#10B981]" : "text-[#EF4444]",
              )}
            >
              {totalReturn >= 0 ? "+" : ""}
              {totalReturn.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1.5">Followers</div>
            <div className="text-lg font-semibold text-slate-950">
              {followers >= 1000 ? `${(followers / 1000).toFixed(1)}k` : followers}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Stats (if provided) */}
      {(volume !== undefined || trades !== undefined) && (
        <div className="px-6 pb-5 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-2 gap-4">
            {volume !== undefined && (
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">Volume</div>
                <div className="text-sm font-medium text-slate-700">
                  ${volume >= 1000 ? `${(volume / 1000).toFixed(0)}k` : volume}
                </div>
              </div>
            )}
            {trades !== undefined && (
              <div>
                <div className="text-xs font-medium text-slate-500 mb-1">Trades</div>
                <div className="text-sm font-medium text-slate-700">{trades}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="p-6 pt-0">
        <Button
          onClick={onCopyClick}
          className="w-full bg-[#FDB022] hover:bg-[#E09A1A] text-slate-950 font-semibold shadow-sm"
        >
          Copy Trade
        </Button>
      </div>
    </Card>
  )
}
