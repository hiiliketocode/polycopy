'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { ArrowDown, ArrowLeftRight, ChevronDown, CheckCircle2, Clock, HelpCircle, Loader2, XCircle, type LucideProps } from 'lucide-react'
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
const SIZE_DECIMALS = 2
const MIN_RESELL_SIZE = 1e-4

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
    isClosingFullPosition?: boolean
  }) => void
  onManualClose?: (payload: {
    orderId: string
    amount: number
    exitPrice: number
  }) => void
}

const SLIPPAGE_TOOLTIP =
  'Limits how much lower than your limit price this close can execute; 1% means the execution price may be at most 1% worse than the quote.'
const ORDER_BEHAVIOR_TOOLTIP =
  'FAK fills as much as possible immediately and cancels the rest, while GTC keeps the order open until it either fills or you cancel it.'
const SLIPPAGE_PRESETS: Array<number> = [0, 1, 3, 5]
const ORDER_STATUS_TIMEOUT_MS = 30_000
const EXIT_TRADE_WARNING =
  'Are you sure you want to leave? You have trades in progress that may fail.'

type StatusPhase =
  | 'submitted'
  | 'processing'
  | 'pending'
  | 'open'
  | 'partial'
  | 'filled'
  | 'canceled'
  | 'expired'
  | 'rejected'
  | 'timed_out'
  | 'unknown'

const TERMINAL_STATUS_PHASES = new Set<StatusPhase>([
  'filled',
  'canceled',
  'expired',
  'rejected',
  'timed_out',
])
const FAILED_EXECUTION_PHASES = new Set<StatusPhase>(['canceled', 'expired', 'rejected'])
const CANCELABLE_PHASES = new Set<StatusPhase>([
  'submitted',
  'processing',
  'pending',
  'open',
  'partial',
  'unknown',
])
type CancelStatusVariant = 'info' | 'success' | 'error'
type CancelStatus = {
  message: string
  variant: CancelStatusVariant
}

function normalizeStatusPhase(
  status?: string | null,
  filledSize?: number | null,
  totalSize?: number | null
): StatusPhase {
  const hasSizes =
    Number.isFinite(filledSize) && Number.isFinite(totalSize) && (totalSize ?? 0) > 0
  if (hasSizes) {
    const filled = filledSize as number
    const total = totalSize as number
    if (filled > 0 && filled < total) return 'partial'
    if (filled >= total) return 'filled'
  }
  if (!status) return 'pending'
  const normalized = status.trim().toLowerCase()
  if (normalized === 'matched' || normalized === 'filled') return 'filled'
  if (['accepted', 'pending', 'submitted', 'unknown'].includes(normalized)) return 'pending'
  if (normalized === 'processing') return 'processing'
  if (normalized === 'open') return 'open'
  if (normalized === 'partial') return 'partial'
  if (normalized === 'canceled' || normalized === 'cancelled') return 'canceled'
  if (normalized === 'expired') return 'expired'
  if (
    normalized.includes('reject') ||
    normalized.includes('error') ||
    normalized.includes('fail') ||
    normalized === 'inactive'
  ) {
    return 'rejected'
  }
  return 'pending'
}

const STATUS_SIMPLE_LABELS: Record<StatusPhase, string> = {
  submitted: 'Order Received by Polymarket',
  processing: 'Order Received by Polymarket, Processing',
  pending: 'Order Received by Polymarket, Pending',
  open: 'Order open on Polymarket',
  partial: 'Partially filled on Polymarket',
  filled: 'Filled on Polymarket',
  canceled: 'Canceled on Polymarket',
  expired: 'Expired on Polymarket',
  rejected: 'Rejected by Polymarket',
  timed_out: 'Failed to match on Polymarket',
  unknown: 'Polymarket status unknown',
}

type ExecutionStatusVariant = 'success' | 'pending' | 'failed'

const STATUS_VARIANT_ICONS: Record<ExecutionStatusVariant, ComponentType<LucideProps>> = {
  success: CheckCircle2,
  pending: Clock,
  failed: XCircle,
}

