'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useSearchParams } from 'next/navigation'
import { Navigation } from '@/components/polycopy/navigation'
import { USDC_DECIMALS } from '@/lib/turnkey/config'
import { extractTraderNameFromRecord } from '@/lib/trader-name'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import type { LucideProps } from 'lucide-react'

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
  | 'unknown'

const TERMINAL_STATUS_PHASES = new Set<StatusPhase>([
  'filled',
  'canceled',
  'expired',
  'rejected',
])
const MINIMUM_TRADE_USD = 1
const MINIMUM_TRADE_TOLERANCE = 1e-6

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
const ICON_KEYS = ['icon', 'market_icon', 'marketIcon', 'image', 'image_url', 'imageUrl']
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

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const fixed = value.toFixed(4)
  const trimmed = fixed.replace(/\.?0+$/, '')
  return `$${trimmed}`
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

function meetsMinimumTradeUsd(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return false
  return value + MINIMUM_TRADE_TOLERANCE >= MINIMUM_TRADE_USD
}

function meetsMinimumContracts(
  amountMode: 'usd' | 'contracts',
  amountValue: number,
  limitPriceValue: number | null
) {
  if (!Number.isFinite(amountValue) || amountValue <= 0) return false
  if (amountMode === 'contracts') {
    return amountValue + MINIMUM_TRADE_TOLERANCE >= 1
  }
  if (!limitPriceValue || !Number.isFinite(limitPriceValue) || limitPriceValue <= 0) return false
  return amountValue + MINIMUM_TRADE_TOLERANCE >= limitPriceValue
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

const FAILED_EXECUTION_PHASES = new Set<StatusPhase>(['canceled', 'expired', 'rejected'])

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
  unknown: 'Polymarket status unknown',
}

