"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowDown, ChevronDown, ChevronUp, Check, HelpCircle, ExternalLink, X, Loader2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

interface TradeCardProps {
  trader: {
    name: string
    avatar?: string
    address: string
    id?: string
    roi?: number
  }
  market: string
  marketAvatar?: string
  position: string
  action: "Buy" | "Sell"
  price: number
  size: number
  total: number
  timestamp: string
  onCopyTrade?: () => void
  onMarkAsCopied?: () => void
  onAdvancedCopy?: () => void
  isPremium?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
  isCopied?: boolean
  // Trade execution data
  conditionId?: string
  tokenId?: string
  marketSlug?: string
  // Live data
  currentMarketPrice?: number
  marketIsOpen?: boolean | null
  liveScore?: string
  category?: string
  polymarketUrl?: string
}

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
  | 'unknown'

const TERMINAL_STATUS_PHASES = new Set<StatusPhase>([
  'filled',
  'canceled',
  'expired',
  'rejected',
])

const MINIMUM_ORDER_TOLERANCE = 1e-6

type TradeErrorInfo = {
  code?: string
  message: string
  description?: string
  success?: boolean
  rawMessage?: string
}

const TRADE_ERROR_DETAILS = {
  INVALID_ORDER_MIN_TICK_SIZE: {
    success: true,
    message: "order is invalid. Price breaks minimum tick size rules",
    description: "order price isn't accurate to correct tick sizing",
  },
  INVALID_ORDER_MIN_SIZE: {
    success: true,
    message: "order is invalid. Size lower than the minimum",
    description: "order size must meet min size threshold requirement",
  },
  INVALID_ORDER_DUPLICATED: {
    success: true,
    message: "order is invalid. Duplicated. Same order has already been placed, can't be placed again",
  },
  INVALID_ORDER_NOT_ENOUGH_BALANCE: {
    success: true,
    message: "not enough balance / allowance",
    description: "funder address doesn't have sufficient balance or allowance for order",
  },
  INVALID_ORDER_EXPIRATION: {
    success: true,
    message: "invalid expiration",
    description: "expiration field expresses a time before now",
  },
  INVALID_ORDER_ERROR: {
    success: true,
    message: "could not insert order",
    description: "system error while inserting order",
  },
  INVALID_POST_ONLY_ORDER_TYPE: {
    success: true,
    message: "invalid post-only order: only GTC and GTD order types are allowed",
    description: "post only flag attached to a market order",
  },
  INVALID_POST_ONLY_ORDER: {
    success: true,
    message: "invalid post-only order: order crosses book",
    description: "post only order would match",
  },
  EXECUTION_ERROR: {
    success: true,
    message: "could not run the execution",
    description: "system error while attempting to execute trade",
  },
  ORDER_DELAYED: {
    success: false,
    message: "order match delayed due to market conditions",
    description: "order placement delayed",
  },
  DELAYING_ORDER_ERROR: {
    success: true,
    message: "error delaying the order",
    description: "system error while delaying order",
  },
  FOK_ORDER_NOT_FILLED_ERROR: {
    success: true,
    message: "order couldn't be fully filled, FOK orders are fully filled/killed",
    description: "FOK order not fully filled so can't be placed",
  },
  MARKET_NOT_READY: {
    success: false,
    message: "the market is not yet ready to process new orders",
    description: "system not accepting orders for market yet https://docs.polymarket.com/developers/CLOB/orders/create-order",
  },
} as const

const TRADE_ERROR_ENTRIES = Object.entries(TRADE_ERROR_DETAILS)

function matchTradeErrorCode(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  for (const [code] of TRADE_ERROR_ENTRIES) {
    if (trimmed.includes(code)) return code
  }
  const lower = trimmed.toLowerCase()
  for (const [code, detail] of TRADE_ERROR_ENTRIES) {
    if (lower.includes(detail.message.toLowerCase())) return code
  }
  return null
}

function findTradeErrorCode(value: unknown, seen = new Set<unknown>()): string | null {
  if (!value) return null
  if (typeof value === "string") return matchTradeErrorCode(value)
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTradeErrorCode(item, seen)
      if (found) return found
    }
    return null
  }
  if (typeof value === "object") {
    if (seen.has(value)) return null
    seen.add(value)
    const record = value as Record<string, unknown>
    const candidates = [
      record.code,
      record.error,
      record.message,
      record.reason,
      record.detail,
      record.details,
      record.data,
      record.upstream,
    ]
    for (const candidate of candidates) {
      const found = findTradeErrorCode(candidate, seen)
      if (found) return found
    }
  }
  return null
}

function findTradeErrorMessage(value: unknown, seen = new Set<unknown>()): string | null {
  if (!value) return null
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findTradeErrorMessage(item, seen)
      if (found) return found
    }
    return null
  }
  if (typeof value === "object") {
    if (seen.has(value)) return null
    seen.add(value)
    const record = value as Record<string, unknown>
    const candidates = [record.error, record.message, record.reason, record.detail]
    for (const candidate of candidates) {
      const found = findTradeErrorMessage(candidate, seen)
      if (found) return found
    }
    const nestedCandidates = [record.details, record.data, record.upstream]
    for (const candidate of nestedCandidates) {
      const found = findTradeErrorMessage(candidate, seen)
      if (found) return found
    }
  }
  return null
}

