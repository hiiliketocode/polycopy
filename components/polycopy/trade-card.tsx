"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  ArrowDown,
  ArrowLeftRight,
  ChevronDown,
  ChevronUp,
  Check,
  HelpCircle,
  ExternalLink,
  Pin,
  X,
  Loader2,
  CalendarClock,
  SignalHigh,
  CheckCircle2,
  Flag,
  CircleDot,
  Clock,
  Star,
  Sparkles,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  adjustSizeForImpliedAmount,
  getStepDecimals,
  normalizeContractsFromUsd,
  normalizeContractsInput,
  roundDownToStep,
  roundUpToStep,
} from "@/lib/polymarket/sizing"
import { cn } from "@/lib/utils"
import { getTraderAvatarInitials } from "@/lib/trader-name"
import {
  BadgeState,
  MarketCategoryType,
  ResolvedGameTime,
  ScoreSources,
  deriveBadgeState,
  resolveMarketCategoryType,
} from "@/lib/badge-state"
import { abbreviateTeamName } from "@/lib/utils/team-abbreviations"
import { isTop5Trader } from "@/lib/polyscore/check-top5"
import { getPolyScore, type PolyScoreResponse } from "@/lib/polyscore/get-polyscore"
import { PolyScoreResults } from "@/components/polyscore/PolyScoreResults"

const normalizeLegacyScore = (value: unknown) => {
  if (!value) return null
  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    const homeRaw = record.home ?? record.homeScore ?? record.home_score
    const awayRaw = record.away ?? record.awayScore ?? record.away_score
    const home = Number.isFinite(Number(homeRaw)) ? Number(homeRaw) : null
    const away = Number.isFinite(Number(awayRaw)) ? Number(awayRaw) : null
    if (home !== null || away !== null) return { home, away }
  }
  if (typeof value === "string") {
    const match = value.match(/(\d+)\s*-\s*(\d+)/)
    if (match) {
      const home = Number(match[1])
      const away = Number(match[2])
      if (Number.isFinite(home) || Number.isFinite(away)) {
        return {
          home: Number.isFinite(home) ? home : null,
          away: Number.isFinite(away) ? away : null,
        }
      }
    }
  }
  return null
}

type PositionTradeSummary = {
  side: "BUY" | "SELL"
  outcome: string
  size: number | null
  price: number | null
  amountUsd: number | null
  timestamp?: number | null
}

type PositionBadgeData = {
  label: string
  trades: PositionTradeSummary[]
  variant: "trader" | "user"
}

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
  tradeTimestampMs?: number
  onCopyTrade?: () => void
  onMarkAsCopied?: (entryPrice: number, amountInvested?: number) => void
  onAdvancedCopy?: () => void
  isPremium?: boolean
  isAdmin?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
  isCopied?: boolean
  // Trade execution data
  conditionId?: string
  tokenId?: string
  marketSlug?: string
  // Live data
  currentMarketPrice?: number
  currentMarketUpdatedAt?: number
  marketIsOpen?: boolean | null
  badgeState?: BadgeState
  marketCategory?: MarketCategoryType
  liveScore?: string
  eventStartTime?: string
  eventEndTime?: string
  eventStatus?: string
  liveStatus?: "live" | "scheduled" | "final" | "unknown"
  category?: string
  polymarketUrl?: string
  espnUrl?: string
  homeTeam?: string | null
  awayTeam?: string | null
  gameTimeInfo?: string | null // e.g., "Q4 5:30" or "Halftime"
  defaultBuySlippage?: number
  defaultSellSlippage?: number
  tradeAnchorId?: string
  onExecutionNotification?: (payload: TradeExecutionNotificationPayload) => void
  walletAddress?: string | null
  manualTradingEnabled?: boolean
  onSwitchToManualTrading?: () => void
  onOpenConnectWallet?: () => void
  hideActions?: boolean
  isPinned?: boolean
  onTogglePin?: () => void
  traderPositionBadge?: PositionBadgeData
  userPositionBadge?: PositionBadgeData
  onSellPosition?: () => void
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
  | 'timed_out'
  | 'unknown'

type ManualFlowStep = 'open-polymarket' | 'enter-details'

type TradeExecutionNotificationPayload = {
  id: string
  market: string
  status: 'filled' | 'partial' | 'failed'
  tradeAnchorId: string
  timestamp: number
}

const TERMINAL_STATUS_PHASES = new Set<StatusPhase>([
  'filled',
  'canceled',
  'expired',
  'rejected',
  'timed_out',
])
const CANCELABLE_PHASES = new Set<StatusPhase>([
  'submitted',
  'processing',
  'pending',
  'open',
  'partial',
  'unknown',
])

type CancelStatus = {
  message: string
  variant: 'info' | 'success' | 'error'
}

const ORDER_STATUS_TIMEOUT_MS = 30_000
const CELEBRATION_MS = 1200
const CONFETTI_PIECES = Array.from({ length: 12 }, (_, index) => index)
const EXIT_TRADE_WARNING =
  'Are you sure you want to leave? You have trades in progress that may fail.'

const LIQUIDITY_ERROR_PHRASES = [
  'no orders found to match with fak order',
  'no match found',
  'could not insert order',
]
const PRICE_LIMIT_REGEX = /price must be at (most|least)\s*\$?([0-9]*\.?[0-9]+)/i

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

function resolveExecutionNotificationStatus(
  statusPhase: StatusPhase,
  filledContracts: number | null,
  totalContracts: number | null,
): TradeExecutionNotificationPayload["status"] | null {
  if (statusPhase === "partial") return "partial"
  if (TERMINAL_STATUS_PHASES.has(statusPhase)) {
    if (filledContracts !== null && filledContracts > 0) {
      if (totalContracts !== null && filledContracts < totalContracts) return "partial"
      return "filled"
    }
    return "failed"
  }
  return null
}

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
    const candidates = [
      record.error,
      record.message,
      record.reason,
      record.detail,
      record.polymarketError,
    ]
    for (const candidate of candidates) {
      const found = findTradeErrorMessage(candidate, seen)
      if (found) return found
    }
    const nestedCandidates = [
      record.details,
      record.data,
      record.upstream,
      record.raw,
      record.snippet,
      record.polymarketError,
    ]
    for (const candidate of nestedCandidates) {
      const found = findTradeErrorMessage(candidate, seen)
      if (found) return found
    }
  }
  return null
}

function getFriendlyLiquidityMessage(rawMessage?: string | null) {
  if (!rawMessage) return null
  const normalized = rawMessage.toLowerCase()
  for (const phrase of LIQUIDITY_ERROR_PHRASES) {
    if (normalized.includes(phrase)) {
      return "We couldn’t fill this order at your price. Try increasing slippage (tap Advanced) or using a smaller amount."
    }
  }
  return null
}

function getFriendlyPriceLimitMessage(rawMessage?: string | null) {
  if (!rawMessage) return null
  const match = rawMessage.match(PRICE_LIMIT_REGEX)
  if (!match) return null
  const direction = match[1]?.toLowerCase()
  const limitValue = match[2]
  const relation = direction === 'least' ? 'below' : 'above'
  const bound = direction === 'least' ? 'min' : 'max'
  return `Slippage pushed your limit price ${relation} the allowed ${bound} ($${limitValue}). Lower slippage % in Advanced and try again.`
}

