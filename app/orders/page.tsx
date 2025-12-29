'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '../components/Header'
import OrdersTable from '@/components/orders/OrdersTable'
import ClosePositionModal from '@/components/orders/ClosePositionModal'
import { supabase } from '@/lib/supabase'
import type { OrderRow, OrderStatus } from '@/lib/orders/types'
import type { PositionSummary } from '@/lib/orders/position'

export default function OrdersPage() {
  const router = useRouter()
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [cashBalance, setCashBalance] = useState<string | null>(null)
  const [cashLoading, setCashLoading] = useState(false)
  const [showFailedOrders, setShowFailedOrders] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [openPositionsCount, setOpenPositionsCount] = useState<number | null>(null)
  const [openPositionsLoading, setOpenPositionsLoading] = useState(false)
  const [openPositionsError, setOpenPositionsError] = useState<string | null>(null)
  const [positions, setPositions] = useState<PositionSummary[]>([])
  const [positionsLoading, setPositionsLoading] = useState(false)
  const [positionsError, setPositionsError] = useState<string | null>(null)
  const [closeTarget, setCloseTarget] = useState<{ order: OrderRow; position: PositionSummary } | null>(null)
  const [closeSubmitting, setCloseSubmitting] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [closeSuccess, setCloseSuccess] = useState<string | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      setLoadingAuth(true)
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (!session?.user) {
          router.push('/login')
          return
        }
      } catch (err) {
        console.error('Auth error:', err)
        router.push('/login')
      } finally {
        setLoadingAuth(false)
      }
    }

    checkAuth()
  }, [router])

  const fetchOrders = useCallback(async (): Promise<string | null> => {
    setOrdersLoading(true)
    setOrdersError(null)
    try {
      const response = await fetch('/api/orders', { cache: 'no-store' })
      const data = await response.json()

      if (response.status === 401) {
        router.push('/login')
        return null
      }

      if (!response.ok) {
        setOrdersError(data.error || 'Failed to load orders')
        return null
      }

      setOrders(data.orders || [])
      const fetchedWallet =
        typeof data.walletAddress === 'string' && data.walletAddress.trim()
          ? data.walletAddress.trim().toLowerCase()
          : null
      setWalletAddress(fetchedWallet)
      return fetchedWallet
    } catch (err) {
      console.error('Orders load error:', err)
      setOrdersError('Failed to load orders')
      return null
    } finally {
      setOrdersLoading(false)
    }
  }, [router])

  const fetchCashBalance = useCallback(async () => {
    setCashLoading(true)
    try {
      const response = await fetch('/api/polymarket/balance', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Failed to load cash balance')
      }
      const data = await response.json()
      setCashBalance(data.balanceFormatted ?? null)
    } catch (err) {
      console.error('Cash balance load error:', err)
      setCashBalance(null)
    } finally {
      setCashLoading(false)
    }
  }, [])

  const fetchOpenPositions = useCallback(
    async (overrideWallet?: string | null): Promise<number | null> => {
      const targetAddress = (overrideWallet ?? walletAddress ?? '').trim()
      if (!targetAddress) {
        setOpenPositionsCount(null)
        setOpenPositionsError(null)
        return null
      }

      const normalizedAddress = targetAddress.toLowerCase()
      setOpenPositionsLoading(true)
      setOpenPositionsError(null)
      try {
        const response = await fetch(
          `/api/polymarket/open-positions?wallet=${encodeURIComponent(normalizedAddress)}`,
          {
            cache: 'no-store',
          }
        )
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to load open positions')
        }
        const count = typeof data?.open_positions === 'number' ? data.open_positions : 0
        setOpenPositionsCount(count)
        return count
      } catch (err: any) {
        console.error('Open positions load error:', err)
        setOpenPositionsError(err?.message || 'Failed to fetch open positions')
        setOpenPositionsCount(null)
        return null
      } finally {
        setOpenPositionsLoading(false)
      }
    },
    [walletAddress]
  )

  const fetchPositions = useCallback(async () => {
    setPositionsLoading(true)
    setPositionsError(null)

    try {
      const response = await fetch('/api/polymarket/positions', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load positions')
      }

      const rawPositions = Array.isArray(data.positions) ? data.positions : []

      const normalized: PositionSummary[] = rawPositions
        .map((entry: any) => {
          const direction = normalizePositionDirection(entry.direction)
          const side = normalizePositionSide(entry.side)
          const tokenId =
            extractString(entry.tokenId) ??
            extractString(entry.token_id) ??
            extractString(entry.asset_id) ??
            extractString(entry.asset)
          if (!tokenId || !direction || !side) return null

          const size =
            typeof entry.size === 'number'
              ? entry.size
              : typeof entry.size === 'string'
                ? parseFloat(entry.size)
                : 0
          if (!Number.isFinite(size) || size <= 0) return null

          return {
            tokenId,
            marketId: extractString(entry.marketId) ?? extractString(entry.market_id) ?? null,
            outcome: extractString(entry.outcome),
            direction,
            side,
            size,
            avgEntryPrice: typeof entry.avgEntryPrice === 'number' ? entry.avgEntryPrice : null,
            firstTradeAt: extractString(entry.firstTradeAt),
            lastTradeAt: extractString(entry.lastTradeAt),
          }
        })
        .filter((entry: PositionSummary | null): entry is PositionSummary => Boolean(entry))

      setPositions(normalized)
    } catch (err: any) {
      console.error('Positions load error:', err)
      setPositionsError(err?.message || 'Failed to fetch positions')
      setPositions([])
    } finally {
      setPositionsLoading(false)
    }
  }, [])

  const positionMap = useMemo(() => {
    const map = new Map<string, PositionSummary>()
    positions.forEach((position) => {
      const marketKey = position.marketId ? position.marketId.trim().toLowerCase() : ''
      const outcomeKey = position.outcome ? position.outcome.trim().toLowerCase() : ''
      if (marketKey) {
        map.set(`${marketKey}::${outcomeKey}`, position)
        map.set(marketKey, position)
      }
      map.set(position.tokenId.toLowerCase(), position)
    })
    return map
  }, [positions])

  const findPositionForOrder = useCallback(
    (order: OrderRow): PositionSummary | undefined => {
      const keys: string[] = []
      const marketKey = extractString(order.marketId)
      const outcomeKey = extractString(order.outcome)
      if (marketKey) {
        const normalizedMarket = marketKey.toLowerCase()
        keys.push(`${normalizedMarket}::${outcomeKey ? outcomeKey.toLowerCase() : ''}`)
        keys.push(normalizedMarket)
      }
      const tokenKey = extractTokenIdFromOrder(order)
      if (tokenKey) {
        keys.push(tokenKey.toLowerCase())
      }
      for (const key of keys) {
        if (!key) continue
        const hit = positionMap.get(key)
        if (hit) return hit
      }
      return undefined
    },
    [positionMap]
  )

  const resolvePositionForOrder = useCallback(
    (order: OrderRow): PositionSummary | null => {
      return findPositionForOrder(order) ?? buildPositionFromOrder(order)
    },
    [findPositionForOrder]
  )

  const refreshOrders = useCallback(async () => {
    setRefreshing(true)
    setRefreshError(null)

    try {
      const response = await fetch('/api/polymarket/orders/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json()

      if (response.status === 401) {
        router.push('/login')
        return
      }

      if (!response.ok) {
        setRefreshError(data.error || 'Failed to refresh orders')
      }
    } catch (err) {
      console.error('Orders refresh error:', err)
      setRefreshError('Failed to refresh orders')
    } finally {
      const fetchedWallet = await fetchOrders()
      const walletForPositions = fetchedWallet ?? walletAddress
      if (walletForPositions) {
        await fetchOpenPositions(walletForPositions)
      }
      await fetchCashBalance()
      fetchPositions()
      setRefreshing(false)
    }
  }, [fetchOrders, router, walletAddress, fetchOpenPositions, fetchCashBalance, fetchPositions])

  const handleSellPosition = useCallback(
    (order: OrderRow) => {
      const position = resolvePositionForOrder(order)
      if (!position) return
      setCloseTarget({ order, position })
      setCloseError(null)
      setCloseSuccess(null)
    },
    [findPositionForOrder]
  )

  const handleConfirmClose = useCallback(
    async ({
      tokenId,
      amount,
      price,
      slippagePercent,
    }: {
      tokenId: string
      amount: number
      price: number
      slippagePercent: number
    }) => {
      setCloseSubmitting(true)
      setCloseError(null)
      try {
        const response = await fetch('/api/polymarket/positions/close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokenId, amount, price, confirm: true }),
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to close position')
        }
        setCloseSuccess(`Close order submitted (${slippagePercent.toFixed(1)}% slippage)`)
        setCloseTarget(null)
        await refreshOrders()
      } catch (err: any) {
        console.error('Close position error:', err)
        setCloseError(err?.message || 'Failed to close position')
      } finally {
        setCloseSubmitting(false)
      }
    },
    [refreshOrders]
  )

  useEffect(() => {
    if (loadingAuth || hasLoaded) return
    setHasLoaded(true)
    refreshOrders()
  }, [loadingAuth, hasLoaded, refreshOrders])

  useEffect(() => {
    if (loadingAuth) return
    fetchCashBalance()
  }, [loadingAuth, fetchCashBalance])

  useEffect(() => {
    if (!walletAddress) return
    fetchPositions()
  }, [walletAddress, fetchPositions])

  const statusSummary = useMemo(() => {
    const summary: Record<OrderStatus, number> = {
      open: 0,
      partial: 0,
      filled: 0,
      canceled: 0,
      expired: 0,
      failed: 0,
    }
    orders.forEach((order) => {
      summary[order.status] += 1
    })
    return summary
  }, [orders])

  const performanceSummary = useMemo(() => {
    let realizedPnl = 0
    let realizedBase = 0
    let unrealizedPnl = 0
    let unrealizedBase = 0
    let amountInvested = 0
    let tradesWon = 0
    let tradesLost = 0
    let tradesOpen = 0

    const safeNumber = (value: number | null | undefined) =>
      Number.isFinite(value ?? NaN) ? (value as number) : 0

    const entryValue = (order: OrderRow) => {
      const contractsValue = order.filledSize > 0 ? order.filledSize : order.size
      const price = order.priceOrAvgPrice ?? order.currentPrice ?? 0
      const safeContracts = Number.isFinite(contractsValue) ? contractsValue : 0
      const safePrice = Number.isFinite(price) ? price : 0
      return safeContracts * safePrice
    }

    orders.forEach((order) => {
      const pnl = safeNumber(order.pnlUsd)
      const invested = entryValue(order)
      amountInvested += invested

      const isClosed =
        order.positionState === 'closed' ||
        ['filled', 'canceled', 'expired', 'failed'].includes(order.status)

      if (isClosed) {
        realizedPnl += pnl
        realizedBase += invested
        if (pnl > 0) tradesWon += 1
        if (pnl < 0) tradesLost += 1
      } else {
        unrealizedPnl += pnl
        unrealizedBase += invested
      }

      if (order.positionState === 'open') {
        tradesOpen += 1
      }
    })

    const blendedPnl = realizedPnl + unrealizedPnl
    const blendedBase = realizedBase + unrealizedBase

    const pct = (pnl: number, base: number) =>
      base !== 0 ? (pnl / base) * 100 : 0

    return {
      realizedPnl,
      realizedPct: pct(realizedPnl, realizedBase),
      unrealizedPnl,
      unrealizedPct: pct(unrealizedPnl, unrealizedBase),
      blendedPnl,
      blendedPct: pct(blendedPnl, blendedBase),
      tradesTotal: orders.length,
      tradesOpen,
      tradesClosed: orders.length - tradesOpen,
      tradesWon,
      tradesLost,
      amountInvested,
      amountWon: Math.max(realizedPnl, 0),
      amountLost: Math.abs(Math.min(realizedPnl, 0)),
    }
  }, [orders])

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {refreshing && !ordersLoading && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            Refreshing orders…
          </div>
        )}

        {refreshError && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-600 shadow-sm">
            {refreshError}
          </div>
        )}

        {closeSuccess && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 shadow-sm">
            {closeSuccess}
          </div>
        )}
        {positionsLoading && (
          <div className="mb-4 text-xs text-slate-500">Refreshing open positions data…</div>
        )}
        {positionsError && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 shadow-sm">
            {positionsError}
          </div>
        )}

        {ordersError && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-600 shadow-sm">
            {ordersError}
          </div>
        )}

        <div className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          <SectionGrid
            title="P&L"
            items={[
              {
                label: 'Realized P&L',
                value: formatCurrency(performanceSummary.realizedPnl),
                sub: formatPercent(performanceSummary.realizedPct),
              },
              {
                label: 'Unrealized P&L',
                value: formatCurrency(performanceSummary.unrealizedPnl),
                sub: formatPercent(performanceSummary.unrealizedPct),
              },
              {
                label: 'Blended P&L',
                value: formatCurrency(performanceSummary.blendedPnl),
                sub: formatPercent(performanceSummary.blendedPct),
              },
            ]}
          />
          <SectionGrid
            title="Trades"
            items={[
              { label: 'Trades made', value: performanceSummary.tradesTotal.toString(), sub: 'Total orders' },
              { label: 'Trades open', value: performanceSummary.tradesOpen.toString(), sub: 'Unresolved positions' },
              { label: 'Trades won', value: performanceSummary.tradesWon.toString(), sub: 'Closed w/ profit' },
              { label: 'Trades lost', value: performanceSummary.tradesLost.toString(), sub: 'Closed w/ loss' },
              { label: 'Trade counts', value: performanceSummary.tradesClosed.toString(), sub: 'Closed/settled' },
            ]}
          />
          <SectionGrid
            title="Amounts"
            items={[
              {
                label: 'Amount invested',
                value: formatCurrency(performanceSummary.amountInvested),
                sub: 'Sum of entry exposure',
              },
              {
                label: 'Amount won',
                value: formatCurrency(performanceSummary.amountWon),
                sub: 'Positive realized P&L',
              },
              {
                label: 'Amount lost',
                value: formatCurrency(performanceSummary.amountLost),
                sub: 'Negative realized P&L',
              },
            ]}
          />
          <div>
            <p className="text-xs text-slate-400">Cash available</p>
            <p className="text-base text-slate-900">{cashLoading ? 'Loading…' : cashBalance ?? '—'}</p>
          </div>
        </div>

        <OrdersTable
          orders={orders}
          loading={ordersLoading}
          statusSummary={statusSummary}
          getPositionForOrder={resolvePositionForOrder}
          onSellPosition={handleSellPosition}
        />
        {closeTarget && (
          <ClosePositionModal
            key={`${closeTarget.order.orderId}-${closeTarget.position.tokenId}-${closeTarget.position.size}`}
            target={closeTarget}
            isSubmitting={closeSubmitting}
            submitError={closeError}
            onClose={() => {
              setCloseTarget(null)
              setCloseError(null)
            }}
            onSubmit={handleConfirmClose}
          />
        )}
      </main>
    </div>
  )
}

