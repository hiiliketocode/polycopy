'use client'

import { cn } from '@/lib/utils'

type TradeTableHeaderProps = {
  showActions?: boolean
  className?: string
}

export function TradeTableHeader({ showActions = true, className }: TradeTableHeaderProps) {
  return (
    <thead className={cn('bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500', className)}>
      <tr className="border-b border-slate-200">
        <th className="px-4 py-3 text-left font-semibold min-w-[180px]">Trader</th>
        <th className="px-4 py-3 text-left font-semibold min-w-[260px]">Market</th>
        <th className="px-4 py-3 text-left font-semibold min-w-[160px]">Trade</th>
        <th className="px-4 py-3 text-left font-semibold min-w-[110px]">Invested</th>
        <th className="px-4 py-3 text-left font-semibold min-w-[110px]">Contracts</th>
        <th className="px-4 py-3 text-left font-semibold min-w-[100px]">Entry</th>
        <th className="px-4 py-3 text-left font-semibold min-w-[100px]">Current</th>
        <th className="px-4 py-3 text-left font-semibold min-w-[90px]">ROI</th>
        <th className="px-4 py-3 text-left font-semibold min-w-[110px]">Time</th>
        {showActions && <th className="px-4 py-3 text-right font-semibold min-w-[140px]">Action</th>}
      </tr>
    </thead>
  )
}