function getOrderStatusLabel(status?: string | null) {
  const phase = normalizeStatusPhase(status)
  return STATUS_SIMPLE_LABELS[phase] || 'Unknown'
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

function formatFilledDateTime(value: string | number | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const dateLabel = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timeLabel = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return `${dateLabel} · ${timeLabel}`
}

function getAvatarColor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 65% 45%)`
}

function getInitials(label: string) {
  if (!label) return '??'
  const parts = label.trim().split(/\s+/)
  const first = parts[0]?.[0] || ''
  const second = parts.length > 1 ? parts[1][0] : parts[0]?.[1] || ''
  return `${first}${second}`.toUpperCase()
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
  const [latestPrice, setLatestPrice] = useState<number | null>(null)
  const [latestPriceLoading, setLatestPriceLoading] = useState(false)
  const [latestPriceError, setLatestPriceError] = useState<string | null>(null)
  const [marketStatus, setMarketStatus] = useState<'Open' | 'Closed' | null>(null)
  const [nowMs, setNowMs] = useState<number>(Date.now())
  const [amountMode, setAmountMode] = useState<'usd' | 'contracts'>('usd')
  const [amountInput, setAmountInput] = useState('')
  const [slippagePreset, setSlippagePreset] = useState<number | 'custom'>(1)
  const [customSlippage, setCustomSlippage] = useState('')
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [balanceData, setBalanceData] = useState<BalanceResponse | null>(null)
  const [showSlippageInfo, setShowSlippageInfo] = useState(false)
  const [showOrderBehaviorInfo, setShowOrderBehaviorInfo] = useState(false)

  const record = tradeRecord
  const marketIcon = record ? extractMarketIcon(record) : ''
  const traderName = record ? extractTraderNameFromRecord(record) ?? '' : ''
  const traderIcon = record ? extractTraderIcon(record) : ''
  const traderWallet = record?.trader_wallet ? String(record.trader_wallet) : ''
  const marketTitle = record ? formatValue(record.market_title || record.market_slug) : '—'
  const fallbackIdentity =
    traderName || (traderWallet ? abbreviateWallet(traderWallet) : '') || 'Trade'
  const iconLabel = marketTitle !== '—' ? marketTitle : fallbackIdentity
  const iconImage = marketIcon || traderIcon
  const traderDisplayName =
    traderName || (traderWallet ? abbreviateWallet(traderWallet) : '') || 'Trader'
  const directionValue = normalizeSide(String(record?.side ?? form.side ?? 'BUY'))
  const directionLabel = directionValue === 'SELL' ? 'Sell' : 'Buy'
  const outcomeLabel = record?.outcome ? String(record.outcome) : '—'
  const tradePrice = record && Number.isFinite(Number(record.price)) ? Number(record.price) : null
  const currentPrice = latestPrice ?? tradePrice
  const slippagePercent =
    slippagePreset === 'custom' ? Number(customSlippage) : Number(slippagePreset)
  const slippageValue = Number.isFinite(slippagePercent) ? slippagePercent : 0
  const maxPrice = currentPrice ? currentPrice * (1 + slippageValue / 100) : null
  const limitPriceValue = Number.isFinite(maxPrice) ? maxPrice : null
  const amountValue = Number(amountInput)
  const hasAmount = Number.isFinite(amountValue) && amountValue > 0
  const contractsValue =
    amountMode === 'usd'
      ? hasAmount && limitPriceValue
        ? amountValue / limitPriceValue
        : null
      : hasAmount
        ? amountValue
        : null
  const estimatedTotal =
    amountMode === 'usd'
      ? hasAmount
        ? amountValue
        : null
      : contractsValue && limitPriceValue
        ? contractsValue * limitPriceValue
        : null
  const canSubmit = useMemo(() => {
    const total = estimatedTotal ?? 0
    return (
      Boolean(form.tokenId.trim()) &&
      limitPriceValue !== null &&
      limitPriceValue > 0 &&
      contractsValue !== null &&
      contractsValue > 0 &&
      meetsMinimumTradeUsd(total) &&
      meetsMinimumContracts(amountMode, amountValue, limitPriceValue)
    )
  }, [amountMode, amountValue, contractsValue, estimatedTotal, form.tokenId, limitPriceValue])
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
  const payoutIfWins = tradeSize
  const filledLabel = record ? formatFilledDateTime(record.trade_timestamp) : '—'
  const priceDelta =
    currentPrice !== null && tradePrice !== null ? currentPrice - tradePrice : null
  const priceDeltaPct =
    priceDelta !== null && tradePrice ? (priceDelta / tradePrice) * 100 : null
  const limitPriceLabel = limitPriceValue ? formatPrice(limitPriceValue) : '—'

  const availableBalance =
    balanceData?.balance && !Number.isNaN(Number(balanceData.balance))
      ? Number(balanceData.balance) / Math.pow(10, USDC_DECIMALS)
      : null
  const notEnoughFunds =
    estimatedTotal !== null && availableBalance !== null && estimatedTotal > availableBalance

  const minimumTotalNotMet =
    estimatedTotal !== null && !meetsMinimumTradeUsd(estimatedTotal)
  const minimumContractsNotMet = hasAmount
    ? amountMode === 'contracts'
      ? !meetsMinimumContracts(amountMode, amountValue, limitPriceValue)
      : limitPriceValue !== null
        ? !meetsMinimumContracts(amountMode, amountValue, limitPriceValue)
        : false
    : false
  const minimumContractUsd =
    limitPriceValue !== null && Number.isFinite(limitPriceValue) ? limitPriceValue : null

  const isOrderSent = Boolean(orderId)
  const slippageLabel =
    slippagePreset === 'custom' ? `${customSlippage || '0'}% (custom)` : `${slippagePreset}%`
  const orderBehaviorLabel =
    form.orderType === 'FAK' ? 'Fill and Kill (FAK)' : "Good 'Til Canceled (GTC)"
  const amountUsdLabel =
    estimatedTotal !== null && Number.isFinite(estimatedTotal)
      ? formatMoney(estimatedTotal)
      : `${amountInput || '0'} USD`
  const amountContractsLabel =
    contractsValue !== null && Number.isFinite(contractsValue)
      ? `${formatNumber(contractsValue)} contracts`
      : `${amountInput || '0'} contracts`
  const confirmationPrimaryLabel =
    amountMode === 'usd' ? amountUsdLabel : amountContractsLabel
  const confirmationSecondaryLabel =
    amountMode === 'usd'
      ? `${amountContractsLabel} (est)`
      : `${amountUsdLabel} (est)`
  const winTotalValue =
    contractsValue !== null && Number.isFinite(contractsValue)
      ? formatMoney(contractsValue)
      : '—'

  const reportedOrderStatus = statusData?.status ? String(statusData.status).trim() : null
  const orderStatusLabel = reportedOrderStatus
    ? getOrderStatusLabel(reportedOrderStatus)
    : 'Order Received by Polymarket, Pending'
  const statusReason = statusData ? findStatusReason(statusData.raw) : null
  const orderStatusVariant = getExecutionStatusVariant(statusPhase)
  const StatusIconComponent = STATUS_VARIANT_ICONS[orderStatusVariant]
  const orderStatusIconClasses = STATUS_VARIANT_WRAPPER_CLASSES[orderStatusVariant]
  const isTerminal = TERMINAL_STATUS_PHASES.has(statusPhase)
  const filledSize = statusData?.filledSize ?? null
  const totalSize = statusData?.size ?? null
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
    fillPriceValue !== null && limitPriceValue && limitPriceValue > 0
      ? directionValue === 'SELL'
        ? ((limitPriceValue - fillPriceValue) / limitPriceValue) * 100
        : ((fillPriceValue - limitPriceValue) / limitPriceValue) * 100
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

  const resetRecordState = useCallback(() => {
    setTradeRecord(null)
    setSubmitError(null)
    setSubmitFailureDetails(null)
    setOrderId(null)
    setSubmittedAt(null)
    setStatusData(null)
    setStatusError(null)
    setStatusPhase('submitted')
    setLatestPrice(null)
    setLatestPriceError(null)
    setMarketStatus(null)
    setAmountMode('usd')
    setAmountInput('')
    setSlippagePreset(1)
    setCustomSlippage('')
    setForm(EMPTY_FORM)
  }, [])

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
      const total = estimatedTotal ?? 0
      if (!form.tokenId.trim() || !limitPriceValue || !contractsValue) {
        setSubmitError('Fill in amount and slippage before sending.')
        return
      }
      if (!meetsMinimumContracts(amountMode, amountValue, limitPriceValue)) {
        if (amountMode === 'contracts') {
          setSubmitError('Minimum amount is 1 contract.')
        } else {
          const minUsdLabel = limitPriceValue ? formatMoney(limitPriceValue) : '$0'
          setSubmitError(`Minimum amount is ${minUsdLabel} for 1 contract at the limit price.`)
        }
        return
      }
      if (!meetsMinimumTradeUsd(total)) {
        setSubmitError('Total must be at least $1.')
        return
      }
      setSubmitError('Check amount and slippage before sending.')
      return
    }

    setSubmitLoading(true)
    try {
      const priceToSend = limitPriceValue
      const amountToSend = contractsValue
      if (!priceToSend || !amountToSend) {
        setSubmitError('Missing amount or price.')
        return
      }
      const payload = {
        tokenId: form.tokenId.trim(),
        price: priceToSend,
        amount: amountToSend,
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
        }
        
        // Add helpful context based on error type
        if (errorMessage.includes('No turnkey wallet') || errorMessage.includes('wallet not found')) {
          errorMessage = 'Trading wallet not connected. Please connect your wallet in your profile settings before executing trades.'
        } else if (errorMessage.includes('No Polymarket API credentials') || errorMessage.includes('L2 credentials')) {
          errorMessage = 'Polymarket credentials not set up. Please complete wallet setup in your profile to enable trading.'
        } else if (errorMessage.includes('Unauthorized')) {
          errorMessage = 'Session expired. Please log out and log back in to continue trading.'
        } else if (errorMessage.includes('balance') || errorMessage.includes('insufficient')) {
          errorMessage = 'Insufficient balance. Please add funds to your wallet or reduce the trade amount.'
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
    let inFlight = false

    processingTimer = setTimeout(() => {
      if (!cancelled && !statusData) {
        setStatusPhase('processing')
      }
    }, 1500)

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
        <section className="rounded-md border border-slate-200 bg-white px-5 py-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <h1 className="text-2xl font-semibold text-slate-900">Trade You're Copying</h1>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-500">
                  {traderIcon ? (
                    <img src={traderIcon} alt={traderDisplayName} className="h-9 w-9 rounded-2xl object-cover" />
                  ) : (
                    <span className="text-sm font-semibold text-slate-700">
                      {getInitials(traderDisplayName)}
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-xs text-slate-400">Trader</div>
                  <div className="text-sm font-semibold text-slate-900">{traderDisplayName}</div>
                </div>
              </div>
            </div>
            <div
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                marketStatus === 'Open'
                  ? 'bg-emerald-100 text-emerald-700'
                  : marketStatus === 'Closed'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-slate-100 text-slate-500'
              }`}
            >
              {marketStatus ? `Market ${marketStatus}` : 'Market status pending'}
            </div>
          </div>
          <div className="flex items-start gap-4">
            {iconImage ? (
              <img
                src={iconImage}
                alt={iconLabel}
                className="h-14 w-14 rounded-2xl border border-slate-200 object-cover"
              />
            ) : (
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700"
                style={{ backgroundColor: getAvatarColor(iconLabel || 'trade') }}
              >
                {getInitials(iconLabel)}
              </div>
            )}
            <div className="flex-1">
              <div className="text-lg font-semibold text-slate-900">{marketTitle}</div>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold tracking-wide text-slate-500">
                    Direction
                  </span>
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm ${
                      directionLabel?.toLowerCase() === 'buy'
                        ? 'bg-emerald-100 text-emerald-700'
                        : directionLabel?.toLowerCase() === 'sell'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {directionLabel}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold tracking-wide text-slate-500">
                    Outcome
                  </span>
                  <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {outcomeLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-4 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-400">
                Filled Price
              </div>
              <div className="text-sm font-semibold text-slate-900">{formatPrice(tradePrice)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-400">
                Contracts
              </div>
              <div className="text-sm font-semibold text-slate-900">{formatNumber(tradeSize)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-400">
                Total Cost
              </div>
              <div className="text-sm font-semibold text-slate-900">{formatMoney(totalCost)}</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-400">
                Payout If Wins
              </div>
              <div className="text-sm font-semibold text-slate-900">{formatMoney(payoutIfWins)}</div>
            </div>
          </div>
          <div className="flex flex-col gap-1 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>{filledLabel}</span>
            <span>Elapsed {elapsed}</span>
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
          <div className="text-sm text-slate-700">
            <span className="text-xs font-medium text-slate-500">Current Price / Contract:</span>{' '}
            <span className="text-sm font-semibold text-slate-900">
              {latestPriceLoading ? 'Loading…' : formatPrice(currentPrice)}
            </span>
            {priceDeltaPct !== null && (
              <span
                className={`ml-3 text-xs font-semibold ${
                  priceDeltaPct >= 0 ? 'text-emerald-600' : 'text-rose-500'
                }`}
              >
                {`${priceDeltaPct > 0 ? '+' : ''}${priceDeltaPct.toFixed(2)}% since original trade`}
              </span>
            )}
          </div>
          {latestPriceError && (
            <div className="text-xs text-rose-600">{latestPriceError}</div>
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
                    <div className="text-xs font-medium text-slate-500">Filled Price</div>
                    <div className="text-lg font-semibold text-slate-900">{fillPriceLabel}</div>
                    <div className="text-xs text-slate-400">Actual execution price</div>
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
                  <div className="mb-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAmountMode('usd')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${
                        amountMode === 'usd'
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      USD
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmountMode('contracts')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${
                        amountMode === 'contracts'
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      Contracts
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
                        step="0.0001"
                        value={amountInput}
                        onChange={(e) => setAmountInput(e.target.value)}
                        className="w-full flex-1 border-none bg-white px-1 text-lg font-semibold text-slate-900 outline-none focus:outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none  [&::-moz-number-spin-box]:appearance-none"
                        placeholder={amountMode === 'usd' ? '1.20' : '10'}
                      />
                    </div>
                    <div className="text-sm font-medium text-slate-700">
                      = {amountMode === 'usd'
                        ? `${formatNumber(contractsValue)} Contracts (est)`
                        : `${formatMoney(estimatedTotal)} USD (est)`}
                    </div>
                    <div className="ml-auto text-sm text-slate-500">
                      Win Total:{' '}
                      <span className="text-base font-semibold text-slate-900">{winTotalValue}</span>
                    </div>
                  </div>
                  {(minimumTotalNotMet || minimumContractsNotMet || notEnoughFunds) ? (
                    <div className="flex flex-wrap gap-2 text-xs text-rose-600 mt-2">
                      {minimumContractsNotMet && amountMode === 'contracts' && (
                        <span>Minimum amount is 1 contract.</span>
                      )}
                      {minimumContractsNotMet && amountMode === 'usd' && (
                        <span>
                          Minimum amount is{' '}
                          {minimumContractUsd !== null ? formatMoney(minimumContractUsd) : '$0'} for
                          1 contract at the limit price.
                        </span>
                      )}
                      {minimumTotalNotMet && <span>Minimum total is $1.</span>}
                      {notEnoughFunds && <span>Not enough funds available.</span>}
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
                    ? `This order will only fill at ${limitPriceLabel} per contract or less.`
                    : 'Set slippage to preview the upper bound.'}
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
                <h3 className="text-lg font-semibold text-slate-900">Order sent to Polymarket</h3>
              </div>
              <div className="text-sm text-slate-600">
                Status:
                <span className="ml-2 inline-flex items-center gap-2">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full border ${orderStatusIconClasses}`}
                  >
                    <StatusIconComponent className="h-3 w-3" aria-hidden />
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{orderStatusLabel}</span>
                </span>
              </div>
              {statusReason && (
                <div className="text-sm text-slate-500">Reason: {statusReason}</div>
              )}
              {showFillProgress && (
                <div>
                  <div className="text-sm text-slate-500">
                    Filled {formatNumber(filledSize)} / {formatNumber(totalSize)}
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
