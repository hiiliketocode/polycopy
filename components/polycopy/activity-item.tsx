import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { getTraderAvatarInitials } from "@/lib/trader-name"

interface ActivityItemProps {
  traderName: string
  traderUsername: string
  traderAvatar?: string
  action: "BUY" | "SELL"
  position: "YES" | "NO"
  market: string
  shares: number
  price: number
  timestamp: string
}

export function ActivityItem({
  traderName,
  traderUsername,
  traderAvatar,
  action,
  position,
  market,
  shares,
  price,
  timestamp,
}: ActivityItemProps) {
  return (
    <div className="flex gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:shadow-sm transition-shadow duration-200">
      {/* Avatar */}
      <Avatar className="h-10 w-10 ring-2 ring-slate-100 shrink-0">
        {traderAvatar ? <AvatarImage src={traderAvatar} alt={traderName} /> : null}
        <AvatarFallback className="bg-white text-slate-700 text-xs font-semibold">
          {getTraderAvatarInitials({ displayName: traderName, wallet: traderUsername })}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-950 text-sm">{traderName}</span>
              <span className="text-slate-500 text-xs">@{traderUsername}</span>
            </div>
          </div>
          <span className="text-xs text-slate-500 shrink-0">{timestamp}</span>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "text-xs font-bold px-2 py-0.5 rounded",
                action === "BUY" ? "bg-[#10B981]/10 text-[#10B981]" : "bg-[#EF4444]/10 text-[#EF4444]",
              )}
            >
              {action}
            </span>
            <span
              className={cn(
                "text-xs font-bold px-2 py-0.5 rounded",
                position === "YES" ? "bg-[#10B981]/10 text-[#10B981]" : "bg-[#EF4444]/10 text-[#EF4444]",
              )}
            >
              {position}
            </span>
            <span className="text-sm text-slate-700 font-medium">
              {shares} shares @ ${price.toFixed(2)}
            </span>
          </div>

          <p className="text-sm text-slate-600 line-clamp-2">{market}</p>
        </div>
      </div>
    </div>
  )
}
