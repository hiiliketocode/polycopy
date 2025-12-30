import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface PositionCardProps {
  market: string
  prediction: string
  position: "YES" | "NO"
  shares: number
  avgPrice: number
  currentPrice: number
  pnl: number
  pnlPercent: number
}

export function PositionCard({
  market,
  prediction,
  position,
  shares,
  avgPrice,
  currentPrice,
  pnl,
  pnlPercent,
}: PositionCardProps) {
  const isProfitable = pnl >= 0

  return (
    <Card className="bg-white border-slate-200 p-5 hover:shadow-md transition-shadow duration-200">
      {/* Market Title */}
      <div className="mb-4">
        <h3 className="font-semibold text-slate-950 text-base leading-snug mb-2">{market}</h3>
        <p className="text-sm text-slate-600 line-clamp-2">{prediction}</p>
      </div>

      {/* Position Badge */}
      <div className="mb-4">
        <Badge
          variant="outline"
          className={cn(
            "font-semibold border-2",
            position === "YES"
              ? "border-[#10B981] text-[#10B981] bg-[#10B981]/5"
              : "border-[#EF4444] text-[#EF4444] bg-[#EF4444]/5",
          )}
        >
          {position}
        </Badge>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4 pb-4 border-b border-slate-100">
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">Shares</div>
          <div className="text-sm font-semibold text-slate-950">{shares}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">Avg Price</div>
          <div className="text-sm font-semibold text-slate-950">${avgPrice.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">Current</div>
          <div className="text-sm font-semibold text-slate-950">${currentPrice.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-slate-500 mb-1">Value</div>
          <div className="text-sm font-semibold text-slate-950">${(shares * currentPrice).toFixed(2)}</div>
        </div>
      </div>

      {/* P&L */}
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-slate-500">Profit/Loss</div>
        <div className="text-right">
          <div className={cn("text-base font-bold", isProfitable ? "text-[#10B981]" : "text-[#EF4444]")}>
            {isProfitable ? "+" : ""}${Math.abs(pnl).toFixed(2)}
          </div>
          <div className={cn("text-sm font-medium", isProfitable ? "text-[#10B981]" : "text-[#EF4444]")}>
            {isProfitable ? "+" : ""}
            {pnlPercent.toFixed(1)}%
          </div>
        </div>
      </div>
    </Card>
  )
}
