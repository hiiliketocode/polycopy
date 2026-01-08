'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ChevronDown, HelpCircle } from 'lucide-react'
import type { OrderRow } from '@/lib/orders/types'
import type { PositionSummary } from '@/lib/orders/position'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

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
  orderId?: string | null
  submittedAt?: string | null
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
  orderId,
  submittedAt,
  onClose,
  onSubmit,
}: ClosePositionModalProps) {
  const { order, position } = target
  const [amountInput, setAmountInput] = useState(() => position.size.toFixed(6))
  const [amountMode, setAmountMode] = useState<'contracts' | 'usd'>('contracts')
  const [slippagePreset, setSlippagePreset] = useState<number | 'custom'>(() => 2)
  const [customSlippage, setCustomSlippage] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [orderType, setOrderType] = useState<'FAK' | 'GTC'>('FAK')
  const [minTickSize, setMinTickSize] = useState<number>(FALLBACK_MIN_TICK_SIZE)
  const [orderStatus, setOrderStatus] = useState<{
    status: string
    size: number | null
    filledSize: number | null
    remainingSize: number | null
    price: number | null
    updatedAt: string | null
  } | null>(null)
  const [orderStatusError, setOrderStatusError] = useState<string | null>(null)
  const [orderStatusLoading, setOrderStatusLoading] = useState(false)

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

  useEffect(() => {
    if (!orderId) {
      setOrderStatus(null)
      setOrderStatusError(null)
      setOrderStatusLoading(false)
      return
    }

    let canceled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    const fetchStatus = async (showLoading: boolean) => {
      if (showLoading) setOrderStatusLoading(true)
      setOrderStatusError(null)
      try {
        const response = await fetch(`/api/polymarket/orders/${orderId}/status`, { cache: 'no-store' })
        const data = await response.json()
        if (canceled) return
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || data?.details || 'Failed to fetch order status')
        }
        const normalized = {
          status: data.status ?? 'unknown',
          size: typeof data.size === 'number' ? data.size : data.size ? Number(data.size) : null,
          filledSize:
            typeof data.filledSize === 'number'
              ? data.filledSize
              : data.filledSize
                ? Number(data.filledSize)
                : null,
          remainingSize:
            typeof data.remainingSize === 'number'
              ? data.remainingSize
              : data.remainingSize
                ? Number(data.remainingSize)
                : null,
          price: typeof data.price === 'number' ? data.price : data.price ? Number(data.price) : null,
          updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : null,
        }
        setOrderStatus(normalized)
        const finalStatuses = new Set(['filled', 'canceled', 'expired', 'failed'])
        if (finalStatuses.has(String(normalized.status).toLowerCase()) && intervalId) {
          clearInterval(intervalId)
          intervalId = null
        }
      } catch (err: any) {
        if (!canceled) {
          setOrderStatusError(err?.message || 'Failed to fetch order status')
        }
      } finally {
        if (!canceled && showLoading) setOrderStatusLoading(false)
      }
    }

    fetchStatus(true)
    intervalId = setInterval(() => {
      fetchStatus(false)
    }, 2000)

    return () => {
      canceled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [orderId])

  const marketDirection = useMemo(
    () => (order.side?.trim().toLowerCase() === 'sell' ? 'sell' : 'buy'),
    [order.side]
  )
  const marketStatus = order.marketIsOpen ? 'market open' : 'market closed'
  const currentPrice = order.currentPrice ?? null
  const entryPrice = order.priceOrAvgPrice ?? position.avgEntryPrice ?? null
  const referencePrice = currentPrice ?? entryPrice ?? null
  const amountInputValue = Number(amountInput)
  const slippagePercent =
    slippagePreset === 'custom' ? Number(customSlippage) : Number(slippagePreset)
  const normalizedSlippage = Number.isFinite(slippagePercent) && slippagePercent >= 0 ? slippagePercent : 0
  const limitPrice =
    referencePrice !== null
      ? Math.max(referencePrice * (1 - normalizedSlippage / 100), minTickSize)
      : minTickSize
  const effectivePriceForSubmit = limitPrice ?? referencePrice ?? minTickSize
  const contractsValue =
    amountMode === 'contracts'
      ? amountInputValue
      : effectivePriceForSubmit > 0
        ? amountInputValue / effectivePriceForSubmit
        : 0
  const amountValid = Number.isFinite(contractsValue) && contractsValue > 0
  const proceeds = amountValid ? effectivePriceForSubmit * contractsValue : null
  const estimatedPnl =
    amountValid && entryPrice !== null
      ? (effectivePriceForSubmit - entryPrice) * contractsValue
      : null
  const currentPnl = order.pnlUsd ?? null
  const currentPriceLabel = formatCurrency(currentPrice ?? referencePrice ?? minTickSize)
  const filledPriceLabel = formatCurrency(entryPrice)
  const contractsLabel = formatNumber(position.size)
  const contractsValueLabel = amountValid ? formatNumber(contractsValue) : '—'
  const proceedsLabel = proceeds !== null ? formatCurrency(proceeds) : '—'
  const investedLabel =
    entryPrice !== null ? formatCurrency(entryPrice * position.size) : '—'
  const sizePercent =
    amountValid && position.size > 0 ? (contractsValue / position.size) * 100 : null
  const sizePercentLabel = sizePercent !== null ? `${sizePercent.toFixed(0)}% of position` : '—'
  const handleSellAll = () => {
    if (amountMode === 'usd') {
      setAmountInput((position.size * effectivePriceForSubmit).toFixed(2))
      return
    }
    setAmountInput(position.size.toFixed(6))
  }

  const handleSwitchToUsd = () => {
    if (!Number.isFinite(contractsValue) || contractsValue <= 0) return
    setAmountMode('usd')
    setAmountInput((contractsValue * effectivePriceForSubmit).toFixed(2))
  }

  const handleSwitchToContracts = () => {
    if (!Number.isFinite(amountInputValue) || amountInputValue <= 0) return
    setAmountMode('contracts')
    setAmountInput((amountInputValue / effectivePriceForSubmit).toFixed(6))
  }

  const handleConfirm = () => {
    if (!amountValid || effectivePriceForSubmit === null || !position.tokenId) return
    onSubmit({
      tokenId: position.tokenId,
      amount: contractsValue,
      price: effectivePriceForSubmit,
      slippagePercent: normalizedSlippage,
      orderType,
    })
  }

  const normalizedStatus = orderStatus?.status ? String(orderStatus.status).toLowerCase() : null
  const statusLabel =
    normalizedStatus === 'open'
      ? 'Open'
      : normalizedStatus === 'partial'
        ? 'Partially Filled'
        : normalizedStatus === 'filled'
          ? 'Filled'
          : normalizedStatus === 'canceled'
            ? 'Canceled'
            : normalizedStatus === 'expired'
              ? 'Expired'
              : normalizedStatus === 'failed'
                ? 'Failed'
                : normalizedStatus
                  ? normalizedStatus
                  : 'Unknown'
  const submittedContracts = orderStatus?.size ?? null
  const filledContracts = orderStatus?.filledSize ?? null
  const remainingContracts =
    orderStatus?.remainingSize ??
    (submittedContracts !== null && filledContracts !== null
      ? Math.max(submittedContracts - filledContracts, 0)
      : null)
  const fillProgress =
    submittedContracts && filledContracts !== null && submittedContracts > 0
      ? Math.min((filledContracts / submittedContracts) * 100, 100)
      : 0
  const fillProgressLabel =
    submittedContracts !== null && filledContracts !== null
      ? `${formatNumber(filledContracts)} / ${formatNumber(submittedContracts)}`
      : '—'

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
            <section className="rounded-xl border border-slate-200 bg-white px-5 py-6 shadow-sm space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold text-slate-900">Position You&apos;re Closing</h1>
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
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-700"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="flex items-start gap-4">
                {order.marketImageUrl ? (
                  <img
                    src={order.marketImageUrl}
                    alt={order.marketTitle}
                    className="h-14 w-14 rounded-2xl border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
                    {order.marketTitle?.charAt(0) ?? 'M'}
                  </div>
                )}
                <div className="flex-1">
                  <div className="text-lg font-semibold text-slate-900">{order.marketTitle || 'Market'}</div>
                  <div className="text-xs text-slate-500 mt-1">{order.outcome ?? '—'}</div>
                </div>
                <div className="text-sm font-semibold text-slate-900">{contractsLabel} contracts</div>
              </div>
              <div className="border border-slate-200 rounded-lg px-4 py-3 bg-slate-50/50">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 relative">
                  <div className="text-center">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Trade</p>
                    <div className="flex flex-wrap items-center justify-center gap-1 max-w-full">
                      <Badge
                        variant="secondary"
                        className={`font-semibold text-xs ${
                          marketDirection === 'sell'
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {marketDirection === 'sell' ? 'Sell' : 'Buy'}
                      </Badge>
                      <span className="text-xs text-slate-400 font-semibold">|</span>
                      <Badge
                        variant="secondary"
                        className={`font-semibold text-xs ${
                          order.outcome?.trim().toLowerCase() === 'yes'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : order.outcome?.trim().toLowerCase() === 'no'
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                        } max-w-[140px] whitespace-normal break-words text-center leading-snug`}
                      >
                        {order.outcome ?? '—'}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-center md:border-l border-slate-200">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Invested</p>
                    <p className="text-sm md:text-base font-semibold text-slate-900">{investedLabel}</p>
                  </div>
                  <div className="text-center md:border-l border-slate-200">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Contracts</p>
                    <p className="text-sm md:text-base font-semibold text-slate-900">{contractsLabel}</p>
                  </div>
                  <div className="text-center md:border-l border-slate-200">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Entry</p>
                    <p className="text-sm md:text-base font-semibold text-slate-900">{filledPriceLabel}</p>
                  </div>
                  <div className="text-center md:border-l border-slate-200">
                    <p className="text-xs text-slate-500 mb-1 font-medium">Current</p>
                    <p className="text-sm md:text-base font-semibold text-slate-900">{currentPriceLabel}</p>
                  </div>
                  <div className="text-center md:border-l border-slate-200">
                    <p className="text-xs text-slate-500 mb-1 font-medium">P / L</p>
                    <p className={`text-sm md:text-base font-semibold ${getPnlColorClass(currentPnl)}`}>
                      {formatPnl(currentPnl)}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <div className="bg-white px-6 pb-3 pt-0">
              <div className="-mt-4 mb-2 flex justify-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400">
                  <ArrowDown className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-0.5 rounded-xl border border-slate-200 bg-slate-50 px-4 pb-4 pt-3">
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="w-[52px]" aria-hidden="true" />
                      <h4 className="text-sm font-semibold text-slate-900">Close</h4>
                      <span className="w-[52px]" aria-hidden="true" />
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>Live price:</span>
                      <span className="font-semibold text-slate-900">{currentPriceLabel}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Live price
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">Estimates update with live market prices.</div>

                    <div className="space-y-2 mb-4">
                      <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-end sm:justify-center">
                        <div className="flex w-full flex-col gap-2 sm:max-w-[240px]">
                          <div className="flex items-center justify-between gap-2">
                            <label htmlFor="close-amount" className="text-xs font-medium text-slate-700">
                              {amountMode === 'usd' ? 'USD to sell' : 'Contracts to sell'}
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleSellAll}
                                className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                              >
                                Sell all
                              </button>
                              <button
                                type="button"
                                onClick={amountMode === 'usd' ? handleSwitchToContracts : handleSwitchToUsd}
                                className="text-[11px] font-semibold text-slate-500 hover:text-slate-700"
                                disabled={!amountValid}
                              >
                                Switch to {amountMode === 'usd' ? 'contracts' : 'USD'}
                              </button>
                            </div>
                          </div>
                          <div className="relative">
                            {amountMode === 'usd' && (
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                            )}
                            <input
                              id="close-amount"
                              type="number"
                              step={amountMode === 'contracts' ? 0.000001 : 0.01}
                              value={amountInput}
                              onChange={(event) => setAmountInput(event.target.value)}
                              onWheel={(event) => event.currentTarget.blur()}
                              placeholder={amountMode === 'usd' ? '0.00' : '0'}
                              disabled={isSubmitting}
                              className={`w-full h-14 border border-slate-300 rounded-lg text-base font-semibold text-slate-700 focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${amountMode === 'usd' ? 'pl-7 pr-3' : 'pl-3 pr-3'}`}
                            />
                          </div>
                          <div className="text-xs font-medium text-slate-500">
                            {amountMode === 'usd'
                              ? `≈ ${contractsValueLabel} contracts`
                              : `≈ ${proceedsLabel} USD`} {sizePercentLabel !== '—' ? `· ${sizePercentLabel}` : ''}
                          </div>
                        </div>
                      </div>
                    </div>

                    {submitError && (
                      <p className="text-xs text-rose-600">{submitError}</p>
                    )}
                  </div>

                  <Button
                    onClick={handleConfirm}
                    disabled={!amountValid || effectivePriceForSubmit === null || isSubmitting}
                    className="w-full bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 hover:from-orange-500 hover:via-amber-500 hover:to-yellow-500 text-slate-900 font-semibold disabled:opacity-50"
                    size="lg"
                  >
                    {isSubmitting ? 'Submitting…' : 'Sell position'}
                  </Button>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    {!showAdvanced && (
                      <TooltipProvider>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                              >
                                Slippage ({normalizedSlippage}%)
                                <HelpCircle className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>{SLIPPAGE_TOOLTIP}</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                              >
                                {orderType === 'GTC' ? "Good 'Til Canceled (GTC)" : 'Fill and Kill (FAK)'}
                                <HelpCircle className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>{ORDER_BEHAVIOR_TOOLTIP}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowAdvanced((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800"
                    >
                      Advanced
                      <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  {!showAdvanced && (
                    <p className="mt-1 text-xs text-slate-500">
                      Estimated: {contractsValueLabel} contracts, ≈ {proceedsLabel}.
                    </p>
                  )}
                  {showAdvanced && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                      <div className="space-y-1.5">
                        <TooltipProvider>
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs font-medium text-slate-900">Slippage Tolerance</Label>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="text-slate-400 hover:text-slate-500">
                                  <HelpCircle className="h-3 w-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>{SLIPPAGE_TOOLTIP}</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                        <div className="flex flex-wrap items-center gap-2">
                          {SLIPPAGE_PRESETS.map((value) => (
                            <Button
                              key={value}
                              type="button"
                              variant={slippagePreset === value ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                setSlippagePreset(value)
                                setCustomSlippage('')
                              }}
                              className={
                                slippagePreset === value
                                  ? 'bg-slate-900 text-white hover:bg-slate-800 font-semibold h-8 text-xs'
                                  : 'border-slate-300 text-slate-700 hover:bg-slate-50 font-medium h-8 text-xs'
                              }
                            >
                              {value}%
                            </Button>
                          ))}
                          <Input
                            type="number"
                            placeholder="Custom"
                            value={customSlippage}
                            onChange={(event) => {
                              setCustomSlippage(event.target.value)
                              setSlippagePreset('custom')
                            }}
                            onWheel={(event) => event.currentTarget.blur()}
                            className="w-20 h-8 text-xs border-slate-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </div>
                        <p className="text-xs text-slate-500">
                          Estimated: {contractsValueLabel} contracts, ≈ {proceedsLabel}.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <TooltipProvider>
                          <div className="flex items-center gap-1.5">
                            <Label className="text-xs font-medium text-slate-900">Order Behavior</Label>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="text-slate-400 hover:text-slate-500">
                                  <HelpCircle className="h-3 w-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>{ORDER_BEHAVIOR_TOOLTIP}</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                        <RadioGroup value={orderType} onValueChange={(value) => setOrderType(value as 'FAK' | 'GTC')} className="space-y-1.5">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="FAK" id="close-fak" className="h-4 w-4" />
                            <Label htmlFor="close-fak" className="text-xs font-medium text-slate-700 cursor-pointer">
                              Fill and Kill (FAK)
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="GTC" id="close-gtc" className="h-4 w-4" />
                            <Label htmlFor="close-gtc" className="text-xs font-medium text-slate-700 cursor-pointer">
                              Good &apos;Til Canceled (GTC)
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                  )}
                  {orderId && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold tracking-wide text-slate-400">Order status</p>
                          <p className="text-base font-semibold text-slate-900">{statusLabel}</p>
                        </div>
                        {submittedAt && (
                          <div className="text-xs text-slate-500">Submitted {submittedAt}</div>
                        )}
                      </div>
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <div className="text-xs font-medium text-slate-500">Submitted contracts</div>
                          <div className="text-sm font-semibold text-slate-900">
                            {submittedContracts !== null ? formatNumber(submittedContracts) : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500">Filled contracts</div>
                          <div className="text-sm font-semibold text-slate-900">
                            {filledContracts !== null ? formatNumber(filledContracts) : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500">Remaining contracts</div>
                          <div className="text-sm font-semibold text-slate-900">
                            {remainingContracts !== null ? formatNumber(remainingContracts) : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500">Limit price</div>
                          <div className="text-sm font-semibold text-slate-900">
                            {orderStatus?.price !== null && orderStatus?.price !== undefined
                              ? formatCurrency(orderStatus.price)
                              : formatCurrency(effectivePriceForSubmit)}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Filled {fillProgressLabel}</div>
                        <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                          <div
                            className="h-2 rounded-full bg-slate-900 transition-all duration-150"
                            style={{ width: `${fillProgress}%` }}
                          />
                        </div>
                      </div>
                      {orderStatus?.updatedAt && (
                        <div className="text-xs text-slate-500">
                          Updated {new Date(orderStatus.updatedAt).toLocaleTimeString()}
                        </div>
                      )}
                      {orderStatusLoading && (
                        <div className="text-xs text-slate-500">Refreshing order status…</div>
                      )}
                      {orderStatusError && (
                        <div className="text-xs text-rose-600">{orderStatusError}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
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
