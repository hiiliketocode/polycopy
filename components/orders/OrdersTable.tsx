'use client'

import React, { useMemo, useState } from 'react'
import { OrderRow, OrderStatus } from '@/lib/orders/types'
import OrderRowDetails from './OrderRowDetails'

const PAGE_SIZE = 12

const STATUS_BADGE_STYLES: Record<OrderStatus, string> = {
  open: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  partial: 'bg-amber-50 text-amber-700 ring-amber-200',
  filled: 'bg-slate-100 text-slate-700 ring-slate-200',
  canceled: 'bg-rose-50 text-rose-700 ring-rose-200',
  expired: 'bg-slate-50 text-slate-500 ring-slate-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  open: 'Open',
  partial: 'Partial',
  filled: 'Filled',
  canceled: 'Canceled',
  expired: 'Expired',
  failed: 'Failed',
}

type MarketStatus = 'open' | 'closed'

const MARKET_STATUS_LABELS: Record<MarketStatus, string> = {
  open: 'Open',
  closed: 'Closed',
}

const MARKET_STATUS_DOT_STYLES: Record<MarketStatus, string> = {
  open: 'bg-emerald-500',
  closed: 'bg-rose-500',
}

type OrdersTableProps = {
  orders: OrderRow[]
  loading: boolean
  statusSummary: Record<OrderStatus, number>
}

export default function OrdersTable({ orders, loading, statusSummary }: OrdersTableProps) {
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)

  const pageCount = Math.max(1, Math.ceil(orders.length / PAGE_SIZE))
  const safePage = Math.max(0, Math.min(currentPage, pageCount - 1))
  const pagedOrders = useMemo(() => {
    const start = safePage * PAGE_SIZE
    return orders.slice(start, start + PAGE_SIZE)
  }, [orders, safePage])

  const statusSummaryEntries = useMemo(
    () =>
      (Object.entries(statusSummary) as [OrderStatus, number][]).filter(([, count]) => count > 0),
    [statusSummary]
  )

  const toggleRow = (orderId: string) => {
    setExpandedOrderId((current) => (current === orderId ? null : orderId))
  }

  const renderMarketStatus = (isOpen: boolean | null): MarketStatus => {
    return isOpen === true ? 'open' : 'closed'
  }

  if (!loading && orders.length === 0) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-slate-900">Orders</h2>
          <p className="text-sm text-slate-500">No orders found yet.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Orders</h2>
          <p className="text-sm text-slate-500">{orders.length} total orders</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {statusSummaryEntries.map(([status, count]) => (
            <span
              key={status}
              className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200"
            >
              {STATUS_LABELS[status]}: {count}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        {loading && orders.length === 0 ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="mb-3 h-3 w-32 rounded-full bg-slate-200" />
                <div className="grid gap-2 text-sm text-slate-400 md:grid-cols-3">
                  <div className="h-3 rounded-full bg-slate-200" />
                  <div className="h-3 rounded-full bg-slate-200" />
                  <div className="h-3 rounded-full bg-slate-200" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 text-xs tracking-wider">
                <th className="py-2 pr-4 font-medium min-w-[140px]">Status</th>
                <th className="py-2 pr-4 font-medium min-w-[220px]">Market</th>
                <th className="py-2 pr-4 font-medium min-w-[200px]">Trader</th>
                <th className="py-2 pr-4 font-medium min-w-[160px]">Side / outcome</th>
                <th className="py-2 pr-4 font-medium min-w-[120px]">Contracts</th>
                <th className="py-2 pr-4 font-medium min-w-[120px]">Price</th>
                <th className="py-2 pr-4 font-medium min-w-[120px]">Current price</th>
                <th className="py-2 pr-4 font-medium min-w-[120px]">P/L</th>
                <th className="py-2 pr-4 font-medium min-w-[140px]">Date</th>
              </tr>
            </thead>
            <tbody>
              {pagedOrders.map((order) => {
                const contractsValue = order.filledSize > 0 ? order.filledSize : order.size
                const marketStatus = renderMarketStatus(order.marketIsOpen)
                return (
                  <React.Fragment key={order.orderId}>
                    <tr className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => toggleRow(order.orderId)}>
                      <td className="py-3 pr-4 align-top">
                        <div className="flex flex-col gap-1">
                          <div className="inline-flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${MARKET_STATUS_DOT_STYLES[marketStatus]}`}
                              aria-label={`Market ${MARKET_STATUS_LABELS[marketStatus]}`}
                              title={`Market ${MARKET_STATUS_LABELS[marketStatus]}`}
                            />
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ring-1 ${STATUS_BADGE_STYLES[order.status]}`}
                            >
                              {STATUS_LABELS[order.status]}
                            </span>
                          </div>
                          {order.positionStateLabel && (
                            <p className="text-xs text-slate-500">{order.positionStateLabel}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                            {order.marketImageUrl ? (
                              <img
                                src={order.marketImageUrl}
                                alt={order.marketTitle}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="flex h-full items-center justify-center">
                                {order.marketTitle.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <p className="truncate font-medium text-slate-900">{order.marketTitle}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                            {order.traderAvatarUrl ? (
                              <img
                                src={order.traderAvatarUrl}
                                alt={order.traderName}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="flex h-full items-center justify-center">
                                {order.traderName.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            <p className="truncate font-medium text-slate-900">{order.traderName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 align-top text-slate-700">
                        <div className="text-sm font-semibold text-slate-900">{formatSide(order.side)}</div>
                        <div className="text-xs text-slate-500">{formatOutcome(order.outcome)}</div>
                      </td>
                      <td className="py-3 pr-4 align-top text-slate-700">
                        {formatNumber(contractsValue)}
                      </td>
                      <td className="py-3 pr-4 align-top text-slate-700">
                        {formatCurrency(order.priceOrAvgPrice)}
                      </td>
                      <td className="py-3 pr-4 align-top text-slate-700">
                        {formatCurrency(order.currentPrice)}
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <span
                          className={`text-sm font-semibold ${getPnlColorClass(order.pnlUsd)}`}
                        >
                          {formatPnl(order.pnlUsd)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 align-top text-slate-600">
                        {formatDate(order.createdAt)}
                      </td>
                    </tr>
                    {expandedOrderId === order.orderId && (
                      <tr className="bg-slate-50">
                        <td colSpan={9} className="px-4 pb-4 pt-2">
                          <OrderRowDetails order={order} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
        <p>
          Page {orders.length === 0 ? 0 : safePage + 1} of {pageCount}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(0, page - 1))}
            disabled={safePage === 0}
            className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(pageCount - 1, page + 1))}
            disabled={safePage >= pageCount - 1}
            className="rounded-full border border-slate-200 px-3 py-1 text-slate-600 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 4,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)
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

function getPnlColorClass(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'text-slate-600'
  }
  if (value > 0) return 'text-emerald-600'
  if (value < 0) return 'text-rose-600'
  return 'text-slate-600'
}

function formatDate(value: string | null | undefined) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatSide(value: string) {
  if (!value) return '—'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'sell') return 'Sell'
  if (normalized === 'buy') return 'Buy'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function formatOutcome(value: string | null) {
  if (!value) return '—'
  return value.charAt(0).toUpperCase() + value.slice(1)
}
