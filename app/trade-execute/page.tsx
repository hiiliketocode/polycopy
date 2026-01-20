'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useSearchParams } from 'next/navigation'
import { Navigation } from '@/components/polycopy/navigation'
import { TradeCard } from '@/components/polycopy/trade-card'
import { USDC_DECIMALS } from '@/lib/turnkey/config'
import {
  adjustSizeForImpliedAmount,
  adjustSizeForImpliedAmountAtLeast,
  getStepDecimals,
  normalizeContractsFromUsd,
  normalizeContractsInput,
  roundDownToStep,
} from '@/lib/polymarket/sizing'
import { extractTraderNameFromRecord } from '@/lib/trader-name'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ConnectWalletModal } from '@/components/polycopy/connect-wallet-modal'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type ExecuteForm = {
  tokenId: string
  price: string
  amount: string
  side: 'BUY' | 'SELL'
  orderType: 'GTC' | 'FOK' | 'FAK'
}

type OrderStatusResponse = {
  status?: string | null
  size?: number | null
  filledSize?: number | null
  remainingSize?: number | null
  price?: number | null
  marketId?: string | null
  updatedAt?: string | null
  raw?: any
}

type SubmitFailureDetails = {
  errorType?: string | null
  rayId?: string | null
  blockedByCloudflare?: boolean
}

type BalanceResponse = {
  proxyAddress?: string | null
  balance?: string | null
  allowance?: string | null
  balanceFormatted?: string | null
  allowanceFormatted?: string | null
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

const TERMINAL_STATUS_PHASES = new Set<StatusPhase>([
  'filled',
  'canceled',
  'expired',
  'rejected',
  'timed_out',
])

const ORDER_STATUS_TIMEOUT_MS = 30_000
const EXIT_TRADE_WARNING =
  'Are you sure you want to leave? You have trades in progress that may fail.'
const EMPTY_FORM: ExecuteForm = {
  tokenId: '',
  price: '',
  amount: '',
  side: 'BUY',
  orderType: 'FAK',
}

const TOKEN_ID_KEYS = ['token_id', 'tokenId', 'tokenID']
const PRICE_KEYS = ['price', 'avg_price', 'avgPrice', 'execution_price']
const AMOUNT_KEYS = ['size', 'amount', 'quantity', 'shares']
const SIDE_KEYS = ['side', 'order_side', 'trade_side']
const OUTCOME_KEYS = ['outcome', 'outcome_name', 'outcomeName']
const ICON_KEYS = [
  'market_avatar',
  'market_avatar_url',
  'marketAvatar',
  'marketAvatarUrl',
  'market_image',
  'market_image_url',
  'marketImage',
  'marketImageUrl',
  'market_icon',
  'market_icon_url',
  'marketIcon',
  'marketIconUrl',
  'icon_url',
  'iconUrl',
  'icon',
  'image',
  'image_url',
  'imageUrl',
  'event_image',
  'event_image_url',
  'eventImage',
  'eventImageUrl',
  'logo',
  'logo_url',
  'logoUrl',
  'twitter_card_image',
  'twitterCardImage',
]
const TRADER_NAME_KEYS = ['trader_username', 'trader_name', 'traderName', 'display_name', 'displayName']
const TRADER_ICON_KEYS = [
  'trader_avatar',
  'trader_avatar_url',
  'traderAvatar',
  'traderAvatarUrl',
  'profile_image',
  'profileImage',
  'profile_image_url',
  'profileImageUrl',
]
const SLIPPAGE_TOOLTIP =
  'Limits how much higher than your limit price the order can fill; 1% means the execution price may be at most 1% above your quote.'
const ORDER_BEHAVIOR_TOOLTIP =
  'FAK fills as much as possible immediately and cancels the rest, while GTC keeps the order open until you cancel it or it fills.'
const FUNDING_FAQ_URL = 'https://docs.polymarket.com/polymarket-learn/get-started/how-to-deposit'
function firstStringValue(record: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key]
    if (value !== undefined && value !== null && value !== '') {
      return String(value)
    }
  }
  return ''
}

function normalizeSide(raw: string) {
  const upper = raw.toUpperCase()
  return upper === 'SELL' ? 'SELL' : 'BUY'
}

function formatValue(value: any) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number') return value.toLocaleString()
  return String(value)
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const fixed = value.toFixed(4)
  const trimmed = fixed.replace(/\.?0+$/, '')
  return `$${trimmed}`
}

function roundPriceToTickSize(price: number, tickSize?: number | null) {
  if (!Number.isFinite(price)) return price
  const step = tickSize && tickSize > 0 ? tickSize : 0.01
  const decimals = getStepDecimals(step)
  const rounded = Math.round(price / step) * step
  return Number(rounded.toFixed(decimals))
}

