'use client'

import { useEffect, useMemo, useState } from 'react'
import type { OrderRow } from '@/lib/orders/types'
import type { PositionSummary } from '@/lib/orders/position'

// Polymarket tick sizes bottom out at 0.001, but some markets use larger ticks (e.g., 0.01)
const FALLBACK_MIN_TICK_SIZE = 0.001

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
    orderType: 'FAK' | 'GTC'
  }) => void
}

const SLIPPAGE_TOOLTIP =
  'Limits how much lower than your limit price this close can execute; 1% means the execution price may be at most 1% worse than the quote.'
const ORDER_BEHAVIOR_TOOLTIP =
  'FAK fills as much as possible immediately and cancels the rest, while GTC keeps the order open until it either fills or you cancel it.'
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
  const [orderType, setOrderType] = useState<'FAK' | 'GTC'>('FAK')
  const [minTickSize, setMinTickSize] = useState<number>(FALLBACK_MIN_TICK_SIZE)

  useEffect(() => {
    let canceled = false
    const conditionId = deriveConditionId(position.tokenId)
    if (!conditionId) {
      setMinTickSize(FALLBACK_MIN_TICK_SIZE)
      return
    }

    const fetchTick = async () => {
      try {
        const response = await fetch(
          `/api/polymarket/market?conditionId=${encodeURIComponent(conditionId)}`,
          { cache: 'no-store' }
        )
        if (!response.ok) {
          if (!canceled) setMinTickSize(FALLBACK_MIN_TICK_SIZE)
          return
        }
        const data = await response.json()
        const tick =
          typeof data?.minimumTickSize === 'number'
            ? data.minimumTickSize
            : data?.minimumTickSize
              ? Number(data.minimumTickSize)
              : null
        const clamped = Number.isFinite(tick) ? Math.max(tick as number, FALLBACK_MIN_TICK_SIZE) : FALLBACK_MIN_TICK_SIZE
        if (!canceled) setMinTickSize(clamped)
      } catch (err) {
        if (!canceled) setMinTickSize(FALLBACK_MIN_TICK_SIZE)
      }
    }

    fetchTick()
    return () => {
      canceled = true
    }
  }, [position.tokenId])

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
      ? Math.max(referencePrice * (1 - normalizedSlippage / 100), minTickSize)
      : minTickSize
  const proceeds = amountValid && limitPrice !== null ? limitPrice * amountValue : null
  const estimatedPnl =
    amountValid && entryPrice !== null && limitPrice !== null
      ? (limitPrice - entryPrice) * amountValue
      : null
  const currentPnl = order.pnlUsd ?? null
  const effectivePriceForSubmit = limitPrice ?? referencePrice ?? minTickSize
  const limitPriceLabel = formatCurrency(limitPrice ?? referencePrice ?? minTickSize)
  const currentPriceLabel = formatCurrency(currentPrice ?? referencePrice ?? minTickSize)
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
          className="w-full max-w-3xl max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="space-y-6 px-6 py-6">
            <section className="rounded-md border border-slate-200 bg-white px-5 py-6 shadow-sm space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">Position You&apos;re Closing</h1>
                  <p className="text-xs text-slate-500">Close this trade through the Polymarket CLOB.</p>
                </div>
                <div
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    marketStatus === 'market open'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {marketStatus}
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
                  {order.marketImageUrl ? (
                    <img
                      src={order.marketImageUrl}
                      alt={order.marketTitle}
                      className="h-14 w-14 rounded-2xl object-cover"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-slate-700">
                      {order.marketTitle?.charAt(0) ?? 'M'}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-lg font-semibold text-slate-900">{order.marketTitle || 'Market'}</div>
                  <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold tracking-wide text-slate-500">Direction</span>
                      <span
                        className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm ${
                          marketDirection === 'buy'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {marketDirection}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold tracking-wide text-slate-500">Outcome</span>
                      <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {order.outcome ?? '—'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-xs font-semibold text-slate-600">
                  {contractsLabel} contracts
                </div>
              </div>
              <div className="mt-4 grid gap-4 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-slate-400">Current Price</div>
                  <div className="text-sm font-semibold text-slate-900">{currentPriceLabel}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-slate-400">Entry Price</div>
                  <div className="text-sm font-semibold text-slate-900">{filledPriceLabel}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-slate-400">P / L</div>
                  <div className={`text-sm font-semibold ${getPnlColorClass(currentPnl)}`}>
                    {formatPnl(currentPnl)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold tracking-wide text-slate-400">Contracts</div>
                  <div className="text-sm font-semibold text-slate-900">{contractsLabel}</div>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>{order.createdAt ? `${order.createdAt}` : '—'}</span>
                <span>Updated {order.updatedAt ?? '—'}</span>
              </div>
            </section>

            <div className="flex justify-center py-0.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-base text-slate-500">
                ↓
              </span>
            </div>

            <section className="rounded-md border border-slate-200 bg-white px-4 py-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Your Close Order</h2>
                </div>
                <div className="text-right">
                  <div className="text-xs font-medium text-slate-500">Contracts Available</div>
                  <div className="text-sm font-semibold text-slate-900">{position.size.toFixed(6)}</div>
                </div>
              </div>
              <div className="text-sm text-slate-700 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">Current Price / Contract:</span>
                  <span className="text-sm font-semibold text-slate-900">{currentPriceLabel}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live price
                  </span>
                </div>
                <div className="text-xs text-slate-500">Estimates update with live market prices.</div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-500">
                    <span>Contracts to sell</span>
                    <button
                      type="button"
                      onClick={handleSellAll}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Sell all
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:w-auto">
                      <input
                        type="number"
                        min="0"
                        step="0.000001"
                        value={amountInput}
                        onChange={(event) => setAmountInput(event.target.value)}
                        className="w-full flex-1 border-none bg-white px-1 text-lg font-semibold text-slate-900 outline-none focus:outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-moz-number-spin-box]:appearance-none"
                        placeholder="10"
                      />
                    </div>
                    <div className="text-sm font-medium text-slate-700">
                      {amountValid && proceeds !== null ? `≈ ${formatCurrency(proceeds)} USD` : 'Enter an amount to preview proceeds'}
                    </div>
                    <div className="ml-auto text-sm text-slate-500">
                      P&amp;L at limit:{' '}
                      <span className={`text-base font-semibold ${getPnlColorClass(estimatedPnl)}`}>
                        {formatPnl(estimatedPnl)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <div className="text-xs font-medium text-slate-500">Slippage Tolerance</div>
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {SLIPPAGE_PRESETS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSlippagePreset(value)}
                      className={`rounded-md border px-2 py-1 text-xs ${
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
                    className={`rounded-md border px-2 py-1 text-xs ${
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
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="0.5"
                    />
                  )}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {limitPriceLabel === '—'
                    ? 'Set slippage to preview the limit price.'
                    : `Allow this close to execute down to ${limitPriceLabel} (market tick size applied).`}
                </div>
                {showSlippageInfo && (
                  <div
                    id="close-slippage-tooltip"
                    className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                  >
                    {SLIPPAGE_TOOLTIP}
                  </div>
                )}
              </div>

              <div>
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
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="closeOrderBehavior"
                      checked={orderType === 'FAK'}
                      onChange={() => setOrderType('FAK')}
                    />
                    <span>Fill and Kill (FAK) (recommended)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="closeOrderBehavior"
                      checked={orderType === 'GTC'}
                      onChange={() => setOrderType('GTC')}
                    />
                    <span>Good &apos;Til Canceled</span>
                  </label>
                </div>
                {showOrderBehaviorInfo && (
                  <div
                    id="close-order-behavior-tooltip"
                    className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                  >
                    {ORDER_BEHAVIOR_TOOLTIP}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                <p className="text-xs text-slate-500">Estimated proceeds</p>
                <p className="text-lg font-semibold text-slate-900">{proceeds !== null ? formatCurrency(proceeds) : '—'}</p>
                <p className="text-xs text-slate-500">
                  P&amp;L at limit price:{' '}
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

              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={!amountValid || effectivePriceForSubmit === null || isSubmitting}
                    className="flex-1 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {isSubmitting ? 'Submitting…' : 'Sell position'}
                  </button>
                </div>
                <div className="text-xs text-slate-500">
                  This sends a limit order. It may fill immediately, partially, or not at all.
                </div>
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

function deriveConditionId(tokenId: string | null | undefined): string | null {
  if (!tokenId) return null
  const trimmed = tokenId.trim()
  if (!trimmed.startsWith('0x')) return null
  if (trimmed.length >= 66) {
    return trimmed.slice(0, 66)
  }
  return null
}