function resolveTradeErrorInfo(value: unknown, fallbackMessage: string): TradeErrorInfo {
  const rawMessage = findTradeErrorMessage(value)
  const code = findTradeErrorCode(value)
  const friendly = getFriendlyLiquidityMessage(rawMessage)
  if (friendly) {
    return {
      message: friendly,
    }
  }
  const priceLimitMessage = getFriendlyPriceLimitMessage(rawMessage)
  if (priceLimitMessage) {
    return {
      message: priceLimitMessage,
    }
  }
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
  isAdmin = false,
  isExpanded = false,
  onToggleExpand,
  isCopied = false,
  conditionId,
  tokenId,
  marketSlug,
  currentMarketPrice,
  currentMarketUpdatedAt,
  marketIsOpen,
  badgeState,
  marketCategory,
  liveScore,
  eventStartTime,
  eventEndTime,
  eventStatus,
  liveStatus,
  category,
  polymarketUrl,
  espnUrl,
  homeTeam,
  awayTeam,
  gameTimeInfo,
  defaultBuySlippage,
  defaultSellSlippage,
  tradeTimestampMs,
  tradeAnchorId,
  onExecutionNotification,
  walletAddress = null,
  manualTradingEnabled = false,
  onSwitchToManualTrading,
  onOpenConnectWallet,
  hideActions = false,
  isPinned = false,
  onTogglePin,
  traderPositionBadge,
  userPositionBadge,
  onSellPosition,
}: TradeCardProps) {
  // DEBUG: Log every render
  console.log('🎯 TradeCard RENDERED:', {
    traderName: trader.name,
    traderAddress: trader.address,
    isAdmin,
    market
  })
  
  const resolvedDefaultSlippage =
    action === "Buy"
      ? typeof defaultBuySlippage === "number"
        ? defaultBuySlippage
        : 3
      : typeof defaultSellSlippage === "number"
        ? defaultSellSlippage
        : 3
  const [amountMode, setAmountMode] = useState<"usd" | "contracts">("usd")
  const [amountInput, setAmountInput] = useState<string>("")
  const canUseAutoClose = Boolean(isAdmin)
  const [autoClose, setAutoClose] = useState(() => canUseAutoClose)
  
  // PolyScore state
  const isTop5 = isAdmin && trader.address ? isTop5Trader(trader.address) : false
  const [isLoadingPolyScore, setIsLoadingPolyScore] = useState(false)
  const [polyScoreData, setPolyScoreData] = useState<PolyScoreResponse | null>(null)
  const [polyScoreError, setPolyScoreError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [localCopied, setLocalCopied] = useState(isCopied)
  const [refreshStatus, setRefreshStatus] = useState<'idle' | 'refreshing' | 'done' | 'error'>('idle')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const userUpdatedSlippageRef = useRef(false)
  const [slippagePreset, setSlippagePreset] = useState<number | 'custom'>(() => resolvedDefaultSlippage)
  const [customSlippage, setCustomSlippage] = useState("")
  const [orderType, setOrderType] = useState<'FAK' | 'GTC'>('FAK')
  const [orderId, setOrderId] = useState<string | null>(null)
  const [statusPhase, setStatusPhase] = useState<StatusPhase>('submitted')
  const statusPhaseRef = useRef<StatusPhase>('submitted')
  const derivedBadgeStateRef = useRef<BadgeState | null>(badgeState ?? null)
  const derivedGameTimeRef = useRef<ResolvedGameTime | null>(
    badgeState ? { time: badgeState.time, source: badgeState.source } : null
  )
  const [statusData, setStatusData] = useState<any | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [confirmationError, setConfirmationError] = useState<TradeErrorInfo | null>(null)
  const [isCancelingOrder, setIsCancelingOrder] = useState(false)
  const [cancelStatus, setCancelStatus] = useState<CancelStatus | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [showTradeDetails, setShowTradeDetails] = useState(false)
  const [isPositionDrawerOpen, setIsPositionDrawerOpen] = useState(false)
  const [positionDrawerTab, setPositionDrawerTab] = useState<"trader" | "user">("trader")
  const [livePrice, setLivePrice] = useState<number | null>(
    typeof currentMarketPrice === "number" && !Number.isNaN(currentMarketPrice)
      ? currentMarketPrice
      : null
  )
  const [marketTickSize, setMarketTickSize] = useState<number | null>(null)
  const [, setOrderBookLoading] = useState(false)
  const [orderBookError, setOrderBookError] = useState<string | null>(null)
  const [bestBidPrice, setBestBidPrice] = useState<number | null>(null)
  const [bestAskPrice, setBestAskPrice] = useState<number | null>(null)
  const [priceFlash, setPriceFlash] = useState<"up" | "down" | "neutral" | null>(null)
  const priceFlashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousMarketPriceRef = useRef<number | null>(null)
  const lastMarketUpdateRef = useRef<number | null>(null)
  const [manualDrawerOpen, setManualDrawerOpen] = useState(false)
  const [manualUsdAmount, setManualUsdAmount] = useState("")
  const [manualPriceInput, setManualPriceInput] = useState("")
  const [manualFlowStep, setManualFlowStep] = useState<ManualFlowStep>('open-polymarket')
  const [showWalletPrompt, setShowWalletPrompt] = useState(false)
  const [isInView, setIsInView] = useState(true)
  const [notificationPending, setNotificationPending] = useState(false)
  const [notificationSent, setNotificationSent] = useState(false)
  const [showFilledCelebration, setShowFilledCelebration] = useState(false)
  const [celebrationKey, setCelebrationKey] = useState(0)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousStatusRef = useRef<StatusPhase | null>(null)
  const [orderIntentId] = useState<string>(() => {
    const randomUuId = globalThis.crypto?.randomUUID?.()
    if (randomUuId) return randomUuId
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  })
  const prevCanUseAutoCloseRef = useRef(canUseAutoClose)
  const resolvedBadge = useMemo(() => {
    if (badgeState) {
      derivedBadgeStateRef.current = badgeState
      if (badgeState.time || !derivedGameTimeRef.current) {
        derivedGameTimeRef.current = { time: badgeState.time, source: badgeState.source }
      }
      return {
        state: badgeState,
        categoryType:
          marketCategory ??
          resolveMarketCategoryType({
            marketKey: conditionId ?? marketSlug ?? market,
            title: market,
            category,
            tags: undefined,
            outcomes: undefined,
            gameStartTime: eventStartTime,
          }),
      }
    }

    const fallbackCategory =
      marketCategory ??
      resolveMarketCategoryType({
        marketKey: conditionId ?? marketSlug ?? market,
        title: market,
        category,
        tags: undefined,
        outcomes: undefined,
        gameStartTime: eventStartTime,
      })

    const scoreSources: ScoreSources = {}
    const gammaScore = normalizeLegacyScore(liveScore)
    if (gammaScore) scoreSources.gamma = gammaScore

    const computed = deriveBadgeState({
      marketKey: conditionId ?? marketSlug ?? market,
      title: market,
      category,
      tags: undefined,
      outcomes: undefined,
      categoryType: fallbackCategory,
      gammaStartTime: eventStartTime,
      marketStartTime: eventStartTime,
      endDateIso: eventEndTime,
      gammaStatus: eventStatus,
      gammaResolved: liveStatus === "final" || marketIsOpen === false,
      websocketLive: false,
      websocketEnded: liveStatus === "final",
      scoreSources,
      previousState: derivedBadgeStateRef.current,
      cachedGameTime: derivedGameTimeRef.current,
    })

    derivedBadgeStateRef.current = computed.state
    derivedGameTimeRef.current = computed.resolvedGameTime

    return { state: computed.state, categoryType: computed.categoryType }
  }, [
    badgeState,
    category,
    conditionId,
    eventEndTime,
    eventStartTime,
    eventStatus,
    liveScore,
    liveStatus,
    market,
    marketCategory,
    marketIsOpen,
    marketSlug,
  ])

  const resolvedBadgeState = resolvedBadge.state
  const resolvedMarketCategory = resolvedBadge.categoryType
  const isUuid = (value?: string | null) =>
    Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))

  const copiedTraderId = isUuid(trader.id) ? trader.id! : null

  const badgeType = resolvedBadgeState?.type ?? "none"
  const badgeScore =
    (badgeType === "live" || badgeType === "ended") && resolvedBadgeState?.score
      ? resolvedBadgeState.score
      : null
  const badgeBaseClass =
    "h-7 px-2.5 text-[11px] font-semibold border shadow-[0_1px_0_rgba(15,23,42,0.06)]"
  const statusBadgeClass = cn(
    badgeBaseClass,
    badgeType === "live" &&
      "bg-emerald-50 text-emerald-700 border-emerald-200 h-auto min-h-[22px] min-w-[140px] py-0.5 pr-2 pl-2 justify-start",
    badgeType === "ended" && "bg-rose-50 text-rose-700 border-rose-200",
    badgeType === "resolved" && "bg-rose-50 text-rose-700 border-rose-200",
    badgeType === "scheduled" && "bg-amber-50 text-amber-700 border-amber-200",
    badgeType === "none" && "bg-slate-50 text-slate-500 border-slate-200",
  )

  // Stabilize gameTimeInfo - only update when period changes, not on every clock tick
  // Use state so React re-renders when it changes, but only when period changes
  const [stableGameTimeInfo, setStableGameTimeInfo] = useState<string | null>(null)
  const lastPeriodFromTimeRef = useRef<string | null>(null)
  
  useEffect(() => {
    if (gameTimeInfo) {
      // Extract period (e.g., "Q1", "Q2", "P1", "OT") to detect meaningful changes
      const periodMatch = gameTimeInfo.match(/^(Q[1-4]|P[1-3]|OT|I\d+)/);
      const currentPeriod = periodMatch ? periodMatch[1] : null;
      
      // Only update state if period changed or if this is the first time we have gameTimeInfo
      // This prevents re-renders on every clock tick
      if (currentPeriod !== lastPeriodFromTimeRef.current || !stableGameTimeInfo) {
        setStableGameTimeInfo(gameTimeInfo);
        lastPeriodFromTimeRef.current = currentPeriod;
      }
    }
    // Don't clear stableGameTimeInfo if gameTimeInfo becomes null - keep the last known value
    // This prevents flashing when gameTimeInfo temporarily disappears
  }, [gameTimeInfo, stableGameTimeInfo])

  // Build score text with team abbreviations for live badge
  // For crypto markets, use liveScore directly if it contains crypto price info
  const scoreText = useMemo(() => {
    // If liveScore is provided and looks like a crypto price (contains currency symbol or crypto symbol), use it directly
    if (liveScore && typeof liveScore === 'string') {
      const trimmed = liveScore.trim();
      // Check if it's a crypto price format (e.g., "BTC $45,234.56" or contains $)
      if (trimmed.includes('$') || /^[A-Z]{2,5}\s+\$/.test(trimmed)) {
        return trimmed;
      }
      // If it already contains brackets (time info), use it as-is
      if (trimmed.includes('(') && trimmed.includes(')')) {
        return trimmed;
      }
      // If it's not a sports score format (doesn't contain numbers separated by dash or colon), use it
      if (!/^\d+\s*[-:]\s*\d+/.test(trimmed) && trimmed.length > 0) {
        return trimmed;
      }
    }
    
    // For sports scores, use badgeScore
    if (!badgeScore || (badgeScore.home === null && badgeScore.away === null)) {
      return null;
    }
    
    let baseScore: string;
    // For live badge, show team abbreviations if available
    if (badgeType === "live" && (homeTeam || awayTeam)) {
      const homeAbbrev = homeTeam ? abbreviateTeamName(homeTeam) : "HOME";
      const awayAbbrev = awayTeam ? abbreviateTeamName(awayTeam) : "AWAY";
      baseScore = `${awayAbbrev} ${badgeScore.away ?? "-"} - ${badgeScore.home ?? "-"} ${homeAbbrev}`;
    } else {
      // Default format for other badge types
      baseScore = `${badgeScore.home ?? "-"} - ${badgeScore.away ?? "-"}`;
    }
    
    return baseScore;
  }, [badgeScore, badgeType, homeTeam, awayTeam, liveScore])
  
  // Add time to score text using stable version - this prevents flashing
  // Always include time if we have a stable version, even if current prop is null
  const scoreTextWithTime = useMemo(() => {
    if (!scoreText) return scoreText;
    
    // If scoreText already has time in brackets, use it as-is
    if (scoreText.includes('(') && scoreText.includes(')')) {
      return scoreText;
    }
    
    // For live badges, always add stable time if available
    if (badgeType === "live" && stableGameTimeInfo) {
      return `${scoreText} (${stableGameTimeInfo})`;
    }
    
    return scoreText;
  }, [scoreText, badgeType, stableGameTimeInfo])

  const statusLabel =
    badgeType === "live"
      ? "Live"
      : badgeType === "ended"
        ? "Ended"
        : badgeType === "resolved"
          ? "Resolved"
          : "Scheduled"

  // Persist last non-empty score to prevent flicker between polling intervals
  // Only update when score numbers or period changes, not on every clock tick
  const stableScoreRef = useRef<string | null>(null)
  const lastScoreNumbersRef = useRef<string | null>(null)
  const lastPeriodRef = useRef<string | null>(null)
  
  useEffect(() => {
    if (scoreTextWithTime) {
      // Extract score numbers without time (e.g., "VGK 0 - 1 OTT")
      const scoreWithoutTime = scoreTextWithTime.replace(/\s*\([^)]*\)\s*$/, '').trim();
      const scoreMatch = scoreWithoutTime.match(/^([A-Z]{2,5}\s+\d+\s*-\s*\d+\s+[A-Z]{2,5}|\d+\s*-\s*\d+)/);
      const scoreNumbers = scoreMatch ? scoreMatch[0].trim() : scoreWithoutTime;
      
      // Extract period from time part if present (e.g., "Q1", "Q2", "P1", "OT")
      const timeMatch = scoreTextWithTime.match(/\(([^)]+)\)/);
      const timePart = timeMatch ? timeMatch[1] : null;
      const periodMatch = timePart?.match(/^(Q[1-4]|P[1-3]|OT|I\d+)/);
      const currentPeriod = periodMatch ? periodMatch[1] : null;
      
      // Only update if score numbers changed or period changed
      if (scoreNumbers !== lastScoreNumbersRef.current || currentPeriod !== lastPeriodRef.current) {
        stableScoreRef.current = scoreTextWithTime;
        lastScoreNumbersRef.current = scoreNumbers;
        lastPeriodRef.current = currentPeriod;
      }
    } else if (stableScoreRef.current) {
      // Keep the last stable score even if current scoreTextWithTime is null
      // This prevents flashing when scoreTextWithTime temporarily disappears
    }
  }, [scoreTextWithTime])
  
  // Always use stable score if available to prevent flashing
  // Only fall back to current scoreTextWithTime if we don't have a stable value yet
  const displayScoreText = stableScoreRef.current || scoreTextWithTime

  const liveBadgeContent = (
    <div className="flex w-full flex-col items-center justify-center gap-0">
      <span
        className="font-semibold text-xs leading-tight whitespace-nowrap text-center"
        aria-live="polite"
        aria-atomic="true"
      >
        {displayScoreText ?? "—"}
      </span>
      <span className="font-semibold text-[9px] leading-none text-emerald-800 text-center">
        {statusLabel}
      </span>
    </div>
  )

  // Determine time prefix:
  // 1. If sports market → "Starts" (deriveBadgeState uses game_start_time for sports markets)
  // 2. Otherwise → "Resolves"
  const isSportsMarket = resolvedMarketCategory === "SPORTS_SCOREABLE" || resolvedMarketCategory === "SPORTS_NON_SCOREABLE"
  // If it's a sports market, deriveBadgeState will have used game_start_time for finalTime
  // So if isSportsMarket is true and we have a time, it's the start time
  const timePrefix = isSportsMarket ? "Starts" : "Resolves"

  const eventTimeLabel = useMemo(() => {
    // If no time is available, don't show the badge at all (no "Time TBD")
    if (!resolvedBadgeState.time) return null
    const parsed = new Date(resolvedBadgeState.time)
    if (Number.isNaN(parsed.getTime())) return null
    
    // Use local timezone for all formatting
    const formatter = new Intl.DateTimeFormat("en-US", { 
      month: "short", 
      day: "numeric",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    })
    
    // Compare dates in local timezone
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const targetDate = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
    
    // For "Resolves" badge, show only date (no time)
    if (timePrefix === "Resolves") {
      if (targetDate.getTime() === today.getTime()) {
        return `${timePrefix} Today`
      }
      if (targetDate.getTime() === tomorrow.getTime()) {
        return `${timePrefix} Tomorrow`
      }
      return `${timePrefix} ${formatter.format(parsed)}`
    }
    
    // For "Starts" badge, show date and time
    const timeFormatter = new Intl.DateTimeFormat("en-US", { 
      hour: "numeric", 
      minute: "2-digit",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    })
    
    if (targetDate.getTime() === today.getTime()) {
      return `${timePrefix} Today, ${timeFormatter.format(parsed)}`
    }
    if (targetDate.getTime() === tomorrow.getTime()) {
      return `${timePrefix} Tomorrow, ${timeFormatter.format(parsed)}`
    }
    const includeTime = parsed.getHours() !== 0 || parsed.getMinutes() !== 0
    const base = formatter.format(parsed)
    return includeTime ? `${timePrefix} ${base}, ${timeFormatter.format(parsed)}` : `${timePrefix} ${base}`
  }, [resolvedBadgeState.time, timePrefix])

  // Don't show time badge if game is live (only show status badge)
  const showTimeBadge = badgeType !== "none" && eventTimeLabel !== null && badgeType !== "live"
  // Show status badge for live/ended/resolved, or if we have crypto price info
  const hasCryptoPrice = scoreText && typeof scoreText === 'string' && (scoreText.includes('$') || /^[A-Z]{2,5}\s+\$/.test(scoreText.trim()))
  const showStatusBadge =
    badgeType === "live" || badgeType === "ended" || badgeType === "resolved" || hasCryptoPrice

  const statusIconMap = {
    live: SignalHigh,
    ended: Flag,
    resolved: CheckCircle2,
    scheduled: Clock,
    none: CircleDot,
  } as const

  const StatusIcon = statusIconMap[badgeType] || CircleDot

  const orderBookPrice = action === "Buy" ? bestAskPrice : bestBidPrice
  const resolvedLivePrice =
    typeof livePrice === "number" && !Number.isNaN(livePrice) ? livePrice : null
  const marketOpenHint = typeof marketIsOpen === "boolean" ? marketIsOpen : null
  const shouldUseOrderBook =
    badgeType !== "ended" && badgeType !== "resolved" && marketOpenHint !== false
  const currentPrice =
    shouldUseOrderBook && typeof orderBookPrice === "number" && Number.isFinite(orderBookPrice)
      ? orderBookPrice
      : resolvedLivePrice !== null
        ? resolvedLivePrice
        : price
  const hasCurrentPrice = Number.isFinite(currentPrice)
  const priceChange =
    hasCurrentPrice && price > 0 ? ((currentPrice - price) / price) * 100 : 0
  const priceDirection = priceChange > 0 ? 'up' : priceChange < 0 ? 'down' : 'neutral'
  const defaultManualPrice = hasCurrentPrice ? currentPrice : price
  const inferredMarketOpen =
    typeof marketIsOpen === "boolean"
      ? marketIsOpen
      : hasCurrentPrice
        ? currentPrice > 0.01 && currentPrice < 0.99
        : null
  const isMarketEnded = badgeType === "ended" || badgeType === "resolved" || inferredMarketOpen === false

  const espnLink = espnUrl?.trim() ? espnUrl : undefined
  const showTraderPositionBadge = Boolean(traderPositionBadge?.trades?.length)
  const showUserPositionBadge = Boolean(userPositionBadge?.trades?.length)
  const hasAnyPositionBadge = showTraderPositionBadge || showUserPositionBadge
  const activePositionBadge =
    positionDrawerTab === "user" ? userPositionBadge : traderPositionBadge
  const traderHedgingInfo = useMemo(() => {
    const trades = traderPositionBadge?.trades ?? []
    if (trades.length === 0) {
      return {
        isHedging: false,
        longerOutcome: null as string | null,
        diff: 0,
        percent: 0,
        basis: "contracts" as "contracts" | "usd",
        isEven: false,
      }
    }

    const buyOutcomes = new Set<string>()
    const outcomeData = new Map<
      string,
      {
        label: string
        netContracts: number
        netAmount: number
        hasSize: boolean
        hasAmount: boolean
      }
    >()

    trades.forEach((trade) => {
      const rawOutcome = trade.outcome?.trim() || "Unknown"
      const outcomeKey = rawOutcome.toLowerCase()
      const direction = trade.side === "SELL" ? -1 : 1
      const existing = outcomeData.get(outcomeKey) ?? {
        label: rawOutcome,
        netContracts: 0,
        netAmount: 0,
        hasSize: false,
        hasAmount: false,
      }

      if (trade.side === "BUY") {
        buyOutcomes.add(outcomeKey)
      }
      if (Number.isFinite(trade.size ?? NaN)) {
        existing.netContracts += (trade.size ?? 0) * direction
        existing.hasSize = true
      }
      if (Number.isFinite(trade.amountUsd ?? NaN)) {
        existing.netAmount += (trade.amountUsd ?? 0) * direction
        existing.hasAmount = true
      }

      outcomeData.set(outcomeKey, existing)
    })

    const isHedging = buyOutcomes.size >= 2
    if (!isHedging) {
      return {
        isHedging: false,
        longerOutcome: null,
        diff: 0,
        percent: 0,
        basis: "contracts" as "contracts" | "usd",
        isEven: false,
      }
    }

    const entries = Array.from(outcomeData.values())
    const sizeOutcomeCount = entries.filter((entry) => entry.hasSize).length
    const amountOutcomeCount = entries.filter((entry) => entry.hasAmount).length
    const basis: "contracts" | "usd" = sizeOutcomeCount >= 2 ? "contracts" : "usd"
    const values = entries
      .map((entry) => ({
        label: entry.label,
        value: basis === "contracts" ? entry.netContracts : entry.netAmount,
      }))
      .filter((entry) => Number.isFinite(entry.value ?? NaN))

    if (values.length < 2) {
      return {
        isHedging: true,
        longerOutcome: null,
        diff: 0,
        percent: 0,
        basis,
        isEven: true,
      }
    }

    const sorted = [...values].sort(
      (a, b) => Math.abs(b.value) - Math.abs(a.value)
    )
    const top = sorted[0]
    const totalAbs = sorted.reduce((acc, entry) => acc + Math.abs(entry.value), 0)
    if (!Number.isFinite(totalAbs) || totalAbs <= 0) {
      return {
        isHedging: true,
        longerOutcome: null,
        diff: 0,
        percent: 0,
        basis,
        isEven: true,
      }
    }

    const otherAbs = totalAbs - Math.abs(top.value)
    const diff = Math.abs(top.value) - otherAbs
    const percent = diff > 0 ? (diff / totalAbs) * 100 : 0
    const isEven = diff <= 0.0001

    return {
      isHedging: true,
      longerOutcome: top.label,
      diff: diff > 0 ? diff : 0,
      percent,
      basis,
      isEven,
    }
  }, [traderPositionBadge?.trades])

  useEffect(() => {
    if (userUpdatedSlippageRef.current) return
    setSlippagePreset(resolvedDefaultSlippage)
  }, [resolvedDefaultSlippage])

  useEffect(() => {
    if (!canUseAutoClose) {
      setAutoClose(false)
    } else if (!prevCanUseAutoCloseRef.current) {
      setAutoClose(true)
    }
    prevCanUseAutoCloseRef.current = canUseAutoClose
  }, [canUseAutoClose])

  useEffect(() => {
    const target = cardRef.current
    if (!target) return
    const observer = new IntersectionObserver(
      (entries) => {
        setIsInView(entries[0]?.isIntersecting ?? true)
      },
      { threshold: 0.3 }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!showConfirmation) {
      setNotificationPending(false)
      setNotificationSent(false)
    }
  }, [showConfirmation])

  const handleSlippagePresetChange = (value: number | 'custom') => {
    userUpdatedSlippageRef.current = true
    setSlippagePreset(value)
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value)

  const formatByStep = (value: number, step: number | null) => {
    if (!Number.isFinite(value)) return "--"
    if (!step || !Number.isFinite(step) || step <= 0) return formatNumber(value)
    const decimals = getStepDecimals(step)
    const quantized = decimals === 0 ? Math.round(value) : Math.round(value / step) * step
    const normalized = decimals === 0 ? Math.round(quantized) : Number(quantized.toFixed(decimals))
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    }).format(normalized)
  }

  const contractStep = 0.0001
  const contractDecimals = 2
  const formatContracts = (value: number) => {
    if (!Number.isFinite(value)) return "--"
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: value % 1 === 0 ? 0 : 1,
      maximumFractionDigits: 1,
    }).format(value)
  }

  const roundPriceToTickSize = (price: number, tickSize?: number | null) => {
    if (!Number.isFinite(price)) return price
    const step =
      tickSize && Number.isFinite(tickSize) && tickSize > 0 ? tickSize : 0.01
    const rounded = roundDownToStep(price, step)
    if (!Number.isFinite(rounded)) return price
    const decimals = getStepDecimals(step)
    return Number(rounded.toFixed(decimals))
  }

  const ceilToStep = (value: number, step: number) => {
    if (!Number.isFinite(value) || step <= 0) return value
    return Math.ceil(value / step) * step
  }

  const formatPrice = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "—"
    const fixed = value.toFixed(4)
    const trimmed = fixed.replace(/\.?0+$/, "")
    return `$${trimmed}`
  }

  const formatInputValue = (value: number, decimals: number) => {
    const fixed = value.toFixed(decimals)
    return fixed.replace(/\.?0+$/, "")
  }

  const formatContractsDisplay = (value: number | null, decimals = contractDecimals) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return "—"
    const trimmed = formatInputValue(value, decimals)
    const [whole, fraction] = trimmed.split(".")
    const withCommas = Number(whole).toLocaleString("en-US")
    return fraction ? `${withCommas}.${fraction}` : withCommas
  }

  const countDecimalPlaces = (value: number) => {
    if (!Number.isFinite(value)) return 0
    const normalized = Number(value.toFixed(10))
    if (!Number.isFinite(normalized)) return 0
    const text = normalized.toString()
    if (!text.includes(".")) return 0
    return text.split(".")[1].length
  }

  const ensureImpliedAmountPrecision = (
    price: number,
    size: number,
    minSize: number,
    step = 0.01,
    maxDecimals = 2
  ) => {
    if (!price || !Number.isFinite(price) || !Number.isFinite(size) || size <= 0) return null
    let candidate = size
    const lowerBound = Math.max(minSize, 0)
    let iterations = 0
    
    // Always round DOWN for safety in frontend
    // Backend will handle small upward adjustments if needed
    while (iterations < 200) {
      const implied = Number((price * candidate).toFixed(10))
      if (countDecimalPlaces(implied) <= maxDecimals) {
        return Number(candidate.toFixed(2))
      }
      const next = Number((candidate - step).toFixed(10))
      if (next < lowerBound) break
      candidate = next
      iterations++
    }
    if (candidate < lowerBound) return null
    const implied = Number((price * candidate).toFixed(10))
    if (countDecimalPlaces(implied) > maxDecimals) return null
    return Number(candidate.toFixed(2))
  }

  const finalizeContractsForOrder = (
    desiredContracts: number,
    minContracts: number,
    price: number | null
  ) => {
    if (!price || !Number.isFinite(price)) return null
    const step = 0.01
    const baseline = Math.max(desiredContracts, minContracts)
    let candidate = roundUpToStep(baseline, step)
    const precise = ensureImpliedAmountPrecision(price, candidate, minContracts, step, 2)
    if (precise !== null) return precise
    const implied = Number((price * candidate).toFixed(10))
    if (countDecimalPlaces(implied) <= 2 && candidate >= minContracts) {
      return Number(candidate.toFixed(2))
    }
    return null
  }

  const parseBookPrice = (entries: Array<any> | undefined, side: "bid" | "ask") => {
    if (!Array.isArray(entries)) return null
    let best: number | null = null
    for (const entry of entries) {
      let price: number | null = null
      if (Array.isArray(entry)) {
        price = Number(entry[0])
      } else if (entry && typeof entry === "object") {
        price = Number((entry as any).price ?? (entry as any).p ?? (entry as any)[0])
      }
      if (price === null || !Number.isFinite(price)) continue
      if (best === null) {
        best = price
        continue
      }
      if (side === "bid" ? price > best : price < best) {
        best = price
      }
    }
    return best
  }

  const computeBufferPrice = (price: number | null, slippagePercent: number) => {
    if (!price || !Number.isFinite(price) || price <= 0) return null
    const buffer = price * (1 - slippagePercent / 100)
    return Number.isFinite(buffer) && buffer > 0 ? buffer : price
  }

  const getMinContractsForUsd = (
    price: number | null,
    slippagePercent: number,
    minUsd = 1
  ) => {
    const bufferPrice = computeBufferPrice(price, slippagePercent)
    if (!bufferPrice) return null
    const rawContracts = minUsd / bufferPrice
    if (!Number.isFinite(rawContracts) || rawContracts <= 0) return null
    return roundUpToStep(rawContracts, 0.1)
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

  const formatPositionQuantity = (trade: PositionTradeSummary) => {
    if (Number.isFinite(trade.size ?? NaN)) {
      return formatContracts(trade.size ?? 0)
    }
    if (Number.isFinite(trade.amountUsd ?? NaN)) {
      return formatCurrency(trade.amountUsd ?? 0)
    }
    return "--"
  }

  const handlePositionBadgeClick = () => {
    if (!hasAnyPositionBadge) return
    if (isPositionDrawerOpen) {
      setIsPositionDrawerOpen(false)
      return
    }
    const preferredTab = showUserPositionBadge ? "user" : "trader"
    setPositionDrawerTab(preferredTab)
    setIsPositionDrawerOpen(true)
  }

  const formatPositionTimestamp = (timestamp?: number | null) => {
    if (!timestamp || !Number.isFinite(timestamp)) return null
    const formatted = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(timestamp))
    return formatted
  }

  const tradeCardPosition: PositionTradeSummary | null = useMemo(() => {
    const normalizedSide = action === "Sell" ? "SELL" : "BUY"
    const amountUsd = Number.isFinite(size * price) ? Number((size * price).toFixed(4)) : null
    return {
      side: normalizedSide,
      outcome: position,
      size: Number.isFinite(size) ? size : null,
      price: Number.isFinite(price) ? price : null,
      amountUsd,
      timestamp: Number.isFinite(tradeTimestampMs ?? NaN) ? tradeTimestampMs : null,
    }
  }, [action, position, price, size, tradeTimestampMs])

  const isSameTradePosition = (
    a: PositionTradeSummary | null | undefined,
    b: PositionTradeSummary | null | undefined
  ) => {
    if (!a || !b) return false
    if (a.side !== b.side) return false
    const normalize = (value: string) => value?.trim().toLowerCase()
    const outcomeMatch = normalize(a.outcome) === normalize(b.outcome)
    if (!outcomeMatch) return false
    const sizeMatch =
      Number.isFinite(a.size ?? NaN) && Number.isFinite(b.size ?? NaN)
        ? Math.abs((a.size ?? 0) - (b.size ?? 0)) < 0.0001
        : true
    const priceMatch =
      Number.isFinite(a.price ?? NaN) && Number.isFinite(b.price ?? NaN)
        ? Math.abs((a.price ?? 0) - (b.price ?? 0)) < 0.0001
        : true
    const timestampMatch =
      Number.isFinite(a.timestamp ?? NaN) && Number.isFinite(b.timestamp ?? NaN)
        ? Math.abs((a.timestamp ?? 0) - (b.timestamp ?? 0)) <= 2000
        : true
    return sizeMatch && priceMatch && timestampMatch
  }

  const ensureTradeIncluded = (
    trades: PositionTradeSummary[],
    target: PositionTradeSummary | null
  ) => {
    if (!target) return trades
    const exists = trades.some((trade) => isSameTradePosition(trade, target))
    if (exists) return trades
    return [target, ...trades]
  }

  const renderPositionDrawer = () => {
    if (!isPositionDrawerOpen || !activePositionBadge) return null
    const baseTrades = activePositionBadge.trades ?? []
    const shouldHighlightTrade = activePositionBadge.variant === "trader"
    const trades =
      shouldHighlightTrade && tradeCardPosition
        ? ensureTradeIncluded(baseTrades, tradeCardPosition)
        : baseTrades
    if (trades.length === 0) return null
    const visibleTrades = trades
    const isUserTab = positionDrawerTab === "user"
    let netContracts = 0
    let netAmount = 0
    let hasContractData = false
    let hasAmountData = false
    let hasSellTrades = false
    trades.forEach((trade) => {
      const size = Number.isFinite(trade.size ?? NaN) ? (trade.size ?? 0) : null
      const amount = Number.isFinite(trade.amountUsd ?? NaN) ? (trade.amountUsd ?? 0) : null
      const direction = trade.side === "SELL" ? -1 : 1
      if (trade.side === "SELL") {
        hasSellTrades = true
      }
      if (size !== null) {
        netContracts += size * direction
        hasContractData = true
      }
      if (amount !== null) {
        netAmount += amount * direction
        hasAmountData = true
      }
    })
    const totalAmountLabel = hasAmountData ? formatCurrency(netAmount) : "--"
    const avgPriceLabel =
      hasAmountData && hasContractData && netContracts !== 0
        ? formatPrice(Math.abs(netAmount / netContracts))
        : "--"
    const traderPositionsCount = traderPositionBadge?.trades?.length ?? 0
    const userPositionsCount = userPositionBadge?.trades?.length ?? 0
    const showHedgingDetails = traderHedgingInfo.isHedging && !isUserTab
    const hedgingDiffLabel =
      traderHedgingInfo.basis === "contracts"
        ? `${formatContracts(traderHedgingInfo.diff)} contracts`
        : formatCurrency(traderHedgingInfo.diff)
    const hedgingPercentLabel = `${traderHedgingInfo.percent.toFixed(1)}%`
    const tabOptions = [
      {
        key: "trader" as const,
        label: traderPositionsCount === 1 ? "Traders' Position" : "Traders' Positions",
        enabled: showTraderPositionBadge,
      },
      {
        key: "user" as const,
        label: userPositionsCount === 1 ? "Your Position" : "Your Positions",
        enabled: showUserPositionBadge,
      },
    ].filter((option) => option.enabled)

    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {tabOptions.length > 1 ? (
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
              {tabOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPositionDrawerTab(option.key)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                    positionDrawerTab === option.key
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-700"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold text-white">
              {tabOptions[0]?.label}
            </span>
          )}
          <div className="flex items-center gap-2">
            {showHedgingDetails ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="secondary"
                      className={cn(
                        badgeBaseClass,
                        "h-6 px-2 text-[11px] font-semibold bg-yellow-50 text-yellow-700 border-yellow-200"
                      )}
                    >
                      <ArrowLeftRight className="h-3 w-3" />
                      Trader Hedging
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[220px] text-xs">
                    Trader has bought multiple outcomes in this market to reduce directional risk.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        </div>
        <div className="mt-2 space-y-2">
          {visibleTrades.map((trade, index) => {
            const sideLabel = trade.side === "SELL" ? "Sell" : "Buy"
            const sideClass = trade.side === "SELL" ? "text-rose-600" : "text-emerald-600"
            const quantityLabel = formatPositionQuantity(trade)
            const contractsLabel =
              Number.isFinite(trade.size ?? NaN) ? formatContracts(trade.size ?? 0) : "--"
            const amountLabel =
              Number.isFinite(trade.amountUsd ?? NaN) ? formatCurrency(trade.amountUsd ?? 0) : "--"
            const priceLabel =
              Number.isFinite(trade.price ?? NaN) ? formatPrice(trade.price ?? null) : null
            const detailLabel = priceLabel ? `${quantityLabel} @ ${priceLabel}` : quantityLabel
            const timestampLabel = formatPositionTimestamp(trade.timestamp)
            const investedLabel =
              Number.isFinite(trade.amountUsd ?? NaN)
                ? formatCurrency(trade.amountUsd ?? 0)
                : "--"
            const outcomeBadgeClass = (() => {
              const normalized = trade.outcome?.trim().toLowerCase()
              if (normalized === "yes") return "bg-emerald-50 text-emerald-700 border-emerald-200"
              if (normalized === "no") return "bg-red-50 text-red-700 border-red-200"
              return "bg-slate-100 text-slate-600 border-slate-200"
            })()
            const primaryDetail = isUserTab
              ? amountLabel !== "--"
                ? priceLabel
                  ? `${amountLabel} @ ${priceLabel}`
                  : amountLabel
                : detailLabel
              : detailLabel
            const secondaryDetail = isUserTab
              ? contractsLabel !== "--"
                ? `${contractsLabel} contracts`
                : "--"
              : investedLabel
            const isHighlightedTrade =
              shouldHighlightTrade && tradeCardPosition
                ? isSameTradePosition(trade, tradeCardPosition)
                : false
            return (
              <div
                key={`${trade.side}-${trade.outcome}-${trade.timestamp ?? index}`}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-slate-700">
                    {isHighlightedTrade ? (
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
                    ) : null}
                    <span className={cn("font-semibold", sideClass)}>{sideLabel}</span>
                    <Badge
                      variant="secondary"
                      className={`font-semibold text-xs ${outcomeBadgeClass}`}
                    >
                      {formatOutcomeLabel(trade.outcome)}
                    </Badge>
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {timestampLabel ?? "--"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-slate-500">{primaryDetail}</p>
                  <p className="text-[11px] text-slate-400">{secondaryDetail}</p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex items-end justify-between gap-3 border-t border-slate-200 pt-2">
          <div className="text-[11px] font-semibold text-slate-500">
            Total{hasSellTrades ? " (Buys - Sells)" : ""}
            <div className="text-sm font-semibold text-slate-700">{totalAmountLabel}</div>
            <div className="text-[11px] font-medium text-slate-400">
              Ave Price {avgPriceLabel}
            </div>
            {showHedgingDetails ? (
              <div className="text-[11px] font-medium text-slate-500">
                {traderHedgingInfo.isEven || !traderHedgingInfo.longerOutcome ? (
                  "Evenly hedged across outcomes"
                ) : (
                  <>
                    Longer on{" "}
                    <span className="font-semibold text-slate-700">
                      {formatOutcomeLabel(traderHedgingInfo.longerOutcome)}
                    </span>{" "}
                    by {hedgingDiffLabel} ({hedgingPercentLabel})
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
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

  const extractTokenId = (token: any): string | null => {
    if (!token) return null
    const candidates = [
      token?.token_id,
      token?.tokenId,
      token?.tokenID,
      token?.asset_id,
      token?.assetId,
      token?.asset,
    ]
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) continue
      const value = typeof candidate === "number" ? candidate.toString() : String(candidate).trim()
      if (value) return value
    }
    return null
  }

  const findTokenIdForOutcome = (tokens: any[], outcomeLabel: string): string | null => {
    if (!Array.isArray(tokens) || !outcomeLabel) return null
    const exactMatch = tokens.find(
      (t: any) =>
        typeof t?.outcome === "string" &&
        t.outcome.trim().toUpperCase() === outcomeLabel.trim().toUpperCase()
    )
    const exactMatchId = extractTokenId(exactMatch)
    if (exactMatchId) return exactMatchId

    const outcomes = tokens
      .map((t: any) => (typeof t?.outcome === "string" ? t.outcome : ""))
      .filter(Boolean)
    const outcomeIndex = outcomes.length ? findOutcomeIndex(outcomes, outcomeLabel) : -1
    if (outcomeIndex >= 0 && tokens[outcomeIndex]) {
      const fuzzyId = extractTokenId(tokens[outcomeIndex])
      if (fuzzyId) return fuzzyId
    }
    return null
  }

  const triggerPriceFlash = useCallback((direction: "up" | "down" | "neutral") => {
    if (priceFlashTimeoutRef.current) {
      clearTimeout(priceFlashTimeoutRef.current)
    }
    setPriceFlash(direction)
    priceFlashTimeoutRef.current = setTimeout(() => {
      setPriceFlash(null)
    }, 650)
  }, [])

  useEffect(() => {
    if (typeof currentMarketPrice === "number" && !Number.isNaN(currentMarketPrice)) {
      setLivePrice(currentMarketPrice)
    }
  }, [currentMarketPrice])

  useEffect(() => {
    if (typeof currentMarketUpdatedAt !== "number") return
    if (lastMarketUpdateRef.current === null) {
      lastMarketUpdateRef.current = currentMarketUpdatedAt
      if (typeof currentMarketPrice === "number" && Number.isFinite(currentMarketPrice)) {
        previousMarketPriceRef.current = currentMarketPrice
      }
      return
    }
    if (currentMarketUpdatedAt === lastMarketUpdateRef.current) return
    lastMarketUpdateRef.current = currentMarketUpdatedAt

    const nextPrice =
      typeof currentMarketPrice === "number" && Number.isFinite(currentMarketPrice)
        ? currentMarketPrice
        : null
    if (nextPrice === null) return

    const prevPrice = previousMarketPriceRef.current
    let direction: "up" | "down" | "neutral" = "neutral"
    if (typeof prevPrice === "number" && Number.isFinite(prevPrice) && nextPrice !== prevPrice) {
      direction = nextPrice > prevPrice ? "up" : "down"
    }
    triggerPriceFlash(direction)
    previousMarketPriceRef.current = nextPrice
  }, [currentMarketPrice, currentMarketUpdatedAt, triggerPriceFlash])

  useEffect(() => {
    return () => {
      if (priceFlashTimeoutRef.current) {
        clearTimeout(priceFlashTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setLocalCopied(isCopied)
  }, [isCopied])

  useEffect(() => {
    if (!hasAnyPositionBadge && isPositionDrawerOpen) {
      setIsPositionDrawerOpen(false)
      return
    }
    if (
      positionDrawerTab === "user" &&
      !showUserPositionBadge &&
      showTraderPositionBadge
    ) {
      setPositionDrawerTab("trader")
    }
    if (
      positionDrawerTab === "trader" &&
      !showTraderPositionBadge &&
      showUserPositionBadge
    ) {
      setPositionDrawerTab("user")
    }
  }, [
    hasAnyPositionBadge,
    isPositionDrawerOpen,
    positionDrawerTab,
    showTraderPositionBadge,
    showUserPositionBadge,
  ])

  useEffect(() => {
    if (!isExpanded) return
    if (tokenId) return
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
        if (!Number.isFinite(nextPrice) || nextPrice < 0) return
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
    if (!isExpanded || !tokenId) return
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null
    let inFlight = false

    setOrderBookError(null)
    setOrderBookLoading(true)
    setBestBidPrice(null)
    setBestAskPrice(null)
    setMarketTickSize(null)

    const fetchBook = async (showLoading: boolean) => {
      if (cancelled || inFlight) return
      inFlight = true
      if (showLoading) {
        setOrderBookLoading(true)
      }
      try {
        const res = await fetch(`/api/polymarket/book?token_id=${encodeURIComponent(tokenId)}`, {
          cache: "no-store",
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.error || "Order book lookup failed.")
        }
        if (cancelled) return

        const bids = Array.isArray(data?.bids) ? data.bids : []
        const asks = Array.isArray(data?.asks) ? data.asks : []
        const bestBid = parseBookPrice(bids, "bid")
        const bestAsk = parseBookPrice(asks, "ask")
        const parsedTick = Number(data?.tick_size)

        setBestBidPrice(Number.isFinite(bestBid ?? NaN) ? bestBid : null)
        setBestAskPrice(Number.isFinite(bestAsk ?? NaN) ? bestAsk : null)
        setMarketTickSize(Number.isFinite(parsedTick) ? parsedTick : null)
        if (Number.isFinite(bestAsk ?? NaN) || Number.isFinite(bestBid ?? NaN)) {
          setLivePrice(action === "Buy" ? bestAsk : bestBid)
        }
      } catch (error: any) {
        if (!cancelled) {
          setOrderBookError(error?.message || "Order book lookup failed.")
        }
      } finally {
        inFlight = false
        if (!cancelled && showLoading) {
          setOrderBookLoading(false)
        }
      }
    }

    fetchBook(true)
    intervalId = setInterval(() => fetchBook(false), 250)

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [action, isExpanded, tokenId])

  useEffect(() => {
    if (!isExpanded || !conditionId || tokenId) return
    let cancelled = false

    const fetchMarketConstraints = async () => {
      try {
        const response = await fetch(`/api/polymarket/market?conditionId=${conditionId}`)
        if (!response.ok) return
        const data = await response.json()
        const tick = typeof data?.tickSize === 'number' ? data.tickSize : null
        if (!cancelled) {
          setMarketTickSize(tick)
        }
      } catch {
        if (!cancelled) {
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

  const defaultSlippagePercent = resolvedDefaultSlippage
  const minTradeUsd = 1
  const slippagePercent =
    slippagePreset === "custom" ? Number(customSlippage) : Number(slippagePreset)
  const resolvedSlippage =
    Number.isFinite(slippagePercent) && slippagePercent >= 0 ? slippagePercent : defaultSlippagePercent
  const rawLimitPrice =
    Number.isFinite(currentPrice) && currentPrice > 0
      ? action === "Buy"
        ? currentPrice * (1 + resolvedSlippage / 100)
        : currentPrice * (1 - resolvedSlippage / 100)
      : null
  const limitPrice =
    rawLimitPrice && Number.isFinite(rawLimitPrice)
      ? roundPriceToTickSize(rawLimitPrice, marketTickSize)
      : null
  const amountValue = Number.parseFloat(amountInput)
  const hasAmountInput = amountInput.trim().length > 0
  const parsedAmountValue =
    Number.isFinite(amountValue) && amountValue > 0 ? amountValue : null
  const contractsSizing =
    amountMode === "usd"
      ? normalizeContractsFromUsd(parsedAmountValue, limitPrice, null, null)
      : normalizeContractsInput(parsedAmountValue, null, null)
  const rawContractsValue = hasAmountInput ? contractsSizing.contracts : null
  const minContractsForBuffer = getMinContractsForUsd(limitPrice, resolvedSlippage, minTradeUsd)
  const minContractsForOrder =
    minContractsForBuffer !== null && limitPrice
      ? finalizeContractsForOrder(minContractsForBuffer, minContractsForBuffer, limitPrice)
      : null
  const minUsdForOrder =
    minContractsForOrder !== null && limitPrice ? minContractsForOrder * limitPrice : minTradeUsd
  const enforcedContracts =
    rawContractsValue === null
      ? null
      : minContractsForBuffer !== null
        ? Math.max(rawContractsValue, minContractsForBuffer)
        : rawContractsValue
  const [frozenOrder, setFrozenOrder] = useState<{ price: number; contracts: number } | null>(null)
  const displayContracts = frozenOrder?.contracts ?? enforcedContracts
  const displayPrice = frozenOrder?.price ?? limitPrice
  const estimatedMaxCost =
    displayContracts !== null && displayContracts !== undefined && displayPrice !== null
      ? displayContracts * displayPrice
      : null
  const contractsValue = displayContracts
  const isBelowMinUsd =
    amountMode === "usd"
      ? hasAmountInput && parsedAmountValue !== null && parsedAmountValue < minUsdForOrder
      : hasAmountInput &&
          (minContractsForOrder ?? minContractsForBuffer) !== null &&
          (rawContractsValue ?? 0) < (minContractsForOrder ?? minContractsForBuffer!)
  const minUsdLabel = formatInputValue(minUsdForOrder, 2)
  const minUsdErrorMessage =
    isBelowMinUsd ? `Minimum order is $${minUsdLabel}.` : null
  const traderSize = Number.isFinite(size) && size > 0 ? size : 0
  const sizePercent =
    traderSize > 0 && contractsValue ? (contractsValue / traderSize) * 100 : null
  const sizePercentLabel = sizePercent !== null ? `${sizePercent.toFixed(0)}%` : "--%"
  const contractLabel = displayContracts === 1 ? "contract" : "contracts"
  const statusDataRef = useRef<any | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollAbortRef = useRef<AbortController | null>(null)
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timeoutTriggeredRef = useRef(false)

  useEffect(() => {
    statusPhaseRef.current = statusPhase
  }, [statusPhase])

  useEffect(() => {
    if (!showConfirmation) return
    if (statusPhase === 'filled' && previousStatusRef.current !== 'filled') {
      setCelebrationKey((prev) => prev + 1)
      setShowFilledCelebration(true)
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current)
      }
      celebrationTimerRef.current = setTimeout(() => {
        setShowFilledCelebration(false)
      }, CELEBRATION_MS)
    }
    previousStatusRef.current = statusPhase
  }, [statusPhase, showConfirmation])

  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current)
      }
    }
  }, [])

  const hasInFlightTrade =
    isSubmitting || (showConfirmation && !TERMINAL_STATUS_PHASES.has(statusPhase))

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

  const handleAmountChange = useCallback((value: string) => {
    setFrozenOrder(null)
    setAmountInput(value)
  }, [])

  const handleSwitchToContracts = useCallback(() => {
    if (!amountInput.trim()) return
    setAmountMode("contracts")
    if (contractsValue && contractsValue > 0) {
      setAmountInput(formatInputValue(contractsValue, contractDecimals))
    }
  }, [amountInput, contractDecimals, contractsValue])

  const handleSwitchToUsd = useCallback(() => {
    if (!amountInput.trim()) return
    setAmountMode("usd")
    if (estimatedMaxCost && estimatedMaxCost > 0) {
      setAmountInput(formatInputValue(estimatedMaxCost, 2))
    }
  }, [amountInput, estimatedMaxCost])

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
      if (statusPhaseRef.current === 'timed_out') return
      inFlight = true
      try {
        if (pollAbortRef.current) {
          pollAbortRef.current.abort()
        }
        const controller = new AbortController()
        pollAbortRef.current = controller
        const res = await fetch(`/api/polymarket/orders/${encodeURIComponent(orderId)}/status`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const data = await res.json()
        if ((statusPhaseRef.current as StatusPhase) === 'timed_out') return
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
          const totalSize =
            typeof data?.size === 'number' ? data.size : null
          
          // Determine if order is filled, partially filled, or canceled
          if (filledSize !== null && filledSize > 0) {
            if (totalSize !== null && filledSize < totalSize) {
              // Has fills but not all - partially filled
              phase = 'partial'
            } else if (remainingSize !== null && remainingSize <= 0) {
              // Fully filled (no remaining)
              phase = 'filled'
            }
          } else if (phase === 'filled' && (!filledSize || filledSize <= 0)) {
            // Marked as filled but no actual fills - treat as canceled
            phase = 'canceled'
          }
          setStatusPhase(phase)
          if (TERMINAL_STATUS_PHASES.has(phase) && intervalId) {
            clearInterval(intervalId)
            intervalId = null
            pollIntervalRef.current = null
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return
        }
        setStatusError(err?.message || 'Network error')
      } finally {
        inFlight = false
      }
    }

    poll()
    intervalId = setInterval(poll, 200)
    pollIntervalRef.current = intervalId

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      if (pendingTimer) clearTimeout(pendingTimer)
      pollIntervalRef.current = null
      if (pollAbortRef.current) {
        pollAbortRef.current.abort()
        pollAbortRef.current = null
      }
    }
  }, [orderId, showConfirmation])

  const refreshOrders = useCallback(async () => {
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
  }, [])

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
      if (!contractsValue || contractsValue <= 0) {
        setSubmitError('Enter an amount to send.')
        setIsSubmitting(false)
        return
      }
      if (isBelowMinUsd) {
        setSubmitError(minUsdErrorMessage ?? 'Minimum trade is $1 at current price.')
        setIsSubmitting(false)
        return
      }
      if (!limitPrice || limitPrice <= 0) {
        setSubmitError('Live price unavailable. Try again in a moment.')
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
            const tokens = Array.isArray(marketData.tokens) ? marketData.tokens : []
            const matchedTokenId = findTokenIdForOutcome(tokens, position)
            if (matchedTokenId) {
              finalTokenId = matchedTokenId
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
      setCancelStatus(null)
      showedConfirmation = true

      const targetToSend = Math.max(contractsValue ?? 0, minContractsForBuffer ?? 0)
      const minContracts = minContractsForBuffer ?? 0
      const finalContracts =
        targetToSend > 0 ? finalizeContractsForOrder(targetToSend, minContracts, limitPrice) : null
      if (!finalContracts) {
        setSubmitError('Order amount invalid. Try increasing the size or lowering slippage.')
        setIsSubmitting(false)
        return
      }
      if (limitPrice && finalContracts * limitPrice < minUsdForOrder) {
        setSubmitError(`Minimum trade is $${minUsdLabel} at current price.`)
        setIsSubmitting(false)
        return
      }
      setFrozenOrder({ price: limitPrice, contracts: finalContracts })

      const requestId =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random().toString(16).slice(2)}`
      const usdInputValue =
        amountMode === 'usd'
          ? parsedAmountValue
          : displayContracts !== null && displayPrice !== null
            ? displayContracts * displayPrice
            : null
      const contractsInputValue =
        amountMode === 'contracts' ? parsedAmountValue : displayContracts ?? null
      const requestedContracts = rawContractsValue
      const autoCorrectAppliedValue =
        requestedContracts !== null &&
        Math.abs(finalContracts - requestedContracts) > Number.EPSILON
      const bestBidSnapshot = Number.isFinite(bestBidPrice ?? NaN) ? bestBidPrice : null
      const bestAskSnapshot = Number.isFinite(bestAskPrice ?? NaN) ? bestAskPrice : null

      // Execute the trade via API
      const requestBody = {
        tokenId: finalTokenId,
        price: limitPrice,
        amount: finalContracts,
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
        amountInvested: estimatedMaxCost ?? undefined,
        outcome: position,
        autoCloseOnTraderClose: canUseAutoClose ? autoClose : false,
        slippagePercent: resolvedSlippage,
        orderIntentId,
        conditionId,
        inputMode: amountMode,
        usdInput: usdInputValue,
        contractsInput: contractsInputValue,
        autoCorrectApplied: autoCorrectAppliedValue,
        bestBid: bestBidSnapshot,
        bestAsk: bestAskSnapshot,
        minOrderSize: minContractsForOrder ?? null,
      }
      
      console.log('🚀 Sending trade request:', requestBody)
      
      const response = await fetch('/api/polymarket/orders/place', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify(requestBody),
      })

      let data: any
      try {
        data = await response.json()
      } catch (parseError) {
        console.error('Failed to parse response as JSON:', parseError)
        const errorInfo = resolveTradeErrorInfo(
          parseError,
          `Server returned ${response.status}: ${response.statusText}`
        )
        setConfirmationError(errorInfo)
        setStatusPhase('rejected')
        setIsSubmitting(false)
        return
      }

      // SECURITY: Removed - do not log full API response (may contain secrets)
      // Use browser DevTools Network tab for debugging instead

      if (!response.ok) {
        const errorInfo = resolveTradeErrorInfo(
          data,
          data?.message || 'Failed to execute trade'
        )
        setConfirmationError(errorInfo)
        setStatusPhase('rejected')
        setIsSubmitting(false)
        return
      }

      const resolvedOrderId =
        data?.orderId ||
        data?.orderID ||
        data?.order_id ||
        data?.order_hash ||
        data?.orderHash ||
        data?.raw?.orderID ||
        data?.raw?.orderId ||
        data?.raw?.order_id ||
        data?.raw?.order_hash ||
        data?.raw?.orderHash ||
        null
      const normalizedOrderId =
        resolvedOrderId !== null && resolvedOrderId !== undefined
          ? String(resolvedOrderId).trim()
          : null

      if (!normalizedOrderId) {
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
      setOrderId(normalizedOrderId)
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

  const openManualDrawer = () => {
    setManualPriceInput(defaultManualPrice.toString())
    setManualUsdAmount("")
    setManualDrawerOpen(true)
  }

  const hasConnectedWallet = Boolean(walletAddress)
  const isPremiumWithoutWallet = Boolean(isPremium) && !hasConnectedWallet
  const allowManualExperience = !isPremium || (isPremiumWithoutWallet && manualTradingEnabled)
  const showQuickCopyExperience = Boolean(isPremium) && hasConnectedWallet
  const showLinkWalletHint = isPremiumWithoutWallet && manualTradingEnabled
  const isSellTrade = action === "Sell"
  const shouldShowInsightsSection =
    traderHedgingInfo.isHedging || isSellTrade || hasAnyPositionBadge
  const normalizedPosition = normalizeOutcome(position)
  const userHasMatchingPosition = Boolean(
    normalizedPosition &&
      userPositionBadge?.trades?.some(
        (trade) => normalizeOutcome(trade.outcome) === normalizedPosition
      )
  )
  const showCopyBuyCta = isSellTrade && !userHasMatchingPosition
  const shouldShowCopyCta = !isSellTrade || showCopyBuyCta
  const shouldShowPrimaryCta = isSellTrade || shouldShowCopyCta
  const copyCtaLabel = showCopyBuyCta ? "Copy Trade (Buy)" : "Copy Trade"
  const copyAgainLabel = "Buy Again"
  const allowQuickCopyExperience = showQuickCopyExperience && !isSellTrade
  const canSellAsWell =
    isSellTrade && userHasMatchingPosition && Boolean(onSellPosition) && !isMarketEnded
  const canBuyAgain = !isMarketEnded && Boolean(onCopyTrade)
  const showSellAction =
    !isSellTrade && userHasMatchingPosition && localCopied && Boolean(onSellPosition)
  const canSellAction = showSellAction && !isMarketEnded

  const handleSellClick = () => {
    if (isSellTrade) {
      if (!canSellAsWell) return
      onSellPosition?.()
      return
    }
    if (!canSellAction) return
    onSellPosition?.()
  }

  const handleBuyAgainClick = () => {
    if (!canBuyAgain) return
    onCopyTrade?.()
  }

  const handleCopyTradeClick = () => {
    if (isMarketEnded) return
    if (!shouldShowCopyCta) return
    if (allowQuickCopyExperience && onToggleExpand) {
      onToggleExpand()
      return
    }
    if (isPremiumWithoutWallet && !manualTradingEnabled) {
      setShowWalletPrompt(true)
      return
    }

    if (manualFlowStep === 'open-polymarket') {
      onCopyTrade?.()
      setManualFlowStep('enter-details')
      return
    }

    if (!manualDrawerOpen) {
      openManualDrawer()
    }
  }

  // Handler for Get PolyScore button
  const handleGetPolyScore = async () => {
    if (!conditionId || !trader.address || !hasCurrentPrice) {
      setPolyScoreError('Missing required trade data')
      return
    }

    setIsLoadingPolyScore(true)
    setPolyScoreError(null)
    setPolyScoreData(null)

    try {
      // Get user session token for authenticated request
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token

      // Fetch market metadata from Supabase first
      let marketData: any = null
      if (conditionId) {
        const { data: marketRow } = await supabase
          .from('markets')
          .select('*')
          .eq('condition_id', conditionId)
          .single()
        marketData = marketRow
      }

      // If market data is missing or incomplete, fetch from Polymarket Price API
      let apiMarketData: any = null
      if (conditionId && (!marketData || !marketData.tags || !marketData.volume_total)) {
        try {
          const priceResponse = await fetch(`/api/polymarket/price?conditionId=${conditionId}`)
          if (priceResponse.ok) {
            const priceData = await priceResponse.json()
            if (priceData.success && priceData.market) {
              apiMarketData = priceData.market
              // Merge API data with database data (prefer database, fallback to API)
              marketData = {
                ...marketData,
                title: marketData?.title || apiMarketData.question || market,
                tags: marketData?.tags || apiMarketData.tags || null,
                event_slug: marketData?.event_slug || apiMarketData.eventSlug || null,
                game_start_time: marketData?.game_start_time || apiMarketData.gameStartTime || null,
              }
            }
          }
        } catch (error) {
          console.warn('[PolyScore] Failed to fetch market data from Price API:', error)
        }
      }

      // Fetch from CLOB API for additional market details (volumes, etc.)
      if (conditionId && (!marketData?.volume_total)) {
        try {
          const clobResponse = await fetch(`/api/polymarket/market?conditionId=${conditionId}`)
          if (clobResponse.ok) {
            const clobData = await clobResponse.json()
            if (clobData.ok) {
              // CLOB API returns basic market info but not volumes
              // Volumes would need to come from Gamma API or be calculated
              marketData = {
                ...marketData,
                title: marketData?.title || clobData.question || market,
              }
            }
          }
        } catch (error) {
          console.warn('[PolyScore] Failed to fetch market data from CLOB API:', error)
        }
      }

      // Fetch from Gamma API for classification and additional metadata
      if (conditionId) {
        try {
          const gammaResponse = await fetch(`/api/gamma/markets?conditionId=${conditionId}`)
          if (gammaResponse.ok) {
            const gammaData = await gammaResponse.json()
            if (gammaData && !Array.isArray(gammaData) && gammaData.category) {
              // Gamma returns category which can help with classification
              marketData = {
                ...marketData,
                // Category can be used to infer bet_structure and market_subtype
                // This would need your classification logic
              }
            }
          }
        } catch (error) {
          console.warn('[PolyScore] Failed to fetch Gamma market data:', error)
        }
      }

      // Fetch recent trader actions (last 5 trades in this market)
      let recentTraderActions: any[] = []
      if (conditionId && trader.address) {
        const { data: recentTrades } = await supabase
          .from('trades')
          .select('side, price, shares_normalized, timestamp')
          .eq('wallet_address', trader.address.toLowerCase())
          .eq('condition_id', conditionId)
          .order('timestamp', { ascending: false })
          .limit(5)
        
        if (recentTrades) {
          recentTraderActions = recentTrades.map(trade => ({
            side: trade.side,
            price: parseFloat(trade.price),
            shares_normalized: parseFloat(trade.shares_normalized || 0),
            timestamp: new Date(trade.timestamp).toISOString(),
          }))
        }
      }

      // Extract event slug from polymarketUrl or marketSlug
      const eventSlugMatch = polymarketUrl?.match(/\/event\/([^\/]+)/)
      const marketEventSlug = eventSlugMatch?.[1] || marketSlug || null

      // Calculate market duration in days
      const startTimeUnix = marketData?.start_time_unix || (eventStartTime ? Math.floor(new Date(eventStartTime).getTime() / 1000) : null)
      const endTimeUnix = marketData?.end_time_unix || (eventEndTime ? Math.floor(new Date(eventEndTime).getTime() / 1000) : null)
      const marketDurationDays = startTimeUnix && endTimeUnix 
        ? Math.round((endTimeUnix - startTimeUnix) / (24 * 60 * 60))
        : null

      // Build structured request payload
      const requestData = {
        // --- The Triggering Trade (The one being copied) ---
        original_trade: {
          wallet_address: trader.address,
          condition_id: conditionId,
          side: action.toUpperCase() as "BUY" | "SELL",
          price: price,
          shares_normalized: size,
          timestamp: tradeTimestampMs ? new Date(tradeTimestampMs).toISOString() : new Date().toISOString(),
        },
        
        // --- The Live Market State ---
        market_context: {
          current_price: currentPrice,
          current_timestamp: new Date().toISOString(),
          market_volume_total: marketData?.volume_total || null,
          market_tags: marketData?.tags 
            ? (Array.isArray(marketData.tags) ? JSON.stringify(marketData.tags) : marketData.tags)
            : (apiMarketData?.tags 
                ? (Array.isArray(apiMarketData.tags) ? JSON.stringify(apiMarketData.tags) : apiMarketData.tags)
                : null),
          market_bet_structure: marketData?.bet_structure || marketCategory?.bet_structure || null,
          market_market_subtype: marketData?.market_subtype || marketCategory?.market_subtype || null,
          market_duration_days: marketDurationDays,
          market_title: market || marketData?.title || apiMarketData?.question || null,
          market_event_slug: marketEventSlug,
          market_start_time_unix: startTimeUnix,
          market_end_time_unix: endTimeUnix,
          market_volume_1_week: marketData?.volume_1_week || null,
          market_volume_1_month: marketData?.volume_1_month || null,
          market_negative_risk_id: marketData?.negative_risk_id || null,
          game_start_time: eventStartTime || marketData?.game_start_time || apiMarketData?.gameStartTime || null,
          token_label: position || null,
          token_id: tokenId || null,
        },

        // --- The User's Context ---
        user_slippage: resolvedDefaultSlippage / 100, // Convert percentage to decimal
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('🎯 [PolyScore] TRADE CARD - Initiating Request')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('Trader Name:', trader.name)
      console.log('Trader Address:', trader.address)
      console.log('Condition ID:', conditionId)
      console.log('Current Price:', currentPrice)
      console.log('User Slippage (%):', resolvedDefaultSlippage)
      console.log('User Slippage (decimal):', requestData.user_slippage)
      console.log('Has Session:', !!session)
      console.log('Session User ID:', session?.user?.id)
      console.log('Market Data Found:', !!marketData)
      console.log('API Market Data Found:', !!apiMarketData)
      console.log('Recent Trader Actions:', recentTraderActions.length)
      console.log('Market Data Details:', {
        hasTitle: !!marketData?.title,
        hasTags: !!marketData?.tags,
        hasVolumes: !!(marketData?.volume_total || marketData?.volume_1_week),
        hasBetStructure: !!marketData?.bet_structure,
        hasSubtype: !!marketData?.market_subtype,
      })
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('📦 FULL REQUEST PAYLOAD (NEW STRUCTURE):')
      console.log(JSON.stringify(requestData, null, 2))
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('📋 Original Trade:', JSON.stringify(requestData.original_trade, null, 2))
      console.log('📋 Market Context:', JSON.stringify(requestData.market_context, null, 2))
      console.log('📋 User Slippage:', requestData.user_slippage)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      // Also log as object so it's expandable in console
      console.log('📦 Request Data Object:', requestData)
      console.log('Market Data:', marketData)

      const result = await getPolyScore(requestData, accessToken)
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('✅ [PolyScore] TRADE CARD - Request Complete')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('Final Result:', JSON.stringify(result, null, 2))
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      
      setPolyScoreData(result)
    } catch (error: any) {
      console.error('[PolyScore] Error:', error)
      setPolyScoreError(error.message || 'Failed to get PolyScore')
    } finally {
      setIsLoadingPolyScore(false)
    }
  }

  const closeManualDrawer = () => {
    setManualDrawerOpen(false)
    setManualUsdAmount("")
    setManualPriceInput("")
    setManualFlowStep('open-polymarket')
  }

  const handleManualMarkAsCopied = () => {
    const manualAmountHasValue = manualUsdAmount.trim().length > 0
    const manualAmountValue = Number.parseFloat(manualUsdAmount)
    const manualAmountPositive =
      manualAmountHasValue && !Number.isNaN(manualAmountValue) && manualAmountValue > 0

    onMarkAsCopied?.(
      manualDisplayPrice,
      manualAmountPositive ? manualAmountValue : undefined
    )
    closeManualDrawer()
  }

  const manualAmountValue = Number.parseFloat(manualUsdAmount)
  const manualAmountHasValue = manualUsdAmount.trim().length > 0
  const manualAmountPositive =
    manualAmountHasValue && !Number.isNaN(manualAmountValue) && manualAmountValue > 0
  const manualAmountValid = !manualAmountHasValue || manualAmountPositive
  const parsedManualPrice = Number.parseFloat(manualPriceInput)
  const editedPriceValid = !Number.isNaN(parsedManualPrice) && parsedManualPrice > 0
  const manualDisplayPrice =
    editedPriceValid
      ? parsedManualPrice
      : defaultManualPrice
  const manualPriceChange =
    price > 0 && manualDisplayPrice > 0
      ? ((manualDisplayPrice - price) / price) * 100
      : null
  const manualPriceChangeColor =
    manualPriceChange === null
      ? 'text-slate-400'
      : manualPriceChange >= 0
        ? 'text-emerald-600'
        : 'text-red-600'
  const manualPriceChangeLabel =
    manualPriceChange === null
      ? '--'
      : `${manualPriceChange >= 0 ? '+' : ''}${manualPriceChange.toFixed(2)}% from entry`
  const manualContractsEstimate =
    manualAmountPositive && manualDisplayPrice > 0
      ? Math.floor(manualAmountValue / manualDisplayPrice)
      : 0

  const isCopyDisabled = isMarketEnded
  const filledContracts =
    typeof statusData?.filledSize === 'number' ? statusData.filledSize : null
  const totalContracts =
    typeof statusData?.size === 'number' ? statusData.size : null
  const fillPrice =
    typeof statusData?.price === 'number' ? statusData.price : null
  const pendingStatusLabel = "Order pending at Polymarket"
  let orderStatusLabel: string
  if (statusPhase === "filled") {
    orderStatusLabel = "Filled"
  } else if (statusPhase === "partial") {
    orderStatusLabel = "Partially filled"
  } else if (statusPhase === "timed_out") {
    orderStatusLabel = "Failed to match on Polymarket"
  } else if (orderType === "FAK" && (statusPhase === "canceled" || statusPhase === "expired" || statusPhase === "rejected") && (!filledContracts || filledContracts <= 0)) {
    orderStatusLabel = "Not filled (FAK)"
  } else {
    orderStatusLabel = pendingStatusLabel
  }
  const filledAmountValue =
    filledContracts !== null && fillPrice !== null ? filledContracts * fillPrice : null
  const totalAmountValue =
    totalContracts !== null && fillPrice !== null ? totalContracts * fillPrice : null
  const statusAmountValue =
    filledAmountValue !== null
      ? filledAmountValue
      : totalAmountValue !== null
        ? totalAmountValue
        : estimatedMaxCost !== null && Number.isFinite(estimatedMaxCost) && estimatedMaxCost > 0
          ? estimatedMaxCost
          : 0
  const statusContractsText =
    filledContracts !== null && totalContracts !== null
      ? `${formatContractsDisplay(filledContracts, 1)} / ${formatContractsDisplay(totalContracts, 1)}`
      : `${formatContractsDisplay(contractsValue ?? 0, 1)} submitted`
  const isFinalStatus = TERMINAL_STATUS_PHASES.has(statusPhase)
  const isFilledStatus = statusPhase === 'filled'
  const canCancelPendingOrder =
    showConfirmation && (isSubmitting || (Boolean(orderId) && CANCELABLE_PHASES.has(statusPhase)))

  const notificationStatus = resolveExecutionNotificationStatus(
    statusPhase,
    filledContracts,
    totalContracts
  )
  const notificationId = orderId ?? orderIntentId

  useEffect(() => {
    if (!showConfirmation || notificationSent || !notificationStatus) return
    if (!onExecutionNotification || !tradeAnchorId) return
    if (!isInView) {
      onExecutionNotification({
        id: notificationId,
        market,
        status: notificationStatus,
        tradeAnchorId,
        timestamp: Date.now(),
      })
      setNotificationSent(true)
      setNotificationPending(false)
    } else {
      setNotificationPending(true)
    }
  }, [
    showConfirmation,
    notificationSent,
    notificationStatus,
    onExecutionNotification,
    tradeAnchorId,
    isInView,
    notificationId,
    market,
  ])

  useEffect(() => {
    if (!showConfirmation || notificationSent || !notificationPending) return
    if (!notificationStatus || !onExecutionNotification || !tradeAnchorId) return
    if (!isInView) {
      onExecutionNotification({
        id: notificationId,
        market,
        status: notificationStatus,
        tradeAnchorId,
        timestamp: Date.now(),
      })
      setNotificationSent(true)
      setNotificationPending(false)
    }
  }, [
    showConfirmation,
    notificationSent,
    notificationPending,
    notificationStatus,
    onExecutionNotification,
    tradeAnchorId,
    isInView,
    notificationId,
    market,
  ])

  const handleCancelOrder = useCallback(async () => {
    if (isCancelingOrder) return
    if (!orderId) {
      setCancelStatus({
        message: 'Waiting for the Polymarket order ID…',
        variant: 'info',
      })
      return
    }
    if (!CANCELABLE_PHASES.has(statusPhase)) {
      setCancelStatus({
        message: 'Order has already reached a final state.',
        variant: 'error',
      })
      return
    }
      setIsCancelingOrder(true)
      setCancelStatus({
        message: 'Attempting to cancel. If it already executed, the status will update.',
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
      setCancelStatus({
        message: 'Cancel request confirmed by Polymarket.',
        variant: 'success',
      })
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      if (pollAbortRef.current) {
        pollAbortRef.current.abort()
        pollAbortRef.current = null
      }
      await refreshOrders().catch(() => {
        /* best effort */
      })
    } catch (error: any) {
      const message =
        typeof error === 'string'
          ? error
          : error?.message || 'Unable to cancel order. Please try again.'
      setCancelStatus({ message, variant: 'error' })
    } finally {
      setIsCancelingOrder(false)
    }
  }, [orderId, isCancelingOrder, statusPhase, refreshOrders, isSubmitting])
  useEffect(() => {
    if (!orderId || !showConfirmation || isFinalStatus) {
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
      setIsCancelingOrder(true)
      setCancelStatus({
        message: 'Order timed out. Attempting to cancel automatically.',
        variant: 'info',
      })
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
        setCancelStatus({
          message: 'Order timed out. We asked Polymarket to cancel automatically.',
          variant: 'info',
        })
        await refreshOrders().catch(() => {
          /* refresh best effort */
        })
      } catch (error: any) {
        const message =
          typeof error === 'string'
            ? error
            : error?.message || 'Unable to cancel order. Please try again.'
        setCancelStatus({ message, variant: 'error' })
      } finally {
        setIsCancelingOrder(false)
      }
    }, ORDER_STATUS_TIMEOUT_MS)
    return () => {
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current)
        pendingTimeoutRef.current = null
      }
    }
  }, [orderId, showConfirmation, isFinalStatus, refreshOrders])
  const resetConfirmation = () => {
    setShowConfirmation(false)
    setOrderId(null)
    setStatusData(null)
    statusDataRef.current = null
    setStatusError(null)
    setConfirmationError(null)
    setCancelStatus(null)
    setIsCancelingOrder(false)
    setStatusPhase('submitted')
    setFrozenOrder(null)
    setShowTradeDetails(false)
  }

  const tradeDetailsJson = useMemo(() => {
    if (!statusData) return null
    try {
      const payload = statusData?.raw ?? statusData
      return JSON.stringify(payload, null, 2)
    } catch (error) {
      console.warn("Unable to render trade details payload", error)
      return null
    }
  }, [statusData])

  const handleTryAgain = () => {
    resetConfirmation()
    setSubmitError('Order failed to match. Try again with a wider spread or updated price.')
  }

  return (
    <div
      ref={cardRef}
      id={tradeAnchorId}
      className={cn(
        "group relative border rounded-xl overflow-hidden transition-all hover:shadow-lg",
        "bg-white border-slate-200"
      )}
    >
      <div
        className={cn(
          "pt-5 px-5 md:pt-6 md:px-6",
          shouldShowPrimaryCta ? "pb-0" : "pb-5 md:pb-6"
        )}
      >
        {/* Header Row */}
        <div className="flex items-start justify-between mb-2 gap-3">
          <Link
            href={`/trader/${trader.id || "1"}`}
            className="flex items-center gap-3 min-w-0 hover:opacity-70 transition-opacity"
          >
            <Avatar className="h-10 w-10 ring-2 ring-slate-100 transition-all">
              {trader.avatar ? <AvatarImage src={trader.avatar} alt={trader.name} /> : null}
              <AvatarFallback className="bg-white text-slate-700 text-sm font-semibold">
                {getTraderAvatarInitials({ displayName: trader.name, wallet: trader.address })}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-medium text-slate-900 text-sm leading-tight">{trader.name}</p>
            </div>
          </Link>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">{timestamp}</span>
            {isPremium && onToggleExpand && !localCopied && null}
          </div>
        </div>

        <div className="mb-2 rounded-lg bg-slate-50/70 px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2.5 md:items-center">
                <Avatar className="h-11 w-11 ring-2 ring-slate-100 bg-slate-50 text-slate-700 text-xs font-semibold uppercase">
                  <AvatarImage src={marketAvatar || "/placeholder.svg"} alt={market} />
                  <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-semibold uppercase">
                    {market.slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h3 className="text-base md:text-lg font-medium text-slate-900 leading-snug break-words">
                    {market}
                    {/* External link icon for Premium users - at end of market name */}
                    {isPremium && polymarketUrl && (
                      <a
                        href={polymarketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex text-slate-400 hover:text-slate-600 transition-colors"
                        title="View on Polymarket"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </h3>
                </div>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center justify-start gap-1.5 md:w-auto md:justify-end">
              {showTimeBadge ? (
                espnLink ? (
                  <Badge
                    asChild
                    variant="secondary"
                    className={cn(
                      badgeBaseClass,
                      resolvedBadgeState.time
                        ? "bg-white text-slate-700 border-slate-200"
                        : "bg-white text-slate-400 border-slate-200",
                    )}
                  >
                    <a href={espnLink} target="_blank" rel="noopener noreferrer">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {eventTimeLabel}
                    </a>
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className={cn(
                      badgeBaseClass,
                      resolvedBadgeState.time
                        ? "bg-white text-slate-700 border-slate-200"
                        : "bg-white text-slate-400 border-slate-200",
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {eventTimeLabel}
                  </Badge>
                )
              ) : null}
              {showStatusBadge ? (
                espnLink ? (
                  <Badge asChild variant="secondary" className={statusBadgeClass}>
                    <a href={espnLink} target="_blank" rel="noopener noreferrer">
                      {badgeType === "live" ? (
                        liveBadgeContent
                      ) : hasCryptoPrice ? (
                        // For crypto prices, show just the price without status label
                        <span className="font-semibold text-xs">{scoreText}</span>
                      ) : (
                        <>
                          <StatusIcon className="h-3.5 w-3.5" />
                          <span className="flex items-center gap-1">
                            <span>{statusLabel}</span>
                            {scoreText ? <span className="font-semibold">{scoreText}</span> : null}
                          </span>
                        </>
                      )}
                    </a>
                  </Badge>
                ) : (
                  <Badge variant="secondary" className={statusBadgeClass}>
                    {badgeType === "live" ? (
                      liveBadgeContent
                    ) : hasCryptoPrice ? (
                      // For crypto prices, show just the price without status label
                      <span className="font-semibold text-xs">{scoreText}</span>
                    ) : (
                      <>
                        <StatusIcon className="h-3.5 w-3.5" />
                        <span className="flex items-center gap-1">
                          <span>{statusLabel}</span>
                          {scoreText ? <span className="font-semibold">{scoreText}</span> : null}
                        </span>
                      </>
                    )}
                  </Badge>
                )
              ) : null}
            </div>
          </div>
        </div>

        {shouldShowInsightsSection && (
          <div
            className={cn(
              "mb-3 rounded-lg bg-slate-50/70 px-3 py-2",
              hasAnyPositionBadge && "cursor-pointer"
            )}
            onClick={hasAnyPositionBadge ? handlePositionBadgeClick : undefined}
            role={hasAnyPositionBadge ? "button" : undefined}
            tabIndex={hasAnyPositionBadge ? 0 : undefined}
            onKeyDown={
              hasAnyPositionBadge
                ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      handlePositionBadgeClick()
                    }
                  }
                : undefined
            }
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {traderHedgingInfo.isHedging ? (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="secondary"
                          className={cn(
                            badgeBaseClass,
                            "h-6 px-2 text-[11px] font-semibold bg-yellow-50 text-yellow-700 border-yellow-200"
                          )}
                        >
                          <ArrowLeftRight className="h-3 w-3" />
                          Trader Hedging
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[220px] text-xs">
                        Trader has bought multiple outcomes in this market to reduce directional risk.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
                {isSellTrade ? (
                  <Badge
                    variant="secondary"
                    className={cn(
                      badgeBaseClass,
                      "h-6 px-2 text-[11px] font-semibold bg-rose-50 text-rose-700 border-rose-200"
                    )}
                  >
                    Trader Sold
                  </Badge>
                ) : null}
                {hasAnyPositionBadge ? (
                  <Badge
                    asChild
                    variant="secondary"
                    className={cn(
                      badgeBaseClass,
                      "h-6 px-2 text-[11px] font-semibold text-slate-600 border-slate-200 hover:bg-slate-100 cursor-pointer",
                      showUserPositionBadge && showTraderPositionBadge ? "bg-white" : "bg-transparent"
                    )}
                  >
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        handlePositionBadgeClick()
                      }}
                      aria-expanded={isPositionDrawerOpen}
                    >
                      <Star className="h-3 w-3 text-slate-500" />
                      <span>{isSellTrade ? "Exiting Positions" : "Existing Positions"}</span>
                      {(showUserPositionBadge || showTraderPositionBadge) && (
                        <span className="ml-1 inline-flex items-center gap-1">
                          {showUserPositionBadge ? (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                              You
                            </span>
                          ) : null}
                          {showTraderPositionBadge ? (
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                              Trader
                            </span>
                          ) : null}
                        </span>
                      )}
                    </button>
                  </Badge>
                ) : null}
              </div>
              {hasAnyPositionBadge ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    handlePositionBadgeClick()
                  }}
                  aria-label={isPositionDrawerOpen ? "Hide existing positions" : "Show existing positions"}
                  aria-expanded={isPositionDrawerOpen}
                  className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      isPositionDrawerOpen && "rotate-180"
                    )}
                  />
                </button>
              ) : null}
            </div>
            {isPositionDrawerOpen && activePositionBadge && (
              <div
                className="mt-2"
                onClick={(event) => {
                  event.stopPropagation()
                }}
              >
                {renderPositionDrawer()}
              </div>
            )}
          </div>
        )}

        <div className="border border-slate-200 rounded-lg px-4 py-3 mb-0 bg-slate-50/50">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 relative">
            <div className="text-center">
              <p className="text-xs text-slate-500 mb-1 font-medium">Outcome</p>
              <div className="flex flex-wrap items-center justify-center max-w-full">
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
              <p className="text-sm md:text-base font-semibold text-slate-900">{formatContracts(size)}</p>
            </div>
            <div className="text-center md:border-l border-slate-200">
              <p className="text-xs text-slate-500 mb-1 font-medium">Entry</p>
              <p className="text-sm md:text-base font-semibold text-slate-900">{formatPrice(price)}</p>
            </div>
            <div className="text-center md:border-l border-slate-200">
              <p className="text-xs text-slate-500 mb-1 font-medium">Current</p>
              <p className="text-sm md:text-base font-semibold">
                <span
                  className={cn(
                    "inline-flex items-center justify-center rounded-md px-1.5 py-0.5 transition-all duration-300",
                    priceFlash && "ring-1 shadow-sm",
                    !hasCurrentPrice && "text-slate-400",
                    priceFlash === "up" && "bg-emerald-50 text-emerald-700 ring-emerald-200",
                    priceFlash === "down" && "bg-red-50 text-red-700 ring-red-200",
                    priceFlash === "neutral" && "bg-slate-200 text-slate-800 ring-slate-300",
                    priceFlash === null && hasCurrentPrice && "text-slate-900"
                  )}
                >
                  {hasCurrentPrice ? formatPrice(currentPrice) : "--"}
                </span>
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

        {!hideActions && allowManualExperience && manualDrawerOpen && shouldShowCopyCta && (
          <div className="p-4 mt-4 space-y-4 border border-slate-200 rounded-xl bg-slate-50">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">Manual Copy</h4>
              <button
                type="button"
                onClick={closeManualDrawer}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Close manual copy drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">Current Price</span>
                <div className="text-right">
                  <p className="text-base font-semibold text-slate-900">${manualDisplayPrice.toFixed(4)}</p>
                  <p className={`text-xs font-medium ${manualPriceChangeColor}`}>{manualPriceChangeLabel}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="manual-copy-price" className="text-xs font-medium text-slate-700">
                Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                <input
                  id="manual-copy-price"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  value={manualPriceInput}
                  onChange={(e) => setManualPriceInput(e.target.value)}
                  placeholder={manualDisplayPrice.toFixed(4)}
                  className="w-full pl-7 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="manual-copy-amount" className="text-xs font-medium text-slate-700">
                Amount (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                <input
                  id="manual-copy-amount"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.,]?[0-9]*"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  value={manualUsdAmount}
                  onChange={(e) => setManualUsdAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              {manualAmountPositive && (
                <p className="text-xs text-slate-500">
                  ≈ {manualContractsEstimate.toLocaleString()} contracts
                </p>
              )}
            </div>

            <Button
              onClick={handleManualMarkAsCopied}
              disabled={!manualAmountValid || isCopyDisabled || isCopied}
              variant="outline"
              className={cn(
                'w-full max-w-[360px] mx-auto font-semibold text-sm',
                isCopied
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 cursor-default'
                  : isCopyDisabled || !manualAmountValid
                    ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                    : 'bg-[#FDB022] border-transparent hover:bg-[#E09A1A] text-slate-900'
              )}
            >
              {isMarketEnded ? (
                "Market Resolved"
              ) : isCopied ? (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Copied
                </>
              ) : (
                'Mark trade as copied'
              )}
            </Button>
          </div>
        )}

        {/* Get PolyScore Button - Admin Only, Top 5 Traders Only */}
        {isAdmin && isTop5 && conditionId && hasCurrentPrice && (
          <div className="px-5 md:px-6 py-2 border-t border-slate-200">
            <div className="flex justify-center">
              <Button
                onClick={handleGetPolyScore}
                disabled={isLoadingPolyScore}
                variant="outline"
                className="rounded-full border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-medium shadow-sm text-xs h-7 px-3"
                size="sm"
              >
                {isLoadingPolyScore ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3 mr-1.5" />
                    Get PolyScore
                  </>
                )}
              </Button>
            </div>
            {polyScoreError && (
              <div className="mt-2 flex justify-center">
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                  {polyScoreError}
                </div>
              </div>
            )}
            {polyScoreData && (
              <div className="mt-2">
                <PolyScoreResults
                  data={polyScoreData}
                  onClose={() => {
                    setPolyScoreData(null)
                    setPolyScoreError(null)
                  }}
                />
              </div>
            )}
          </div>
        )}

        {!hideActions && shouldShowPrimaryCta && !(allowQuickCopyExperience && isExpanded) && (
          <div className="py-4">
            {isSellTrade ? (
              <div className="w-full flex justify-center">
                <div className="flex w-full max-w-[360px] items-center">
                  <Button
                    onClick={showCopyBuyCta ? handleCopyTradeClick : handleSellClick}
                    disabled={showCopyBuyCta ? isCopyDisabled : !canSellAsWell}
                    className={cn(
                      "w-full rounded-full font-semibold shadow-sm text-sm",
                      showCopyBuyCta
                        ? isMarketEnded
                          ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                          : "bg-[#FDB022] hover:bg-[#E09A1A] text-slate-900"
                        : canSellAsWell
                          ? "bg-rose-500 hover:bg-rose-600 text-white"
                          : "bg-slate-200 text-slate-500 cursor-not-allowed"
                    )}
                    size="lg"
                  >
                    {showCopyBuyCta ? (isMarketEnded ? "Market Resolved" : copyCtaLabel) : "Sell As Well"}
                  </Button>
                </div>
              </div>
            ) : allowQuickCopyExperience ? (
              <div className="w-full flex justify-center">
                <div
                  className={cn(
                    "flex w-full max-w-[360px] items-center",
                    showSellAction ? "gap-2" : ""
                  )}
                >
                  <Button
                    onClick={handleCopyTradeClick}
                    disabled={isCopyDisabled}
                    className={cn(
                      "rounded-full font-semibold shadow-sm text-sm",
                      showSellAction ? "flex-1" : "w-full",
                      localCopied
                        ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                        : isMarketEnded
                          ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                          : "bg-[#FDB022] hover:bg-[#E09A1A] text-slate-900"
                    )}
                    size="lg"
                  >
                    {isMarketEnded ? (
                      "Market Resolved"
                    ) : localCopied ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        {copyAgainLabel}
                      </>
                    ) : (
                      copyCtaLabel
                    )}
                  </Button>
                  {showSellAction && (
                    <Button
                      onClick={handleSellClick}
                      disabled={!canSellAction}
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 rounded-full px-4 text-xs font-semibold",
                        canSellAction
                          ? "border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-600"
                          : "border-slate-200 text-slate-400"
                      )}
                    >
                      Sell
                    </Button>
                  )}
                </div>
              </div>
            ) : allowManualExperience ? (
              <div className="w-full flex justify-center">
                {!manualDrawerOpen && (
                  isCopied ? (
                    <Button
                      disabled
                      className="w-full max-w-[360px] rounded-full bg-emerald-500 hover:bg-emerald-500 text-white font-semibold shadow-sm text-sm"
                      size="lg"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Copied
                    </Button>
                  ) : (
                    <Button
                      onClick={handleCopyTradeClick}
                      disabled={isCopyDisabled}
                      className={`w-full max-w-[360px] rounded-full font-semibold shadow-sm text-sm ${
                        isMarketEnded
                          ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                          : "bg-[#FDB022] hover:bg-[#E09A1A] text-slate-900"
                      }`}
                      size="lg"
                    >
                      {isMarketEnded ? (
                        "Market Resolved"
                      ) : manualFlowStep === 'open-polymarket' ? (
                        <>
                          Open Polymarket to enter trade
                          <ExternalLink className="w-4 h-4 ml-2" />
                        </>
                      ) : (
                        'Enter order details'
                      )}
                    </Button>
                  )
                )}
                {showLinkWalletHint && (
                  <div className="mt-3 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs font-semibold text-slate-700 border-slate-200 hover:bg-slate-50"
                      onClick={() => onOpenConnectWallet?.()}
                    >
                      Link my wallet for quick trades
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full flex justify-center">
                <Button
                  onClick={handleCopyTradeClick}
                  disabled={isCopyDisabled}
                  className={`w-full max-w-[360px] mx-auto font-semibold shadow-sm text-sm ${
                    isMarketEnded
                      ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                      : "bg-[#FDB022] hover:bg-[#E09A1A] text-slate-900"
                  }`}
                  size="lg"
                >
                  {isMarketEnded ? "Market Resolved" : copyCtaLabel}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

        {!hideActions && allowQuickCopyExperience && isExpanded && shouldShowCopyCta && (
        <div className="bg-white px-6 pb-3 pt-0">
          <div className="-mt-4 mb-2 flex justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400">
              <ArrowDown className="h-4 w-4" />
            </div>
          </div>
          <div className="relative mt-0.5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 px-4 pb-4 pt-3">
            {showFilledCelebration ? (
              <div key={celebrationKey} className="confetti-layer" aria-hidden="true">
                {CONFETTI_PIECES.map((index) => (
                  <span key={index} className="confetti" />
                ))}
              </div>
            ) : null}
            {showConfirmation ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-slate-400">Status</p>
                    <p className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                      {!isFinalStatus && <Loader2 className="h-4 w-4 animate-spin text-amber-500" />}
                      {orderStatusLabel}
                    </p>
                    {!isFinalStatus && (
                      <div className="mt-1">
                        <p
                          className={`text-xs ${
                            statusPhase === 'timed_out' ? 'text-amber-600' : 'text-slate-500'
                          }`}
                        >
                          {statusPhase === 'timed_out'
                            ? 'Polymarket did not match this order within 30 seconds. Try increasing slippage and/or using a smaller amount.'
                            : 'This may take a moment.'}
                        </p>
                      </div>
                    )}
                    {statusPhase === 'timed_out' && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-amber-600">
                          We couldn’t fill this order at your price. Try increasing slippage (tap Advanced) or using a smaller amount.
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <span>Why didn&apos;t it match?</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-slate-500"
                                  aria-label="Why orders fail to match"
                                >
                                  ?
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>
                                  Orders fail to match when there isn&apos;t enough liquidity at your limit price.
                                  Increasing slippage or reducing size widens the chance of a fill.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    )}
                    {cancelStatus && (
                      <p className={`text-xs ${getCancelStatusClass(cancelStatus.variant)}`}>
                        {cancelStatus.message}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {canCancelPendingOrder && (
                      <button
                        type="button"
                        onClick={handleCancelOrder}
                        disabled={isCancelingOrder}
                        className={`inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                          isCancelingOrder
                            ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50'
                        }`}
                      >
                        {isCancelingOrder ? 'Canceling…' : 'Cancel'}
                      </button>
                    )}
                    {isFilledStatus && (
                      <button
                        type="button"
                        onClick={resetConfirmation}
                        className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-700 h-8 w-8"
                        aria-label="Close order confirmation"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
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
                        {filledAmountValue !== null ? "Filled USD" : "Estimated max USD"}
                      </label>
                    <div className="flex h-14 items-center rounded-lg border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700">
                      {formatCurrency(Number.isFinite(statusAmountValue) ? statusAmountValue : 0)}
                    </div>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[180px]">
                      <span className="text-xs font-medium text-slate-700 text-center sm:text-left">
                        Filled / submitted
                      </span>
                      <div className="flex h-14 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 text-center">
                        {statusContractsText}
                      </div>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[180px]">
                      <span className="text-xs font-medium text-slate-700 text-center sm:text-left">
                        Average fill price
                      </span>
                      <div className="flex h-14 items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 text-center">
                        {formatPrice(fillPrice)}
                      </div>
                    </div>
                  </div>
                </div>
                {statusError && (
                  <p className="text-xs text-rose-600">Status error: {statusError}</p>
                )}
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTradeDetails((current) => !current)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Trade Details
                    {showTradeDetails ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                {showTradeDetails && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-400">Polymarket Response</p>
                  {tradeDetailsJson ? (
                    <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-100 bg-white p-3 text-[11px] leading-relaxed text-slate-600">
                      {tradeDetailsJson}
                    </pre>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">
                      Waiting for confirmation details...
                    </p>
                  )}
                  {cancelStatus && (
                    <p className={`mt-2 text-[11px] ${getCancelStatusClass(cancelStatus.variant)}`}>
                      {cancelStatus.message}
                    </p>
                  )}
                </div>
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

                {orderBookError && (
                  <div className="text-xs text-amber-600">{orderBookError}</div>
                )}

                {/* Amount Input */}
                <div className="space-y-2 mb-4">
                    <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-end sm:justify-center">
                      <div className="flex w-full flex-col gap-2 sm:max-w-[240px]">
                        <div className="flex items-center justify-between gap-2">
                  <label htmlFor="amount" className="text-xs font-medium text-slate-700">
                    {amountMode === "usd" ? `USD (min $${minUsdLabel})` : "Contracts"}
                  </label>
                        </div>
                  <div className="relative">
                    {amountMode === "usd" && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                    )}
                    <input
                      id="amount"
                      type="text"
                      inputMode={amountMode === "usd" ? "decimal" : "numeric"}
                      pattern={amountMode === "usd" ? "[0-9]*[.,]?[0-9]*" : "[0-9]*"}
                      step={amountMode === "contracts" ? contractStep : 0.01}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      value={amountInput}
                            onChange={(e) => {
                              handleAmountChange(e.target.value)
                              if (submitError) setSubmitError(null)
                            }}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder={amountMode === "usd" ? "0.00" : "0"}
                      disabled={isSubmitting}
                            className={`w-full h-14 border border-slate-300 rounded-lg text-base font-semibold text-slate-700 focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${amountMode === "usd" ? "pl-7 pr-3" : "pl-3 pr-3"}`}
                    />
          </div>
          <style jsx>{`
            .confetti-layer {
              position: absolute;
              inset: 0;
              pointer-events: none;
              overflow: hidden;
              z-index: 10;
            }

            .confetti {
              position: absolute;
              top: -8px;
              width: 7px;
              height: 14px;
              border-radius: 3px;
              opacity: 0;
              animation: confetti-fall ${CELEBRATION_MS}ms ease-out forwards;
            }

            .confetti-layer span:nth-child(1) {
              left: 8%;
              background: #34d399;
              animation-delay: 0ms;
            }
            .confetti-layer span:nth-child(2) {
              left: 18%;
              background: #fbbf24;
              animation-delay: 40ms;
            }
            .confetti-layer span:nth-child(3) {
              left: 28%;
              background: #60a5fa;
              animation-delay: 80ms;
            }
            .confetti-layer span:nth-child(4) {
              left: 38%;
              background: #f472b6;
              animation-delay: 120ms;
            }
            .confetti-layer span:nth-child(5) {
              left: 48%;
              background: #fb7185;
              animation-delay: 60ms;
            }
            .confetti-layer span:nth-child(6) {
              left: 58%;
              background: #a78bfa;
              animation-delay: 140ms;
            }
            .confetti-layer span:nth-child(7) {
              left: 68%;
              background: #22d3ee;
              animation-delay: 100ms;
            }
            .confetti-layer span:nth-child(8) {
              left: 78%;
              background: #f97316;
              animation-delay: 160ms;
            }
            .confetti-layer span:nth-child(9) {
              left: 88%;
              background: #facc15;
              animation-delay: 20ms;
            }
            .confetti-layer span:nth-child(10) {
              left: 12%;
              background: #34d399;
              animation-delay: 180ms;
            }
            .confetti-layer span:nth-child(11) {
              left: 52%;
              background: #60a5fa;
              animation-delay: 30ms;
            }
            .confetti-layer span:nth-child(12) {
              left: 92%;
              background: #fb7185;
              animation-delay: 70ms;
            }

            @keyframes confetti-fall {
              0% {
                transform: translateY(0) rotate(0deg);
                opacity: 1;
              }
              100% {
                transform: translateY(90px) rotate(160deg);
                opacity: 0;
              }
            }
          `}</style>
        </div>
                      <button
                        type="button"
                        onClick={amountMode === "usd" ? handleSwitchToContracts : handleSwitchToUsd}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-700 hover:border-slate-300 sm:h-12 sm:w-12 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!amountInput.trim()}
                        aria-label={`Switch to ${amountMode === "usd" ? "contracts" : "USD"}`}
                      >
                        <ArrowLeftRight className="h-4 w-4" />
                      </button>
                      <div className="flex h-14 w-full items-center justify-center rounded-lg border border-slate-200 bg-white text-base font-semibold text-slate-700 text-center sm:w-auto sm:min-w-[180px]">
                        {amountMode === "usd"
                          ? !hasAmountInput
                            ? "—"
                            : `≈ ${formatContractsDisplay(contractsValue, 1)} ${contractLabel}`
                          : !hasAmountInput
                            ? "—"
                            : `≈ ${estimatedMaxCost !== null ? formatCurrency(estimatedMaxCost) : "—"} USD`}
                      </div>
                      <div className="flex h-14 items-center text-xs font-medium text-slate-500">
                        {sizePercentLabel} of original trade
                      </div>
                    </div>
                    {minUsdErrorMessage && (
                      <p className="text-xs text-rose-600">{minUsdErrorMessage}</p>
                    )}
                    {submitError && (
                      <p className="text-xs text-rose-600">{submitError}</p>
                  )}
                </div>

                  <div className="flex justify-center">
                    <Button
                      onClick={handleQuickCopy}
                      disabled={
                        isMarketEnded ||
                        !amountInput ||
                        !contractsValue ||
                        contractsValue <= 0 ||
                        isBelowMinUsd ||
                        !limitPrice ||
                        isSubmitting
                      }
                      className={`w-full max-w-[360px] rounded-full font-semibold ${
                        isMarketEnded
                          ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                          : "bg-[#FDB022] hover:bg-[#E09A1A] text-slate-900"
                      }`}
                      size="lg"
                    >
                      {isMarketEnded ? "Market Resolved" : isSubmitting ? pendingStatusLabel : "Execute Trade"}
                    </Button>
                  </div>
                  {isSubmitting && (
                    <p className="mt-2 text-center text-xs text-slate-500">This may take a moment.</p>
                  )}
                {canUseAutoClose && (
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
                                handleSlippagePresetChange(value)
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
                              type="text"
                              placeholder="Custom"
                              value={customSlippage}
                              inputMode="decimal"
                              pattern="[0-9]*[.,]?[0-9]*"
                              autoComplete="off"
                              autoCorrect="off"
                              autoCapitalize="none"
                              onChange={(e) => {
                                setCustomSlippage(e.target.value)
                                handleSlippagePresetChange("custom")
                              }}
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-20 h-8 text-xs border-slate-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                </div>
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
                      Order pending at Polymarket, but status refresh failed. Check the Orders page for updates.
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
                Your copy trade of {formatCurrency(estimatedMaxCost ?? 0)} has been submitted to Polymarket
              </p>
            </div>
          )}
          </div>
          {showConfirmation && isFinalStatus && (
            <div className="mt-3 flex justify-center">
              <Button
                onClick={resetConfirmation}
                className={`w-full max-w-[360px] mx-auto rounded-full font-semibold ${
                  isFilledStatus
                    ? "bg-slate-900 text-white hover:bg-slate-800"
                    : "bg-amber-500 text-slate-900 hover:bg-amber-400"
                }`}
                size="lg"
              >
                {isFilledStatus ? copyAgainLabel : "Try Again"}
              </Button>
            </div>
          )}
        </div>
      )}

      {!hideActions && (
        <Dialog open={showWalletPrompt} onOpenChange={setShowWalletPrompt}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Connect your wallet to trade</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              You need to connect your Polymarket wallet to continue trading with quick copy.
            </p>
            <div className="mt-4 space-y-2">
              <Button
                className="w-full bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => {
                  setShowWalletPrompt(false)
                  onOpenConnectWallet?.()
                }}
              >
                Link my wallet for quick trades
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onSwitchToManualTrading?.()
                  setShowWalletPrompt(false)
                }}
              >
                Switch to manual trading
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* PolyScore Results Modal */}
      {polyScoreData && (
        <PolyScoreResults
          data={polyScoreData}
          onClose={() => {
            setPolyScoreData(null)
            setPolyScoreError(null)
          }}
        />
      )}

      {onTogglePin && (
        <div className="absolute bottom-3 right-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onTogglePin}
                  aria-pressed={isPinned}
                  aria-label={isPinned ? "Unpin trade" : "Pin trade"}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 transition hover:text-slate-600",
                    isPinned && "border-amber-200 bg-amber-50 text-amber-500 hover:text-amber-600"
                  )}
                >
                  <Pin className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{isPinned ? "Unpin trade" : "Pin trade"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  )
}

function getCancelStatusClass(variant: CancelStatus['variant']) {
  if (variant === 'success') return 'text-emerald-600'
  if (variant === 'error') return 'text-rose-600'
  return 'text-slate-500'
}