function ceilToStep(value: number, step: number) {
  if (!Number.isFinite(value) || step <= 0) return value
  return Math.ceil(value / step) * step
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

type OrderBookResponse = {
  bids?: Array<any>
  asks?: Array<any>
  min_order_size?: number | string | null
  tick_size?: number | string | null
}

function normalizeOutcome(value: string) {
  return value.trim().toLowerCase()
}

function normalizeStatusPhase(status?: string | null): StatusPhase {
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

type ExecutionStatusVariant = 'success' | 'pending' | 'failed'

const FAILED_EXECUTION_PHASES = new Set<StatusPhase>(['canceled', 'expired', 'rejected', 'timed_out'])

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

const SUBMIT_ERROR_REASON_LABELS: Record<string, string> = {
  blocked_by_cloudflare: 'Blocked by Cloudflare',
  missing_order_id: 'Missing order identifier from Polymarket',
  api_error: 'Polymarket API error',
}

function formatSubmitErrorReason(code?: string | null) {
  if (!code) return 'Unknown failure reason'
  return SUBMIT_ERROR_REASON_LABELS[code] ?? code
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

function getOrderStatusLabel(status?: string | null) {
  const phase = normalizeStatusPhase(status)
  return STATUS_SIMPLE_LABELS[phase] || 'Unknown'
}

function getPostOrderStateLabel(
  phase: StatusPhase,
  orderType: ExecuteForm['orderType'],
  filledSize: number | null
) {
  if (phase === 'filled') return 'Filled'
  if (phase === 'partial') return 'Partially filled'
  if (phase === 'timed_out') return 'Failed to match'
  if (
    orderType === 'FAK' &&
    (phase === 'canceled' || phase === 'expired' || phase === 'rejected') &&
    (!filledSize || filledSize <= 0)
  ) {
    return 'Not filled (FAK)'
  }
  return 'Order sent to Polymarket'
}

function resolveOutcomePrice(
  outcomePrices: any,
  outcomes: any,
  outcomeName: string,
  outcomeIndex: number | null
): number | null {
  if (!Array.isArray(outcomePrices) || outcomePrices.length === 0) return null
  const prices = outcomePrices.map((price: any) => Number(price))
  const normalized = outcomeName ? normalizeOutcome(outcomeName) : ''

  if (normalized && Array.isArray(outcomes)) {
    const outcomeIdx = outcomes.findIndex(
      (outcome: any) => normalizeOutcome(String(outcome)) === normalized
    )
    if (outcomeIdx >= 0 && Number.isFinite(prices[outcomeIdx])) {
      return prices[outcomeIdx]
    }
  }

  if (Number.isFinite(outcomeIndex) && outcomeIndex! >= 0 && Number.isFinite(prices[outcomeIndex!])) {
    return prices[outcomeIndex!]
  }

  const firstValid = prices.find((price) => Number.isFinite(price))
  if (typeof firstValid === 'number' && Number.isFinite(firstValid)) {
    return firstValid
  }
  return null
}

function getNestedValue(record: Record<string, any>, path: string[]) {
  let current: any = record
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined
    current = current[key]
  }
  return current
}

function formatElapsedDetailed(timestamp: string | number | null | undefined, nowMs: number) {
  if (!timestamp) return '—'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '—'
  const seconds = Math.max(0, Math.floor((nowMs - date.getTime()) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

function abbreviateWallet(wallet: string) {
  if (!wallet) return '—'
  return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
}

function extractTokenId(record: Record<string, any>) {
  const direct = firstStringValue(record, TOKEN_ID_KEYS)
  if (direct) return direct
  const raw = record?.raw
  if (!raw || typeof raw !== 'object') return ''
  const rawDirect = firstStringValue(raw, TOKEN_ID_KEYS)
  if (rawDirect) return rawDirect
  const nested = getNestedValue(raw, ['token', 'id'])
  return nested ? String(nested) : ''
}

type MarketMetadata = {
  tokens?: Array<{ token_id?: string | null; outcome?: string | null }>
  icon?: string | null
  image?: string | null
}

async function fetchMarketMetadata(conditionId: string): Promise<MarketMetadata | null> {
  try {
    const response = await fetch(
      `/api/polymarket/market?conditionId=${encodeURIComponent(conditionId)}`,
      { cache: 'no-store' }
    )
    if (!response.ok) {
      return null
    }
    const data = await response.json()
    if (!data) {
      return null
    }
    return {
      tokens: Array.isArray(data.tokens) ? data.tokens : undefined,
      icon: typeof data.icon === 'string' && data.icon.trim() ? data.icon : null,
      image: typeof data.image === 'string' && data.image.trim() ? data.image : null,
    }
  } catch (error) {
    console.error('[trade-execute] fetchMarketMetadata failed', error)
    return null
  }
}

function extractMarketIcon(record: Record<string, any>) {
  const direct = firstStringValue(record, ICON_KEYS)
  if (direct) return direct
  const raw = record?.raw
  if (!raw || typeof raw !== 'object') return ''
  const rawDirect = firstStringValue(raw, ICON_KEYS)
  if (rawDirect) return rawDirect
  const nested = getNestedValue(raw, ['market', 'icon'])
  return nested ? String(nested) : ''
}

function extractTraderIcon(record: Record<string, any>) {
  const direct = firstStringValue(record, TRADER_ICON_KEYS)
  if (direct) return direct
  const raw = record?.raw
  if (!raw || typeof raw !== 'object') return ''
  const rawDirect = firstStringValue(raw, TRADER_ICON_KEYS)
  if (rawDirect) return rawDirect
  const nested = getNestedValue(raw, ['trader', 'avatar'])
  return nested ? String(nested) : ''
}

function parseBookPrice(entries: Array<any> | undefined, side: 'bid' | 'ask') {
  if (!Array.isArray(entries)) return null
  let best: number | null = null
  for (const entry of entries) {
    let price: number | null = null
    if (Array.isArray(entry)) {
      price = Number(entry[0])
    } else if (entry && typeof entry === 'object') {
      price = Number(entry.price ?? entry.p ?? entry[0])
    }
    if (price === null || !Number.isFinite(price)) continue
    if (best === null) {
      best = price
      continue
    }
    if (side === 'bid' ? price > best : price < best) {
      best = price
    }
  }
  return best
}

function formatInputValue(value: number, decimals: number) {
  const fixed = value.toFixed(decimals)
  return fixed.replace(/\.?0+$/, '')
}

function formatContractsDisplay(value: number | null, decimals: number) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const trimmed = formatInputValue(value, decimals)
  const [whole, fraction] = trimmed.split('.')
  const withCommas = Number(whole).toLocaleString()
  return fraction ? `${withCommas}.${fraction}` : withCommas
}

function TradeExecutePageInner() {
  const searchParams = useSearchParams()
  const prefillAppliedRef = useRef(false)
  const [tradeRecord, setTradeRecord] = useState<Record<string, any> | null>(null)

  const [form, setForm] = useState<ExecuteForm>(EMPTY_FORM)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitFailureDetails, setSubmitFailureDetails] = useState<SubmitFailureDetails | null>(null)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [statusData, setStatusData] = useState<OrderStatusResponse | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusPhase, setStatusPhase] = useState<StatusPhase>('submitted')
  const statusPhaseRef = useRef<StatusPhase>('submitted')
  const [submittedSnapshot, setSubmittedSnapshot] = useState<{
    contracts: number
    estimatedUsd: number
    limitPrice: number
  } | null>(null)
  const [latestPrice, setLatestPrice] = useState<number | null>(null)
  const [latestPriceLoading, setLatestPriceLoading] = useState(false)
  const [latestPriceError, setLatestPriceError] = useState<string | null>(null)
  const [marketStatus, setMarketStatus] = useState<'Open' | 'Closed' | null>(null)
  const [orderBookLoading, setOrderBookLoading] = useState(false)
  const [orderBookError, setOrderBookError] = useState<string | null>(null)
  const [bookTickSize, setBookTickSize] = useState<number | null>(null)
  const [bestBidPrice, setBestBidPrice] = useState<number | null>(null)
  const [bestAskPrice, setBestAskPrice] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState<number>(Date.now())
  const [amountMode, setAmountMode] = useState<'usd' | 'contracts'>('usd')
  const [amountInput, setAmountInput] = useState('')
  const [slippagePreset, setSlippagePreset] = useState<number | 'custom'>(3)
  const [customSlippage, setCustomSlippage] = useState('')
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [isPremiumUser, setIsPremiumUser] = useState(false)
  const [showConnectWalletModal, setShowConnectWalletModal] = useState(false)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [balanceData, setBalanceData] = useState<BalanceResponse | null>(null)
  const [showSlippageInfo, setShowSlippageInfo] = useState(false)
  const [showOrderBehaviorInfo, setShowOrderBehaviorInfo] = useState(false)
  const [showFundingModal, setShowFundingModal] = useState(false)

  const record = tradeRecord
  const marketIcon = record ? extractMarketIcon(record) : ''
  const traderName = record ? extractTraderNameFromRecord(record) ?? '' : ''
  const traderIcon = record ? extractTraderIcon(record) : ''
  const traderWallet = record?.trader_wallet ? String(record.trader_wallet) : ''
  const marketTitle = record ? formatValue(record.market_title || record.market_slug) : '—'
  const traderDisplayName =
    traderName || (traderWallet ? abbreviateWallet(traderWallet) : '') || 'Trader'
  const directionValue = normalizeSide(String(record?.side ?? form.side ?? 'BUY'))
  const directionLabel = directionValue === 'SELL' ? 'Sell' : 'Buy'
  const outcomeLabel = record?.outcome ? String(record.outcome) : '—'
  const tradePrice = record && Number.isFinite(Number(record.price)) ? Number(record.price) : null
  const tickSize = Number.isFinite(bookTickSize ?? NaN) ? bookTickSize : null
  const orderBookPrice = directionValue === 'SELL' ? bestBidPrice : bestAskPrice
  const liveReferencePrice =
    orderBookPrice ??
    latestPrice ??
    tradePrice
  const currentPrice = liveReferencePrice ?? null
  const slippagePercent =
    slippagePreset === 'custom' ? Number(customSlippage) : Number(slippagePreset)
  const slippageValue = Number.isFinite(slippagePercent) ? slippagePercent : 0
  const minTradeUsd = 1
  const rawLimitPrice =
    currentPrice && Number.isFinite(currentPrice)
      ? directionValue === 'SELL'
        ? currentPrice * (1 - slippageValue / 100)
        : currentPrice * (1 + slippageValue / 100)
      : null
  const normalizedLimitPrice =
    rawLimitPrice && Number.isFinite(rawLimitPrice) && rawLimitPrice > 0 ? rawLimitPrice : null
  const limitPriceValue =
    normalizedLimitPrice && Number.isFinite(normalizedLimitPrice)
      ? roundPriceToTickSize(normalizedLimitPrice, tickSize)
      : null
  const amountValue = Number(amountInput)
  const hasAmountInput = amountInput.trim().length > 0
  const parsedAmountValue =
    Number.isFinite(amountValue) && amountValue > 0 ? amountValue : null
  const contractStep = 0.0001
  const sizeDecimals = 2
  const contractsSizing =
    amountMode === 'usd'
      ? normalizeContractsFromUsd(parsedAmountValue, limitPriceValue, null, null)
      : normalizeContractsInput(parsedAmountValue, null, null)
  const rawContractsValue = hasAmountInput ? contractsSizing.contracts : null
  const baseContractsValue =
    rawContractsValue && limitPriceValue
      ? adjustSizeForImpliedAmount(limitPriceValue, rawContractsValue, tickSize, 2, 2)
      : rawContractsValue
  const baseEstimatedTotal =
    baseContractsValue && limitPriceValue ? baseContractsValue * limitPriceValue : null
  const bufferPrice = limitPriceValue ? limitPriceValue * (1 - slippageValue / 100) : null
  const safeBufferPrice =
    bufferPrice !== null && Number.isFinite(bufferPrice) && bufferPrice > 0
      ? bufferPrice
      : limitPriceValue
  const minContractsForBuffer =
    safeBufferPrice !== null
      ? adjustSizeForImpliedAmountAtLeast(
          limitPriceValue ?? safeBufferPrice,
          ceilToStep(minTradeUsd / safeBufferPrice, 0.01),
          tickSize,
          2,
          2
        )
      : null
  const needsMinUsdBuffer =
    amountMode === 'usd'
      ? parsedAmountValue !== null && parsedAmountValue <= minTradeUsd
      : baseEstimatedTotal !== null && baseEstimatedTotal < minTradeUsd
  const contractsValue =
    needsMinUsdBuffer && minContractsForBuffer
      ? Math.max(baseContractsValue ?? 0, minContractsForBuffer)
      : baseContractsValue
  const estimatedTotal =
    contractsValue && limitPriceValue ? contractsValue * limitPriceValue : null
  const isBelowMinUsd =
    amountMode === 'usd'
      ? parsedAmountValue !== null && parsedAmountValue < minTradeUsd
      : estimatedTotal !== null && estimatedTotal < minTradeUsd
  const canSubmit = useMemo(() => {
    return (
      Boolean(form.tokenId.trim()) &&
      limitPriceValue !== null &&
      limitPriceValue > 0 &&
      contractsValue !== null &&
      contractsValue > 0 &&
      !isBelowMinUsd
    )
  }, [contractsValue, form.tokenId, isBelowMinUsd, limitPriceValue])
  const elapsed = record ? formatElapsedDetailed(record.trade_timestamp, nowMs) : '—'
  const tradeSize =
    record && Number.isFinite(Number(record.size))
      ? Number(record.size)
      : null
  const totalCost =
    tradePrice !== null && tradeSize !== null ? tradePrice * tradeSize : null
  const availableCashAmount = balanceData?.balanceFormatted
    ? balanceData.balanceFormatted.replace(/\s*USDC$/i, '').trim()
    : ''
  const availableCashDisplay = balanceLoading
    ? 'Loading…'
    : availableCashAmount
      ? `$${availableCashAmount}`
      : '—'
  const priceDelta =
    currentPrice !== null && tradePrice !== null ? currentPrice - tradePrice : null
  const priceDeltaPct =
    priceDelta !== null && tradePrice ? (priceDelta / tradePrice) * 100 : null
  const polymarketEventSlug = record?.event_slug || record?.eventSlug
  const polymarketMarketSlug = record?.market_slug || record?.marketSlug
  const polymarketUrl = polymarketEventSlug
    ? `https://polymarket.com/event/${polymarketEventSlug}`
    : polymarketMarketSlug
      ? `https://polymarket.com/market/${polymarketMarketSlug}`
      : null
  
  const isOrderSent = Boolean(orderId)
  const submittedContracts =
    submittedSnapshot?.contracts ?? (contractsValue !== null ? contractsValue : null)
  const submittedUsd = submittedSnapshot?.estimatedUsd ?? estimatedTotal
  const submittedLimitPrice = submittedSnapshot?.limitPrice ?? limitPriceValue
  const limitPriceLabel = submittedLimitPrice ? formatPrice(submittedLimitPrice) : '—'

  const availableBalance =
    balanceData?.balance && !Number.isNaN(Number(balanceData.balance))
      ? Number(balanceData.balance) / Math.pow(10, USDC_DECIMALS)
      : null
  const notEnoughFunds =
    estimatedTotal !== null && availableBalance !== null && estimatedTotal > availableBalance

  const slippageLabel =
    slippagePreset === 'custom' ? `${customSlippage || '0'}% (custom)` : `${slippagePreset}%`
  const orderBehaviorLabel =
    form.orderType === 'FAK' ? 'Fill and Kill (FAK)' : "Good 'Til Canceled (GTC)"
  const amountUsdLabel =
    submittedUsd !== null && Number.isFinite(submittedUsd)
      ? formatMoney(submittedUsd)
      : '—'
  const amountContractsLabel =
    submittedContracts !== null && Number.isFinite(submittedContracts)
      ? `${formatContractsDisplay(submittedContracts, sizeDecimals)} contracts`
      : '—'
  const confirmationPrimaryLabel = amountContractsLabel
  const confirmationSecondaryLabel = `${amountUsdLabel} (est)`
  const winTotalValue =
    contractsValue !== null && Number.isFinite(contractsValue)
      ? formatMoney(contractsValue)
      : '—'

  const reportedOrderStatus = statusData?.status ? String(statusData.status).trim() : null
  const orderStatusLabel =
    statusPhase === 'timed_out'
      ? STATUS_SIMPLE_LABELS.timed_out
      : reportedOrderStatus
        ? getOrderStatusLabel(reportedOrderStatus)
        : STATUS_SIMPLE_LABELS[statusPhase] ?? null
  const statusReason = statusData ? findStatusReason(statusData.raw) : null
  const orderStatusVariant = getExecutionStatusVariant(statusPhase)
  const StatusIconComponent = STATUS_VARIANT_ICONS[orderStatusVariant]
  const orderStatusIconClasses = STATUS_VARIANT_WRAPPER_CLASSES[orderStatusVariant]
  const filledSize = statusData?.filledSize ?? null
  const totalSize = statusData?.size ?? null
  const postOrderStateLabel = getPostOrderStateLabel(statusPhase, form.orderType, filledSize)
  const fillProgress =
    filledSize !== null && totalSize !== null && totalSize > 0
      ? Math.min(100, Math.max(0, (filledSize / totalSize) * 100))
      : null
  const showFillProgress =
    fillProgress !== null && (statusPhase === 'open' || statusPhase === 'partial')

  const fillPriceValue =
    statusData?.price !== undefined &&
    statusData?.price !== null &&
    Number.isFinite(statusData.price)
      ? Number(statusData.price)
      : null
  const fillPriceLabel = fillPriceValue !== null ? formatPrice(fillPriceValue) : 'Polymarket pending fill'
  const fillSlippagePercent =
    fillPriceValue !== null && submittedLimitPrice && submittedLimitPrice > 0
      ? directionValue === 'SELL'
        ? ((submittedLimitPrice - fillPriceValue) / submittedLimitPrice) * 100
        : ((fillPriceValue - submittedLimitPrice) / submittedLimitPrice) * 100
      : null
  const fillSlippageLabel =
    fillSlippagePercent !== null
      ? `${fillSlippagePercent > 0 ? '+' : fillSlippagePercent < 0 ? '-' : ''}${Math.abs(
          fillSlippagePercent
        ).toFixed(2)}%`
      : 'Polymarket pending fill'
  const fillSlippageTone =
    fillSlippagePercent === null
      ? 'text-slate-500'
      : fillSlippagePercent > 0
        ? 'text-rose-500'
        : fillSlippagePercent < 0
          ? 'text-emerald-600'
          : 'text-slate-700'

  useEffect(() => {
    statusPhaseRef.current = statusPhase
  }, [statusPhase])

  const hasInFlightTrade =
    submitLoading || (Boolean(orderId) && !TERMINAL_STATUS_PHASES.has(statusPhase))

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

  const resetRecordState = useCallback(() => {
    setTradeRecord(null)
    setSubmitError(null)
    setSubmitFailureDetails(null)
    setOrderId(null)
    setSubmittedAt(null)
    setStatusData(null)
    setStatusError(null)
    setStatusPhase('submitted')
    setSubmittedSnapshot(null)
    setLatestPrice(null)
    setLatestPriceError(null)
    setMarketStatus(null)
    setOrderBookError(null)
    setOrderBookLoading(false)
    setBookTickSize(null)
    setBestBidPrice(null)
    setBestAskPrice(null)
    setAmountMode('usd')
    setAmountInput('')
    setSlippagePreset(3)
    setCustomSlippage('')
    setForm(EMPTY_FORM)
  }, [])

  const handleSwitchToContracts = useCallback(() => {
    if (!amountInput.trim()) return
    setAmountMode('contracts')
    if (contractsValue && contractsValue > 0) {
      setAmountInput(formatInputValue(contractsValue, sizeDecimals))
    }
  }, [amountInput, contractsValue, sizeDecimals])

  const handleSwitchToUsd = useCallback(() => {
    if (!amountInput.trim()) return
    setAmountMode('usd')
    if (estimatedTotal && estimatedTotal > 0) {
      setAmountInput(formatInputValue(estimatedTotal, 2))
    }
  }, [amountInput, estimatedTotal])

  const handleAdjustOrder = useCallback(() => {
    setOrderId(null)
    setSubmittedAt(null)
    setStatusData(null)
    setStatusError(null)
    setStatusPhase('submitted')
    setSubmitError(null)
    setSubmitFailureDetails(null)
    setSubmittedSnapshot(null)
  }, [])

  const handleAmountChange = useCallback((value: string) => {
    setAmountInput(value)
  }, [])

  useEffect(() => {
    if (!hasAmountInput || !limitPriceValue) return
    const bufferPrice = limitPriceValue * (1 - slippageValue / 100)
    const safeBufferPrice =
      Number.isFinite(bufferPrice) && bufferPrice > 0 ? bufferPrice : limitPriceValue
    const minContractsForBuffer = adjustSizeForImpliedAmountAtLeast(
      limitPriceValue,
      ceilToStep(minTradeUsd / safeBufferPrice, 0.01),
      tickSize,
      2,
      2
    )
    if (amountMode === 'usd') {
      if (parsedAmountValue !== null && parsedAmountValue < minTradeUsd) {
        const formatted = formatInputValue(minTradeUsd, 2)
        if (formatted !== amountInput) {
          setAmountInput(formatted)
        }
      }
      return
    }
    if (amountMode === 'contracts' && estimatedTotal !== null && estimatedTotal < minTradeUsd) {
      const formatted = formatInputValue(minContractsForBuffer ?? 0, sizeDecimals)
      if (formatted !== amountInput) {
        setAmountInput(formatted)
      }
    }
  }, [
    amountInput,
    amountMode,
    estimatedTotal,
    hasAmountInput,
    limitPriceValue,
    minTradeUsd,
    parsedAmountValue,
    slippageValue,
    tickSize,
    sizeDecimals,
  ])

  const applyRecord = async (record: Record<string, any>) => {
    setTradeRecord(record)

    const tokenFromRecord = extractTokenId(record)
    const recordPrice = Number(record.price)
    const recordSize = Number(record.size)
    const recordTotal =
      Number.isFinite(recordPrice) && Number.isFinite(recordSize)
        ? recordPrice * recordSize
        : null
    const nextForm: ExecuteForm = {
      tokenId: tokenFromRecord,
      price: firstStringValue(record, PRICE_KEYS),
      amount: firstStringValue(record, AMOUNT_KEYS),
      side: normalizeSide(firstStringValue(record, SIDE_KEYS) || 'BUY'),
      orderType: 'FAK',
    }
    setForm(nextForm)
    if (recordTotal !== null && Number.isFinite(recordTotal)) {
      setAmountInput(recordTotal.toFixed(2))
      setAmountMode('usd')
    } else {
      setAmountInput('')
    }

    const conditionIdValue = record.condition_id || record.conditionId
    const marketMeta =
      conditionIdValue && typeof conditionIdValue === 'string'
        ? await fetchMarketMetadata(conditionIdValue)
        : null

    const iconUrl = marketMeta?.icon || marketMeta?.image
    if (iconUrl) {
      setTradeRecord((prev) =>
        prev
          ? {
              ...prev,
              icon: iconUrl,
              market_icon: iconUrl,
              market: { ...(prev.market || {}), icon: iconUrl },
            }
          : prev
      )
    }

    if (!tokenFromRecord) {
      const tokens = marketMeta?.tokens || []
      if (tokens.length > 0) {
        const outcome =
          firstStringValue(record, OUTCOME_KEYS) || String(record.outcome || '')
        const outcomeIndex =
          record.outcome_index !== undefined ? Number(record.outcome_index) : null
        let match: { outcome?: string | null; token_id?: string | null } | null = null
        if (outcome) {
          match = tokens.find(
            (token) =>
              token.outcome &&
              token.outcome.toLowerCase() === outcome.toLowerCase() &&
              token.token_id
          ) ?? null
        }
        if (!match && Number.isFinite(outcomeIndex) && outcomeIndex! >= 0) {
          match = tokens[outcomeIndex!] || null
        }
        if (match?.token_id) {
          setForm((prev) => ({ ...prev, tokenId: String(match!.token_id) }))
        }
      }
    }
  }

  useEffect(() => {
    if (prefillAppliedRef.current) return
    if (!searchParams) return
    const prefill = searchParams.get('prefill')
    if (!prefill) return

    const priceRaw = searchParams.get('price')
    const sizeRaw = searchParams.get('size')
    const timestampRaw = searchParams.get('timestamp')
    const tradeIdParam = searchParams.get('tradeId')
    const record: Record<string, any> = {
      trade_id: tradeIdParam || undefined,
      trader_username: searchParams.get('traderName') || undefined,
      trader_wallet: searchParams.get('traderWallet') || undefined,
      market_title: searchParams.get('marketTitle') || undefined,
      market_slug: searchParams.get('marketSlug') || undefined,
      event_slug: searchParams.get('eventSlug') || undefined,
      condition_id: searchParams.get('conditionId') || undefined,
      outcome: searchParams.get('outcome') || undefined,
      side: searchParams.get('side') || undefined,
      price: priceRaw && Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : undefined,
      size: sizeRaw && Number.isFinite(Number(sizeRaw)) ? Number(sizeRaw) : undefined,
      trade_timestamp:
        timestampRaw && Number.isFinite(Number(timestampRaw))
          ? Number(timestampRaw)
          : timestampRaw || undefined,
    }

    resetRecordState()
    applyRecord(record)
    prefillAppliedRef.current = true
  }, [searchParams, resetRecordState])

  useEffect(() => {
    let mounted = true

    const loadProfile = async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const user = data?.user || null
        if (!mounted) return
        if (!user) {
          setUserId(null)
          setIsPremiumUser(false)
          return
        }
        setUserId(user.id)

        const { data: profile } = await supabase
          .from('profiles')
          .select('is_premium, is_admin')
          .eq('id', user.id)
          .maybeSingle()

        if (mounted) {
          setIsPremiumUser(Boolean(profile?.is_premium || profile?.is_admin))
        }
      } catch (err) {
        console.warn('Failed to load profile for trade execution', err)
        if (mounted) {
          setUserId(null)
          setIsPremiumUser(false)
        }
      }
    }

    loadProfile()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    const tokenId = form.tokenId.trim()
    if (!tokenId) return
    let cancelled = false
    let inFlight = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    setBookTickSize(null)
    setBestBidPrice(null)
    setBestAskPrice(null)

    const fetchBook = async (showLoading: boolean) => {
      if (cancelled || inFlight) return
      inFlight = true
      if (showLoading) {
        setOrderBookLoading(true)
      }
      setOrderBookError(null)
      try {
        const res = await fetch(`/api/polymarket/book?token_id=${encodeURIComponent(tokenId)}`, {
          cache: 'no-store',
        })
        const data = (await res.json()) as OrderBookResponse
        if (!res.ok) {
          throw new Error((data as any)?.error || 'Order book lookup failed.')
        }
        if (cancelled) return

        const bids = Array.isArray(data?.bids) ? data.bids : []
        const asks = Array.isArray(data?.asks) ? data.asks : []
        const bestBid = parseBookPrice(bids, 'bid')
        const bestAsk = parseBookPrice(asks, 'ask')
        const parsedTick = Number(data?.tick_size)
        setBestBidPrice(Number.isFinite(bestBid ?? NaN) ? bestBid : null)
        setBestAskPrice(Number.isFinite(bestAsk ?? NaN) ? bestAsk : null)
        setBookTickSize(Number.isFinite(parsedTick) ? parsedTick : null)
      } catch (error: any) {
        if (!cancelled) {
          setOrderBookError(error?.message || 'Order book lookup failed.')
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
  }, [form.tokenId])

  const fetchBalance = useCallback(async (address?: string) => {
    setBalanceLoading(true)
    setBalanceError(null)
    setBalanceData(null)

    try {
      const res = await fetch('/api/polymarket/balance', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      })
      const data = (await res.json()) as BalanceResponse
      if (!res.ok) {
        throw new Error((data as any)?.error || 'Failed to fetch balance')
      }
      setBalanceData(data)
      try {
        sessionStorage.setItem('polymarket-balance', JSON.stringify(data))
      } catch {
        // Ignore storage errors
      }
      const resolvedAddress = data?.proxyAddress?.trim() || ''
      if (resolvedAddress && !walletAddress) {
        setWalletAddress(resolvedAddress)
      }
      if (address && !walletAddress) {
        setWalletAddress(address)
      }
      return data
    } catch (err: any) {
      const message = err?.message || 'Failed to fetch balance'
      if (
        message.includes('No turnkey wallet found') ||
        message.includes('No Polymarket API credentials')
      ) {
        setBalanceError('Connect your wallet and set up CLOB credentials to see available cash.')
      } else {
        setBalanceError(message)
      }
      setBalanceData(null)
      return null
    } finally {
      setBalanceLoading(false)
    }
  }, [walletAddress])

  const handleWalletConnect = async (address: string) => {
    if (!userId) return

    try {
      const { data: walletData } = await supabase
        .from('turnkey_wallets')
        .select('polymarket_account_address, eoa_address')
        .eq('user_id', userId)
        .maybeSingle()

      const connectedWallet =
        walletData?.polymarket_account_address ||
        walletData?.eoa_address ||
        address

      setWalletAddress(connectedWallet || null)

      try {
        await fetch('/api/polymarket/reset-credentials', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
        })
      } catch {
        // Non-blocking
      }

      if (connectedWallet) {
        try {
          await fetch('/api/polymarket/l2-credentials', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store',
            body: JSON.stringify({ polymarketAccountAddress: connectedWallet }),
          })
        } catch {
          // Non-blocking
        }
      }
    } catch (err) {
      console.warn('Error updating wallet after connection:', err)
      setWalletAddress(address)
    }
  }

  useEffect(() => {
    let cached: BalanceResponse | null = null
    try {
      const stored = sessionStorage.getItem('polymarket-balance')
      cached = stored ? (JSON.parse(stored) as BalanceResponse) : null
    } catch {
      cached = null
    }
    if (cached) {
      setBalanceData(cached)
      const cachedAddress = cached?.proxyAddress?.trim() || ''
      if (cachedAddress) {
        setWalletAddress(cachedAddress)
      }
    }
    fetchBalance()
  }, [fetchBalance])

  const handleExecute = async () => {
    setSubmitError(null)
    setSubmitFailureDetails(null)

    if (!canSubmit) {
      if (!form.tokenId.trim() || !limitPriceValue || !contractsValue) {
        setSubmitError('Enter an amount to send your order.')
        return
      }
      if (isBelowMinUsd) {
        setSubmitError('Minimum trade is $1 at current price.')
        return
      }
      setSubmitError('Check amount and pricing before sending.')
      return
    }

    if (isPremiumUser && notEnoughFunds) {
      setSubmitError('Not enough balance to place this order.')
      setShowFundingModal(true)
      return
    }

    setSubmitLoading(true)
    try {
      if (!limitPriceValue) {
        setSubmitError('Invalid limit price')
        setSubmitLoading(false)
        return
      }
      const priceToSend = limitPriceValue
      const roundedContracts = contractsValue ? roundDownToStep(contractsValue, 0.01) : null
      const amountToSend =
        limitPriceValue && roundedContracts
          ? adjustSizeForImpliedAmount(limitPriceValue, roundedContracts, tickSize, 2, 2)
          : roundedContracts
      const bufferPrice = limitPriceValue * (1 - slippageValue / 100)
      const safeBufferPrice =
        Number.isFinite(bufferPrice) && bufferPrice > 0 ? bufferPrice : limitPriceValue
      const minContractsForBuffer = adjustSizeForImpliedAmountAtLeast(
        limitPriceValue,
        ceilToStep(minTradeUsd / safeBufferPrice, 0.01),
        tickSize,
        2,
        2
      )
      const finalAmount =
        amountToSend && minContractsForBuffer && amountToSend < minContractsForBuffer
          ? minContractsForBuffer
          : amountToSend
      if (!priceToSend || !amountToSend || !finalAmount) {
        setSubmitError('Missing amount or price.')
        return
      }
      if (finalAmount && priceToSend * finalAmount < minTradeUsd) {
        setSubmitError('Minimum trade is $1 at current price.')
        return
      }

      if (estimatedTotal !== null && priceToSend && finalAmount !== null) {
        setSubmittedSnapshot({
          contracts: finalAmount,
          estimatedUsd: finalAmount * priceToSend,
          limitPrice: priceToSend,
        })
      }

      const payload = {
        tokenId: form.tokenId.trim(),
        price: priceToSend,
        amount: finalAmount,
        side: form.side,
        orderType: form.orderType,
        confirm: true,
      }

      const res = await fetch('/api/polymarket/orders/place', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        // Handle error - ensure it's a string, not an object
        let errorMessage = 'Trade execution failed'
        
        if (data?.error) {
          // If error is an object, try to extract a meaningful message
          if (typeof data.error === 'string') {
            errorMessage = data.error
          } else if (typeof data.error === 'object') {
            errorMessage = data.error.message || data.error.error || JSON.stringify(data.error)
          }
        } else if (data?.message) {
          errorMessage = data.message
        } else if (data?.polymarketError) {
          errorMessage =
            typeof data.polymarketError === 'string'
              ? data.polymarketError
              : JSON.stringify(data.polymarketError)
        } else if (data?.raw) {
          errorMessage =
            typeof data.raw === 'string' ? data.raw : JSON.stringify(data.raw)
        } else if (data?.snippet) {
          errorMessage =
            typeof data.snippet === 'string' ? data.snippet : JSON.stringify(data.snippet)
        }
        
        const normalizedError = errorMessage.toLowerCase()
        const priceLimitMatch = errorMessage.match(
          /price must be at (most|least)\s*\$?([0-9]*\.?[0-9]+)/i
        )
        const isFundingError =
          normalizedError.includes('not enough balance') ||
          normalizedError.includes('allowance') ||
          normalizedError.includes('insufficient')

        // Add helpful context based on error type
        if (errorMessage.includes('No turnkey wallet') || errorMessage.includes('wallet not found')) {
          errorMessage = 'Trading wallet not connected. Please connect your wallet in your profile settings before executing trades.'
        } else if (errorMessage.includes('No Polymarket API credentials') || errorMessage.includes('L2 credentials')) {
          errorMessage = 'Polymarket credentials not set up. Please complete wallet setup in your profile to enable trading.'
        } else if (errorMessage.includes('Unauthorized')) {
          errorMessage = 'Session expired. Please log out and log back in to continue trading.'
        } else if (priceLimitMatch) {
          const direction = priceLimitMatch[1]?.toLowerCase()
          const limitValue = priceLimitMatch[2]
          const relation = direction === 'least' ? 'below' : 'above'
          const bound = direction === 'least' ? 'min' : 'max'
          errorMessage = `Slippage pushed your limit price ${relation} the allowed ${bound} ($${limitValue}). Lower slippage % in Advanced and try again.`
        } else if (normalizedError.includes('no orders found to match with fak order') || normalizedError.includes('fak orders are partially filled') || normalizedError.includes('fak order')) {
          errorMessage =
            "We couldn’t fill this order at your price. Try increasing slippage (tap Advanced) or using a smaller amount."
        } else if (normalizedError.includes('not enough balance') || normalizedError.includes('allowance')) {
          errorMessage =
            'Not enough balance or allowance to place this order. Add funds or approve a higher allowance, then try again.'
        } else if (errorMessage.includes('balance') || errorMessage.includes('insufficient')) {
          errorMessage = 'Insufficient balance. Please add funds to your wallet or reduce the trade amount.'
        }

        if (isPremiumUser && isFundingError) {
          setShowFundingModal(true)
        }
        
        setSubmitError(errorMessage)
        setSubmitFailureDetails({
          errorType: data?.errorType ?? data?.error_type ?? null,
          rayId: data?.rayId ?? data?.ray_id ?? null,
          blockedByCloudflare:
            Boolean(data?.blockedByCloudflare) || Boolean(data?.blocked_by_cloudflare),
        })
        return
      }
      const resolvedOrderId =
        data?.orderId ||
        data?.orderID ||
        data?.raw?.orderID ||
        data?.raw?.orderId ||
        data?.raw?.order_hash ||
        data?.raw?.orderHash ||
        null
      const normalizedOrderId =
        resolvedOrderId !== null && resolvedOrderId !== undefined
          ? String(resolvedOrderId).trim()
          : null
      setOrderId(normalizedOrderId && normalizedOrderId.length > 0 ? normalizedOrderId : null)
      setSubmittedAt(data?.submittedAt || new Date().toISOString())
      setStatusData(null)
      setStatusError(null)
      setStatusPhase('submitted')
    } catch (err: any) {
      let errorMessage = 'Network error - please check your connection and try again'
      
      if (err?.message) {
        if (typeof err.message === 'string') {
          errorMessage = err.message
        } else {
          errorMessage = JSON.stringify(err.message)
        }
      }
      
      setSubmitError(errorMessage)
    } finally {
      setSubmitLoading(false)
    }
  }

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null
    let processingTimer: ReturnType<typeof setTimeout> | null = null
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    let inFlight = false

    processingTimer = setTimeout(() => {
      if (!cancelled && !statusData) {
        setStatusPhase('processing')
      }
    }, 1500)

    const cancelOrder = async () => {
      try {
        const res = await fetch('/api/polymarket/orders/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderHash: orderId }),
        })
        const data = await res.json()
        if (!res.ok) {
          setStatusError(data?.error || data?.message || 'Failed to cancel order')
        }
      } catch (err: any) {
        setStatusError(err?.message || 'Failed to cancel order')
      }
    }

    timeoutTimer = setTimeout(async () => {
      if (cancelled) return
      const phase = statusPhaseRef.current
      if (TERMINAL_STATUS_PHASES.has(phase)) return
      setStatusPhase('timed_out')
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
      await cancelOrder()
    }, ORDER_STATUS_TIMEOUT_MS)

    const poll = async () => {
      if (cancelled || inFlight) return
      if (statusPhaseRef.current === 'timed_out') return
      inFlight = true
      try {
        const res = await fetch(`/api/polymarket/orders/${encodeURIComponent(orderId)}/status`, {
          cache: 'no-store',
        })
        const data = await res.json()
        if (!res.ok) {
          setStatusError(data?.error || data?.message || 'Status check failed')
        } else {
          if (processingTimer) {
            clearTimeout(processingTimer)
            processingTimer = null
          }
          setStatusData(data)
          setStatusError(null)
          const rawStatus = data?.status ? String(data.status) : ''
          const phase = normalizeStatusPhase(rawStatus)
          setStatusPhase(phase)
          if (TERMINAL_STATUS_PHASES.has(phase) && intervalId) {
            clearInterval(intervalId)
            intervalId = null
            if (timeoutTimer) {
              clearTimeout(timeoutTimer)
              timeoutTimer = null
            }
          }
        }
      } catch (err: any) {
        setStatusError(err?.message || 'Network error')
      } finally {
        inFlight = false
      }
    }

    poll()
    intervalId = setInterval(poll, 250)

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      if (processingTimer) clearTimeout(processingTimer)
      if (timeoutTimer) clearTimeout(timeoutTimer)
    }
  }, [orderId])

  useEffect(() => {
    if (!record?.trade_timestamp) return
    setNowMs(Date.now())
    const timer = setInterval(() => {
      setNowMs(Date.now())
    }, 1000)
    return () => clearInterval(timer)
  }, [record?.trade_timestamp])

  useEffect(() => {
    if (!record) return
    const conditionId = record.condition_id || record.conditionId
    const slug = record.market_slug || record.marketSlug
    const title = record.market_title || record.marketTitle
    const outcome =
      firstStringValue(record, OUTCOME_KEYS) || String(record.outcome || '')
    const outcomeIndex =
      record.outcome_index !== undefined ? Number(record.outcome_index) : null

    if (!conditionId && !slug && !title) {
      setLatestPriceError('No market identifiers available for price lookup.')
      return
    }

    let cancelled = false

    const fetchPrice = async (showLoading: boolean) => {
      if (showLoading) {
        setLatestPriceLoading(true)
      }
      setLatestPriceError(null)
      try {
        const params = new URLSearchParams()
        if (conditionId) params.set('conditionId', String(conditionId))
        if (slug) params.set('slug', String(slug))
        if (title) params.set('title', String(title))

        const priceRes = await fetch(`/api/polymarket/price?${params.toString()}`)
        const priceData = await priceRes.json()
        if (cancelled) return
        if (priceRes.ok && priceData?.success && priceData?.market) {
          const resolved = resolveOutcomePrice(
            priceData.market.outcomePrices,
            priceData.market.outcomes,
            outcome,
            outcomeIndex
          )
          if (typeof priceData.market.closed === 'boolean') {
            setMarketStatus(priceData.market.closed ? 'Closed' : 'Open')
          }
          if (resolved !== null && Number.isFinite(resolved)) {
            setLatestPrice(resolved)
          } else {
            setLatestPriceError('Latest price not available for this outcome.')
          }
        } else {
          setLatestPriceError(priceData?.error || 'Price lookup failed.')
        }
      } catch (err: any) {
        if (!cancelled) {
          setLatestPriceError(err?.message || 'Price lookup failed.')
        }
      } finally {
        if (!cancelled && showLoading) {
          setLatestPriceLoading(false)
        }
      }
    }

    setLatestPrice(null)
    setMarketStatus(null)
    fetchPrice(true)
    const intervalId = setInterval(() => {
      fetchPrice(false)
    }, 1000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [
    record?.condition_id,
    record?.conditionId,
    record?.market_slug,
    record?.marketSlug,
    record?.market_title,
    record?.marketTitle,
    record?.outcome,
    record?.outcome_index,
  ])

  return (
    <div>
      <Navigation />
      <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
        <div className="space-y-4">
          <div className="text-2xl font-semibold text-slate-900">Trade You're Copying</div>
          <TradeCard
            trader={{
              name: traderDisplayName,
              avatar: traderIcon || undefined,
              address: traderWallet,
              id: traderWallet || undefined,
            }}
            market={marketTitle}
            marketAvatar={marketIcon || undefined}
            position={outcomeLabel}
            action={directionLabel === 'Sell' ? 'Sell' : 'Buy'}
            price={tradePrice ?? 0}
            size={tradeSize ?? 0}
            total={totalCost ?? 0}
            timestamp={elapsed}
            isPremium={isPremiumUser}
            conditionId={record?.condition_id || record?.conditionId}
            tokenId={form.tokenId || extractTokenId(record ?? {})}
            marketSlug={record?.market_slug || record?.marketSlug || undefined}
            currentMarketPrice={currentPrice ?? undefined}
            marketIsOpen={
              marketStatus === 'Open' ? true : marketStatus === 'Closed' ? false : null
            }
            polymarketUrl={polymarketUrl ?? undefined}
            walletAddress={walletAddress}
            onOpenConnectWallet={() => setShowConnectWalletModal(true)}
            hideActions
          />
        </div>

        <div className="flex justify-center py-0.5">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-base text-slate-500">
            ↓
          </span>
        </div>

        <section className="rounded-md border border-slate-200 bg-white px-4 py-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Your Order</h2>
            </div>
            <div className="text-right">
              <div className="text-xs font-medium text-slate-500">Cash Available</div>
              <div className="text-sm font-semibold text-slate-900">{availableCashDisplay}</div>
              {balanceError && (
                <div className="text-xs text-rose-600">{balanceError}</div>
              )}
            </div>
          </div>
          <div className="text-sm text-slate-700 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Current Price / Contract:</span>
              <span className="text-sm font-semibold text-slate-900">
                {orderBookLoading || latestPriceLoading ? 'Loading…' : formatPrice(currentPrice)}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Live price
              </span>
              {priceDeltaPct !== null && (
                <span
                  className={`text-xs font-semibold ${
                    priceDeltaPct >= 0 ? 'text-emerald-600' : 'text-rose-500'
                  }`}
                >
                  {`${priceDeltaPct > 0 ? '+' : ''}${priceDeltaPct.toFixed(2)}% since original trade`}
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">Estimates update with live market prices.</div>
          </div>
          {(orderBookError || latestPriceError) && (
            <div className="text-xs text-amber-600">
              {orderBookError || latestPriceError}
            </div>
          )}

          {isOrderSent ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 shadow-sm space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium text-slate-500">Order Size</div>
                  <div className="text-lg font-semibold text-slate-900">
                    {confirmationPrimaryLabel}
                  </div>
                  <div className="text-xs text-slate-500">{confirmationSecondaryLabel}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Limit Price</div>
                  <div className="text-lg font-semibold text-slate-900">{limitPriceLabel}</div>
                  <div className="text-xs text-slate-500">Direction: {directionLabel}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Slippage Tolerance</div>
                  <div className="text-sm font-semibold text-slate-900">{slippageLabel}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Order Behavior</div>
                  <div className="text-sm font-semibold text-slate-900">{orderBehaviorLabel}</div>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Average fill price</div>
                    <div className="text-lg font-semibold text-slate-900">{fillPriceLabel}</div>
                    <div className="text-xs text-slate-400">Shown once fills are reported</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Slippage vs limit</div>
                    <div className={`text-sm font-semibold ${fillSlippageTone}`}>{fillSlippageLabel}</div>
                    <div className="text-xs text-slate-400">Positive worsens the fill</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-500">
                    <span>{amountMode === 'usd' ? 'USD (estimated)' : 'Contracts'}</span>
                    <button
                      type="button"
                      onClick={amountMode === 'usd' ? handleSwitchToContracts : handleSwitchToUsd}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                      disabled={!amountInput.trim()}
                    >
                      Switch to {amountMode === 'usd' ? 'contracts' : 'USD'}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:w-auto">
                      {amountMode === 'usd' && (
                        <span className="text-sm font-semibold text-slate-900">$</span>
                      )}
                      <input
                        type="number"
                        min="0"
                        step={amountMode === 'contracts' ? contractStep : 0.01}
                        value={amountInput}
                        onChange={(e) => handleAmountChange(e.target.value)}
                        className="w-full flex-1 border-none bg-white px-1 text-lg font-semibold text-slate-900 outline-none focus:outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none  [&::-moz-number-spin-box]:appearance-none"
                        placeholder={amountMode === 'usd' ? '1.20' : '10'}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={amountMode === 'usd' ? handleSwitchToContracts : handleSwitchToUsd}
                      className="text-sm font-medium text-slate-700 hover:text-slate-900"
                      disabled={amountMode === 'usd' ? !contractsValue : !estimatedTotal}
                    >
                      {amountMode === 'usd'
                        ? `≈ ${formatContractsDisplay(contractsValue, sizeDecimals)} contracts (tap to edit)`
                        : `≈ ${formatMoney(estimatedTotal)} USD (tap to edit)`}
                    </button>
                    <div className="ml-auto text-sm text-slate-500">
                      Win Total:{' '}
                      <span className="text-base font-semibold text-slate-900">{winTotalValue}</span>
                    </div>
                  </div>
                  {(notEnoughFunds || isBelowMinUsd) ? (
                    <div className="flex flex-wrap gap-2 text-xs text-amber-700 mt-2">
                      {isBelowMinUsd && <span>Minimum trade is $1.</span>}
                      {notEnoughFunds && <span>Available cash may be lower than this estimate.</span>}
                    </div>
                  ) : null}
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
                    aria-controls="slippage-tooltip"
                  >
                    ?
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[0, 1, 3, 5].map((value) => (
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
                      onChange={(e) => setCustomSlippage(e.target.value)}
                      className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="0.5"
                    />
                  )}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {limitPriceValue
                    ? `This order will only fill at ${limitPriceLabel} per contract or ${directionValue === 'SELL' ? 'more' : 'less'}.`
                    : 'Set slippage to preview the limit price.'}
                </div>
                {showSlippageInfo && (
                  <div
                    id="slippage-tooltip"
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
                    aria-controls="order-behavior-tooltip"
                  >
                    ?
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="orderBehavior"
                      checked={form.orderType === 'FAK'}
                      onChange={() => setForm((prev) => ({ ...prev, orderType: 'FAK' }))}
                    />
                    <span>Fill and Kill (FAK) (recommended)</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name="orderBehavior"
                      checked={form.orderType === 'GTC'}
                      onChange={() => setForm((prev) => ({ ...prev, orderType: 'GTC' }))}
                    />
                    <span>Good 'Til Canceled</span>
                  </label>
                </div>
                {showOrderBehaviorInfo && (
                  <div
                    id="order-behavior-tooltip"
                    className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
                  >
                    {ORDER_BEHAVIOR_TOOLTIP}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={!canSubmit || submitLoading}
                  className="inline-flex w-full max-w-[320px] justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400 mx-auto sm:max-w-none sm:w-auto"
                >
                  {submitLoading ? 'Submitting…' : 'Send Order'}
                </button>
                <div className="text-xs text-slate-500">
                  This sends a limit order. It may fill immediately, partially, or not at all.
                </div>
              </div>
            </>
          )}

          {submitError && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 space-y-1">
              <div>{submitError}</div>
              {submitFailureDetails?.errorType && (
                <div className="text-xs text-slate-500">
                  Reason code:{' '}
                  <span className="font-semibold text-slate-900">
                    {formatSubmitErrorReason(submitFailureDetails.errorType)}
                  </span>
                </div>
              )}
              {submitFailureDetails?.rayId && (
                <div className="text-xs text-slate-500">Ray ID: {submitFailureDetails.rayId}</div>
              )}
            </div>
          )}

          {orderId && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm space-y-4 sm:px-5 sm:py-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{postOrderStateLabel}</h3>
              </div>
              <div className="text-sm text-slate-600 flex items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${orderStatusIconClasses}`}
                >
                  <StatusIconComponent className="h-3 w-3" aria-hidden />
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {orderStatusLabel || 'Polymarket status pending'}
                </span>
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <div className="text-xs font-medium text-slate-500">Submitted contracts</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatContractsDisplay(submittedContracts, sizeDecimals)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Estimated max USD</div>
                  <div className="text-sm font-semibold text-slate-900">{amountUsdLabel}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Filled contracts</div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatContractsDisplay(filledSize, sizeDecimals)}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Average fill price</div>
                  <div className="text-sm font-semibold text-slate-900">{fillPriceLabel}</div>
                </div>
              </div>
              {statusReason && (
                <div className="text-sm text-slate-500">Reason: {statusReason}</div>
              )}
              {statusPhase === 'timed_out' && (
                <div className="space-y-3">
                  <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    Polymarket did not match this order within 30 seconds. We canceled it so you can
                    try again with a wider spread or updated price.
                  </div>
                  <button
                    type="button"
                    onClick={handleAdjustOrder}
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Adjust order and try again
                  </button>
                </div>
              )}
              <div className="text-xs text-slate-500">
                Polymarket status: {reportedOrderStatus || 'No status updates yet'}
              </div>
              {showFillProgress && (
                <div>
                  <div className="text-sm text-slate-500">
                    Filled {formatContractsDisplay(filledSize, sizeDecimals)} / {formatContractsDisplay(totalSize, sizeDecimals)}
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-slate-900 transition-all duration-150"
                      style={{ width: `${fillProgress}%` }}
                    />
                  </div>
                </div>
              )}
              {statusData?.updatedAt && (
                <div className="text-sm text-slate-500">
                  Updated {new Date(statusData.updatedAt).toLocaleTimeString()}
                </div>
              )}
              {statusError && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {statusError}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <ConnectWalletModal
        open={showConnectWalletModal}
        onOpenChange={setShowConnectWalletModal}
        onConnect={handleWalletConnect}
      />

      <Dialog open={showFundingModal} onOpenChange={setShowFundingModal}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Fund your Polymarket account</DialogTitle>
            <DialogDescription>
              Quick trades use your Polymarket USDC balance. Add funds before retrying this order.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-2">
            <Button asChild className="w-full bg-slate-900 text-white hover:bg-slate-800">
              <a href={FUNDING_FAQ_URL} target="_blank" rel="noopener noreferrer">
                How to deposit USDC
              </a>
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowFundingModal(false)}
            >
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function TradeExecutePage() {
  return (
    <Suspense fallback={null}>
      <TradeExecutePageInner />
    </Suspense>
  )
}
