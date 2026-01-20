import React from 'react'
import { OrderRow } from '@/lib/orders/types'

type OrderRowDetailsProps = {
  order: OrderRow
}

export default function OrderRowDetails({ order }: OrderRowDetailsProps) {
  const rawJson = JSON.stringify(order.raw ?? {}, null, 2)

  return (
    <div className="space-y-4 text-sm text-slate-600">
      <div>
        <p className="text-xs font-semibold text-slate-400">Raw data</p>
        <pre className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 overflow-auto max-h-64">
          {rawJson}
        </pre>
      </div>
    </div>
  )
}