function resolveTradeErrorInfo(value: unknown, fallbackMessage: string): TradeErrorInfo {
  const rawMessage = findTradeErrorMessage(value)
  const code = findTradeErrorCode(value)
  if (code && code in TRADE_ERROR_DETAILS) {
    const detail = TRADE_ERROR_DETAILS[code as keyof typeof TRADE_ERROR_DETAILS]
    return {
      code,
      message: detail.message,
      description: 'description' in detail ? detail.description : undefined,
      success: detail.success,
      rawMessage: rawMessage ?? undefined,
    }
  }
  return {
    message: rawMessage || fallbackMessage,
    rawMessage: rawMessage ?? undefined,
  }
}

function normalizeStatusPhase(status?: string | null): StatusPhase {
  if (!status) return 'pending'
  const normalized = status.trim().toLowerCase()
  if (normalized === 'matched' || normalized === 'filled') return 'filled'
  if (['complete', 'completed', 'closed', 'done', 'executed', 'success', 'succeeded'].includes(normalized)) {
    return 'filled'
  }
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

export function TradeCard({
  trader,
  market,
  marketAvatar,
  position,
  action,
  price,
  size,
  total,
  timestamp,
  onCopyTrade,
  onMarkAsCopied,
  onAdvancedCopy,
  isPremium = false,
  isExpanded = false,
  onToggleExpand,
  isCopied = false,
  conditionId,
  tokenId,
  marketSlug,
  currentMarketPrice,
  marketIsOpen,
  liveScore,
  category,
  polymarketUrl,
}: TradeCardProps) {
  const [usdAmount, setUsdAmount] = useState<string>("")
  const [autoClose, setAutoClose] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [localCopied, setLocalCopied] = useState(isCopied)
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'refreshing' | 'done' | 'error'>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [slippagePreset, setSlippagePreset] = useState<number | 'custom'>(2)
  const [customSlippage, setCustomSlippage] = useState("")
  const [orderType, setOrderType] = useState<'FAK' | 'GTC'>('FAK')
  const [orderId, setOrderId] = useState<string | null>(null)
  const [statusPhase, setStatusPhase] = useState<StatusPhase>('submitted')
  const [statusData, setStatusData] = useState<any | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [confirmationError, setConfirmationError] = useState<TradeErrorInfo | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [livePrice, setLivePrice] = useState<number | null>(
    typeof currentMarketPrice === "number" && !Number.isNaN(currentMarketPrice)
      ? currentMarketPrice
      : null
  )
  const [marketMinimumOrderSize, setMarketMinimumOrderSize] = useState<number | null>(null)
  const [marketTickSize, setMarketTickSize] = useState<number | null>(null)

  const formatWallet = (value: string) => {
    const trimmed = value?.trim() || ""
    if (trimmed.length <= 10) return trimmed
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`
  }

  const isUuid = (value?: string | null) =>
    Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))

  const displayAddress = formatWallet(trader.address || "")
  const copiedTraderId = isUuid(trader.id) ? trader.id! : null

  const resolvedLivePrice =
    typeof livePrice === "number" && !Number.isNaN(livePrice) ? livePrice : null
  const hasCurrentPrice = resolvedLivePrice !== null
  const currentPrice = hasCurrentPrice ? resolvedLivePrice : price
  const priceChange = hasCurrentPrice ? ((currentPrice - price) / price) * 100 : 0
  const priceDirection = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'neutral'
  const inferredMarketOpen =
    typeof marketIsOpen === "boolean"
      ? marketIsOpen
      : hasCurrentPrice
        ? currentPrice > 0.05 && currentPrice < 0.95
        : null
  const isMarketEnded = inferredMarketOpen === false

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat("en-US").format(value)
  }

  const formatContracts = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const formatOutcomeLabel = (value: string) => {
    const trimmed = value?.trim()
    if (!trimmed) return "--"
    const lower = trimmed.toLowerCase()
    if (lower === "yes") return "Yes"
    if (lower === "no") return "No"
    return trimmed
      .split(" ")
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ""))
      .join(" ")
  }

  const normalizeOutcome = (value: string) => value?.trim().toLowerCase()
  const findOutcomeIndex = (outcomes: string[], target: string) => {
    const normalizedTarget = normalizeOutcome(target)
    if (!normalizedTarget) return -1
    const normalizedOutcomes = outcomes.map((outcome) => normalizeOutcome(outcome))
    const exactIndex = normalizedOutcomes.findIndex((outcome) => outcome === normalizedTarget)
    if (exactIndex >= 0) return exactIndex

    const containsIndex = normalizedOutcomes.findIndex(
      (outcome) =>
        outcome.includes(normalizedTarget) || normalizedTarget.includes(outcome)
    )
    return containsIndex
  }

  useEffect(() => {
    if (typeof currentMarketPrice === "number" && !Number.isNaN(currentMarketPrice)) {
      setLivePrice(currentMarketPrice)
    }
  }, [currentMarketPrice])

  useEffect(() => {
    setLocalCopied(isCopied)
  }, [isCopied])

  useEffect(() => {
    if (!isExpanded) return
    if (!conditionId && !marketSlug && !market) return

    let canceled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let inFlight = false

    const fetchPrice = async () => {
      if (inFlight || canceled) return
      inFlight = true
      try {
        const params = new URLSearchParams()
        if (conditionId) {
          params.set('conditionId', conditionId)
        } else if (marketSlug) {
          params.set('slug', marketSlug)
        } else if (market) {
          params.set('title', market)
        }
        const response = await fetch(`/api/polymarket/price?${params.toString()}`, {
          cache: 'no-store',
        })
        if (!response.ok) return
        const data = await response.json()
        if (!data?.success || !data?.market) return

        const outcomes = Array.isArray(data.market.outcomes) ? data.market.outcomes : null
        const prices = Array.isArray(data.market.outcomePrices) ? data.market.outcomePrices : null
        if (!outcomes || !prices) return
        const outcomeIndex = findOutcomeIndex(outcomes, position)
        if (outcomeIndex < 0 || outcomeIndex >= prices.length) return
        const nextPrice = Number(prices[outcomeIndex])
        if (!Number.isFinite(nextPrice) || nextPrice <= 0) return
        if (!canceled) setLivePrice(nextPrice)
      } catch {
        // Ignore transient fetch errors for live price polling.
      } finally {
        inFlight = false
        if (!canceled) {
          timer = setTimeout(fetchPrice, 250)
        }
      }
    }

    fetchPrice()
    return () => {
      canceled = true
      if (timer) clearTimeout(timer)
    }
  }, [conditionId, isExpanded, market, marketSlug, position])

  useEffect(() => {
    if (!isExpanded || !conditionId) return
    let cancelled = false

    const fetchMarketConstraints = async () => {
      try {
        const response = await fetch(`/api/polymarket/market?conditionId=${conditionId}`)
        if (!response.ok) return
        const data = await response.json()
        const minSize =
          typeof data?.minimumOrderSize === 'number'
            ? data.minimumOrderSize
            : typeof data?.minOrderSize === 'number'
              ? data.minOrderSize
              : null
        const tick = typeof data?.tickSize === 'number' ? data.tickSize : null
        if (!cancelled) {
          setMarketMinimumOrderSize(minSize)
          setMarketTickSize(tick)
        }
      } catch {
        if (!cancelled) {
          setMarketMinimumOrderSize(null)
          setMarketTickSize(null)
        }
      }
    }

    fetchMarketConstraints()
    return () => {
      cancelled = true
    }
  }, [conditionId, isExpanded])

  const normalizedOutcome = position?.trim().toLowerCase()
  const outcomeBadgeClass =
    normalizedOutcome === "yes"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : normalizedOutcome === "no"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-slate-100 text-slate-700 border-slate-200"

  const defaultSlippagePercent = 2
  const slippagePercent =
    slippagePreset === "custom" ? Number(customSlippage) : Number(slippagePreset)
  const resolvedSlippage =
    Number.isFinite(slippagePercent) && slippagePercent >= 0 ? slippagePercent : defaultSlippagePercent
  const limitPrice =
    action === "Buy"
      ? currentPrice * (1 + resolvedSlippage / 100)
      : currentPrice * (1 - resolvedSlippage / 100)
  const amountValue = Number.parseFloat(usdAmount)
  const hasAmountInput = usdAmount.trim().length > 0
  const effectivePrice = Number.isFinite(limitPrice) && limitPrice > 0 ? limitPrice : currentPrice
  const calculatedContracts =
    Number.isFinite(amountValue) && amountValue > 0 ? Math.floor(amountValue / effectivePrice) : 0
  const amountTooSmall =
    hasAmountInput && Number.isFinite(amountValue) && amountValue > 0 && calculatedContracts < 1
  const marketMinimumSize =
    Number.isFinite(marketMinimumOrderSize) && marketMinimumOrderSize > 0
      ? marketMinimumOrderSize
      : null
  const marketMinimumContracts =
    marketMinimumSize !== null
      ? Math.max(1, Math.ceil(marketMinimumSize - MINIMUM_ORDER_TOLERANCE))
      : null
  const marketMinimumNotMet =
    hasAmountInput &&
    calculatedContracts > 0 &&
    marketMinimumContracts !== null &&
    calculatedContracts + MINIMUM_ORDER_TOLERANCE < marketMinimumContracts
  const tickSizeLabel =
    Number.isFinite(marketTickSize) && marketTickSize && marketTickSize > 0
      ? ` Prices must follow the ${formatCurrency(marketTickSize)} tick size.`
      : ''
  const marketMinimumMessage =
    marketMinimumContracts !== null
      ? `Minimum order size for this market is ${marketMinimumContracts} ${marketMinimumContracts === 1 ? 'contract' : 'contracts'} (min_order_size).${tickSizeLabel}`
      : `Minimum order size varies by market (min_order_size).${tickSizeLabel}`
  const inlineAmountError = amountTooSmall
    ? `Minimum is 1 contract (≈ ${formatCurrency(effectivePrice)} at current price).`
    : marketMinimumNotMet
      ? marketMinimumMessage
      : null
  const traderSize = Number.isFinite(size) && size > 0 ? size : 0
  const sizePercent =
    traderSize > 0 && calculatedContracts > 0 ? (calculatedContracts / traderSize) * 100 : null
  const sizePercentLabel = sizePercent !== null ? `${sizePercent.toFixed(0)}%` : '--%'
  const contractLabel = calculatedContracts === 1 ? "contract" : "contracts"
  const estimatedContractsAtLimit =
    Number.isFinite(amountValue) && amountValue > 0 && limitPrice > 0
      ? Math.floor(amountValue / limitPrice)
      : 0
  const estimatedMaxCost = estimatedContractsAtLimit * limitPrice
  const previousSlippage = useRef(resolvedSlippage)
  const statusDataRef = useRef<any | null>(null)

  useEffect(() => {
    if (previousSlippage.current !== resolvedSlippage) {
      if (Number.isFinite(amountValue) && amountValue > 0 && limitPrice > 0) {
        const contractsAtLimit = Math.floor(amountValue / limitPrice)
        if (contractsAtLimit > 0) {
          const normalizedAmount = contractsAtLimit * limitPrice
          setUsdAmount(normalizedAmount.toFixed(2))
        }
      }
    }
    previousSlippage.current = resolvedSlippage
  }, [amountValue, limitPrice, resolvedSlippage])

  useEffect(() => {
    if (!orderId || !showConfirmation) return
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null
    let pendingTimer: ReturnType<typeof setTimeout> | null = null
    let inFlight = false

    setStatusPhase('submitted')
    setStatusData(null)
    statusDataRef.current = null
    setStatusError(null)

    pendingTimer = setTimeout(() => {
      if (!cancelled && !statusDataRef.current) {
        setStatusPhase('pending')
      }
    }, 300)

    const poll = async () => {
      if (cancelled || inFlight) return
      inFlight = true
      try {
        const res = await fetch(`/api/polymarket/orders/${encodeURIComponent(orderId)}/status`, {
          cache: 'no-store',
        })
        const data = await res.json()
        if (!res.ok) {
          setStatusError(data?.error || data?.message || 'Status check failed')
        } else {
          if (pendingTimer) {
            clearTimeout(pendingTimer)
            pendingTimer = null
          }
          statusDataRef.current = data
          setStatusData(data)
          setStatusError(null)
          const rawStatus = data?.status ? String(data.status) : ''
          let phase = normalizeStatusPhase(rawStatus)
          const filledSize =
            typeof data?.filledSize === 'number' ? data.filledSize : null
          const remainingSize =
            typeof data?.remainingSize === 'number' ? data.remainingSize : null
          if (
            remainingSize !== null &&
            remainingSize <= 0 &&
            filledSize !== null &&
            filledSize > 0
          ) {
            phase = 'filled'
          }
          setStatusPhase(phase)
          if (TERMINAL_STATUS_PHASES.has(phase) && intervalId) {
            clearInterval(intervalId)
            intervalId = null
          }
        }
      } catch (err: any) {
        setStatusError(err?.message || 'Network error')
      } finally {
        inFlight = false
      }
    }

    poll()
    intervalId = setInterval(poll, 200)

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      if (pendingTimer) clearTimeout(pendingTimer)
    }
  }, [orderId, showConfirmation])

  const refreshOrders = async () => {
    setRefreshStatus('refreshing')
    try {
      await fetch('/api/polymarket/orders/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      setRefreshStatus('done')
    } catch (error) {
      console.warn('Order refresh failed', error)
      setRefreshStatus('error')
    } finally {
      setTimeout(() => setRefreshStatus('idle'), 3000)
    }
  }

  const handleQuickCopy = async () => {
    if (!isPremium) {
      // Non-premium users: just open Polymarket
      onCopyTrade?.()
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)
    setConfirmationError(null)
    let showedConfirmation = false
    
    try {
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        setSubmitError('Enter a valid amount.')
    setIsSubmitting(false)
        return
      }

      // Calculate contracts from USD amount
      if (calculatedContracts <= 0) {
        setSubmitError('Amount too small. Must be at least 1 contract.')
        setIsSubmitting(false)
        return
      }

      // If we don't have tokenId, we need to fetch it from conditionId + outcome
      let finalTokenId = tokenId
      if (!finalTokenId && conditionId) {
        try {
          // Fetch market data to get tokenId
          const marketResponse = await fetch(`/api/polymarket/market?conditionId=${conditionId}`)
          if (marketResponse.ok) {
            const marketData = await marketResponse.json()
            // Find the token matching the outcome
            const tokens = marketData.tokens || []
            const matchingToken = tokens.find((t: any) => 
              t.outcome?.toUpperCase() === position.toUpperCase()
            )
            if (matchingToken?.token_id) {
              finalTokenId = matchingToken.token_id
            }
          }
        } catch (error) {
          console.error('Failed to fetch market data:', error)
        }
      }

      if (!finalTokenId) {
        setSubmitError('Unable to determine token ID. Please use Advanced mode.')
        setIsSubmitting(false)
        return
      }

      setShowConfirmation(true)
      setStatusPhase('submitted')
      setStatusError(null)
      setConfirmationError(null)
      showedConfirmation = true

      // Execute the trade via API
      const response = await fetch('/api/polymarket/orders/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenId: finalTokenId,
            price: limitPrice,
            amount: calculatedContracts,
            side: action === 'Buy' ? 'BUY' : 'SELL',
            orderType,
            confirm: true,
            copiedTraderId,
            copiedTraderWallet: trader.address,
            copiedTraderUsername: trader.name,
            marketId: conditionId || (finalTokenId ? finalTokenId.slice(0, 66) : undefined),
            marketTitle: market,
            marketSlug,
            marketAvatarUrl: marketAvatar,
            amountInvested: Number.isFinite(amountValue) ? amountValue : undefined,
            outcome: position,
            autoCloseOnTraderClose: autoClose,
          }),
        })

      const data = await response.json()

      if (!response.ok) {
        const errorInfo = resolveTradeErrorInfo(
          data?.error ?? data,
          data?.message || 'Failed to execute trade'
        )
        setConfirmationError(errorInfo)
        setStatusPhase('rejected')
        setIsSubmitting(false)
        return
      }

      const placedOrderId =
        data?.orderId ||
        data?.orderID ||
        data?.raw?.orderId ||
        data?.raw?.orderID ||
        data?.raw?.order_id ||
        null

      if (!placedOrderId) {
        const errorInfo = resolveTradeErrorInfo(
          data,
          'Order submitted but no order ID returned.'
        )
        setConfirmationError(errorInfo)
        setStatusPhase('rejected')
        setIsSubmitting(false)
        return
      }

      // Success: open confirmation view
      setIsSubmitting(false)
      setLocalCopied(true)
      setOrderId(String(placedOrderId))
      refreshOrders().catch(() => {
        /* handled in refreshOrders */
      })

    } catch (error: any) {
      console.error('Trade execution error:', error)
      if (showedConfirmation) {
        const errorInfo = resolveTradeErrorInfo(
          error,
          'Failed to execute trade. Please try again.'
        )
        setConfirmationError(errorInfo)
        setStatusPhase('rejected')
      } else {
        setSubmitError(error?.message || 'Failed to execute trade. Please try again.')
      }
      setIsSubmitting(false)
    }
  }

  const handleCopyTradeClick = () => {
    if (isMarketEnded) return
    if (isPremium && onToggleExpand) {
      onToggleExpand()
    } else if (!isPremium) {
      onCopyTrade?.()
    }
  }

  const isCopyDisabled = isMarketEnded
  const statusLabel =
    statusPhase === 'submitted'
      ? 'Order sent to Polymarket'
      : statusPhase === 'pending' || statusPhase === 'processing' || statusPhase === 'open'
        ? 'Order Received by Polymarket, Pending'
        : statusPhase === 'filled'
          ? 'Order filled on Polymarket'
          : statusPhase === 'partial'
            ? 'Partially filled on Polymarket'
            : 'Not filled on Polymarket'
  const filledContracts =
    typeof statusData?.filledSize === 'number' ? statusData.filledSize : null
  const totalContracts =
    typeof statusData?.size === 'number' ? statusData.size : null
  const remainingContracts =
    typeof statusData?.remainingSize === 'number' ? statusData.remainingSize : null
  const fillPrice =
    typeof statusData?.price === 'number' ? statusData.price : null
  const filledAmountValue =
    filledContracts !== null && fillPrice !== null ? filledContracts * fillPrice : null
  const totalAmountValue =
    totalContracts !== null && fillPrice !== null ? totalContracts * fillPrice : null
  const statusAmountValue =
    filledAmountValue !== null
      ? filledAmountValue
      : totalAmountValue !== null
        ? totalAmountValue
        : Number.isFinite(estimatedMaxCost) && estimatedMaxCost > 0
          ? estimatedMaxCost
          : Number.isFinite(amountValue)
            ? amountValue
            : 0
  const statusContractsText =
    filledContracts !== null && totalContracts !== null
      ? `${formatContracts(filledContracts)} of ${formatContracts(totalContracts)} filled`
      : `${calculatedContracts.toLocaleString()} ${contractLabel}`
  const isFinalStatus = TERMINAL_STATUS_PHASES.has(statusPhase)

  return (
    <div className="group bg-white border border-slate-200 rounded-xl overflow-hidden transition-all hover:shadow-lg">
      <div className="p-5 md:p-6">
        {/* Header Row */}
        <div className="flex items-start justify-between mb-4 gap-3">
          <Link
            href={`/trader/${trader.id || "1"}`}
            className="flex items-center gap-3 min-w-0 hover:opacity-70 transition-opacity"
          >
            <Avatar className="h-10 w-10 ring-2 ring-slate-100 transition-all">
              <AvatarImage src={trader.avatar || "/placeholder.svg"} alt={trader.name} />
              <AvatarFallback className="bg-gradient-to-br from-yellow-400 to-yellow-500 text-slate-900 text-sm font-semibold">
                {trader.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-medium text-slate-900 text-sm">{trader.name}</p>
              <p className="text-xs text-slate-500 font-mono truncate">{displayAddress}</p>
            </div>
          </Link>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {/* Live Score (Always visible for all users) */}
            <div className="flex flex-col md:flex-row items-end md:items-center gap-2">
              {isMarketEnded && (
                <Badge
                  variant="secondary"
                  className="h-7 px-2 text-[10px] font-semibold bg-rose-50 text-rose-700 border-rose-200 flex items-center"
                >
                  Ended
                </Badge>
              )}
              {liveScore && (
                <div className="px-2 py-1 h-7 rounded bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 shadow-sm flex items-center">
                  <span className="text-[10px] font-semibold text-blue-900">{liveScore}</span>
                </div>
              )}
            </div>
            {/* Timestamp & Expand */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{timestamp}</span>
              {isPremium && onToggleExpand && !localCopied && null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Avatar className="h-11 w-11 ring-2 ring-slate-100 bg-slate-50 text-slate-700 text-xs font-semibold uppercase">
            <AvatarImage src={marketAvatar || "/placeholder.svg"} alt={market} />
            <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-semibold uppercase">
              {market.slice(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 flex items-center gap-2">
            <h3 className="text-base md:text-lg font-medium text-slate-900 leading-snug">{market}</h3>
            {/* External link icon for Premium users - at end of market name */}
            {isPremium && polymarketUrl && (
              <a
                href={polymarketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                title="View on Polymarket"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg px-4 py-3 mb-2 bg-slate-50/50">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 relative">
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-1 font-medium">Trade</p>
              <div className="flex flex-wrap items-center justify-center gap-1 max-w-full">
                <Badge
                  variant="secondary"
                  className={`font-semibold text-xs ${
                    action === "Buy"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  }`}
                >
                  {action}
                </Badge>
                <span className="text-xs text-slate-400 font-semibold">|</span>
                <Badge
                  variant="secondary"
                  className={`font-semibold text-xs ${outcomeBadgeClass} max-w-[140px] whitespace-normal break-words text-center leading-snug`}
                >
                  {formatOutcomeLabel(position)}
                </Badge>
                </div>
              </div>
            <div className="text-center md:border-l border-slate-200">
              <p className="text-xs text-slate-500 mb-1 font-medium">Invested</p>
              <p className="text-sm md:text-base font-semibold text-slate-900">{formatCurrency(total)}</p>
            </div>
            <div className="text-center md:border-l border-slate-200">
              <p className="text-xs text-slate-500 mb-1 font-medium">Contracts</p>
              <p className="text-sm md:text-base font-semibold text-slate-900">{formatNumber(size)}</p>
            </div>
            <div className="text-center md:border-l border-slate-200">
              <p className="text-xs text-slate-500 mb-1 font-medium">Entry</p>
              <p className="text-sm md:text-base font-semibold text-slate-900">{formatCurrency(price)}</p>
            </div>
            <div className="text-center md:border-l border-slate-200">
              <p className="text-xs text-slate-500 mb-1 font-medium">Current</p>
              <p className="text-sm md:text-base font-semibold text-slate-900">
                {hasCurrentPrice ? formatCurrency(currentPrice) : "--"}
              </p>
            </div>
            <div className="text-center md:border-l border-slate-200">
              <p className="text-xs text-slate-500 mb-1 font-medium">ROI</p>
              <p className={`text-sm md:text-base font-semibold ${
                priceDirection === 'neutral' || !hasCurrentPrice ? 'text-slate-400' :
                priceDirection === 'up' ? 'text-emerald-600' :
                'text-red-600'
              }`}>
                {!hasCurrentPrice ? '--' : `${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}%`}
              </p>
            </div>
          </div>
        </div>

        {!(isPremium && isExpanded) && (
        <div className={isPremium ? "w-full" : "grid grid-cols-2 gap-2"}>
          <Button
            onClick={handleCopyTradeClick}
              disabled={isCopyDisabled}
            className={`font-semibold shadow-sm text-sm ${
              localCopied
                ? "w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                  : isMarketEnded
                    ? "w-full bg-slate-200 text-slate-500 cursor-not-allowed"
                : isPremium
                  ? "w-full bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 hover:from-orange-500 hover:via-amber-500 hover:to-yellow-500 text-slate-900"
                  : "bg-[#FDB022] hover:bg-[#FDB022]/90 text-slate-900"
            }`}
            size="lg"
          >
            {localCopied ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                  Copy Again
              </>
            ) : (
                <>
                  {isPremium ? "Copy Trade" : "Manual Copy"}
                  {!isPremium && <ExternalLink className="w-4 h-4 ml-2" />}
                </>
            )}
          </Button>
          {!isPremium && (
            <Button
              onClick={onMarkAsCopied}
              variant="outline"
              className="border-slate-300 text-slate-700 hover:bg-slate-50 font-medium bg-transparent text-sm transition-all"
              size="lg"
            >
              Mark as Copied
            </Button>
          )}
        </div>
        )}
      </div>

      {isPremium && isExpanded && (
        <div className="bg-white px-6 pb-3 pt-0">
          <div className="-mt-4 mb-2 flex justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400">
              <ArrowDown className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-0.5 rounded-xl border border-slate-200 bg-slate-50 px-4 pb-4 pt-3">
            {showConfirmation ? (
              <div className="space-y-4">
                  <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-slate-400">Status</p>
                    <p className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                      {!isFinalStatus && <Loader2 className="h-4 w-4 animate-spin text-amber-500" />}
                      {statusLabel}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowConfirmation(false)
                      setOrderId(null)
                      setStatusData(null)
                      statusDataRef.current = null
                      setStatusError(null)
                      setConfirmationError(null)
                      setStatusPhase('submitted')
                    }}
                    className={
                      isFinalStatus
                        ? "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 h-8 text-xs font-semibold text-slate-600 hover:text-slate-800"
                        : "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-700 h-8 w-8"
                    }
                    aria-label={isFinalStatus ? "Copy again" : "Close order confirmation"}
                  >
                    {isFinalStatus ? "Copy Again" : <X className="h-4 w-4" />}
                  </button>
                </div>
                {confirmationError && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      confirmationError.success === false
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    <p className="font-semibold">
                      {confirmationError.code
                        ? `${confirmationError.code}: ${confirmationError.message}`
                        : confirmationError.message}
                    </p>
                    {confirmationError.description && (
                      <p className="text-[11px] opacity-80">{confirmationError.description}</p>
                    )}
                    {confirmationError.rawMessage &&
                      confirmationError.rawMessage !== confirmationError.message && (
                        <p className="text-[11px] opacity-70">{confirmationError.rawMessage}</p>
                      )}
                    </div>
                )}
                <div className="space-y-2">
                  <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-end sm:justify-center">
                    <div className="flex w-full flex-col gap-2 sm:max-w-[240px]">
                      <label className="text-xs font-medium text-slate-700">
                        Amount (USD)
                      </label>
                      <div className="flex h-14 items-center rounded-lg border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700">
                        {formatCurrency(Number.isFinite(statusAmountValue) ? statusAmountValue : 0)}
                  </div>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[180px]">
                      <span className="text-xs font-medium text-slate-700 text-center sm:text-left">
                        Contracts
                      </span>
                      <div className="flex h-14 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 text-center">
                        {statusContractsText}
                      </div>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[180px]">
                      <span className="text-xs font-medium text-slate-700 text-center sm:text-left">
                        Filled Price
                      </span>
                      <div className="flex h-14 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 text-center">
                        {fillPrice !== null ? formatCurrency(fillPrice) : '—'}
                      </div>
                    </div>
                  </div>
                </div>
                {statusError && (
                  <p className="text-xs text-rose-600">Status error: {statusError}</p>
                )}
              </div>
            ) : !isSuccess ? (
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <button
                      type="button"
                      onClick={onToggleExpand}
                      className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors"
                      aria-label="Collapse quick copy"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <h4 className="text-sm font-semibold text-slate-900">Copy</h4>
                    <span className="w-[52px]" aria-hidden="true" />
                </div>

                {/* Amount Input */}
                <div className="space-y-2 mb-4">
                    <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-end sm:justify-center">
                      <div className="flex w-full flex-col gap-2 sm:max-w-[240px]">
                        <div className="flex items-center gap-1.5">
                  <label htmlFor="amount" className="text-xs font-medium text-slate-700">
                    Amount (USD)
                  </label>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="text-slate-400 hover:text-slate-500"
                                  aria-label="Amount (USD) info"
                                >
                                  <HelpCircle className="h-3 w-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>
                                  We use your dollar amount to calculate the maximum whole contracts at the current price.
                                  We then round to the nearest fillable total so the order stays within your budget.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                    <input
                      id="amount"
                      type="number"
                      value={usdAmount}
                            onChange={(e) => {
                              setUsdAmount(e.target.value)
                              if (submitError) setSubmitError(null)
                            }}
                            onBlur={() => {
                              if (!Number.isFinite(amountValue) || amountValue <= 0) return
                              if (calculatedContracts < 1) return
                              const normalizedAmount = calculatedContracts * effectivePrice
                              setUsdAmount(normalizedAmount.toFixed(2))
                            }}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="0.00"
                      disabled={isSubmitting}
                            className="w-full h-14 pl-7 pr-3 border border-slate-300 rounded-lg text-base font-semibold text-slate-700 focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                      </div>
                      <div className="flex h-14 w-full items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 text-center sm:w-auto sm:min-w-[180px]">
                        = {calculatedContracts.toLocaleString()} {contractLabel}
                      </div>
                      <div className="flex h-14 items-center text-xs font-medium text-slate-500">
                        {sizePercentLabel} of original trade
                      </div>
                    </div>
                    {inlineAmountError && (
                      <p className="text-xs text-rose-600">{inlineAmountError}</p>
                    )}
                    {submitError && !inlineAmountError && (
                      <p className="text-xs text-rose-600">{submitError}</p>
                  )}
                </div>

                  <Button
                    onClick={handleQuickCopy}
                    disabled={
                      isMarketEnded ||
                      !usdAmount ||
                      Number.parseFloat(usdAmount) <= 0 ||
                      amountTooSmall ||
                      isSubmitting
                    }
                    className="w-full bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400 hover:from-orange-500 hover:via-amber-500 hover:to-yellow-500 text-slate-900 font-semibold disabled:opacity-50"
                    size="lg"
                  >
                    {isSubmitting ? (
                      <>
                        Order sent to Polymarket
                      </>
                    ) : (
                      "Execute Trade"
                    )}
                  </Button>
                {/* Auto-close Checkbox */}
                  <div className="mt-4 flex items-start space-x-3 p-2.5 bg-white rounded-lg border border-slate-200">
                  <Checkbox
                    id="auto-close"
                    checked={autoClose}
                    onCheckedChange={(checked) => setAutoClose(!!checked)}
                    disabled={isSubmitting}
                  />
                  <div className="flex-1">
                    <label
                      htmlFor="auto-close"
                      className="text-sm font-medium text-slate-900 cursor-pointer leading-tight"
                    >
                      Auto-close when trader closes
                    </label>
                  </div>
                </div>
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
                                Slippage ({resolvedSlippage}%)
                                <HelpCircle className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>
                                We set your limit price up to {resolvedSlippage}% worse than the current best price to increase the chance of filling. You still fill at the best available price.
                              </p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                              >
                                {orderType === "GTC" ? "Good 'Til Canceled (GTC)" : "Fill and Kill (FAK)"}
                                <HelpCircle className="h-3.5 w-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>
                                {orderType === "GTC"
                                  ? "GTC leaves the order open until it fills or you cancel it."
                                  : "FAK fills as much as possible immediately and cancels the rest."}
                              </p>
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
                      <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                  {!showAdvanced && (
                    <p className="mt-1 text-xs text-slate-500">
                      Estimated: {estimatedContractsAtLimit.toLocaleString()} contracts, up to {formatCurrency(estimatedMaxCost)} (may fill for less).
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
                                <p>
                                  We set your limit price up to {resolvedSlippage}% worse than the current best price to increase the chance of filling. You still fill at the best available price.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                        <div className="flex flex-wrap items-center gap-2">
                          {[0, 1, 3, 5].map((value) => (
                            <Button
                              key={value}
                              type="button"
                              variant={slippagePreset === value ? "default" : "outline"}
                              size="sm"
                              onClick={() => {
                                setSlippagePreset(value)
                                setCustomSlippage("")
                              }}
                              className={
                                slippagePreset === value
                                  ? "bg-slate-900 text-white hover:bg-slate-800 font-semibold h-8 text-xs"
                                  : "border-slate-300 text-slate-700 hover:bg-slate-50 font-medium h-8 text-xs"
                              }
                            >
                              {value}%
                  </Button>
                          ))}
                          <Input
                            type="number"
                            placeholder="Custom"
                            value={customSlippage}
                            onChange={(e) => {
                              setCustomSlippage(e.target.value)
                              setSlippagePreset("custom")
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-20 h-8 text-xs border-slate-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                </div>
                        <p className="text-xs text-slate-500">
                          Estimated: {estimatedContractsAtLimit.toLocaleString()} contracts, up to {formatCurrency(estimatedMaxCost)} (may fill for less).
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
                                <p>
                                  FAK fills as much as possible immediately and cancels the rest. GTC leaves the order open until it fills or you cancel it.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                        <RadioGroup value={orderType} onValueChange={(value) => setOrderType(value as 'FAK' | 'GTC')} className="space-y-1.5">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="FAK" id="quick-copy-fak" className="h-4 w-4" />
                            <Label htmlFor="quick-copy-fak" className="text-xs font-medium text-slate-700 cursor-pointer">
                              Fill and Kill (FAK)
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="GTC" id="quick-copy-gtc" className="h-4 w-4" />
                            <Label htmlFor="quick-copy-gtc" className="text-xs font-medium text-slate-700 cursor-pointer">
                              Good 'Til Canceled (GTC)
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                  )}
                  {refreshStatus === 'refreshing' && (
                    <p className="text-xs text-slate-600 mt-2">Refreshing order status…</p>
                  )}
                  {refreshStatus === 'done' && (
                    <p className="text-xs text-emerald-600 mt-2">Order submitted to Polymarket. Latest status will appear in Orders shortly.</p>
                  )}
                  {refreshStatus === 'error' && (
                    <p className="text-xs text-rose-600 mt-2">
                      Order sent to Polymarket, but status refresh failed. Check the Orders page for updates.
                    </p>
                  )}
                </div>
              </div>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h4 className="text-lg font-semibold text-slate-900 mb-2">Trade Executed Successfully!</h4>
              <p className="text-sm text-slate-600">
                Your copy trade of {formatCurrency(Number.parseFloat(usdAmount))} has been submitted to Polymarket
              </p>
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  )
}
