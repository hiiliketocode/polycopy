'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/app/components/Header'

type LookupResult =
  | { found: true; table: string; record: Record<string, any> }
  | { found: false; message?: string; error?: string }

type ExecuteForm = {
  tokenId: string
  price: string
  amount: string
  side: 'BUY' | 'SELL'
  orderType: 'GTC' | 'FOK' | 'IOC'
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
  | 'open'
  | 'partial'
  | 'filled'
  | 'canceled'
  | 'expired'
  | 'unknown'

const TERMINAL_STATUSES = new Set(['filled', 'canceled', 'cancelled', 'expired', 'rejected'])

const EMPTY_FORM: ExecuteForm = {
  tokenId: '',
  price: '',
  amount: '',
  side: 'BUY',
  orderType: 'IOC',
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
const CONTRACT_TYPE_KEYS = [
  'contract_type',
  'contractType',
  'market_type',
  'marketType',
  'market_kind',
  'marketKind',
  'market_structure',
  'marketStructure',
]

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

function formatPriceInput(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return ''
  const fixed = value.toFixed(6)
  return fixed.replace(/\.?0+$/, '')
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function normalizeOutcome(value: string) {
  return value.trim().toLowerCase()
}

function normalizeStatusPhase(status?: string | null): StatusPhase {
  if (!status) return 'unknown'
  const normalized = status.toLowerCase()
  if (normalized === 'open') return 'open'
  if (normalized === 'partial') return 'partial'
  if (normalized === 'filled') return 'filled'
  if (normalized === 'canceled' || normalized === 'cancelled') return 'canceled'
  if (normalized === 'expired') return 'expired'
  return 'unknown'
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

function extractTraderName(record: Record<string, any>) {
  const direct = firstStringValue(record, TRADER_NAME_KEYS)
  if (direct) return direct
  const raw = record?.raw
  if (!raw || typeof raw !== 'object') return ''
  return firstStringValue(raw, TRADER_NAME_KEYS)
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

function extractContractType(record: Record<string, any>) {
  const direct = firstStringValue(record, CONTRACT_TYPE_KEYS)
  if (direct) return direct
  const raw = record?.raw
  if (!raw || typeof raw !== 'object') return ''
  const rawDirect = firstStringValue(raw, CONTRACT_TYPE_KEYS)
  if (rawDirect) return rawDirect
  const nested = getNestedValue(raw, ['market', 'contractType'])
  return nested ? String(nested) : ''
}

export default function TradeExecutePage() {
  const searchParams = useSearchParams()
  const [tradeId, setTradeId] = useState('')
  const [result, setResult] = useState<LookupResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const prefillAppliedRef = useRef(false)

  const [form, setForm] = useState<ExecuteForm>(EMPTY_FORM)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitResult, setSubmitResult] = useState<any | null>(null)
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
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [limitPriceInput, setLimitPriceInput] = useState('')
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [balanceData, setBalanceData] = useState<BalanceResponse | null>(null)

  const record = result && 'found' in result && result.found ? result.record : null
  const displayTokenId = record ? extractTokenId(record) : ''
  const marketIcon = record ? extractMarketIcon(record) : ''
  const traderName = record ? extractTraderName(record) : ''
  const traderIcon = record ? extractTraderIcon(record) : ''
  const traderWallet = record?.trader_wallet ? String(record.trader_wallet) : ''
  const traderLabel =
    traderName || (traderWallet ? `${traderWallet.slice(0, 6)}...${traderWallet.slice(-4)}` : '')
  const traderInitials = traderLabel ? getInitials(traderLabel) : '??'
  const traderAvatarColor = getAvatarColor(traderWallet || traderLabel || 'trader')
  const marketTitle = record ? formatValue(record.market_title || record.market_slug) : '—'
  const contractTypeRaw = record ? extractContractType(record) : ''
  const contractType = contractTypeRaw ? formatValue(contractTypeRaw) : ''
  const tradePrice = record && Number.isFinite(Number(record.price)) ? Number(record.price) : null
  const currentPrice = latestPrice ?? tradePrice
  const slippagePercent =
    slippagePreset === 'custom' ? Number(customSlippage) : Number(slippagePreset)
  const slippageValue = Number.isFinite(slippagePercent) ? slippagePercent : 0
  const maxPrice = currentPrice ? currentPrice * (1 + slippageValue / 100) : null
  const limitPrice = showAdvanced ? Number(limitPriceInput) : maxPrice
  const limitPriceValue = Number.isFinite(limitPrice) ? limitPrice : null
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
      total >= 1
    )
  }, [estimatedTotal, form.tokenId, limitPriceValue, contractsValue])
  const elapsed = record ? formatElapsedDetailed(record.trade_timestamp, nowMs) : '—'
  const tradeSize = record && Number.isFinite(Number(record.size)) ? Number(record.size) : null
  const totalCost =
    tradePrice !== null && tradeSize !== null ? tradePrice * tradeSize : null
  const payoutIfWins = tradeSize
  const filledLabel = record ? formatFilledDateTime(record.trade_timestamp) : '—'
  const priceDelta =
    currentPrice !== null && tradePrice !== null ? currentPrice - tradePrice : null
  const priceDeltaPct =
    priceDelta !== null && tradePrice ? (priceDelta / tradePrice) * 100 : null
  const amountHelper =
    amountMode === 'usd'
      ? `Estimated contracts: ${formatNumber(contractsValue)}`
      : `Estimated total: ${formatMoney(estimatedTotal)}`
  const slippageHelper =
    slippageValue === 0
      ? 'Your order will only fill at the current price and may not fill.'
      : `Allows fills up to ${slippageValue}% worse than the current price to improve execution.`

  const orderStatus = statusData?.status ? String(statusData.status).toLowerCase() : null
  const isTerminal = orderStatus ? TERMINAL_STATUSES.has(orderStatus) : false
  const filledSize = statusData?.filledSize ?? null
  const totalSize = statusData?.size ?? null
  const fillProgress =
    filledSize !== null && totalSize !== null && totalSize > 0
      ? Math.min(100, Math.max(0, (filledSize / totalSize) * 100))
      : null

  const resetLookupState = () => {
    setLookupError(null)
    setResult(null)
    setSubmitResult(null)
    setSubmitError(null)
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
    setShowAdvanced(false)
    setLimitPriceInput('')
  }

  const applyRecord = async (record: Record<string, any>, tableLabel = 'prefill') => {
    setResult({ found: true, table: tableLabel, record })

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
      orderType: 'IOC',
    }
    setForm(nextForm)
    if (recordTotal !== null && Number.isFinite(recordTotal)) {
      setAmountInput(recordTotal.toFixed(2))
      setAmountMode('usd')
    }

    if (!tokenFromRecord && (record.condition_id || record.conditionId)) {
      try {
        const outcome =
          firstStringValue(record, OUTCOME_KEYS) || String(record.outcome || '')
        const outcomeIndex =
          record.outcome_index !== undefined ? Number(record.outcome_index) : null
        const conditionId = record.condition_id || record.conditionId

        const tokenRes = await fetch(
          `/api/polymarket/market?conditionId=${encodeURIComponent(String(conditionId))}`
        )
        const tokenData = await tokenRes.json()
        if (tokenRes.ok && tokenData?.tokens?.length) {
          const tokens = tokenData.tokens as Array<{ outcome?: string; token_id?: string }>
          let match: { outcome?: string; token_id?: string } | null = null
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
      } catch {
        // Ignore token lookup failures; manual entry still allowed.
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
        timestampRaw && Number.isFinite(Number(timestampRaw)) ? Number(timestampRaw) : timestampRaw || undefined,
    }

    setTradeId(tradeIdParam || '')
    resetLookupState()
    applyRecord(record, 'prefill')
    prefillAppliedRef.current = true
  }, [searchParams])

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

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    resetLookupState()

    const trimmed = tradeId.trim()
    if (!trimmed) {
      setLookupError('Please enter a trade id.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/trade-lookup?tradeId=${encodeURIComponent(trimmed)}`)
      const data = await res.json()
      if (!res.ok) {
        setLookupError(data?.error || data?.message || 'Lookup failed')
        return
      }

      setResult(data)

      if (data?.found && data?.record) {
        await applyRecord(data.record, data.table || 'lookup')
      } else {
        setForm(EMPTY_FORM)
      }
    } catch (err: any) {
      setLookupError(err?.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    setSubmitError(null)
    setSubmitResult(null)

    if (!canSubmit) {
      const total = estimatedTotal ?? 0
      if (!form.tokenId.trim() || !limitPriceValue || !contractsValue) {
        setSubmitError('Fill in amount and slippage before sending.')
        return
      }
      if (total < 1) {
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
        setSubmitError(data?.error || data?.message || 'Send failed')
        return
      }
      setSubmitResult(data)
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
      setSubmitError(err?.message || 'Network error')
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
          const nextStatus = data?.status ? String(data.status) : ''
          const phase = normalizeStatusPhase(nextStatus)
          if (phase === 'open' || phase === 'partial') {
            setStatusPhase(phase)
          } else if (TERMINAL_STATUSES.has(nextStatus.toLowerCase())) {
            setStatusPhase(phase)
            if (intervalId) clearInterval(intervalId)
          } else if (nextStatus) {
            setStatusPhase('unknown')
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
    if (showAdvanced) return
    if (!Number.isFinite(maxPrice)) return
    setLimitPriceInput(formatPriceInput(maxPrice))
  }, [maxPrice, showAdvanced])

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
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">Trade Details</h1>
        <p className="mt-2 text-sm text-slate-600">
          Look up a trade id to review what the trader filled and send a new order.
        </p>

      <form onSubmit={handleLookup} className="mt-6 space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          Trade Id
          <input
            type="text"
            value={tradeId}
            onChange={(e) => setTradeId(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="0xabc123..."
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {loading ? 'Looking up…' : 'Lookup Trade'}
        </button>
      </form>

      {lookupError && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {lookupError}
        </div>
      )}

      {result && (
        <div className="mt-6 space-y-6">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-4">
            <h2 className="text-sm font-semibold text-slate-800">Trade Details</h2>
            {!record && (
              <p className="mt-2 text-sm text-slate-600">
                {result?.message || result?.error || 'Trade not found.'}
              </p>
            )}
            {record && (
              <div className="mt-3 space-y-4 text-sm text-slate-700">
                <div className="flex items-center gap-3">
                  {traderIcon ? (
                    <img
                      src={traderIcon}
                      alt=""
                      className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: traderAvatarColor }}
                    >
                      {traderInitials}
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-medium text-slate-500">Trader</div>
                    <div className="text-sm font-semibold text-slate-800">
                      {traderName || 'Anonymous'}
                    </div>
                    <div className="break-words font-mono text-xs text-slate-500">
                      {traderWallet ? `${traderWallet.slice(0, 6)}...${traderWallet.slice(-4)}` : '—'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {marketIcon ? (
                    <img
                      src={marketIcon}
                      alt=""
                      className="h-8 w-8 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {getInitials(String(marketTitle || 'M'))}
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-medium text-slate-500">Market</div>
                    <div className="text-sm font-semibold text-slate-800">{marketTitle}</div>
                    {contractType && <div className="text-xs text-slate-500">{contractType}</div>}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500">Direction</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
                      {(record.side || form.side || 'BUY').toUpperCase()}
                    </span>
                    <span className="text-sm font-semibold text-slate-800">
                      {record.outcome || '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {record && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-4">
              <h2 className="text-sm font-semibold text-slate-800">Order Summary</h2>
              <p className="mt-1 text-xs text-slate-500">What the trader filled</p>
              <div className="mt-3 rounded-md bg-slate-100 px-3 py-3">
                <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Trader Fill Price</div>
                    <div>{formatPrice(tradePrice)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Contracts</div>
                    <div>{formatNumber(tradeSize)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Total Cost</div>
                    <div>{formatMoney(totalCost)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Payout If Wins</div>
                    <div>{formatMoney(payoutIfWins)}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-xs font-medium text-slate-500">Filled</div>
                    <div>{filledLabel}</div>
                  </div>
                </div>
              </div>

              <details className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-slate-600">
                  View technical details
                </summary>
                <div className="mt-2 grid gap-3 text-xs text-slate-700 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Trade Id</div>
                    <div className="break-words font-mono">{formatValue(record.trade_id)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Token Id</div>
                    <div className="break-words font-mono">{formatValue(displayTokenId)}</div>
                  </div>
                </div>
              </details>
            </div>
          )}

          {record && (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-4">
              <h2 className="text-sm font-semibold text-slate-800">Live Snapshot</h2>
              <p className="mt-1 text-xs text-slate-500">Current market conditions</p>
              <div className="mt-3 rounded-md bg-slate-100 px-3 py-3">
                <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Time Since Trader Filled</div>
                    <div>{elapsed}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Market Status</div>
                    <div
                      className={
                        marketStatus === 'Open'
                          ? 'font-medium text-emerald-600'
                          : marketStatus === 'Closed'
                            ? 'font-medium text-rose-600'
                            : ''
                      }
                    >
                      {marketStatus || '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Current Price</div>
                    <div>{latestPriceLoading ? 'Loading…' : formatPrice(currentPrice)}</div>
                    {priceDeltaPct !== null && (
                      <div className="text-xs text-slate-500">
                        {`${priceDeltaPct > 0 ? '+' : ''}${priceDeltaPct.toFixed(2)}% since trader filled`}
                      </div>
                    )}
                    {latestPriceError && (
                      <div className="mt-1 text-xs text-rose-600">{latestPriceError}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 rounded-md border border-slate-200 bg-slate-50 px-4 py-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Send Order</h2>
        <div className="mt-4 space-y-6">
          <div className="rounded-md bg-slate-100 px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-slate-500">Available Cash</div>
                <div className="text-sm text-slate-800">
                  {balanceLoading ? 'Loading…' : balanceData?.balanceFormatted || '—'}
                </div>
                <div className="text-xs text-slate-500">
                  {walletAddress ? `Wallet ${abbreviateWallet(walletAddress)}` : '—'}
                </div>
                {balanceError && (
                  <div className="mt-1 text-xs text-rose-600">{balanceError}</div>
                )}
              </div>
              {walletAddress && (
                <button
                  type="button"
                  onClick={() => fetchBalance(walletAddress)}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:border-slate-300"
                >
                  Refresh
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500">Amount</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setAmountMode('usd')}
                  className={`rounded px-2 py-1 ${
                    amountMode === 'usd' ? 'bg-slate-900 text-white' : 'text-slate-600'
                  }`}
                >
                  $
                </button>
                <button
                  type="button"
                  onClick={() => setAmountMode('contracts')}
                  className={`rounded px-2 py-1 ${
                    amountMode === 'contracts' ? 'bg-slate-900 text-white' : 'text-slate-600'
                  }`}
                >
                  Contracts
                </button>
              </div>
              <input
                type="number"
                min="0"
                step="0.0001"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder={amountMode === 'usd' ? '1.20' : '10'}
              />
            </div>
            <div className="mt-2 text-xs text-slate-500">{amountHelper}</div>
            {estimatedTotal !== null && estimatedTotal < 1 && (
              <div className="mt-1 text-xs text-rose-600">Minimum total is $1.</div>
            )}
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500">Slippage Tolerance</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
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
            <div className="mt-2 text-xs text-slate-600">Max Price: {formatPrice(maxPrice)}</div>
            <div className="mt-1 text-xs text-slate-500">Slippage is measured from the current price.</div>
            <div className="mt-1 text-xs text-slate-500">{slippageHelper}</div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500">Order Behavior</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="orderBehavior"
                  checked={form.orderType === 'IOC'}
                  onChange={() => setForm((prev) => ({ ...prev, orderType: 'IOC' }))}
                />
                <span>Immediate or Cancel (recommended)</span>
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
          </div>

          <div className="rounded-md bg-slate-100 px-3 py-3">
            <div className="text-xs font-semibold text-slate-600">Order Preview</div>
            <div className="mt-2 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-slate-500">Current Price</div>
                <div>{formatPrice(currentPrice)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Max Price</div>
                <div>{formatPrice(maxPrice)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Estimated Contracts</div>
                <div>{formatNumber(contractsValue)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Estimated Total</div>
                <div>{formatMoney(estimatedTotal)}</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {slippageValue === 0
                ? 'This order may not fill.'
                : 'This order may fill at up to your max price.'}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleExecute}
            disabled={!canSubmit || submitLoading}
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitLoading ? 'Submitting…' : 'Send Order'}
          </button>
          <div className="text-xs text-slate-500">
            This sends a limit order. It may fill immediately, partially, or not at all.
          </div>
        </div>

        <details
          className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-2"
          open={showAdvanced}
          onToggle={(event) => {
            const open = event.currentTarget.open
            setShowAdvanced(open)
            if (open && !limitPriceInput && Number.isFinite(maxPrice)) {
              setLimitPriceInput(formatPriceInput(maxPrice))
            }
          }}
        >
          <summary className="cursor-pointer text-xs font-medium text-slate-600">Advanced</summary>
          <div className="mt-3 grid gap-4 text-sm text-slate-700 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">
              Limit Price
              <input
                type="number"
                min="0"
                step="0.000001"
                value={limitPriceInput}
                onChange={(e) => setLimitPriceInput(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="0.20"
              />
            </label>
            <label className="block text-sm font-medium text-slate-700">
              Time in Force
              <select
                value={form.orderType}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, orderType: e.target.value as ExecuteForm['orderType'] }))
                }
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="IOC">Immediate or Cancel</option>
                <option value="GTC">Good 'Til Canceled</option>
              </select>
            </label>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            Advanced options are for experienced traders.
          </div>
        </details>

        {submitError && (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {submitError}
          </div>
        )}

        {submitResult && (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
            <h3 className="text-sm font-semibold text-slate-800">Order Result</h3>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap rounded bg-white px-3 py-2 text-xs text-slate-800">
              {JSON.stringify(submitResult, null, 2)}
            </pre>
          </div>
        )}

        {orderId && (
          <div className="mt-4 rounded-md border border-slate-200 bg-white px-3 py-3">
            <h3 className="text-sm font-semibold text-slate-800">Order Status</h3>
            <p className="mt-1 text-xs text-slate-500">
              Order status is shown in real time. Polymarket may take longer to reflect updates.
            </p>
            <div className="mt-2 text-sm text-slate-700">
              {isTerminal
                ? 'Completed'
                : statusPhase === 'open' || statusPhase === 'partial'
                  ? 'Open'
                  : statusPhase === 'processing'
                    ? 'Processing'
                    : 'Submitted'}
            </div>
            {orderStatus && (
              <div className="mt-1 text-xs text-slate-500">
                Status: {orderStatus}
              </div>
            )}
            {fillProgress !== null && (orderStatus === 'open' || orderStatus === 'partial') && (
              <div className="mt-2">
                <div className="text-xs text-slate-500">
                  Filled {formatNumber(filledSize)} / {formatNumber(totalSize)}
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-slate-900"
                    style={{ width: `${fillProgress}%` }}
                  />
                </div>
              </div>
            )}
            {statusData?.updatedAt && (
              <div className="mt-2 text-xs text-slate-400">
                Updated {new Date(statusData.updatedAt).toLocaleTimeString()}
              </div>
            )}
            {statusError && (
              <div className="mt-2 text-xs text-rose-600">{statusError}</div>
            )}
          </div>
        )}
      </div>
      </main>
    </div>
  )
}
