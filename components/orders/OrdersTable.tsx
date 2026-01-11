'use client'
import React, { useMemo, useState } from 'react'
import { OrderActivity, OrderRow, OrderStatus } from '@/lib/orders/types'
import { PositionSummary } from '@/lib/orders/position'
import OrderRowDetails from './OrderRowDetails'

const PAGE_SIZE = 12

const STATUS_LABELS: Record<OrderStatus, string> = {
  open: 'Open',
  partial: 'Partial',
  filled: 'Filled',
  canceled: 'Canceled',
  expired: 'Expired',
  failed: 'Failed',
}

const ACTIVITY_ICON_STYLES: Record<OrderActivity, { iconBg: string; iconText: string }> = {
  bought: { iconBg: 'bg-sky-100 border-sky-200', iconText: 'text-sky-700' },
  sold: { iconBg: 'bg-amber-100 border-amber-200', iconText: 'text-amber-700' },
  redeemed: { iconBg: 'bg-emerald-100 border-emerald-200', iconText: 'text-emerald-700' },
  lost: { iconBg: 'bg-rose-100 border-rose-200', iconText: 'text-rose-700' },
  canceled: { iconBg: 'bg-slate-100 border-slate-200', iconText: 'text-slate-600' },
  expired: { iconBg: 'bg-slate-100 border-slate-200', iconText: 'text-slate-600' },
  failed: { iconBg: 'bg-rose-100 border-rose-200', iconText: 'text-rose-700' },
}

const OUTCOME_PILL_STYLES: Record<OrderActivity, string> = {
  bought: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  sold: 'bg-amber-50 text-amber-700 ring-amber-100',
  redeemed: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  lost: 'bg-rose-50 text-rose-700 ring-rose-100',
  canceled: 'bg-slate-100 text-slate-600 ring-slate-200',
  expired: 'bg-slate-50 text-slate-500 ring-slate-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-100',
}

type OrdersTableProps = {
  orders: OrderRow[]
  loading: boolean
  statusSummary: Record<OrderStatus, number>
  getPositionForOrder: (order: OrderRow) => PositionSummary | null
  onSellPosition: (order: OrderRow) => void
  showActions?: boolean
  onCancelOrder?: (order: OrderRow) => void
  cancelingOrderId?: string | null
  customTitle?: string
}

