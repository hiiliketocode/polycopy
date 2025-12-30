import { Card } from "@/components/ui/card"
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatsCardProps {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  icon?: LucideIcon
  variant?: "default" | "profit" | "loss"
}

export function StatsCard({ label, value, change, changeLabel, icon: Icon, variant = "default" }: StatsCardProps) {
  const isPositive = change !== undefined && change >= 0

  return (
    <Card className="bg-white border-slate-200 p-6 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className="text-sm font-medium text-slate-500">{label}</div>
        {Icon && (
          <div className="p-2 rounded-lg bg-slate-50">
            <Icon className="h-4 w-4 text-slate-600" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-3xl font-bold text-slate-950">{value}</div>

        {change !== undefined && (
          <div className="flex items-center gap-1.5">
            {isPositive ? (
              <TrendingUp className="h-3.5 w-3.5 text-[#10B981]" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-[#EF4444]" />
            )}
            <span className={cn("text-sm font-medium", isPositive ? "text-[#10B981]" : "text-[#EF4444]")}>
              {isPositive ? "+" : ""}
              {change.toFixed(1)}%
            </span>
            {changeLabel && <span className="text-sm text-slate-500 ml-1">{changeLabel}</span>}
          </div>
        )}
      </div>
    </Card>
  )
}