const STATUS_VARIANT_WRAPPER_CLASSES: Record<ExecutionStatusVariant, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-600',
  pending: 'border-amber-200 bg-amber-50 text-amber-600',
  failed: 'border-rose-200 bg-rose-50 text-rose-600',
}

function getExecutionStatusVariant(phase: StatusPhase): ExecutionStatusVariant {
  if (phase === 'filled') return 'success'
  if (FAILED_EXECUTION_PHASES.has(phase)) return 'failed'
  return 'pending'
}

function getOrderStatusLabel(status?: string | null, filledSize?: number | null, totalSize?: number | null) {
  const phase = normalizeStatusPhase(status, filledSize, totalSize)
  return STATUS_SIMPLE_LABELS[phase] || 'Polymarket status pending'
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value.constructor === Object || Object.getPrototypeOf(value) === Object.prototype)
  )
}

function findStatusReason(value: unknown): string | null {
  if (!isPlainObject(value)) return null
  const record = value
  const candidates = [
    'reject_reason',
    'rejectReason',
    'reject_msg',
    'rejectMsg',
    'reason',
    'message',
    'details',
    'status_message',
    'statusMessage',
    'error',
    'errorMessage',
    'status_reason',
    'statusReason',
  ]
  for (const key of candidates) {
    const entry = record[key]
    if (typeof entry === 'string' && entry.trim().length > 0) {
      return entry.trim()
    }
    if (isPlainObject(entry)) {
      const nested = findStatusReason(entry)
      if (nested) return nested
    }
  }
  if (Array.isArray(record.errors) && record.errors.length > 0) {
    const texts = record.errors
      .map((item) => {
        if (typeof item === 'string') return item
        if (isPlainObject(item)) {
          return findStatusReason(item)
        }
        return null
      })
      .filter((text): text is string => Boolean(text))
    if (texts.length > 0) {
      return texts.join('; ')
    }
  }
  return null
}

function getPostOrderStateLabel(
  phase: StatusPhase,
  orderType: 'FAK' | 'GTC',
  filledSize: number | null
) {
  if (phase === 'timed_out') return 'Failed to match on Polymarket'
  if (phase === 'filled') return 'Filled'
  if (phase === 'partial') return 'Partially filled'
  if (
    orderType === 'FAK' &&
    (phase === 'canceled' || phase === 'expired' || phase === 'rejected') &&
    (!filledSize || filledSize <= 0)
  ) {
    return 'Not filled (FAK)'
  }
  return 'Order sent to Polymarket'
}