export default function OrdersTable({
  orders,
  loading,
  statusSummary: _statusSummary,
  getPositionForOrder,
  onSellPosition,
  showActions = true,
  onCancelOrder,
  cancelingOrderId = null,
  customTitle,
}: OrdersTableProps) {
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)

  const pageCount = Math.max(1, Math.ceil(orders.length / PAGE_SIZE))
  const safePage = Math.max(0, Math.min(currentPage, pageCount - 1))
  const pagedOrders = useMemo(() => {
    const start = safePage * PAGE_SIZE
    return orders.slice(start, start + PAGE_SIZE)
  }, [orders, safePage])

  const toggleRow = (orderId: string) => {
    setExpandedOrderId((current) => (current === orderId ? null : orderId))
  }

  if (!loading && orders.length === 0) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-slate-900">{customTitle || 'Orders'}</h2>
          <p className="text-sm text-slate-500">No orders found yet.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{customTitle || 'Orders'}</h2>
          <p className="text-sm text-slate-500">{orders.length} items</p>
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
                <th className="py-2 pr-4 font-medium min-w-[140px]">Activity</th>
                <th className="py-2 pr-4 font-medium min-w-[280px]">Market</th>
                <th className="py-2 pr-4 font-medium text-right min-w-[100px]">Value</th>
                <th className="py-2 pr-2 font-medium text-right min-w-[120px]">Time</th>
                {showActions && <th className="py-2 pl-2 font-medium text-right min-w-[120px]">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {pagedOrders.map((order) => {
                const contractsValue = order.filledSize > 0 ? order.filledSize : order.size
                const position = getPositionForOrder(order)
                const hasOpenPosition = Boolean(position && position.size > 0)
                const isMarketOpen =
                  (order.marketIsOpen ?? null) !== false &&
                  (order.status === 'open' || order.status === 'partial' || order.marketIsOpen === true)
                const canSell = hasOpenPosition && isMarketOpen
                const activityStyle = ACTIVITY_ICON_STYLES[order.activity]
                const isAutoSold = !showActions && order.activity === 'sold' && order.isAutoClose
                const activityLabel = isAutoSold ? 'Auto-sold' : order.activityLabel
                const activityTooltip = getActivityTooltip(order, activityLabel)
                const value = deriveOrderValue(order, contractsValue)
                const outcomeStyle = OUTCOME_PILL_STYLES[order.activity]
                return (
                  <React.Fragment key={order.orderId}>
                    <tr className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => toggleRow(order.orderId)}>
                      <td className="py-3 pr-4 align-top">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold ${activityStyle.iconBg} ${activityStyle.iconText}`}
                            title={activityTooltip}
                          >
                            {order.activityIcon}
                          </span>
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-900">{activityLabel}</span>
                            <span className="text-xs text-slate-500">{STATUS_LABELS[order.status]}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-slate-100 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
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
                            <p className="truncate text-sm font-semibold text-slate-900">{order.marketTitle}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              {order.outcome && (
                                <span
                                  className={`inline-flex items-center gap-2 rounded-full px-2 py-0.5 font-semibold ring-1 ${outcomeStyle}`}
                                >
                                  {formatOutcome(order.outcome)}
                                  {order.priceOrAvgPrice !== null && order.priceOrAvgPrice !== undefined && !Number.isNaN(order.priceOrAvgPrice)
                                    ? formatCents(order.priceOrAvgPrice)
                                    : null}
                                </span>
                              )}
                            <span className="text-slate-500">{formatShares(contractsValue)} contracts</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4 align-top text-right">
                        <span
                          className={`text-sm font-semibold ${getValueColorClass(value)}`}
                          title={value === null ? 'No value' : undefined}
                        >
                          {formatCurrencySigned(value)}
                        </span>
                      </td>
                      <td className="py-3 pr-2 align-top text-right text-slate-600">
                        {formatRelativeTime(order.createdAt)}
                      </td>
                      {showActions && (
                        <td className="py-3 pr-4 align-top text-right">
                          {onCancelOrder ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                onCancelOrder(order)
                              }}
                              disabled={cancelingOrderId === order.orderId}
                              className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                                cancelingOrderId === order.orderId
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'bg-slate-900 text-white hover:bg-slate-800'
                              }`}
                            >
                              {cancelingOrderId === order.orderId ? 'Canceling…' : 'Cancel'}
                            </button>
                          ) : (
                            isMarketOpen && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  if (!canSell) return
                                  onSellPosition(order)
                                }}
                                disabled={!canSell}
                                className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                                  canSell
                                    ? 'bg-rose-500 text-white hover:bg-rose-400'
                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                }`}
                              >
                                Sell
                              </button>
                            )
                          )}
                        </td>
                      )}
                    </tr>
                    {expandedOrderId === order.orderId && (
                      <tr className="bg-slate-50">
                        <td colSpan={showActions ? 5 : 4} className="px-4 pb-4 pt-2">
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

function getActivityTooltip(order: OrderRow, activityLabel: string) {
  const baseLabel =
    order.activity === 'bought' && (order.status === 'open' || order.status === 'partial')
      ? `${activityLabel} (open)`
      : activityLabel
  const rawAction = getRawAction(order)
  if (rawAction) return `${baseLabel} - ${rawAction}`
  return baseLabel
}

function getRawAction(order: OrderRow) {
  const raw = order.raw ?? {}
  const candidates = [
    raw.action_type,
    raw.action,
    raw.event_type,
    raw.eventType,
    raw.raw_action,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  return null
}

function formatOutcome(value: string | null) {
  if (!value) return '—'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatShares(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
  }).format(value)
}

function formatCents(price: number | null | undefined) {
  if (price === null || price === undefined || Number.isNaN(price)) return ''
  const cents = price * 100
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: cents % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(cents)
  return `${formatted}¢`
}

function formatCurrencySigned(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const abs = Math.abs(value)
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs)
  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}$${formatted}`
}

function getValueColorClass(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'text-slate-500'
  if (value > 0) return 'text-emerald-600'
  if (value < 0) return 'text-rose-600'
  return 'text-slate-600'
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60000)
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

function deriveOrderValue(order: OrderRow, contractsValue: number | null | undefined) {
  const size = Number.isFinite(contractsValue ?? NaN) ? (contractsValue as number) : null
  const price = Number.isFinite(order.priceOrAvgPrice ?? NaN)
    ? (order.priceOrAvgPrice as number)
    : Number.isFinite(order.currentPrice ?? NaN)
      ? (order.currentPrice as number)
      : null

  if (order.activity === 'redeemed' || order.activity === 'lost') {
    const pnl = Number.isFinite(order.pnlUsd ?? NaN) ? (order.pnlUsd as number) : null
    if (pnl !== null) return pnl
  }

  if (price === null || size === null) return null
  const notional = price * size
  if (!Number.isFinite(notional)) return null

  if (order.activity === 'sold') return notional
  if (order.activity === 'redeemed') return notional
  if (order.activity === 'lost' || order.activity === 'canceled' || order.activity === 'expired' || order.activity === 'failed') {
    return -notional
  }
  return -notional
}
