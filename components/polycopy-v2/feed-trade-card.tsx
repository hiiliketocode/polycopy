"use client"

import { TraderAvatar, MarketAvatar } from "@/components/ui/polycopy-avatar"
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
  Trophy,
  CircleDot,
  Clock,
  Star,
  Info,
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
import {
  normalizeEventStatus,
  statusLooksFinal,
  statusLooksLive,
  statusLooksScheduled,
  isSeasonLongMarketTitle,
} from "@/lib/market-status"
import { getTraderAvatarInitials } from "@/lib/trader-name"
import { GetPolyScoreButton, PolyPredictBadge, PolySignal } from "@/components/polyscore"
import { PolyScoreRequest, PolyScoreResponse, getPolyScore } from "@/lib/polyscore/get-polyscore"
import { PredictionStats } from "@/components/polyscore/PredictionStats"
import { supabase } from "@/lib/supabase"
import type { GeminiAssessment, GeminiChatMessage, TradeAssessmentSnapshot } from "@/lib/gemini/trade-assessment"

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
  tradeTimestamp?: number
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
  liveScore?: string
  eventStartTime?: string
  eventEndTime?: string
  eventStatus?: string
  liveStatus?: "live" | "scheduled" | "final" | "unknown"
  category?: string
  polymarketUrl?: string
  espnUrl?: string
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
  fireReasons?: string[]
  fireScore?: number
  fireWinRate?: number | null
  fireRoi?: number | null
  fireConviction?: number | null
  // Server-side PolySignal scoring (from fire feed, FT-learnings based)
  polySignalScore?: number
  polySignalRecommendation?: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'AVOID' | 'TOXIC'
  polySignalIndicators?: Record<string, { value: unknown; label: string; status: string }>
  tags?: string[] | null
  marketSubtype?: string // niche (market_subtype from DB)
  betStructure?: string // bet_structure from DB
  gameTimeInfo?: string // e.g., "Q4 5:30" or "Halftime"
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
  tradeTimestamp,
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
  liveScore,
  eventStartTime,
  eventEndTime,
  eventStatus,
  liveStatus,
  category,
  polymarketUrl,
  espnUrl,
  defaultBuySlippage,
  defaultSellSlippage,
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
  fireReasons,
  fireScore,
  fireWinRate,
  fireRoi,
  fireConviction,
  polySignalScore,
  polySignalRecommendation,
  polySignalIndicators,
  tags,
  marketSubtype,
  betStructure,
  gameTimeInfo,
}: TradeCardProps) {
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
  const canUseAutoClose = Boolean(isPremium)
  const [autoClose, setAutoClose] = useState(() => canUseAutoClose)
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
  // PolyScore state
  const [polyScoreData, setPolyScoreData] = useState<PolyScoreResponse | null>(null)
  const [polyScoreLoading, setPolyScoreLoading] = useState(false)
  const [polyScoreError, setPolyScoreError] = useState<string | null>(null)
  // Client-side indicator badge state (fetches when server props aren't available)
  const [indicatorScore, setIndicatorScore] = useState<number | null>(polySignalScore ?? null)
  const [indicatorRecommendation, setIndicatorRecommendation] = useState<string | null>(polySignalRecommendation ?? null)
  const indicatorFetchedRef = useRef<string | null>(null)
  const [assessmentMessages, setAssessmentMessages] = useState<GeminiChatMessage[]>([])
  const [assessmentLoading, setAssessmentLoading] = useState(false)
  const [assessmentError, setAssessmentError] = useState<string | null>(null)
  const [assessmentInput, setAssessmentInput] = useState("")
  const [assessmentResult, setAssessmentResult] = useState<GeminiAssessment | null>(null)
  const polyScoreFetchedRef = useRef<string | null>(null) // Track which trade we've fetched for (conditionId + wallet)
  const statusPhaseRef = useRef<StatusPhase>('submitted')
  const [statusData, setStatusData] = useState<any | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [confirmationError, setConfirmationError] = useState<TradeErrorInfo | null>(null)

  // Market tags for semantic mapping (core semantic engine)
  // Tags are batch-fetched by feed page, but may be missing for new markets
  // PredictionStats will handle fallback to DB query if needed
  // IMPORTANT: Normalize to lowercase to match semantic_mapping table
  const marketTagsForInsights = useMemo(() => {
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      console.log('[TradeCard] No tags prop provided');
      return null;
    }
    
    // Normalize tags array - handle nested objects, strings, etc.
    // Convert to lowercase to match semantic_mapping table format
    const filtered = tags
      .map((t: any) => {
        // Handle nested objects/arrays
        if (typeof t === 'object' && t !== null) {
          return t.name || t.tag || t.value || String(t);
        }
        return String(t);
      })
      .map((t: string) => t.trim().toLowerCase()) // Normalize to lowercase!
      .filter((t: string) => t.length > 0 && t !== 'null' && t !== 'undefined');
    
    if (filtered.length > 0) {
      console.log('[TradeCard] Normalized tags for PredictionStats:', filtered);
      return filtered;
    }
    
    console.warn('[TradeCard] No valid tags after normalization');
    return null;
  }, [tags])

  // Market data is now batch-fetched in feed page before trades are displayed
  // No need to call slow /api/markets/ensure endpoint here
  // Tags and market data are guaranteed to be available via props

  const [isCancelingOrder, setIsCancelingOrder] = useState(false)
  const [cancelStatus, setCancelStatus] = useState<CancelStatus | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [showTradeDetails, setShowTradeDetails] = useState(false)
  const [isInsightsDrawerOpen, setIsInsightsDrawerOpen] = useState(false)
  const [insightsDrawerTab, setInsightsDrawerTab] = useState<"positions" | "indicators" | "insights" | "gemini">("positions")
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

  const isUuid = (value?: string | null) =>
    Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))

  const copiedTraderId = isUuid(trader.id) ? trader.id! : null

  // Cache last valid score to prevent flickering when data momentarily disappears
  // or when different sources use different team abbreviations
  const lastValidScoreRef = useRef<{ full: string; homeTeam: string; awayTeam: string; homeScore: string; awayScore: string } | null>(null)
  
  const cleanedLiveScore = useMemo(() => {
    if (!liveScore) {
      // Return cached score to prevent flickering
      return lastValidScoreRef.current?.full ?? null
    }
    // Remove leading non-alphanumeric, and strip any embedded time like " (Q4 5:30)" or " (Halftime)"
    let cleaned = liveScore.replace(/^[^A-Za-z0-9]+/, "").trim()
    // Remove parenthesized time/status suffix (e.g., "(Q4 5:30)", "(Halftime)", "(OT 2:15)")
    cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/, "").trim()
    if (!cleaned.length) return lastValidScoreRef.current?.full ?? null
    
    // Parse the score format: "TEAM1 123 - 456 TEAM2" or "TEAM1 123-456 TEAM2"
    const scoreMatch = cleaned.match(/^([A-Za-z]+)\s*(\d+)\s*-\s*(\d+)\s*([A-Za-z]+)$/)
    if (!scoreMatch) {
      // Not a valid score format, return cached or current
      return lastValidScoreRef.current?.full ?? cleaned
    }
    
    const [, newHomeTeam, newHomeScore, newAwayScore, newAwayTeam] = scoreMatch
    const cached = lastValidScoreRef.current
    
    // If we have a cached score, only update the numeric scores but keep the team names stable
    if (cached) {
      const updatedFull = `${cached.homeTeam} ${newHomeScore} - ${newAwayScore} ${cached.awayTeam}`
      lastValidScoreRef.current = {
        full: updatedFull,
        homeTeam: cached.homeTeam,
        awayTeam: cached.awayTeam,
        homeScore: newHomeScore,
        awayScore: newAwayScore,
      }
      return updatedFull
    }
    
    // First valid score - cache everything including team names
    const full = `${newHomeTeam} ${newHomeScore} - ${newAwayScore} ${newAwayTeam}`
    lastValidScoreRef.current = {
      full,
      homeTeam: newHomeTeam,
      awayTeam: newAwayTeam,
      homeScore: newHomeScore,
      awayScore: newAwayScore,
    }
    return full
  }, [liveScore])

  const looksLikeScore = Boolean(cleanedLiveScore && /\d+\s*-\s*\d+/.test(cleanedLiveScore))
  const isCryptoMarket = useMemo(() => {
    if (category && category.toLowerCase().includes("crypto")) return true
    const haystack = `${market} ${marketSlug ?? ""}`.toLowerCase()
    return Boolean(
      haystack.match(
        /\b(crypto|bitcoin|btc|ethereum|eth|solana|sol|dogecoin|doge|xrp|ripple|cardano|ada|polygon|matic|bnb|litecoin|ltc|avalanche|avax|arbitrum|arb|optimism|op|polkadot|dot|chainlink|link|uniswap|uni|cosmos|atom|near|sui|aptos|algo|algorand|tron|trx)\b/
      )
    )
  }, [category, market, marketSlug])
  const isSeasonLong = useMemo(() => isSeasonLongMarketTitle(market), [market])
  const isSportsCategory = useMemo(
    () => typeof category === "string" && category.toLowerCase().includes("sports"),
    [category]
  )
  const assessmentBetStructure = useMemo(() => {
    const titleLower = (market || "").toLowerCase()
    if (titleLower.includes("over") || titleLower.includes("under") || titleLower.includes("o/u")) return "OVER_UNDER"
    if (titleLower.includes("spread") || titleLower.includes("handicap")) return "SPREAD"
    if (titleLower.includes("total") && titleLower.includes("points")) return "TOTAL_POINTS"
    if (titleLower.includes("winner") || titleLower.includes("win") || titleLower.includes("will")) return "WINNER"
    return "STANDARD"
  }, [market])
  const resolvedLiveStatus = useMemo(() => {
    if (isSeasonLong) {
      const normalized = normalizeEventStatus(eventStatus)
      return statusLooksFinal(normalized) ? "final" : "scheduled"
    }
    const normalizedLiveStatus = typeof liveStatus === "string" ? liveStatus.toLowerCase() : ""
    if (normalizedLiveStatus === "live") return "live"
    if (normalizedLiveStatus === "final") return "final"
    if (normalizedLiveStatus === "scheduled") {
      if (looksLikeScore) return "live"
      if (eventStartTime) {
        const start = new Date(eventStartTime)
        if (!Number.isNaN(start.getTime())) {
          return Date.now() >= start.getTime() ? "live" : "scheduled"
        }
      }
      return "scheduled"
    }
    const normalized = normalizeEventStatus(eventStatus)
    if (statusLooksFinal(normalized)) return "final"
    if (statusLooksLive(normalized)) return "live"
    if (looksLikeScore) return "live"
    if (statusLooksScheduled(normalized)) {
      if (eventStartTime) {
        const start = new Date(eventStartTime)
        if (!Number.isNaN(start.getTime())) {
          return Date.now() >= start.getTime() ? "live" : "scheduled"
        }
      }
      return "scheduled"
    }
    if (eventStartTime) {
      const start = new Date(eventStartTime)
      if (!Number.isNaN(start.getTime())) {
        return Date.now() >= start.getTime() ? "live" : "scheduled"
      }
    }
    return "unknown"
  }, [isSeasonLong, liveStatus, eventStatus, eventStartTime, looksLikeScore])

  // Calculate orderBookPrice - will be overridden in expanded card context via effectiveAction
  const orderBookPrice = action === "Buy" ? bestAskPrice : bestBidPrice
  const resolvedLivePrice =
    typeof livePrice === "number" && !Number.isNaN(livePrice) ? livePrice : null
  const marketOpenHint = typeof marketIsOpen === "boolean" ? marketIsOpen : null
  const shouldUseOrderBook =
    resolvedLiveStatus !== "final" && marketOpenHint !== false
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
  const isMarketEnded = inferredMarketOpen === false

  const statusVariant = isMarketEnded
    ? "resolved"
    : resolvedLiveStatus === "live"
      ? "live"
      : resolvedLiveStatus === "final"
        ? "ended"
        : resolvedLiveStatus === "scheduled"
          ? "scheduled"
          : "open"

  const forceResolvedBadge = resolvedLiveStatus === "final" && looksLikeScore && isMarketEnded
  const statusBadgeVariant = forceResolvedBadge ? "resolved" : statusVariant

  const eventStatusLabel =
    statusBadgeVariant === "live"
      ? "Live"
      : statusBadgeVariant === "ended"
        ? "Ended"
        : statusBadgeVariant === "resolved"
          ? "Resolved"
          : statusBadgeVariant === "scheduled"
            ? "Scheduled"
            : "Open"

  const statusIconMap = {
    live: SignalHigh,
    ended: Flag,
    resolved: CheckCircle2,
    scheduled: Clock,
    open: CircleDot,
  } as const

  const StatusIcon = statusIconMap[statusBadgeVariant]

  const badgeBaseClass =
    "h-7 px-2.5 font-sans text-[10px] font-bold uppercase tracking-wide border"
  const espnLink = espnUrl?.trim() ? espnUrl : undefined
  const showTraderPositionBadge = Boolean(traderPositionBadge?.trades?.length)
  const showUserPositionBadge = Boolean(userPositionBadge?.trades?.length)
  const hasAnyPositionBadge = showTraderPositionBadge || showUserPositionBadge
  const totalPositionCount = (traderPositionBadge?.trades?.length ?? 0) + (userPositionBadge?.trades?.length ?? 0)
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

  const statusBadgeClass = cn(
    badgeBaseClass,
    statusBadgeVariant === "live" && "bg-profit-green/10 text-profit-green border-profit-green/30",
    statusBadgeVariant === "ended" && "bg-loss-red/10 text-loss-red border-loss-red/30",
    statusBadgeVariant === "resolved" && "bg-loss-red/10 text-loss-red border-loss-red/30",
    statusBadgeVariant === "scheduled" && "bg-poly-yellow/10 text-poly-black border-poly-yellow/30",
    statusBadgeVariant === "open" && "bg-accent text-muted-foreground border-border",
  )

  const showScoreBadge =
    Boolean(cleanedLiveScore && looksLikeScore) &&
    (resolvedLiveStatus === "live" || resolvedLiveStatus === "final")
  const hideLiveStatusBadge = isCryptoMarket && statusBadgeVariant === "live"

  const showCombinedScoreBadge =
    showScoreBadge && (statusBadgeVariant === "live" || statusBadgeVariant === "ended")
  // Always show "Live" or "Ended" - don't use gameTimeInfo as it causes flickering
  const combinedScoreLabel = statusBadgeVariant === "ended" ? "Ended" : "Live"
  const combinedScoreBadgeClass = cn(
    badgeBaseClass,
    "relative h-auto min-h-[34px] flex-col gap-0 px-3 pt-1 pb-3 leading-none w-[200px] min-w-[200px]",
    statusBadgeVariant === "live" && "bg-profit-green/10 text-profit-green border-profit-green/30",
    statusBadgeVariant === "ended" && "bg-loss-red/10 text-loss-red border-loss-red/30",
  )

  // Show event time badge for non-live, non-resolved, non-ended markets
  const showEventTimeBadge =
    statusBadgeVariant !== "live" &&
    statusBadgeVariant !== "resolved" &&
    statusBadgeVariant !== "ended"
  const hasEventTime = Boolean(eventStartTime || eventEndTime)
  const sportsTitleHint = useMemo(() => {
    if (!market) return false
    const lower = market.toLowerCase()
    const hasWinVerb = /\b(win|beat|defeat|draw|tie)\b/.test(lower)
    if (!hasWinVerb) return false
    const hasMatchToken = /\b(vs\.?|v\.?|@)\b/.test(lower)
    const hasTeamToken = /\b(fc|sc|cf|afc)\b/.test(lower)
    const hasLeagueToken =
      /\b(nfl|nba|nhl|mlb|ncaa|ucl|uefa|champions league|premier league|la liga|serie a|bundesliga|ligue 1|mls)\b/.test(
        lower
      )
    const slugHint = marketSlug?.toLowerCase() ?? ""
    const hasSlugLeague =
      slugHint.includes("ucl") ||
      slugHint.includes("uefa") ||
      slugHint.includes("champions") ||
      slugHint.includes("premier") ||
      slugHint.includes("bundesliga") ||
      slugHint.includes("laliga") ||
      slugHint.includes("seriea") ||
      slugHint.includes("ligue1")
    return hasMatchToken || hasTeamToken || hasLeagueToken || hasSlugLeague
  }, [market, marketSlug])

  const isSportsContext = Boolean(
    looksLikeScore ||
      liveStatus === "live" ||
      liveStatus === "final" ||
      sportsTitleHint ||
      (category && category.toLowerCase().includes("sports")) ||
      espnUrl
  )
  const { eventTimeValue, eventTimeKind } = useMemo(() => {
    if (isSeasonLong && eventEndTime) {
      return { eventTimeValue: eventEndTime, eventTimeKind: "end" as const }
    }
    if (statusVariant === "ended" || statusVariant === "resolved") {
      if (eventEndTime) return { eventTimeValue: eventEndTime, eventTimeKind: "end" as const }
      if (eventStartTime) return { eventTimeValue: eventStartTime, eventTimeKind: "start" as const }
      return { eventTimeValue: null, eventTimeKind: "unknown" as const }
    }
    if (eventStartTime) return { eventTimeValue: eventStartTime, eventTimeKind: "start" as const }
    if (eventEndTime) return { eventTimeValue: eventEndTime, eventTimeKind: "end" as const }
    return { eventTimeValue: null, eventTimeKind: "unknown" as const }
  }, [isSeasonLong, statusVariant, eventStartTime, eventEndTime])
  const { eventTimeLabel, isEventTimeLoading } = useMemo(() => {
    if (!eventTimeValue) {
      if (typeof currentMarketUpdatedAt === "number") {
        return { eventTimeLabel: "Time TBD", isEventTimeLoading: false }
      }
      return { eventTimeLabel: "Loading", isEventTimeLoading: true }
    }
    const prefix =
      eventTimeKind === "start" ? "Starts" : eventTimeKind === "end" ? "Resolves" : "Time"
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(eventTimeValue)
    const isMidnightUtc = /T00:00:00(?:\.000)?(?:Z|[+-]00:00)$/.test(eventTimeValue)
    const useDateOnly = isDateOnly || (eventTimeKind !== "start" && isMidnightUtc)
    const parsed = new Date(eventTimeValue)
    if (Number.isNaN(parsed.getTime())) return { eventTimeLabel: null, isEventTimeLoading: true }
    const timeZone = useDateOnly ? "UTC" : undefined
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    const toYmd = (date: Date) => {
      const parts = formatter.formatToParts(date)
      const lookup = parts.reduce<Record<string, string>>((acc, part) => {
        if (part.type !== "literal") acc[part.type] = part.value
        return acc
      }, {})
      return `${lookup.year}-${lookup.month}-${lookup.day}`
    }
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const targetKey = toYmd(parsed)
    if (eventTimeKind === "start") {
      if (targetKey === toYmd(today) || targetKey === toYmd(tomorrow)) {
        const label = targetKey === toYmd(today) ? "Today" : "Tomorrow"
        if (!useDateOnly) {
          const timeLabel = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
          }).format(parsed)
          return {
            eventTimeLabel: `${prefix} ${label}, ${timeLabel}`,
            isEventTimeLoading: false,
          }
        }
        return { eventTimeLabel: `${prefix} ${label}`, isEventTimeLoading: false }
      }
    }
    if (eventTimeKind === "end") {
      if (targetKey === toYmd(today)) {
        return { eventTimeLabel: `${prefix} Today`, isEventTimeLoading: false }
      }
      if (targetKey === toYmd(tomorrow)) {
        return { eventTimeLabel: `${prefix} Tomorrow`, isEventTimeLoading: false }
      }
    }
    const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
    const allowTime = !useDateOnly && eventTimeKind !== "end"
    if (allowTime && (parsed.getHours() !== 0 || parsed.getMinutes() !== 0)) {
      options.hour = "numeric"
      options.minute = "2-digit"
    }
    const formatted = new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: useDateOnly ? "UTC" : undefined,
    }).format(parsed)
    return { eventTimeLabel: `${prefix} ${formatted}`, isEventTimeLoading: false }
  }, [eventTimeValue, eventTimeKind, currentMarketUpdatedAt])

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

  const handleInsightsDrawerToggle = (preferredTab?: "positions" | "indicators" | "insights" | "gemini") => {
    if (isInsightsDrawerOpen && (!preferredTab || insightsDrawerTab === preferredTab)) {
      setIsInsightsDrawerOpen(false)
      return
    }
    if (preferredTab) {
      setInsightsDrawerTab(preferredTab)
    } else if (!isInsightsDrawerOpen) {
      // Default to positions if we have them, otherwise indicators
      setInsightsDrawerTab(hasAnyPositionBadge ? "positions" : "indicators")
    }
    if (!isInsightsDrawerOpen && hasAnyPositionBadge) {
      const preferredPositionTab = showUserPositionBadge ? "user" : "trader"
      setPositionDrawerTab(preferredPositionTab)
    }
    setIsInsightsDrawerOpen(true)
    // Auto-run Gemini if switching to that tab and haven't fetched yet
    if (preferredTab === "gemini" && isAdmin && !assessmentMessages.length && !assessmentLoading) {
      runAssessment()
    }
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

  const renderPositionDrawer = () => {
    if (!isInsightsDrawerOpen || !activePositionBadge) return null
    const trades = activePositionBadge.trades ?? []
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
      <div className="rounded-none border border-border bg-accent px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {tabOptions.length > 1 ? (
            <div className="flex items-center gap-1 rounded-none border border-border bg-card p-1">
              {tabOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPositionDrawerTab(option.key)}
                  className={cn(
                    "rounded-none px-2.5 py-1 font-sans text-[10px] font-bold uppercase tracking-wide transition",
                    positionDrawerTab === option.key
                      ? "bg-poly-black text-white"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : (
            <span className="bg-poly-black px-3 py-1 font-sans text-[10px] font-bold uppercase tracking-wide text-white">
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
                        "h-7 px-2.5 bg-poly-yellow/20 text-poly-black border-poly-yellow"
                      )}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
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
            const sideClass = trade.side === "SELL" ? "text-loss-red" : "text-profit-green"
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
              if (normalized === "yes") return "bg-profit-green/10 text-profit-green border-profit-green/30"
              if (normalized === "no") return "bg-loss-red/10 text-loss-red border-loss-red/30"
              return "bg-accent text-muted-foreground border-border"
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
            return (
              <div
                key={`${trade.side}-${trade.outcome}-${trade.timestamp ?? index}`}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1 truncate text-foreground">
                    <span className={cn("font-sans font-bold uppercase tracking-wide", sideClass)}>{sideLabel}</span>
                    <Badge
                      variant="secondary"
                      className={`font-sans font-bold text-[10px] uppercase tracking-wide ${outcomeBadgeClass}`}
                    >
                      {formatOutcomeLabel(trade.outcome)}
                    </Badge>
                  </p>
                  <p className="font-body text-[11px] text-muted-foreground tabular-nums">
                    {timestampLabel ?? "--"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-body text-muted-foreground tabular-nums">{primaryDetail}</p>
                  <p className="font-body text-[11px] text-muted-foreground tabular-nums">{secondaryDetail}</p>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex items-end justify-between gap-3 border-t border-border pt-2">
          <div className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">
            Total{hasSellTrades ? " (Buys - Sells)" : ""}
            <div className="font-body text-sm font-semibold tabular-nums text-foreground">{totalAmountLabel}</div>
            <div className="font-body text-[11px] font-medium tabular-nums text-muted-foreground normal-case tracking-normal">
              Ave Price {avgPriceLabel}
            </div>
            {showHedgingDetails ? (
              <div className="text-[11px] font-medium text-muted-foreground">
                {traderHedgingInfo.isEven || !traderHedgingInfo.longerOutcome ? (
                  "Evenly hedged across outcomes"
                ) : (
                  <>
                    Longer on{" "}
                    <span className="font-semibold text-foreground">
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
    // If on positions tab but no positions exist, switch to indicators
    if (!hasAnyPositionBadge && isInsightsDrawerOpen && insightsDrawerTab === "positions") {
      setInsightsDrawerTab("indicators")
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
    isInsightsDrawerOpen,
    insightsDrawerTab,
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
          // Use effectiveAction for price when in expanded card context
          const currentEffectiveAction = isSellTrade && !userHasMatchingPosition ? "Buy" : action
          setLivePrice(currentEffectiveAction === "Buy" ? bestAsk : bestBid)
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
      ? "bg-profit-green/10 text-profit-green border-profit-green/30"
      : normalizedOutcome === "no"
        ? "bg-loss-red/10 text-loss-red border-loss-red/30"
        : "bg-accent text-foreground border-border"

  const defaultSlippagePercent = resolvedDefaultSlippage
  const minTradeUsd = 1
  const slippagePercent =
    slippagePreset === "custom" ? Number(customSlippage) : Number(slippagePreset)
  const resolvedSlippage =
    Number.isFinite(slippagePercent) && slippagePercent >= 0 ? slippagePercent : defaultSlippagePercent
  // Calculate limitPrice using action (will be recalculated with effectiveAction later)
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
      // Use effectiveLimitPrice when showCopyBuyCta is true, otherwise use limitPrice
      const finalLimitPrice = showCopyBuyCta && effectiveLimitPrice ? effectiveLimitPrice : limitPrice
      const requestBody = {
        tokenId: finalTokenId,
        price: finalLimitPrice,
        amount: finalContracts,
        side: effectiveAction === 'Buy' ? 'BUY' : 'SELL',
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
  // v2: Any account with a connected wallet gets the quick-copy experience
  const showQuickCopyExperience = hasConnectedWallet
  // v2: Only accounts without a wallet see the manual (step 1 / step 2) experience
  const allowManualExperience = !hasConnectedWallet
  const showLinkWalletHint = !hasConnectedWallet
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
  // When showing "Copy Trade (Buy)" for a sell trade, we want to execute a buy order
  const effectiveAction = showCopyBuyCta ? "Buy" : action
  // Recalculate currentPrice using effectiveAction for correct buy/sell price display
  const effectiveOrderBookPrice = effectiveAction === "Buy" ? bestAskPrice : bestBidPrice
  const effectiveCurrentPrice = useMemo(() => {
    const shouldUseOrderBook =
      resolvedLiveStatus !== "final" && marketOpenHint !== false
    return shouldUseOrderBook && typeof effectiveOrderBookPrice === "number" && Number.isFinite(effectiveOrderBookPrice)
      ? effectiveOrderBookPrice
      : resolvedLivePrice !== null
        ? resolvedLivePrice
        : price
  }, [effectiveOrderBookPrice, resolvedLiveStatus, marketOpenHint, resolvedLivePrice, price])
  // Recalculate limitPrice using effectiveAction and effectiveCurrentPrice
  const effectiveLimitPrice = useMemo(() => {
    const rawLimit =
      Number.isFinite(effectiveCurrentPrice) && effectiveCurrentPrice > 0
        ? effectiveAction === "Buy"
          ? effectiveCurrentPrice * (1 + resolvedSlippage / 100)
          : effectiveCurrentPrice * (1 - resolvedSlippage / 100)
        : null
    return rawLimit && Number.isFinite(rawLimit)
      ? roundPriceToTickSize(rawLimit, marketTickSize)
      : null
  }, [effectiveCurrentPrice, effectiveAction, resolvedSlippage, marketTickSize])
  const shouldShowCopyCta = !isSellTrade || showCopyBuyCta
  const shouldShowPrimaryCta = isSellTrade || shouldShowCopyCta
  const copyCtaLabel = showCopyBuyCta ? "Copy Trade (Buy)" : "Copy Trade"
  const copyAgainLabel = "Buy Again"
  const fireReasonLabel = useCallback((reason: string) => {
    // Show actual values when available, otherwise show threshold
    if (reason === "win_rate") {
      if (fireWinRate !== null && fireWinRate !== undefined) {
        return `Win rate ${(fireWinRate * 100).toFixed(0)}%`
      }
      return "Win rate ≥55%"
    }
    if (reason === "conviction") {
      if (fireConviction !== null && fireConviction !== undefined) {
        return `Conviction ${fireConviction.toFixed(1)}x`
      }
      return "Conviction ≥2.5x"
    }
    if (reason === "roi") {
      if (fireRoi !== null && fireRoi !== undefined) {
        return `ROI ${(fireRoi * 100).toFixed(0)}%`
      }
      return "ROI ≥15%"
    }
    return reason
  }, [fireWinRate, fireRoi, fireConviction])
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
    // If showing "Copy Trade (Buy)" for a sell trade, expand to show buy flow
    if (showCopyBuyCta && onToggleExpand) {
      onToggleExpand()
      return
    }
    if (allowQuickCopyExperience && onToggleExpand) {
      onToggleExpand()
      return
    }
    if (!hasConnectedWallet && !manualTradingEnabled) {
      setShowWalletPrompt(true)
      return
    }

    // For manual experience, just open Polymarket
    onCopyTrade?.()
  }

  const handleMarkAsConfirmedClick = () => {
    if (isMarketEnded) return
    if (!shouldShowCopyCta) return
    
    // Open the manual drawer to enter order details
    if (!manualDrawerOpen) {
      openManualDrawer()
    }
  }

  const closeManualDrawer = () => {
    setManualDrawerOpen(false)
    setManualUsdAmount("")
    setManualPriceInput("")
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
      ? 'text-muted-foreground'
      : manualPriceChange >= 0
        ? 'text-profit-green'
        : 'text-loss-red'
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
  let statusLabel: string
  if (statusPhase === "filled") {
    statusLabel = "Filled"
  } else if (statusPhase === "partial") {
    statusLabel = "Partially filled"
  } else if (statusPhase === "timed_out") {
    statusLabel = "Failed to match on Polymarket"
  } else if (orderType === "FAK" && (statusPhase === "canceled" || statusPhase === "expired" || statusPhase === "rejected") && (!filledContracts || filledContracts <= 0)) {
    statusLabel = "Not filled (FAK)"
  } else {
    statusLabel = pendingStatusLabel
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

  // Fetch PolyScore analysis
  const fetchPolyScore = useCallback(async () => {
    if (!conditionId || !trader.address) return
    
    // Create a unique key for this trade
    const tradeKey = `${conditionId}-${trader.address}`
    
    // Prevent duplicate fetches for the same trade
    if (polyScoreFetchedRef.current === tradeKey) return
    polyScoreFetchedRef.current = tradeKey

    setPolyScoreLoading(true)
    setPolyScoreError(null)

    try {
      // Get user session token
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const request: PolyScoreRequest = {
        original_trade: {
          wallet_address: trader.address,
          condition_id: conditionId,
          side: action === 'Buy' ? 'BUY' : 'SELL',
          price: price,
          shares_normalized: size,
          timestamp: new Date().toISOString(),
        },
        market_context: {
          current_price: currentMarketPrice ?? price,
          current_timestamp: new Date().toISOString(),
          market_title: market,
          market_tags: category ? JSON.stringify([category]) : null,
          market_bet_structure: null,
        },
        user_slippage: action === 'Buy' 
          ? (defaultBuySlippage ?? 0.05)
          : (defaultSellSlippage ?? 0.05),
      }

      const response = await getPolyScore(request, token)
      console.log('[TradeCard] PolyScore response received:', {
        hasVerdict: !!response.verdict,
        hasUiPresentation: !!response.ui_presentation,
        polyscore: response.polyscore,
        verdict: response.verdict,
        verdictLabel: response.verdict?.label,
        verdictIcon: response.verdict?.icon,
        verdictColor: response.verdict?.color,
        legacyVerdict: response.ui_presentation?.verdict,
        fullResponse: response,
      })
      setPolyScoreData(response)
    } catch (err: any) {
      setPolyScoreError(err?.message || 'Failed to fetch PolyScore')
      console.error('[TradeCard] PolyScore error:', err)
    } finally {
      setPolyScoreLoading(false)
    }
  }, [conditionId, trader.address, action, price, size, currentMarketPrice, market, category, defaultBuySlippage, defaultSellSlippage])

  // Auto-fetch PolyScore when component mounts and required data is available (admin only)
  useEffect(() => {
    // Reset state when trade changes or if user is not admin
    if (!isAdmin) {
      setPolyScoreData(null)
      setPolyScoreError(null)
      return
    }
    
    const tradeKey = conditionId && trader.address ? `${conditionId}-${trader.address}` : null
    if (tradeKey && polyScoreFetchedRef.current !== tradeKey) {
      // Reset data if this is a different trade
      if (polyScoreFetchedRef.current !== null) {
        setPolyScoreData(null)
        setPolyScoreError(null)
      }
    }
    
    // Only fetch if user is admin, we have required data and haven't fetched for this specific trade yet
    if (isAdmin && conditionId && trader.address && polyScoreFetchedRef.current !== tradeKey) {
      fetchPolyScore()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, conditionId, trader.address]) // Only depend on the essential data to avoid infinite loops

  // Fetch indicator score client-side for the compact header badge when server data isn't available
  useEffect(() => {
    // If we already have server-side data, use that
    if (polySignalScore != null && polySignalRecommendation) {
      setIndicatorScore(polySignalScore)
      setIndicatorRecommendation(polySignalRecommendation)
      return
    }
    // Need wallet + price to fetch
    if (!trader.address || !price || price <= 0) return
    const tradeKey = `${conditionId ?? "none"}-${trader.address}`
    if (indicatorFetchedRef.current === tradeKey) return
    indicatorFetchedRef.current = tradeKey

    const params = new URLSearchParams({
      wallet: trader.address.toLowerCase(),
      price: String(price),
      size: String(size ?? 0),
      title: market ?? '',
      category: marketSubtype ?? '',
    })
    if (conditionId) params.set('conditionId', conditionId)
    if (position) params.set('outcome', position)

    fetch(`/api/polysignal?${params}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res?.score != null && res?.recommendation) {
          setIndicatorScore(res.score)
          setIndicatorRecommendation(res.recommendation)
        }
      })
      .catch(() => {/* silently ignore */})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trader.address, price, conditionId, polySignalScore, polySignalRecommendation])

  const buildAssessmentSnapshot = useCallback((): TradeAssessmentSnapshot => {
    const nowIso = new Date().toISOString()
    const livePriceValue = Number.isFinite(currentPrice) ? currentPrice : null
    const roiFromLive =
      livePriceValue !== null && price > 0 ? ((livePriceValue - price) / price) * 100 : null
    const priceEdgePct =
      livePriceValue !== null ? (livePriceValue - price) * 100 : null

    let minsBeforeClose: number | null = null
    if (eventEndTime) {
      const end = new Date(eventEndTime)
      if (!Number.isNaN(end.getTime())) {
        minsBeforeClose = Math.round((end.getTime() - Date.now()) / 60000)
      }
    }
    let minutesToStart: number | null = null
    let minutesToEnd: number | null = null
    if (eventStartTime) {
      const start = new Date(eventStartTime)
      if (!Number.isNaN(start.getTime())) {
        minutesToStart = Math.round((start.getTime() - Date.now()) / 60000)
      }
    }
    if (eventEndTime) {
      const end = new Date(eventEndTime)
      if (!Number.isNaN(end.getTime())) {
        minutesToEnd = Math.round((end.getTime() - Date.now()) / 60000)
      }
    }

    return {
      tradeId: tradeAnchorId || conditionId || tokenId || null,
      trader: {
        name: trader.name,
        wallet: trader.address,
        roi: trader.roi ?? null,
        convictionScore: fireConviction ?? null,
      },
      market: {
        title: market,
        category: category ?? null,
        isSports: isSportsCategory,
        position,
        action,
        conditionId: conditionId ?? null,
        tokenId: tokenId ?? null,
        marketSlug: marketSlug ?? null,
        polymarketUrl: polymarketUrl ?? null,
        espnUrl: espnUrl ?? null,
        betStructure: assessmentBetStructure ?? null,
      },
      numbers: {
        entryPrice: price,
        size,
        totalUsd: total,
        currentPrice: livePriceValue,
        roiFromLive,
        priceEdgePct,
      },
      timing: {
        tradeTimestamp: tradeTimestamp ?? null,
        eventStartTime: eventStartTime ?? null,
        eventEndTime: eventEndTime ?? null,
        liveStatus: resolvedLiveStatus,
        eventStatus: eventStatus ?? null,
        currentTimestampIso: nowIso,
        minutesToStart,
        minutesToEnd,
      },
      live: {
        liveScore: liveScore ?? null,
        liveStatusSource: liveStatus ?? null,
        gameTimeInfo: null,
        minsBeforeClose,
      },
      insights: {
        fireReasons: fireReasons ?? null,
        fireScore: fireScore ?? null,
        fireWinRate: fireWinRate ?? null,
        fireRoi: fireRoi ?? null,
        fireConviction: fireConviction ?? null,
      },
    }
  }, [
    action,
    category,
    conditionId,
    eventEndTime,
    eventStartTime,
    eventStatus,
    fireConviction,
    fireReasons,
    fireRoi,
    fireScore,
    fireWinRate,
    liveScore,
    liveStatus,
    market,
    marketSlug,
    polymarketUrl,
    position,
    price,
    resolvedLiveStatus,
    size,
    tokenId,
    total,
    tradeAnchorId,
    tradeTimestamp,
    trader.address,
    trader.name,
    trader.roi,
    currentPrice,
  ])

  const runAssessment = useCallback(
    async (userMessage?: string) => {
      if (!isAdmin) return
      const trimmed = userMessage?.trim()
      const messagesForRequest = trimmed
        ? [...assessmentMessages, { role: 'user' as const, content: trimmed }]
        : [...assessmentMessages]

      if (trimmed) {
        setAssessmentMessages(messagesForRequest)
        setAssessmentInput("")
      }

      setAssessmentLoading(true)
      setAssessmentError(null)

      try {
        const snapshot = buildAssessmentSnapshot()
        const response = await fetch("/api/admin/gemini-trade-assessor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshot,
            messages: messagesForRequest,
            userMessage: trimmed,
          }),
        })

        let payload: any
        try {
          payload = await response.json()
        } catch (jsonError) {
          const text = await response.text()
          console.error("[Gemini Verdict] Failed to parse response as JSON:", jsonError)
          console.error("[Gemini Verdict] Response text:", text.substring(0, 500))
          throw new Error(`Invalid response from server: ${response.status} ${response.statusText}`)
        }

        if (!response.ok) {
          const errorMsg = payload?.error || `Server error: ${response.status} ${response.statusText}`
          console.error("[Gemini Verdict] API error:", {
            status: response.status,
            statusText: response.statusText,
            error: payload?.error,
            details: payload?.details,
          })
          throw new Error(errorMsg)
        }

        const rawText: string = payload?.text || ""
        const parsed: GeminiAssessment | null = payload?.analysis
          ? {
              recommendation: payload.analysis.recommendation || "uncertain",
              betSize: payload.analysis.betSize || "regular",
              confidence: payload.analysis.confidence ?? undefined,
              headline: payload.analysis.headline,
              rationale: payload.analysis.rationale,
              liveInsights: payload.analysis.liveInsights,
              riskNotes: payload.analysis.riskNotes,
              timingCallout: payload.analysis.timingCallout,
              rawText: payload.analysis.rawText || rawText,
            }
          : rawText
            ? { recommendation: "uncertain", betSize: "regular", rawText }
            : null

        const assistantText =
          parsed && parsed.headline
            ? `${parsed.headline}${parsed.rationale?.length ? `\n• ${parsed.rationale.slice(0, 2).join("\n• ")}` : ""}`
            : rawText || "No response"

        setAssessmentResult(parsed)
        setAssessmentMessages([...messagesForRequest, { role: "assistant", content: assistantText }])
      } catch (error: any) {
        console.error("[Gemini Verdict] Error:", error)
        const errorMessage = error?.message || "Failed to get Gemini verdict"
        setAssessmentError(errorMessage)
        // Log additional error details in development
        if (process.env.NODE_ENV === 'development') {
          console.error("[Gemini Verdict] Full error:", error)
        }
      } finally {
        setAssessmentLoading(false)
      }
    },
    [assessmentMessages, buildAssessmentSnapshot, isAdmin]
  )

  useEffect(() => {
    if (isAdmin && isInsightsDrawerOpen && insightsDrawerTab === "gemini" && assessmentMessages.length === 0 && !assessmentLoading) {
      runAssessment()
    }
  }, [isInsightsDrawerOpen, insightsDrawerTab, assessmentLoading, assessmentMessages.length, isAdmin, runAssessment])

  return (
    <div
      ref={cardRef}
      id={tradeAnchorId}
      className={cn(
        "group relative border rounded-none overflow-hidden transition-all hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,0.08)]",
        "bg-card border-border"
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
            <TraderAvatar
              displayName={trader.name}
              wallet={trader.address}
              src={trader.avatar}
              size={40}
              className="ring-2 ring-border transition-all"
            />
            <div className="min-w-0">
              <p className="font-sans font-bold text-foreground text-sm leading-tight">{trader.name}</p>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Flags — Hedging / Sold / Positions */}
            {traderHedgingInfo.isHedging && (
              <span className="h-6 px-2 inline-flex items-center font-sans text-[9px] font-bold uppercase tracking-wide bg-poly-yellow/20 text-poly-black border border-poly-yellow whitespace-nowrap">
                Hedging
              </span>
            )}
            {isSellTrade && (
              <span className="h-6 px-2 inline-flex items-center font-sans text-[9px] font-bold uppercase tracking-wide bg-loss-red/10 text-loss-red border border-loss-red/40 whitespace-nowrap">
                Sold
              </span>
            )}
            {/* Indicator score — colored square with number */}
            {indicatorScore != null && indicatorRecommendation && (
              <button
                type="button"
                onClick={() => handleInsightsDrawerToggle("indicators")}
                aria-label={`PolySignal score ${indicatorScore}`}
                className={cn(
                  "flex items-center justify-center w-8 h-8 font-sans text-xs font-bold text-white transition-opacity hover:opacity-80",
                  indicatorRecommendation === 'STRONG_BUY' && "bg-profit-green",
                  indicatorRecommendation === 'BUY' && "bg-profit-green",
                  indicatorRecommendation === 'NEUTRAL' && "bg-neutral-grey",
                  indicatorRecommendation === 'AVOID' && "bg-poly-yellow text-poly-black",
                  indicatorRecommendation === 'TOXIC' && "bg-loss-red",
                )}
              >
                {indicatorScore}
              </button>
            )}
            <span className="font-sans text-[11px] text-muted-foreground font-medium tabular-nums whitespace-nowrap">{timestamp}</span>
          </div>
        </div>

        <div className="mb-2 rounded-none bg-accent/70 -mx-5 px-5 md:-mx-6 md:px-6 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2.5 md:items-center">
                <MarketAvatar
                  marketName={market}
                  src={marketAvatar}
                  size={44}
                  className="ring-2 ring-border"
                />
                <div className="min-w-0">
                  <h3 className="font-sans text-base md:text-lg font-semibold text-foreground leading-snug break-words">
                    {market}
                    {/* External link icon for Premium users - at end of market name */}
                    {isPremium && polymarketUrl && (
                      <a
                        href={polymarketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 inline-flex text-muted-foreground hover:text-muted-foreground transition-colors"
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
              {showEventTimeBadge && (
                espnLink ? (
                  <Badge
                    asChild
                    variant="secondary"
                    className={cn(
                      badgeBaseClass,
                      hasEventTime
                        ? "bg-card text-foreground border-border"
                        : "bg-card text-muted-foreground border-border",
                    )}
                  >
                    <a href={espnLink} target="_blank" rel="noopener noreferrer">
                      {isEventTimeLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CalendarClock className="h-3.5 w-3.5" />
                      )}
                      {eventTimeLabel ?? "Loading"}
                    </a>
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className={cn(
                      badgeBaseClass,
                      hasEventTime
                        ? "bg-card text-foreground border-border"
                        : "bg-card text-muted-foreground border-border",
                    )}
                  >
                    {isEventTimeLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CalendarClock className="h-3.5 w-3.5" />
                    )}
                    {eventTimeLabel ?? "Loading"}
                  </Badge>
                )
              )}
              {!showCombinedScoreBadge &&
                (statusBadgeVariant === "live" ||
                  statusBadgeVariant === "ended" ||
                  statusBadgeVariant === "resolved") &&
                  !hideLiveStatusBadge && (
                  espnLink ? (
                    <Badge asChild variant="secondary" className={statusBadgeClass}>
                      <a href={espnLink} target="_blank" rel="noopener noreferrer">
                        <StatusIcon className="h-3.5 w-3.5" />
                        {eventStatusLabel}
                      </a>
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className={statusBadgeClass}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {eventStatusLabel}
                    </Badge>
                  )
                )}
              {showCombinedScoreBadge ? (
                <div className="ml-auto md:ml-0">
                  {espnLink ? (
                    <Badge asChild variant="secondary" className={combinedScoreBadgeClass}>
                      <a href={espnLink} target="_blank" rel="noopener noreferrer">
                        <span className="flex items-center justify-center gap-1 w-full overflow-hidden">
                          <Trophy className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate whitespace-nowrap">{cleanedLiveScore}</span>
                        </span>
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-sans text-[8px] font-bold uppercase tracking-widest opacity-70">
                          {combinedScoreLabel}
                        </span>
                      </a>
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className={combinedScoreBadgeClass}>
                      <span className="flex items-center justify-center gap-1 w-full overflow-hidden">
                        <Trophy className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate whitespace-nowrap">{cleanedLiveScore}</span>
                      </span>
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 font-sans text-[8px] font-bold uppercase tracking-widest opacity-70">
                        {combinedScoreLabel}
                      </span>
                    </Badge>
                  )}
                </div>
              ) : showScoreBadge ? (
                <div className="ml-auto md:ml-0">
                  {espnLink ? (
                    <Badge
                      asChild
                      variant="secondary"
                      className={cn(
                        badgeBaseClass,
                        "bg-accent text-foreground border-border w-[200px] min-w-[200px] overflow-hidden",
                      )}
                    >
                      <a href={espnLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1 w-full">
                        <Trophy className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate whitespace-nowrap">{cleanedLiveScore}</span>
                      </a>
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className={cn(
                        badgeBaseClass,
                        "bg-accent text-foreground border-border w-[200px] min-w-[200px] overflow-hidden justify-center",
                      )}
                    >
                      <Trophy className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate whitespace-nowrap">{cleanedLiveScore}</span>
                    </Badge>
                  )}
                </div>
              ) : null}
              {/* Info badge removed - never show percentages like "Over: 40% | Under: 60%" */}
            </div>
          </div>
        </div>

        {/* Always-visible Insights Tabs */}
        <div className="mb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border pb-0">
            {hasAnyPositionBadge && (
              <button
                type="button"
                onClick={() => handleInsightsDrawerToggle("positions")}
                className={cn(
                  "px-3 py-2 font-sans text-[10px] font-bold uppercase tracking-wide transition whitespace-nowrap border border-b-0",
                  isInsightsDrawerOpen && insightsDrawerTab === "positions"
                    ? "text-foreground bg-card border-border -mb-px"
                    : "text-muted-foreground hover:text-foreground border-transparent hover:border-border/50"
                )}
              >
                Positions{totalPositionCount > 1 ? ` ${totalPositionCount}+` : ""}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleInsightsDrawerToggle("indicators")}
              className={cn(
                "px-3 py-2 font-sans text-[10px] font-bold uppercase tracking-wide transition whitespace-nowrap border border-b-0",
                isInsightsDrawerOpen && insightsDrawerTab === "indicators"
                  ? "text-foreground bg-card border-border -mb-px"
                  : "text-muted-foreground hover:text-foreground border-transparent hover:border-border/50"
              )}
            >
              Indicators
              {indicatorScore != null && (
                <span className="ml-1.5 font-body tabular-nums">{indicatorScore}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => handleInsightsDrawerToggle("insights")}
              className={cn(
                "px-3 py-2 font-sans text-[10px] font-bold uppercase tracking-wide transition whitespace-nowrap border border-b-0",
                isInsightsDrawerOpen && insightsDrawerTab === "insights"
                  ? "text-foreground bg-card border-border -mb-px"
                  : "text-muted-foreground hover:text-foreground border-transparent hover:border-border/50"
              )}
            >
              Trader Insights
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  handleInsightsDrawerToggle("gemini")
                  if (!assessmentMessages.length && !assessmentLoading) {
                    runAssessment()
                  }
                }}
                className={cn(
                  "px-3 py-2 font-sans text-[10px] font-bold uppercase tracking-wide transition whitespace-nowrap border border-b-0 flex items-center gap-1.5",
                  isInsightsDrawerOpen && insightsDrawerTab === "gemini"
                    ? "text-foreground bg-card border-border -mb-px"
                    : "text-muted-foreground hover:text-foreground border-transparent hover:border-border/50"
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Gemini
              </button>
            )}
          </div>

          {/* Tab Content — collapsed by default, shown when a tab is active */}
          {isInsightsDrawerOpen && (
            <div
              className="border border-t-0 border-border bg-card"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="p-3">
                {/* Positions Tab */}
                {insightsDrawerTab === "positions" && hasAnyPositionBadge && activePositionBadge && (
                  renderPositionDrawer()
                )}

                {/* Indicators Tab (PolySignal) */}
                {insightsDrawerTab === "indicators" && (
                  <PolySignal
                    data={polyScoreData}
                    loading={polyScoreLoading}
                    entryPrice={price}
                    currentPrice={currentPrice}
                    walletAddress={trader.address}
                    tradeSize={size}
                    marketSubtype={marketSubtype}
                    marketTitle={market}
                    conditionId={conditionId}
                    outcome={position}
                    serverRecommendation={polySignalRecommendation}
                    serverScore={polySignalScore}
                    serverIndicators={polySignalIndicators}
                  />
                )}

                {/* Trader Insights Tab (PredictionStats) */}
                {insightsDrawerTab === "insights" && (
                  conditionId && trader.address ? (
                    <PredictionStats
                      walletAddress={trader.address}
                      conditionId={conditionId}
                      price={price}
                      size={size}
                      marketTitle={market}
                      marketCategory={category}
                      marketTags={marketTagsForInsights}
                      marketSubtype={marketSubtype}
                      betStructure={betStructure}
                      isAdmin={isAdmin}
                      fireReasons={fireReasons}
                      fireWinRate={fireWinRate}
                      fireRoi={fireRoi}
                      fireConviction={fireConviction}
                    />
                  ) : (
                    <p className="font-body text-sm text-muted-foreground py-4 text-center">No trader insights available for this trade.</p>
                  )
                )}

                {/* Gemini Verdict Tab */}
                {insightsDrawerTab === "gemini" && isAdmin && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-sans text-xs font-bold uppercase tracking-wide text-foreground">Gemini Trade Verdict</p>
                        <p className="font-body text-xs text-muted-foreground">AI read on this trade with live context.</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {assessmentLoading && <Loader2 className="h-4 w-4 animate-spin text-poly-yellow" />}
                        {assessmentResult?.confidence !== undefined && (
                          <span className="font-body font-semibold tabular-nums">{Math.round(assessmentResult.confidence)}% conf.</span>
                        )}
                      </div>
                    </div>

                    {assessmentError && (
                      <div className="rounded-none border border-loss-red/30 bg-loss-red/10 px-3 py-2 font-body text-sm text-loss-red">
                        {assessmentError}
                      </div>
                    )}

                    <div className="rounded-none border border-border bg-accent p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="font-sans text-[10px] font-bold uppercase tracking-wide">
                          Verdict: {(assessmentResult?.recommendation ?? "pending").replace(/_/g, " ")}
                        </Badge>
                        <Badge variant="secondary" className="font-sans text-[10px] font-bold uppercase tracking-wide">
                          Size: {assessmentResult?.betSize ?? "—"}
                        </Badge>
                        {assessmentResult?.timingCallout && (
                          <span className="bg-card px-3 py-1 font-sans text-[10px] font-bold text-foreground border border-border">
                            {assessmentResult.timingCallout}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-2">
                        {assessmentResult?.headline ? (
                          <p className="font-sans text-sm font-bold text-foreground">{assessmentResult.headline}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {assessmentLoading ? "Gemini is analyzing this trade…" : "Run Gemini to get a verdict."}
                          </p>
                        )}
                        {assessmentResult?.rationale?.length ? (
                          <ul className="list-disc space-y-1 pl-5 font-body text-sm text-foreground">
                            {assessmentResult.rationale.slice(0, 4).map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        ) : null}
                        {assessmentResult?.liveInsights?.length ? (
                          <div>
                            <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Live Notes</p>
                            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                              {assessmentResult.liveInsights.slice(0, 3).map((item, idx) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {assessmentResult?.riskNotes?.length ? (
                          <div>
                            <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Risk</p>
                            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
                              {assessmentResult.riskNotes.slice(0, 3).map((item, idx) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {!assessmentResult?.headline && assessmentResult?.rawText && (
                          <pre className="mt-2 max-h-40 overflow-auto rounded-none bg-poly-black/90 p-3 text-[11px] text-white/70">
                            {assessmentResult.rawText}
                          </pre>
                        )}
                      </div>
                    </div>

                    <div className="rounded-none border border-border bg-card p-3">
                      <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Conversation</p>
                      <div className="max-h-64 overflow-y-auto space-y-3">
                        {assessmentMessages.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No messages yet. Gemini will drop a verdict when you ask.</p>
                        ) : (
                          assessmentMessages.map((message, idx) => {
                            const isAssistant = message.role === "assistant"
                            return (
                              <div
                                key={`${message.role}-${idx}-${message.content.slice(0, 8)}`}
                                className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
                              >
                                <div
                                  className={cn(
                                    "max-w-[78%] rounded-none border px-3 py-2 font-body text-sm whitespace-pre-wrap",
                                    isAssistant
                                      ? "bg-accent border-border text-foreground"
                                      : "bg-poly-black border-poly-black/80 text-white"
                                  )}
                                >
                                  <p
                                    className={cn(
                                      "font-sans text-[9px] font-bold uppercase tracking-widest mb-1",
                                      isAssistant ? "text-muted-foreground" : "text-white/80"
                                    )}
                                  >
                                    {isAssistant ? "Gemini" : "You"}
                                  </p>
                                  {message.content}
                                </div>
                              </div>
                            )
                          })
                        )}
                        {assessmentLoading && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin text-poly-yellow" />
                            <span>Gemini is thinking…</span>
                          </div>
                        )}
                      </div>
                      <div className="mt-3 flex w-full items-center gap-2">
                        <Input
                          value={assessmentInput}
                          onChange={(e) => setAssessmentInput(e.target.value)}
                          placeholder="Ask Gemini about this trade..."
                          disabled={assessmentLoading}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault()
                              if (assessmentInput.trim()) {
                                runAssessment(assessmentInput)
                              }
                            }
                          }}
                        />
                        <Button
                          onClick={() => assessmentInput.trim() && runAssessment(assessmentInput)}
                          disabled={assessmentLoading || !assessmentInput.trim()}
                          className="bg-poly-black text-white hover:bg-poly-black/90 font-sans font-bold uppercase tracking-wide"
                        >
                          {assessmentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                        </Button>
                      </div>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Gemini only sees the snapshot we send (price, size, live score, timing, fire stats). No external browsing.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-border mb-0">
            <div className="bg-card py-2.5 text-center">
              <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground mb-1">Outcome</p>
              <div className="flex flex-wrap items-center justify-center max-w-full">
                <Badge
                  variant="secondary"
                  className={`font-sans font-bold text-xs uppercase tracking-wide ${outcomeBadgeClass} max-w-[140px] whitespace-normal break-words text-center leading-snug`}
                >
                  {formatOutcomeLabel(position)}
                </Badge>
              </div>
            </div>
            <div className="bg-card py-2.5 text-center">
              <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground mb-1">Invested</p>
              <p className="font-body text-sm md:text-base font-semibold tabular-nums text-foreground">{formatCurrency(total)}</p>
            </div>
            <div className="bg-card py-2.5 text-center">
              <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground mb-1">Contracts</p>
              <p className="font-body text-sm md:text-base font-semibold tabular-nums text-foreground">{formatContracts(size)}</p>
            </div>
            <div className="bg-card py-2.5 text-center">
              <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground mb-1">Entry</p>
              <p className="font-body text-sm md:text-base font-semibold tabular-nums text-foreground">{formatPrice(price)}</p>
            </div>
            <div className="bg-card py-2.5 text-center">
              <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground mb-1">Current</p>
              <p className="font-body text-sm md:text-base font-semibold tabular-nums">
                <span
                  className={cn(
                    "inline-flex items-center justify-center px-1.5 py-0.5 transition-colors duration-300",
                    !hasCurrentPrice && "text-muted-foreground",
                    priceFlash === "up" && "bg-profit-green/10 text-profit-green",
                    priceFlash === "down" && "bg-loss-red/10 text-loss-red",
                    priceFlash === "neutral" && "bg-accent text-foreground",
                    priceFlash === null && hasCurrentPrice && "text-foreground"
                  )}
                >
                  {hasCurrentPrice ? formatPrice(currentPrice) : "--"}
                </span>
              </p>
            </div>
            <div className="bg-card py-2.5 text-center">
              <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground mb-1">ROI</p>
              <p className={`font-body text-sm md:text-base font-semibold tabular-nums ${
                priceDirection === 'neutral' || !hasCurrentPrice ? 'text-muted-foreground' :
                priceDirection === 'up' ? 'text-profit-green' :
                'text-loss-red'
              }`}>
                {!hasCurrentPrice ? '--' : `${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}%`}
              </p>
            </div>
        </div>

        {!hideActions && allowManualExperience && manualDrawerOpen && shouldShowCopyCta && (
          <div className="p-4 mt-4 space-y-4 border border-border rounded-none bg-accent">
            <div className="flex items-center justify-between">
              <h4 className="font-sans text-xs font-bold uppercase tracking-wide text-foreground">Manual Copy</h4>
              <button
                type="button"
                onClick={closeManualDrawer}
                className="p-1 rounded-none text-muted-foreground hover:text-muted-foreground hover:bg-accent"
                aria-label="Close manual copy drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-card border border-border rounded-none p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">Current Price</span>
                <div className="text-right">
                  <p className="font-body text-base font-semibold tabular-nums text-foreground">${manualDisplayPrice.toFixed(4)}</p>
                  <p className={`font-body text-xs font-medium tabular-nums ${manualPriceChangeColor}`}>{manualPriceChangeLabel}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="manual-copy-price" className="font-sans text-[9px] font-medium uppercase tracking-widest text-foreground">
                Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  id="manual-copy-price"
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  value={manualPriceInput}
                  onChange={(e) => setManualPriceInput(e.target.value)}
                  placeholder={manualDisplayPrice.toFixed(4)}
                  className="w-full pl-7 pr-3 py-2.5 border border-border rounded-none font-body text-sm tabular-nums focus:ring-2 focus:ring-poly-yellow focus:border-poly-yellow outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="manual-copy-amount" className="font-sans text-[9px] font-medium uppercase tracking-widest text-foreground">
                Amount (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                <input
                  id="manual-copy-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={manualUsdAmount}
                  onChange={(e) => setManualUsdAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2.5 border border-border rounded-none font-body text-sm tabular-nums focus:ring-2 focus:ring-poly-yellow focus:border-poly-yellow outline-none transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
              {manualAmountPositive && (
                <p className="font-body text-xs text-muted-foreground tabular-nums">
                  ≈ {manualContractsEstimate.toLocaleString()} contracts
                </p>
              )}
            </div>

            <div className="flex justify-center">
              <Button
                onClick={handleManualMarkAsCopied}
                disabled={!manualAmountValid || isCopyDisabled || isCopied}
                variant="outline"
                className={cn(
                  'w-full max-w-[360px] font-sans font-bold uppercase tracking-wide text-sm',
                  isCopied
                    ? 'bg-profit-green/10 border-profit-green/30 text-profit-green cursor-default'
                    : isCopyDisabled || !manualAmountValid
                      ? 'bg-accent border-border text-muted-foreground cursor-not-allowed'
                      : 'bg-poly-yellow border-transparent hover:bg-poly-yellow-hover text-poly-black'
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
                      "w-full rounded-none font-sans font-bold uppercase tracking-wide text-sm",
                      showCopyBuyCta
                        ? isMarketEnded
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-poly-yellow hover:bg-poly-yellow-hover text-poly-black"
                        : canSellAsWell
                          ? "bg-loss-red hover:bg-loss-red/90 text-white"
                          : "bg-muted text-muted-foreground cursor-not-allowed"
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
                      "rounded-none font-sans font-bold uppercase tracking-wide text-sm",
                      showSellAction ? "flex-1" : "w-full",
                      localCopied
                        ? "bg-profit-green hover:bg-profit-green/90 text-white"
                        : isMarketEnded
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-poly-yellow hover:bg-poly-yellow-hover text-poly-black"
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
                        "h-9 rounded-none px-4 font-sans text-[10px] font-bold uppercase tracking-wide",
                        canSellAction
                          ? "border-loss-red/30 text-loss-red hover:bg-loss-red/10 hover:text-loss-red"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      Sell
                    </Button>
                  )}
                </div>
              </div>
            ) : allowManualExperience ? (
              <div className="w-full">
                {!manualDrawerOpen && (
                  isCopied ? (
                    <div className="flex justify-center">
                      <Button
                        disabled
                        className="w-full max-w-[360px] rounded-none bg-profit-green hover:bg-profit-green text-white font-sans font-bold uppercase tracking-wide text-sm"
                        size="lg"
                      >
                        <Check className="w-4 h-4 mr-2" />
                        Copied
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 px-5 md:px-6 pb-3">
                      {/* Two-button flow */}
                      <div className="flex flex-row gap-1 justify-center px-4">
                        <Button
                          onClick={handleCopyTradeClick}
                          disabled={isCopyDisabled}
                          className={`flex-1 rounded-none font-sans font-bold uppercase tracking-wide text-sm py-4 ${
                            isMarketEnded
                              ? "bg-muted text-muted-foreground cursor-not-allowed"
                              : "bg-poly-yellow hover:bg-poly-yellow-hover text-poly-black"
                          }`}
                          size="lg"
                        >
                          {isMarketEnded ? (
                            "Market Resolved"
                          ) : (
                            <>
                              <span className="inline-flex items-center justify-center w-5 h-5 bg-poly-black text-poly-yellow font-sans text-[10px] font-bold mr-2">
                                1
                              </span>
                              Copy trade
                              <ExternalLink className="w-4 h-4 ml-2" />
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={handleMarkAsConfirmedClick}
                          disabled={isCopyDisabled}
                          variant="outline"
                          className={`flex-1 rounded-none font-sans font-bold uppercase tracking-wide text-sm py-4 ${
                            isMarketEnded
                              ? "border-border text-muted-foreground cursor-not-allowed"
                              : "border-border text-foreground hover:bg-accent"
                          }`}
                          size="lg"
                        >
                          {isMarketEnded ? (
                            "Market Resolved"
                          ) : (
                            <>
                              <span className="inline-flex items-center justify-center w-5 h-5 bg-poly-black text-white font-sans text-[10px] font-bold mr-2">
                                2
                              </span>
                              Mark as copied
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Info tooltip - moved below buttons */}
                      <div className="flex justify-center">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="flex items-center gap-1.5 font-sans text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Info className="w-3.5 h-3.5" />
                              <span className="font-medium uppercase tracking-wide">How to trade</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[280px] text-center">
                            <p className="mb-2">
                              Without a connected wallet, you manually execute copy trades on Polymarket, then input the trade details on Polycopy.
                            </p>
                            <p className="text-muted-foreground">
                              <strong className="text-white">Connect your wallet</strong> to trade directly from your Polycopy feed.{" "}
                              <button
                                type="button"
                                onClick={() => onOpenConnectWallet?.()}
                                className="underline hover:text-white transition-colors"
                              >
                                Connect now
                              </button>
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  )
                )}
                {showLinkWalletHint && (
                  <div className="mt-3 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="font-sans text-[10px] font-bold uppercase tracking-wide text-foreground border-border hover:bg-accent"
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
                  className={`w-full max-w-[360px] mx-auto font-sans font-bold uppercase tracking-wide text-sm ${
                    isMarketEnded
                      ? "bg-muted text-muted-foreground cursor-not-allowed"
                      : "bg-poly-yellow hover:bg-poly-yellow-hover text-poly-black"
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

        {!hideActions && (allowQuickCopyExperience || showCopyBuyCta) && isExpanded && shouldShowCopyCta && (
        <div className="bg-card px-6 pb-3 pt-0">
          <div className="-mt-4 mb-2 flex justify-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-none border border-border bg-card text-muted-foreground">
              <ArrowDown className="h-4 w-4" />
            </div>
          </div>
          <div className="relative mt-0.5 overflow-hidden rounded-none border border-border bg-accent px-4 pb-4 pt-3">
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
                    <p className="font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">Status</p>
                    <p className="flex items-center gap-2 font-sans text-lg font-bold text-foreground">
                      {!isFinalStatus && <Loader2 className="h-4 w-4 animate-spin text-poly-yellow" />}
                      {statusLabel}
                    </p>
                    {!isFinalStatus && (
                      <div className="mt-1">
                        <p
                          className={`text-xs ${
                            statusPhase === 'timed_out' ? 'text-poly-yellow' : 'text-muted-foreground'
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
                        <p className="font-body text-xs text-poly-yellow">
                          We couldn’t fill this order at your price. Try increasing slippage (tap Advanced) or using a smaller amount.
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>Why didn&apos;t it match?</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-none border border-border bg-card text-[10px] font-semibold text-muted-foreground"
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
                        className={`inline-flex items-center justify-center rounded-none border px-3 py-1.5 font-sans text-[10px] font-bold uppercase tracking-wide transition ${
                          isCancelingOrder
                            ? 'border-border bg-accent text-muted-foreground cursor-not-allowed'
                            : 'border-loss-red/30 bg-card text-loss-red hover:bg-loss-red/10'
                        }`}
                      >
                        {isCancelingOrder ? 'Canceling…' : 'Cancel'}
                      </button>
                    )}
                    {isFilledStatus && (
                      <button
                        type="button"
                        onClick={resetConfirmation}
                        className="inline-flex items-center justify-center rounded-none border border-border bg-card text-muted-foreground hover:text-foreground h-8 w-8"
                        aria-label="Close order confirmation"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                {confirmationError && (
                  <div
                    className={`rounded-none border px-3 py-2 text-xs ${
                      confirmationError.success === false
                        ? "border-poly-yellow/30 bg-poly-yellow/10 text-poly-black"
                        : "border-loss-red/30 bg-loss-red/10 text-loss-red"
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
                      <label className="font-sans text-[9px] font-medium uppercase tracking-widest text-foreground">
                        {filledAmountValue !== null ? "Filled USD" : "Estimated max USD"}
                      </label>
                    <div className="flex h-14 items-center rounded-none border border-border bg-card px-4 font-body text-base font-semibold tabular-nums text-foreground">
                      {formatCurrency(Number.isFinite(statusAmountValue) ? statusAmountValue : 0)}
                    </div>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[180px]">
                      <span className="font-sans text-[9px] font-medium uppercase tracking-widest text-foreground text-center sm:text-left">
                        Filled / submitted
                      </span>
                      <div className="flex h-14 items-center justify-center rounded-none border border-border bg-card font-body text-base font-semibold tabular-nums text-foreground text-center">
                        {statusContractsText}
                      </div>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[180px]">
                      <span className="font-sans text-[9px] font-medium uppercase tracking-widest text-foreground text-center sm:text-left">
                        Average fill price
                      </span>
                      <div className="flex h-14 items-center justify-center rounded-none border border-border bg-card font-body text-base font-semibold tabular-nums text-foreground text-center">
                        {formatPrice(fillPrice)}
                      </div>
                    </div>
                  </div>
                </div>
                {statusError && (
                  <p className="font-body text-xs text-loss-red">Status error: {statusError}</p>
                )}
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowTradeDetails((current) => !current)}
                    className="inline-flex items-center gap-1 rounded-none border border-border bg-card px-2.5 py-1 font-sans text-[9px] font-bold uppercase tracking-wide text-muted-foreground hover:bg-accent"
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
                  <div className="mt-3 rounded-none border border-border bg-accent p-3">
                    <p className="font-sans text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Polymarket Response</p>
                  {tradeDetailsJson ? (
                    <pre className="mt-2 max-h-56 overflow-auto rounded-none border border-border bg-card p-3 text-[11px] leading-relaxed text-muted-foreground">
                      {tradeDetailsJson}
                    </pre>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
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
                      className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Collapse quick copy"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <h4 className="font-sans text-xs font-bold uppercase tracking-wide text-foreground">Copy</h4>
                    <span className="w-[52px]" aria-hidden="true" />
                </div>

                {orderBookError && (
                  <div className="font-body text-xs text-poly-yellow">{orderBookError}</div>
                )}

                {/* Amount Input */}
                <div className="space-y-2 mb-4">
                    <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-end sm:justify-center">
                      <div className="flex w-full flex-col gap-2 sm:max-w-[240px]">
                        <div className="flex items-center justify-between gap-2">
                  <label htmlFor="amount" className="font-sans text-[9px] font-medium uppercase tracking-widest text-foreground">
                    {amountMode === "usd" ? `USD (min $${minUsdLabel})` : "Contracts"}
                  </label>
                        </div>
                  <div className="relative">
                    {amountMode === "usd" && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    )}
                    <input
                      id="amount"
                      type="number"
                      inputMode={amountMode === "usd" ? "decimal" : "numeric"}
                      pattern={amountMode === "usd" ? "[0-9]*[.,]?[0-9]*" : "[0-9]*"}
                      step={amountMode === "contracts" ? contractStep : 0.01}
                      value={amountInput}
                            onChange={(e) => {
                              handleAmountChange(e.target.value)
                              if (submitError) setSubmitError(null)
                            }}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder={amountMode === "usd" ? "0.00" : "0"}
                      disabled={isSubmitting}
                            className={`w-full h-14 border border-border rounded-none font-body text-base font-semibold tabular-nums text-foreground focus:ring-2 focus:ring-poly-yellow focus:border-poly-yellow outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${amountMode === "usd" ? "pl-7 pr-3" : "pl-3 pr-3"}`}
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
                        className="flex h-10 w-10 items-center justify-center rounded-none border border-border bg-card text-muted-foreground hover:text-foreground hover:border-border sm:h-12 sm:w-12 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!amountInput.trim()}
                        aria-label={`Switch to ${amountMode === "usd" ? "contracts" : "USD"}`}
                      >
                        <ArrowLeftRight className="h-4 w-4" />
                      </button>
                      <div className="flex h-14 w-full items-center justify-center rounded-none border border-border bg-card font-body text-base font-semibold tabular-nums text-foreground text-center sm:w-auto sm:min-w-[180px]">
                        {amountMode === "usd"
                          ? !hasAmountInput
                            ? "—"
                            : `≈ ${formatContractsDisplay(contractsValue, 1)} ${contractLabel}`
                          : !hasAmountInput
                            ? "—"
                            : `≈ ${estimatedMaxCost !== null ? formatCurrency(estimatedMaxCost) : "—"} USD`}
                      </div>
                      <div className="flex h-14 items-center font-body text-xs font-medium tabular-nums text-muted-foreground">
                        {sizePercentLabel} of original trade
                      </div>
                    </div>
                    {minUsdErrorMessage && (
                      <p className="font-body text-xs text-loss-red">{minUsdErrorMessage}</p>
                    )}
                    {submitError && (
                      <p className="font-body text-xs text-loss-red">{submitError}</p>
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
                      className={`w-full max-w-[360px] rounded-none font-sans font-bold uppercase tracking-wide ${
                        isMarketEnded
                          ? "bg-muted text-muted-foreground cursor-not-allowed"
                          : "bg-poly-yellow hover:bg-poly-yellow-hover text-poly-black"
                      }`}
                      size="lg"
                    >
                      {isMarketEnded ? "Market Resolved" : isSubmitting ? pendingStatusLabel : "Execute Trade"}
                    </Button>
                  </div>
                  {isSubmitting && (
                    <p className="mt-2 text-center text-xs text-muted-foreground">This may take a moment.</p>
                  )}
                {canUseAutoClose && (
                  <div className="mt-4 flex items-start space-x-3 p-2.5 bg-card rounded-none border border-border">
                    <Checkbox
                      id="auto-close"
                      checked={autoClose}
                      onCheckedChange={(checked) => setAutoClose(!!checked)}
                      disabled={isSubmitting}
                    />
                    <div className="flex-1">
                      <label
                        htmlFor="auto-close"
                        className="font-body text-sm font-medium text-foreground cursor-pointer leading-tight"
                      >
                        Auto-close when trader closes
                      </label>
                    </div>
                  </div>
                )}
                  <div className="mt-2 flex items-center justify-between gap-3">
                    {!showAdvanced && (
                      <TooltipProvider>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
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
                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
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
                      className="inline-flex items-center gap-1 font-sans text-[10px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                    >
                    Advanced
                      <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                  {showAdvanced && (
                    <div className="mt-3 rounded-none border border-border bg-card p-3 space-y-3">
                      <div className="space-y-1.5">
                        <TooltipProvider>
                          <div className="flex items-center gap-1.5">
                            <Label className="font-sans text-[9px] font-medium uppercase tracking-widest text-foreground">Slippage Tolerance</Label>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="text-muted-foreground hover:text-muted-foreground">
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
                                  ? "bg-poly-black text-white hover:bg-poly-black/90 font-sans font-bold h-8 text-[10px] uppercase tracking-wide"
                                  : "border-border text-foreground hover:bg-accent font-sans font-medium h-8 text-[10px]"
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
                                handleSlippagePresetChange("custom")
                              }}
                            onWheel={(e) => e.currentTarget.blur()}
                            className="w-20 h-8 text-xs border-border [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                </div>
              </div>

                      <div className="space-y-1.5">
                        <TooltipProvider>
                          <div className="flex items-center gap-1.5">
                            <Label className="font-sans text-[9px] font-medium uppercase tracking-widest text-foreground">Order Behavior</Label>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" className="text-muted-foreground hover:text-muted-foreground">
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
                            <Label htmlFor="quick-copy-fak" className="font-body text-xs font-medium text-foreground cursor-pointer">
                              Fill and Kill (FAK)
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="GTC" id="quick-copy-gtc" className="h-4 w-4" />
                            <Label htmlFor="quick-copy-gtc" className="font-body text-xs font-medium text-foreground cursor-pointer">
                              Good 'Til Canceled (GTC)
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                  )}
                  {refreshStatus === 'refreshing' && (
                    <p className="text-xs text-muted-foreground mt-2">Refreshing order status…</p>
                  )}
                  {refreshStatus === 'done' && (
                    <p className="font-body text-xs text-profit-green mt-2">Order submitted to Polymarket. Latest status will appear in Orders shortly.</p>
                  )}
                  {refreshStatus === 'error' && (
                    <p className="font-body text-xs text-loss-red mt-2">
                      Order pending at Polymarket, but status refresh failed. Check the Orders page for updates.
                    </p>
                  )}
                </div>
              </div>
          ) : (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-profit-green/10 flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-profit-green" />
              </div>
              <h4 className="font-sans text-lg font-bold text-foreground mb-2">Trade Executed Successfully!</h4>
              <p className="font-body text-sm text-muted-foreground">
                Your copy trade of {formatCurrency(estimatedMaxCost ?? 0)} has been submitted to Polymarket
              </p>
            </div>
          )}
          </div>
          {showConfirmation && isFinalStatus && (
            <div className="mt-3 flex justify-center">
              <Button
                onClick={resetConfirmation}
                className={`w-full max-w-[360px] mx-auto rounded-none font-sans font-bold uppercase tracking-wide ${
                  isFilledStatus
                    ? "bg-poly-black text-white hover:bg-poly-black/90"
                    : "bg-poly-yellow text-poly-black hover:bg-poly-yellow-hover"
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
            <p className="text-sm text-muted-foreground">
              You need to connect your Polymarket wallet to continue trading with quick copy.
            </p>
            <div className="mt-4 space-y-2">
              <Button
                className="w-full bg-poly-black text-white hover:bg-poly-black/90"
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

      {onTogglePin && (
        <div className="absolute bottom-2 right-3">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onTogglePin}
                  aria-pressed={isPinned}
                  aria-label={isPinned ? "Unpin trade" : "Pin trade"}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-none border border-border bg-card text-muted-foreground transition hover:text-muted-foreground",
                    isPinned && "border-poly-yellow/30 bg-poly-yellow/10 text-poly-yellow hover:text-poly-yellow"
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
  if (variant === 'success') return 'text-profit-green'
  if (variant === 'error') return 'text-loss-red'
  return 'text-muted-foreground'
}
