import React from 'react'
import { OrderRow } from '@/lib/orders/types'

type OrderRowDetailsProps = {
  order: OrderRow
}

export default function OrderRowDetails({ order }: OrderRowDetailsProps) {
  const rawJson = JSON.stringify(order.raw ?? {}, null, 2)
  const stats = [
    { label: 'Position status', value: order.positionStateLabel ?? 'Unknown' },
    { label: 'Current price', value: formatCurrency(order.currentPrice) },
    { label: 'P / L', value: formatPnl(order.pnlUsd) },
  ]

  return (
    <div className="space-y-4 text-sm text-slate-600">
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((detail) => (
          <div key={detail.label}>
            <p className="text-xs font-semibold text-slate-400">{detail.label}</p>
            <p className="text-base text-slate-900">{detail.value}</p>
          </div>
        ))}
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400">Raw data</p>
        <pre className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 overflow-auto max-h-64">
          {rawJson}
        </pre>
      </div>
    </div>
  )
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 4,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)
  return `$${formatted}`
}

function formatPnl(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(Math.abs(value))
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}$${formatted}`
}