type SectionItem = {
  label: string
  value: string
  sub: string
}

function SectionGrid({ title, items }: { title: string; items: SectionItem[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.15em] text-slate-400">{title}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] uppercase tracking-[0.25em] text-slate-400">{item.label}</p>
            <p className="text-lg font-semibold text-slate-900">{item.value}</p>
            <p className="text-xs text-slate-500">{item.sub}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value)
  return `$${formatted}`
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const formatted = value.toFixed(1)
  return `${formatted}%`
}

function extractTokenIdFromOrder(order: OrderRow): string | null {
  const raw = order.raw ?? {}
  const candidateKeys = [
    'token_id',
    'tokenId',
    'tokenID',
    'asset_id',
    'assetId',
    'asset',
    'market',
    'condition_id',
    'conditionId',
  ]

  for (const key of candidateKeys) {
    const value = raw[key]
    const normalized = extractString(value)
    if (normalized) return normalized
  }

  const nestedMarket = typeof raw.market === 'object' && raw.market !== null ? raw.market : null
  if (nestedMarket) {
    const nestedKey = extractString(nestedMarket.token_id ?? nestedMarket.asset_id)
    if (nestedKey) return nestedKey
  }

  return null
}

function buildPositionFromOrder(order: OrderRow): PositionSummary | null {
  const tokenId = extractTokenIdFromOrder(order)
  if (!tokenId) return null

  const size = order.filledSize > 0 ? order.filledSize : order.size
  if (!Number.isFinite(size) || size <= 0) return null

  const normalizedSide = order.side?.trim().toLowerCase() ?? ''
  const direction = normalizedSide === 'sell' ? 'SHORT' : 'LONG'
  const side = normalizedSide === 'sell' ? 'SELL' : 'BUY'

  return {
    tokenId,
    marketId: extractString(order.marketId) ?? null,
    outcome: order.outcome ?? null,
    direction,
    side,
    size,
    avgEntryPrice: order.priceOrAvgPrice,
    firstTradeAt: extractString(order.createdAt),
    lastTradeAt: extractString(order.updatedAt),
  }
}

function normalizePositionDirection(value: unknown): 'LONG' | 'SHORT' | null {
  if (!value) return null
  const normalized = String(value).trim().toUpperCase()
  if (normalized === 'SHORT') return 'SHORT'
  if (normalized === 'LONG') return 'LONG'
  return null
}

function normalizePositionSide(value: unknown): 'BUY' | 'SELL' | null {
  if (!value) return null
  const normalized = String(value).trim().toUpperCase()
  if (normalized === 'SELL') return 'SELL'
  if (normalized === 'BUY') return 'BUY'
  return null
}

function extractString(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  return String(value)
}
