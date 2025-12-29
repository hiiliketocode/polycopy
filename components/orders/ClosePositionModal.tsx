'use client'

import { useMemo, useState } from 'react'
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
    orderType: 'IOC' | 'GTC'
  }) => void
}

const badgeBase = 'inline-flex items-center justify-center rounded-full px-3 py-1 text-sm font-semibold tracking-wide'
const layoutBadgeBase = `${badgeBase} bg-slate-100 text-slate-600 border border-slate-200`
const SLIPPAGE_TOOLTIP =
  'Limits how much lower than your limit price this close can execute; 1% means the execution price may be at most 1% worse than the quote.'
const ORDER_BEHAVIOR_TOOLTIP =
  "IOC cancels any unfilled portion immediately, while GTC keeps the order open until it either fills or you cancel it."
const SLIPPAGE_PRESETS: Array<number> = [0, 1, 3, 5]

export default function ClosePositionModal({
  target,
  isSubmitting,
  submitError,
  onClose,
  onSubmit,
}: ClosePositionModalProps) {
  const { order, position } = target
  const [amountInput, setAmountInput] = useState(() => position.size.toFixed(6))
  const [slippagePreset, setSlippagePreset] = useState<number | 'custom'>(() => 1)
  const [customSlippage, setCustomSlippage] = useState('')
  const [showSlippageInfo, setShowSlippageInfo] = useState(false)
  const [showOrderBehaviorInfo, setShowOrderBehaviorInfo] = useState(false)
  const [orderType, setOrderType] = useState<'IOC' | 'GTC'>('IOC')

  const marketDirection = useMemo(
    () => (order.side?.trim().toLowerCase() === 'sell' ? 'sell' : 'buy'),
    [order.side]
  )
  const marketStatus = order.marketIsOpen ? 'market open' : 'market closed'
  const currentPrice = order.currentPrice ?? null
  const entryPrice = order.priceOrAvgPrice ?? position.avgEntryPrice ?? null
  const referencePrice = currentPrice ?? entryPrice ?? null
  const amountValue = Number(amountInput)
  const amountValid = Number.isFinite(amountValue) && amountValue > 0
  const slippagePercent =
    slippagePreset === 'custom' ? Number(customSlippage) : Number(slippagePreset)
  const normalizedSlippage = Number.isFinite(slippagePercent) && slippagePercent >= 0 ? slippagePercent : 0
  const limitPrice =
    referencePrice !== null
      ? Math.max(referencePrice * (1 - normalizedSlippage / 100), Number.EPSILON)
      : null
  const proceeds = amountValid && limitPrice !== null ? limitPrice * amountValue : null
  const estimatedPnl =
    amountValid && entryPrice !== null && limitPrice !== null
      ? (limitPrice - entryPrice) * amountValue
      : null
  const currentPnl = order.pnlUsd ?? null
  const effectivePriceForSubmit = limitPrice ?? referencePrice
  const limitPriceLabel = formatCurrency(limitPrice ?? referencePrice)
  const currentPriceLabel = formatCurrency(currentPrice ?? referencePrice)
  const totalCostLabel = proceeds !== null ? formatCurrency(proceeds) : '—'
  const payoutLabel = estimatedPnl !== null ? formatPnl(estimatedPnl) : '—'
  const filledPriceLabel = formatCurrency(entryPrice)
  const contractsLabel = formatNumber(position.size)
  const handleSellAll = () => {
    setAmountInput(position.size.toFixed(6))
  }

  const handleConfirm = () => {
    if (!amountValid || effectivePriceForSubmit === null || !position.tokenId) return
    onSubmit({
      tokenId: position.tokenId,
      amount: amountValue,
      price: effectivePriceForSubmit,
      slippagePercent: normalizedSlippage,
      orderType,
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
          className="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="space-y-6 px-6 py-6">
            <section className="rounded-[32px] border border-slate-200 bg-white px-6 py-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">sell position</p>
                  <p className="text-xs text-slate-500">Close this trade through the Polymarket CLOB.</p>
                </div>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    marketStatus === 'market open'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {marketStatus}
                </span>
              </div>
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border border-slate-100 bg-slate-50 text-xs font-semibold text-slate-500">
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
                <div className="flex flex-1 flex-col gap-2">
                  <p className="text-base font-semibold text-slate-900">{order.marketTitle || 'Market'}</p>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 ${
                        marketDirection === 'buy'
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          : 'bg-rose-50 text-rose-600 border border-rose-100'
                      }`}
                    >
                      direction: {marketDirection}
                    </span>
                    <span className="inline-flex rounded-full bg-slate-50 px-3 py-1 text-slate-600 border border-slate-100">
                      outcome: {order.outcome ?? '—'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {order.createdAt ? `${order.createdAt}` : '—'} · Updated {order.updatedAt ?? '—'}
                  </p>
                </div>
                <div>
                  <span className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                    {contractsLabel} contracts
                  </span>
                </div>
              </div>
              <div className="grid gap-4 text-sm text-slate-500 sm:grid-cols-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">current price</p>
                  <p className="text-base font-semibold text-slate-900">{currentPriceLabel}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">entry price</p>
                  <p className="text-base font-semibold text-slate-900">{filledPriceLabel}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">P / L</p>
                  <p className={`text-base font-semibold ${getPnlColorClass(currentPnl)}`}>
                    {formatPnl(currentPnl)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">contracts</p>
                  <p className="text-base font-semibold text-slate-900">{contractsLabel}</p>
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-slate-200 bg-white px-6 py-6 shadow-lg space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">close order</p>
                <div className="text-xs text-slate-500">{position.size.toFixed(6)} contracts available</div>
              </div>
              <div className="flex items-center justify-between text-sm font-semibold text-slate-900">
                <span>available exposure</span>
                <span className="text-xs text-slate-500">
                  {totalCostLabel} · P&L at limit: {payoutLabel}
                </span>
              </div>
              <div className="rounded-[20px] border border-slate-100 bg-slate-50 px-5 py-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500">amount</p>
                    <p className="text-lg font-semibold text-slate-900">contracts to sell</p>
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
                  min="0"
                  step="0.000001"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  className="mt-3 w-full border-none bg-slate-50 px-3 py-2 text-lg font-semibold text-slate-900 outline-none focus:outline-none"
                />
                <p className="mt-2 text-xs text-slate-500">
                  {amountValid && proceeds !== null ? `≈ ${formatCurrency(proceeds)}` : 'Enter an amount to preview proceeds'}
                </p>
              </div>

              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-medium text-slate-500">Slippage tolerance</div>
                  <button
                    type="button"
                    onClick={() => setShowSlippageInfo((prev) => !prev)}
                    className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-slate-500"
                    aria-expanded={showSlippageInfo}
                    aria-controls="close-slippage-tooltip"
                  >
                    ?
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SLIPPAGE_PRESETS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSlippagePreset(value)}
                      className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                        slippagePreset === value
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {value}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSlippagePreset('custom')}
                    className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                      slippagePreset === 'custom'
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    Custom
                  </button>
                  {slippagePreset === 'custom' && (
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={customSlippage}
                      onChange={(event) => setCustomSlippage(event.target.value)}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="0.5"
                    />
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {limitPriceLabel === '—'
                    ? 'Set slippage to preview the lower bound.'
                    : `Allow this close to execute down to ${limitPriceLabel} when the market price moves.`}
                </p>
                {showSlippageInfo && (
                  <div
                    id="close-slippage-tooltip"
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                  >
                    {SLIPPAGE_TOOLTIP}
                  </div>
                )}
              </div>

              <div className="space-y-3 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-medium text-slate-500">Order Behavior</div>
                  <button
                    type="button"
                    onClick={() => setShowOrderBehaviorInfo((prev) => !prev)}
                    className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-slate-500"
                    aria-expanded={showOrderBehaviorInfo}
                    aria-controls="close-order-behavior-tooltip"
                  >
                    ?
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="closeOrderBehavior"
                      checked={orderType === 'IOC'}
                      onChange={() => setOrderType('IOC')}
                    />
                    <span className="text-xs font-semibold text-slate-900">Immediate or Cancel (recommended)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="closeOrderBehavior"
                      checked={orderType === 'GTC'}
                      onChange={() => setOrderType('GTC')}
                    />
                    <span className="text-xs font-semibold text-slate-900">Good 'Til Canceled</span>
                  </label>
                </div>
                {showOrderBehaviorInfo && (
                  <div
                    id="close-order-behavior-tooltip"
                    className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                  >
                    {ORDER_BEHAVIOR_TOOLTIP}
                  </div>
                )}
              </div>

              <div className="rounded-[20px] border border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                <p className="text-xs text-slate-500">Estimated proceeds</p>
                <p className="text-lg font-semibold text-slate-900">{proceeds !== null ? formatCurrency(proceeds) : '—'}</p>
                <p className="text-xs text-slate-500">
                  P&L at limit price:{' '}
                  <span className={`font-semibold ${getPnlColorClass(estimatedPnl)}`}>
                    {formatPnl(estimatedPnl)}
                  </span>
                </p>
              </div>

              {submitError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {submitError}
                </div>
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
                  disabled={!amountValid || effectivePriceForSubmit === null || isSubmitting}
                  className="flex-1 rounded-2xl bg-rose-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-400 disabled:opacity-40"
                >
                  {isSubmitting ? 'Submitting…' : 'Sell position'}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
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
  if (value === null || value === undefined || Number.isNaN(value)) return 'text-slate-600'
  if (value > 0) return 'text-emerald-600'
  if (value < 0) return 'text-rose-600'
  return 'text-slate-600'
}