// Force recompile - Jan 13 2026
export default function ClosePositionModal({
  target,
  isSubmitting,
  submitError,
  orderId,
  submittedAt,
  onClose,
  onSubmit,
  onManualClose,
}: ClosePositionModalProps) {
  const { order, position } = target
  const [mode, setMode] = useState<'sell' | 'manual'>('sell')
  const [amountInput, setAmountInput] = useState(() => position.size.toFixed(6))
  const [amountMode, setAmountMode] = useState<'contracts' | 'usd'>('contracts')
  const [manualPriceInput, setManualPriceInput] = useState(() => (order.currentPrice ?? order.priceOrAvgPrice ?? 0).toFixed(4))
  const [slippagePreset, setSlippagePreset] = useState<number | 'custom'>(() => 3)
  const [customSlippage, setCustomSlippage] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [orderType, setOrderType] = useState<'FAK' | 'GTC'>('FAK')
  const [minTickSize, setMinTickSize] = useState<number>(FALLBACK_MIN_TICK_SIZE)
  const [statusPhase, setStatusPhase] = useState<StatusPhase>('submitted')
  const [orderStatus, setOrderStatus] = useState<{
    status: string
    size: number | null
    filledSize: number | null
    remainingSize: number | null
    price: number | null
    updatedAt: string | null
    raw: any
  } | null>(null)
  const [orderStatusError, setOrderStatusError] = useState<string | null>(null)
  const [orderStatusLoading, setOrderStatusLoading] = useState(false)
  const [isCancelingOrder, setIsCancelingOrder] = useState(false)
  const [cancelStatus, setCancelStatus] = useState<CancelStatus | null>(null)
  const statusPhaseRef = useRef<StatusPhase>('submitted')
  const orderStatusRef = useRef<typeof orderStatus | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollAbortRef = useRef<AbortController | null>(null)
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeoutTriggeredRef = useRef(false)

  useEffect(() => {
    statusPhaseRef.current = statusPhase
  }, [statusPhase])

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
      orderStatusRef.current = null
      setOrderStatusError(null)
      setOrderStatusLoading(false)
      setStatusPhase('submitted')
      statusPhaseRef.current = 'submitted'
    setIsCancelingOrder(false)
    setCancelStatus(null)
      return
    }

    let canceled = false
    let intervalId: ReturnType<typeof setInterval> | null = null
    let pendingTimer: ReturnType<typeof setTimeout> | null = null
    let inFlight = false

    setOrderStatus(null)
    orderStatusRef.current = null
    setOrderStatusError(null)
    setStatusPhase('submitted')
    statusPhaseRef.current = 'submitted'
    setCancelStatus(null)
    setIsCancelingOrder(false)

    pendingTimer = setTimeout(() => {
      if (!canceled && !orderStatusRef.current) {
        setStatusPhase('pending')
        statusPhaseRef.current = 'pending'
      }
    }, 300)

    const fetchStatus = async (showLoading: boolean) => {
      if (canceled || inFlight) return
      if (statusPhaseRef.current === 'timed_out') return
      if (showLoading) setOrderStatusLoading(true)
      setOrderStatusError(null)
      try {
        inFlight = true
        if (pollAbortRef.current) {
          pollAbortRef.current.abort()
        }
        const controller = new AbortController()
        pollAbortRef.current = controller
        const response = await fetch(`/api/polymarket/orders/${orderId}/status`, {
          cache: 'no-store',
          signal: controller.signal,
        })
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
          raw: data,
        }
        setOrderStatus(normalized)
        orderStatusRef.current = normalized
        if (pendingTimer) {
          clearTimeout(pendingTimer)
          pendingTimer = null
        }
        const rawStatus = normalized.status ? String(normalized.status) : ''
        let phase = normalizeStatusPhase(rawStatus, normalized.filledSize, normalized.size)
        const filledSize =
          typeof data?.filledSize === 'number' ? data.filledSize : normalized.filledSize
        const remainingSize =
          typeof data?.remainingSize === 'number' ? data.remainingSize : normalized.remainingSize
        if (
          remainingSize !== null &&
          remainingSize <= 0 &&
          filledSize !== null &&
          filledSize > 0
        ) {
          phase = 'filled'
        }
        if (phase === 'filled' && (!filledSize || filledSize <= 0)) {
          phase = 'canceled'
        }
        setStatusPhase(phase)
        statusPhaseRef.current = phase
        const finalStatuses = new Set(['filled', 'canceled', 'expired', 'failed', 'rejected'])
        if (finalStatuses.has(String(normalized.status).toLowerCase()) && intervalId) {
          clearInterval(intervalId)
          intervalId = null
          pollIntervalRef.current = null
        }
      } catch (err: any) {
        if (!canceled && err?.name !== 'AbortError') {
          setOrderStatusError(err?.message || 'Failed to fetch order status')
        }
      } finally {
        inFlight = false
        if (!canceled && showLoading) setOrderStatusLoading(false)
      }
    }

    fetchStatus(true)
    intervalId = setInterval(() => {
      fetchStatus(false)
    }, 2000)
    pollIntervalRef.current = intervalId

    return () => {
      canceled = true
      if (intervalId) clearInterval(intervalId)
      if (pendingTimer) clearTimeout(pendingTimer)
      pollIntervalRef.current = null
      if (pollAbortRef.current) {
        pollAbortRef.current.abort()
        pollAbortRef.current = null
      }
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
  const sizePercentLabel = sizePercent !== null ? `${sizePercent.toFixed(0)}%` : null
  const lowPriceWarning =
    referencePrice !== null && referencePrice < 0.03
      ? 'Warning: price is under $0.03; liquidity can be thin and orders may reject.'
      : null
  const matchFailureMessage =
    statusPhase === 'timed_out' ||
    statusPhase === 'rejected' ||
    statusPhase === 'canceled' ||
    statusPhase === 'expired'
      ? "Failed to match at this price. Widen slippage or switch to Good 'Til Cancel, then try again."
      : null
  const partialFillMessage =
    statusPhase === 'partial'
      ? 'Partial fill. Remaining contracts may need another attempt or more time.'
      : null

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

    // Detect if user is trying to close the full position (within 0.1% tolerance)
    const isClosingFullPosition = contractsValue >= position.size * 0.999

    onSubmit({
      tokenId: position.tokenId,
      amount: contractsValue,
      price: effectivePriceForSubmit,
      slippagePercent: normalizedSlippage,
      orderType,
      isClosingFullPosition, // Pass this flag to the API
    })
  }

  const handleManualConfirm = () => {
    if (!onManualClose) return
    const manualPrice = Number(manualPriceInput)
    if (!amountValid || !Number.isFinite(manualPrice) || manualPrice <= 0) return
    onManualClose({
      orderId: order.orderId,
      amount: contractsValue,
      exitPrice: manualPrice,
    })
  }

  const cancelPendingOrder = useCallback(async (wasUserInitiated = false) => {
    if (!orderId || isCancelingOrder || (!CANCELABLE_PHASES.has(statusPhase) && statusPhase !== 'timed_out')) {
      return
    }
    setIsCancelingOrder(true)
    setCancelStatus({
      message: wasUserInitiated
        ? 'Attempting to cancel. If it already executed, the status will update.'
        : 'Order timed out. Attempting to cancel automatically.',
      variant: 'info',
    })
    if (pendingTimeoutRef.current) {
      clearTimeout(pendingTimeoutRef.current)
      pendingTimeoutRef.current = null
    }
    try {
      const response = await fetch('/api/polymarket/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderHash: orderId }),
      })
      let payload: any = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) {
        throw new Error(
          payload?.error ||
            payload?.message ||
            payload?.details ||
            'Failed to cancel order on Polymarket.'
        )
      }
      statusPhaseRef.current = 'canceled'
      setStatusPhase('canceled')
      setCancelStatus(
        wasUserInitiated
          ? {
              message: 'Cancel request confirmed by Polymarket.',
              variant: 'success',
            }
          : {
              message: 'Order timed out. We asked Polymarket to cancel automatically.',
              variant: 'info',
            }
      )
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      if (pollAbortRef.current) {
        pollAbortRef.current.abort()
        pollAbortRef.current = null
      }
    } catch (error: any) {
      const message =
        typeof error === 'string'
          ? error
          : error?.message || 'Unable to cancel order. Please try again.'
      setCancelStatus({ message, variant: 'error' })
    } finally {
      setIsCancelingOrder(false)
    }
  }, [orderId, isCancelingOrder, statusPhase])

  const hasSubmittedOrder = Boolean(orderId)
  const showConfirmation = isSubmitting || hasSubmittedOrder
  const hasInFlightTrade =
    isSubmitting || (hasSubmittedOrder && !TERMINAL_STATUS_PHASES.has(statusPhase))
  const isFinalStatus = TERMINAL_STATUS_PHASES.has(statusPhase)
  const canCancelPendingOrder =
    Boolean(orderId) && showConfirmation && CANCELABLE_PHASES.has(statusPhase)
  const submittedContracts = orderStatus?.size ?? null
  const filledContracts = orderStatus?.filledSize ?? null
  const remainingContractsFromStatus =
    typeof orderStatus?.remainingSize === 'number' && orderStatus.remainingSize >= 0
      ? orderStatus.remainingSize
      : null
  const remainingContracts =
    remainingContractsFromStatus !== null
      ? remainingContractsFromStatus
      : submittedContracts !== null &&
          filledContracts !== null &&
          submittedContracts > filledContracts
        ? submittedContracts - filledContracts
        : null
  const expectedPositionRemainder =
    filledContracts !== null && Number.isFinite(position.size)
      ? Math.max(position.size - filledContracts, 0)
      : null
  const isLikelyFullRemainder =
    remainingContracts !== null && expectedPositionRemainder !== null
      ? remainingContracts >= expectedPositionRemainder * 0.999
      : false
  const showSellRemainingCta =
    remainingContracts !== null &&
    remainingContracts > MIN_RESELL_SIZE &&
    (statusPhase === 'partial' || statusPhase === 'timed_out' || isFinalStatus)
  const remainingContractsDisplay = remainingContracts ?? 0
  const handleSellRemaining = () => {
    if (!showSellRemainingCta || remainingContracts === null) return
    setAmountMode('contracts')
    setAmountInput(formatInputValue(remainingContracts, SIZE_DECIMALS))
    onSubmit({
      tokenId: position.tokenId,
      amount: remainingContracts,
      price: effectivePriceForSubmit ?? limitPrice ?? FALLBACK_MIN_TICK_SIZE,
      slippagePercent: normalizedSlippage,
      orderType,
      isClosingFullPosition: isLikelyFullRemainder || remainingContracts >= position.size * 0.999,
    })
  }
  const pendingStatusLabel = 'Order pending at Polymarket'
  const statusLabel = getPostOrderStateLabel(statusPhase, orderType, filledContracts)
  const statusVariant = getExecutionStatusVariant(statusPhase)
  const StatusIconComponent = STATUS_VARIANT_ICONS[statusVariant]
  const orderStatusIconClasses = STATUS_VARIANT_WRAPPER_CLASSES[statusVariant]
  const orderStatusLabel =
    statusPhase === 'timed_out'
      ? pendingStatusLabel
      : getOrderStatusLabel(orderStatus?.status, filledContracts, submittedContracts)
  const statusReason = orderStatus ? findStatusReason(orderStatus.raw) : null
  const isFilledStatus = statusPhase === 'filled'
  const averageFillPriceLabel =
    orderStatus?.price !== null && orderStatus?.price !== undefined
      ? formatCurrency(orderStatus.price)
      : formatCurrency(effectivePriceForSubmit)
  const fillProgress =
    submittedContracts && filledContracts !== null && submittedContracts > 0
      ? Math.min((filledContracts / submittedContracts) * 100, 100)
      : 0
  const fillProgressLabel =
    submittedContracts !== null && filledContracts !== null
      ? `${formatNumber(filledContracts)} / ${formatNumber(submittedContracts)}`
      : '—'
  const showFillProgress =
    submittedContracts !== null && filledContracts !== null && submittedContracts > 0

  useEffect(() => {
    if (!hasInFlightTrade) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = EXIT_TRADE_WARNING
      return EXIT_TRADE_WARNING
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasInFlightTrade])

  useEffect(() => {
    if (!orderId || isFinalStatus) {
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current)
        pendingTimeoutRef.current = null
      }
      timeoutTriggeredRef.current = false
      return
    }
    timeoutTriggeredRef.current = false
    if (pendingTimeoutRef.current) {
      clearTimeout(pendingTimeoutRef.current)
    }
    pendingTimeoutRef.current = setTimeout(async () => {
      if (timeoutTriggeredRef.current) return
      if (TERMINAL_STATUS_PHASES.has(statusPhaseRef.current)) return
      timeoutTriggeredRef.current = true
      statusPhaseRef.current = 'timed_out'
      setStatusPhase('timed_out')
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      if (pollAbortRef.current) {
        pollAbortRef.current.abort()
        pollAbortRef.current = null
      }
      try {
        await cancelPendingOrder()
      } catch {
        /* cancel errors handled in cancelPendingOrder */
      }
    }, ORDER_STATUS_TIMEOUT_MS)
    return () => {
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current)
        pendingTimeoutRef.current = null
      }
    }
  }, [orderId, isFinalStatus, cancelPendingOrder])

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
              {lowPriceWarning && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {lowPriceWarning}
                </div>
              )}
            </section>

            <div className="bg-white px-6 pb-3 pt-0">
              <div className="-mt-4 mb-2 flex justify-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400">
                  <ArrowDown className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-0.5 rounded-xl border border-slate-200 bg-slate-50 px-4 pb-4 pt-3">
                <div className="space-y-5">
                  {/* Mode Toggle */}
                  {onManualClose && (
                    <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setMode('sell')}
                        className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                          mode === 'sell'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Sell Now
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode('manual')}
                        className={`flex-1 px-4 py-2 rounded-md text-sm font-semibold transition-all ${
                          mode === 'manual'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Sold on Polymarket
                      </button>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="w-[52px]" aria-hidden="true" />
                      <h4 className="text-sm font-semibold text-slate-900">{mode === 'sell' ? 'Close' : 'Mark as Sold'}</h4>
                      <span className="w-[52px]" aria-hidden="true" />
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-end sm:justify-center">
                        <div className="flex w-full flex-col gap-2 sm:max-w-[240px]">
                          <label htmlFor="close-amount" className="text-xs font-medium text-slate-700">
                            {amountMode === 'usd' ? 'USD' : 'Contracts'}
                          </label>
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
                        </div>
                        <button
                          type="button"
                          onClick={amountMode === 'usd' ? handleSwitchToContracts : handleSwitchToUsd}
                          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:border-slate-300 sm:h-12 sm:w-12 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!amountInput.trim()}
                          aria-label={`Switch to ${amountMode === 'usd' ? 'contracts' : 'USD'}`}
                        >
                          <ArrowLeftRight className="h-4 w-4" />
                        </button>
                        <div className="flex h-14 w-full items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 text-center sm:w-auto sm:min-w-[180px]">
                          {amountMode === 'usd'
                            ? !amountValid
                              ? '—'
                              : `≈ ${contractsValueLabel} contracts`
                            : !amountValid
                              ? '—'
                              : `≈ ${proceedsLabel} USD`}
                        </div>
                        <div className="flex h-14 items-center text-xs font-medium text-slate-500">
                          {sizePercentLabel ? `Estimated · ${sizePercentLabel} of position` : 'Estimated'}
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 text-center">
                        Estimates use current market prices.
                      </p>
                    </div>

                    {submitError && (
                      <p className="text-xs text-rose-600">{submitError}</p>
                    )}
                  </div>

                  {/* Manual Price Input - Only in Manual Mode */}
                  {mode === 'manual' && (
                    <div className="space-y-2">
                      <label htmlFor="manual-price" className="text-xs font-medium text-slate-700">
                        Exit Price
                      </label>
                      <div className="relative">
                        <input
                          id="manual-price"
                          type="number"
                          step={0.0001}
                          value={manualPriceInput}
                          onChange={(event) => setManualPriceInput(event.target.value)}
                          onWheel={(event) => event.currentTarget.blur()}
                          placeholder="0.0000"
                          disabled={isSubmitting}
                          className="w-full h-14 border border-slate-300 rounded-lg text-base font-semibold text-slate-700 focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none pl-3 pr-3"
                        />
                      </div>
                      <p className="text-xs text-slate-500">
                        Enter the price at which you sold this position on Polymarket.
                      </p>
                    </div>
                  )}

                  <Button
                    onClick={mode === 'sell' ? handleConfirm : handleManualConfirm}
                    disabled={
                      isSubmitting ||
                      hasSubmittedOrder ||
                      !amountValid ||
                      (mode === 'sell' && effectivePriceForSubmit === null) ||
                      (mode === 'manual' && !Number.isFinite(Number(manualPriceInput)))
                    }
                    className="w-full bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 hover:from-orange-500 hover:via-amber-500 hover:to-yellow-500 text-slate-900 font-semibold disabled:opacity-50"
                    size="lg"
                  >
                    {isSubmitting
                      ? pendingStatusLabel
                      : hasSubmittedOrder
                        ? 'Order sent to Polymarket'
                        : mode === 'sell'
                          ? 'Sell position'
                          : 'Mark as sold'}
                  </Button>
                  {matchFailureMessage && (
                    <p className="mt-2 text-xs text-rose-700 text-center">{matchFailureMessage}</p>
                  )}
                  {partialFillMessage && (
                    <p className="mt-1 text-xs text-amber-700 text-center">{partialFillMessage}</p>
                  )}

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
                  {showConfirmation && (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm space-y-4 sm:px-5 sm:py-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold tracking-wide text-slate-400">Status</p>
                          <p className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                            {!isFinalStatus && <Loader2 className="h-4 w-4 animate-spin text-amber-500" />}
                            {statusLabel}
                          </p>
                          {!isFinalStatus && (
                            <p
                              className={`text-xs ${
                                statusPhase === 'timed_out' ? 'text-amber-600' : 'text-slate-500'
                              }`}
                            >
                              {statusPhase === 'timed_out'
                                ? 'Polymarket did not match this order within 30 seconds. Try increasing slippage and/or using a smaller amount.'
                                : 'This may take a moment.'}
                            </p>
                          )}
                          {statusPhase === 'timed_out' && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs text-amber-600">
                                We couldn’t fill this order at your price. Try increasing slippage (tap Advanced) or using a smaller amount.
                              </p>
                            </div>
                          )}
                        </div>
                        {canCancelPendingOrder && (
                          <button
                            type="button"
                            onClick={() => cancelPendingOrder(true)}
                            disabled={isCancelingOrder}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-sm transition ${
                              isCancelingOrder
                                ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                            }`}
                          >
                            {isCancelingOrder ? 'Canceling…' : 'Cancel'}
                          </button>
                        )}
                      </div>
                      {cancelStatus && (
                        <p className={`text-xs ${getCancelStatusClass(cancelStatus.variant)}`}>
                          {cancelStatus.message}
                        </p>
                      )}
                      <div className="text-sm text-slate-600 flex items-center gap-2">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${orderStatusIconClasses}`}
                        >
                          <StatusIconComponent className="h-3 w-3" aria-hidden />
                        </span>
                        <span className="text-sm font-semibold text-slate-900">{orderStatusLabel}</span>
                        {isFilledStatus && (
                          <button
                            type="button"
                            onClick={onClose}
                            className="ml-auto inline-flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-700 h-7 w-7"
                            aria-label="Close order confirmation"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <div className="text-xs font-medium text-slate-500">Submitted contracts</div>
                          <div className="text-sm font-semibold text-slate-900">
                            {formatContractsDisplay(submittedContracts, SIZE_DECIMALS)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500">Estimated max USD</div>
                          <div className="text-sm font-semibold text-slate-900">{proceedsLabel}</div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500">Filled contracts</div>
                          <div className="text-sm font-semibold text-slate-900">
                            {formatContractsDisplay(filledContracts, SIZE_DECIMALS)}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-500">Average fill price</div>
                          <div className="text-sm font-semibold text-slate-900">{averageFillPriceLabel}</div>
                        </div>
                      </div>
                      {submittedAt && (
                        <div className="text-xs text-slate-500 text-right">Submitted {submittedAt}</div>
                      )}
                      {statusReason && (
                        <div className="text-sm text-slate-500">Reason: {statusReason}</div>
                      )}
                      {showFillProgress && (
                        <div>
                          <div className="text-sm text-slate-500">
                            Filled {formatContractsDisplay(filledContracts, SIZE_DECIMALS)} /{' '}
                            {formatContractsDisplay(submittedContracts, SIZE_DECIMALS)}
                          </div>
                          <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                            <div
                              className="h-2 rounded-full bg-slate-900 transition-all duration-150"
                              style={{ width: `${fillProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                      {showSellRemainingCta && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-amber-800">Partial fill detected</p>
                              <p className="text-xs text-amber-700">
                                You still have {formatContractsDisplay(remainingContractsDisplay, SIZE_DECIMALS)} contracts to sell.
                              </p>
                            </div>
                            <Button
                              onClick={handleSellRemaining}
                              disabled={isSubmitting}
                              size="sm"
                              className="bg-amber-600 text-white hover:bg-amber-700"
                            >
                              Sell remaining
                            </Button>
                          </div>
                        </div>
                      )}
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

function formatInputValue(value: number, decimals: number) {
  const fixed = value.toFixed(decimals)
  return fixed.replace(/\.?0+$/, '')
}

function formatContractsDisplay(value: number | null, decimals: number) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const trimmed = formatInputValue(value, decimals)
  const [whole, fraction] = trimmed.split('.')
  const withCommas = Number(whole).toLocaleString('en-US')
  return fraction ? `${withCommas}.${fraction}` : withCommas
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

function getCancelStatusClass(variant: CancelStatusVariant) {
  if (variant === 'success') return 'text-emerald-600'
  if (variant === 'error') return 'text-rose-600'
  return 'text-slate-500'
}
