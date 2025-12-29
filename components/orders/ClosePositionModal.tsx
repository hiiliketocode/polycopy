'use client'

import { useState } from 'react'
import type { OrderRow } from '@/lib/orders/types'
import type { PositionSummary } from '@/lib/orders/position'

type CloseTarget = {
  order: OrderRow
  position: PositionSummary
}

type ClosePositionModalProps = {
  target: CloseTarget
  isSubmitting: boolean
  submitError?: string | null
  onClose: () => void
  onSubmit: (payload: {
    tokenId: string
    amount: number
    price: number
    slippagePercent: number
  }) => void
}

export default function ClosePositionModal({
  target,
  isSubmitting,
  submitError,
  onClose,
  onSubmit,
}: ClosePositionModalProps) {
  const [amountInput, setAmountInput] = useState(() => target.position.size.toFixed(6))
  const [slippagePercent, setSlippagePercent] = useState(1)

  const { order, position } = target
  const currentPrice = order.currentPrice ?? null
  const directionLabel = order.side?.trim().toLowerCase() === 'sell' ? 'Short' : 'Long'
  const entryPrice = order.priceOrAvgPrice ?? position.avgEntryPrice
  const referencePrice = currentPrice ?? entryPrice ?? null
  const amountValue = Number(amountInput)
  const amountValid = Number.isFinite(amountValue) && amountValue > 0
  const limitPrice =
    referencePrice !== null
      ? Math.max(referencePrice * (1 - slippagePercent / 100), Number.EPSILON)
      : null
  const proceeds =
    amountValid && limitPrice !== null ? limitPrice * amountValue : null
  const estimatedPnl =
    amountValid && entryPrice !== null && limitPrice !== null
      ? (limitPrice - entryPrice) * amountValue
      : null
  const currentPnl = order.pnlUsd ?? null
  const effectivePriceForSubmit = limitPrice ?? referencePrice
  const limitPriceLabel = formatCurrency(limitPrice ?? referencePrice)
  const currentPriceLabel = formatCurrency(currentPrice ?? referencePrice)

  const handleSellAll = () => {
    setAmountInput(position.size.toFixed(6))
  }

  const handleConfirm = () => {
    if (!amountValid || effectivePriceForSubmit === null || !position.tokenId) return
    onSubmit({
      tokenId: position.tokenId,
      amount: amountValue,
      price: effectivePriceForSubmit,
      slippagePercent,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="flex min-h-full w-full items-start justify-center px-4 py-8 sm:items-center">
        <div
          className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="space-y-6 px-6 py-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sell position</p>
                <p className="text-lg font-semibold text-slate-900">{order.marketTitle}</p>
                <p className="text-xs text-slate-400">
                  {directionLabel} · {order.outcome ?? '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-500 hover:text-slate-700"
                aria-label="Close sell modal"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid gap-3 text-sm text-slate-500 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">Current price</p>
                <p className="text-base font-semibold text-slate-900">{currentPriceLabel}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">Entry price</p>
                <p className="text-base font-semibold text-slate-900">
                  {entryPrice !== null ? formatCurrency(entryPrice) : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">P / L</p>
                <p className={`text-base font-semibold ${getPnlColorClass(currentPnl)}`}>{formatPnl(currentPnl)}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500">Amount to sell</p>
                  <p className="text-sm font-semibold text-slate-900">{position.size.toFixed(6)} contracts available</p>
                </div>
                <button
                  type="button"
                  onClick={handleSellAll}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
                >
                  Sell all
                </button>
              </div>
              <input
                type="number"
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                min="0"
                step="0.000001"
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-lg font-semibold text-slate-900"
              />
              <div className="text-xs text-slate-500">
                Slippage pinching the limit price controls how low this order can execute.
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Slippage tolerance</span>
                <span className="font-semibold text-slate-900">{slippagePercent.toFixed(2)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                step="0.25"
                value={slippagePercent}
                onChange={(event) => setSlippagePercent(Number(event.target.value))}
                className="w-full"
              />
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Limit price</span>
                <span className="font-semibold text-slate-900">{limitPriceLabel}</span>
              </div>
              <div className="text-xs text-slate-400">
                Allow this close to execute down to {limitPriceLabel} when the market price moves.
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
              <p>
                Estimated proceeds: {' '}
                <span className="font-semibold text-slate-900">
                  {proceeds !== null ? formatCurrency(proceeds) : '—'}
                </span>
              </p>
              <p>
                P&L at limit price:{' '}
                <span className={`font-semibold ${getPnlColorClass(estimatedPnl)}`}>
                  {formatPnl(estimatedPnl)}
                </span>
              </p>
            </div>

            {submitError && (
              <p className="text-xs text-rose-600">{submitError}</p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!amountValid || limitPrice === null || isSubmitting}
                className="flex-1 rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-400 disabled:opacity-40"
              >
                {isSubmitting ? 'Submitting…' : 'Sell position'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
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
  if (value === null || value === undefined || Number.isNaN(value)) return 'text-slate-600'
  if (value > 0) return 'text-emerald-600'
  if (value < 0) return 'text-rose-600'
  return 'text-slate-600'
}
