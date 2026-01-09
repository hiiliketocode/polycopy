'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Navigation } from '@/components/polycopy/navigation'
import OrdersTable from '@/components/orders/OrdersTable'
import ClosePositionModal from '@/components/orders/ClosePositionModal'
import { supabase } from '@/lib/supabase'
import { resolveFeatureTier, tierHasPremiumAccess, type FeatureTier } from '@/lib/feature-tier'
import type { User } from '@supabase/supabase-js'
import type { OrderRow, OrderStatus } from '@/lib/orders/types'
import type { PositionSummary } from '@/lib/orders/position'

export default function OrdersPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [userTier, setUserTier] = useState<FeatureTier>('anon')
  const [isPremium, setIsPremium] = useState(false)
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [showFailedOrders, setShowFailedOrders] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [openOrderIds, setOpenOrderIds] = useState<string[]>([])
  const [openOrdersFetched, setOpenOrdersFetched] = useState(false)
  const [positions, setPositions] = useState<PositionSummary[]>([])
  const [positionsLoading, setPositionsLoading] = useState(false)
  const [positionsError, setPositionsError] = useState<string | null>(null)
  const [positionsLoaded, setPositionsLoaded] = useState(false)
  const [closeTarget, setCloseTarget] = useState<{ order: OrderRow; position: PositionSummary } | null>(null)
  const [closeSubmitting, setCloseSubmitting] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)
  const [closeSuccess, setCloseSuccess] = useState<string | null>(null)
  const [closeOrderId, setCloseOrderId] = useState<string | null>(null)
  const [closeSubmittedAt, setCloseSubmittedAt] = useState<string | null>(null)
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'positions' | 'openOrders' | 'history'>('positions')
  const [includeResolvedPositions, setIncludeResolvedPositions] = useState(false)
  const historyOrdersOnly = useMemo(() => {
    const base = orders.filter((order) => order.status !== 'open' && order.status !== 'partial')
    return showFailedOrders ? base : base.filter((order) => order.status !== 'failed')
  }, [orders, showFailedOrders])

  const openOrdersOnly = useMemo(() => {
    const MIN_REMAINING = 1e-6
    const openIdSet = new Set(openOrderIds.map((id) => id.toLowerCase()))
    return orders.filter((order) => {
      const statusOpen = order.status === 'open' || order.status === 'partial'
      if (!statusOpen) return false
      const tif = normalizeTimeInForce(order)
      if (tif !== 'GTC') return false
      const remaining = deriveRemainingSize(order)
      if (!(remaining > MIN_REMAINING)) return false
      const normalizedId = (order.orderId || '').trim().toLowerCase()
      if (openOrdersFetched) {
        return openIdSet.has(normalizedId)
      }
      return true
    })
  }, [orders, openOrderIds, openOrdersFetched])

  const hiddenFailedOrdersCount = useMemo(() => {
    const base = orders.filter((order) => order.status !== 'open' && order.status !== 'partial')
    const failedCount = base.filter((order) => order.status === 'failed').length
    return showFailedOrders ? 0 : failedCount
  }, [orders, showFailedOrders])

  useEffect(() => {
    const checkAuth = async () => {
      setLoadingAuth(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.push('/login')
          return
        }
        setUser(user)
      } catch (err) {
        console.error('Auth error:', err)
        router.push('/login')
      } finally {
        setLoadingAuth(false)
      }
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.push('/login')
      } else {
        setUser(prevUser => {
          if (prevUser?.id === session.user.id) {
            return prevUser
          }
          return session.user
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  // Fetch feature tier and wallet
  useEffect(() => {
    if (!user) {
      setUserTier('anon')
      setIsPremium(false)
      setWalletAddress(null)
      setProfileImageUrl(null)
      return
    }

    setUserTier('registered')

    let cancelled = false

    const fetchProfileAndWallet = async () => {
      try {
        const [profileRes, walletRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('is_premium, is_admin, profile_image_url')
            .eq('id', user.id)
            .single(),
          supabase
            .from('turnkey_wallets')
            .select('polymarket_account_address, eoa_address')
            .eq('user_id', user.id)
            .maybeSingle()
        ])

        if (profileRes.error) {
          console.error('Error fetching profile:', profileRes.error)
          if (!cancelled) {
            setUserTier(resolveFeatureTier(true, null))
            setIsPremium(false)
            setProfileImageUrl(null)
          }
          return
        }

        if (!cancelled) {
          setUserTier(resolveFeatureTier(true, profileRes.data))
          setIsPremium(profileRes.data?.is_premium || false)
          setProfileImageUrl(profileRes.data?.profile_image_url || null)
          setWalletAddress(
            walletRes.data?.polymarket_account_address || 
            walletRes.data?.eoa_address || 
            null
          )
        }
      } catch (err) {
        console.error('Error fetching profile and wallet:', err)
        if (!cancelled) {
          setUserTier('registered')
          setIsPremium(false)
          setProfileImageUrl(null)
          setWalletAddress(null)
        }
      }
    }

    fetchProfileAndWallet()

    return () => {
      cancelled = true
    }
  }, [user])

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
      const openIds = Array.isArray(data.openOrderIds)
        ? data.openOrderIds
            .map((id: unknown) => (typeof id === 'string' ? id.trim().toLowerCase() : null))
            .filter((id: string | null): id is string => Boolean(id))
        : []
      setOpenOrderIds(openIds)
      setOpenOrdersFetched(typeof data.openOrdersFetched === 'boolean' ? data.openOrdersFetched : false)
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
      setPositionsLoaded(true)
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
      await fetchOrders()
      setRefreshing(false)
      if (activeTab === 'positions') {
        fetchPositions()
      }
    }
  }, [fetchOrders, router, fetchPositions, activeTab])

  const handleSellPosition = useCallback(
    (order: OrderRow) => {
      const position = resolvePositionForOrder(order)
      if (!position) return
      setCloseTarget({ order, position })
      setCloseError(null)
      setCloseSuccess(null)
      setCloseOrderId(null)
      setCloseSubmittedAt(null)
    },
    [findPositionForOrder]
  )

  const handleCancelOrder = useCallback(
    async (order: OrderRow) => {
      if (!order?.orderId) return
      setCancelError(null)
      setCancelingOrderId(order.orderId)
      try {
        const response = await fetch('/api/polymarket/orders/cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderHash: order.orderId }),
        })
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to cancel order')
        }
        await refreshOrders()
      } catch (err: any) {
        console.error('Cancel order error:', err)
        setCancelError(err?.message || 'Failed to cancel order')
      } finally {
        setCancelingOrderId(null)
      }
    },
    [refreshOrders]
  )

  const handleConfirmClose = useCallback(
    async ({
      tokenId,
      amount,
      price,
      slippagePercent,
      orderType,
    }: {
      tokenId: string
      amount: number
      price: number
      slippagePercent: number
      orderType: 'FAK' | 'GTC'
    }) => {
      const positionSide = closeTarget?.position.side
      const sideForClose: 'BUY' | 'SELL' =
        positionSide === 'SELL' ? 'BUY' : 'SELL'

      if (!closeTarget) {
        setCloseError('No position selected to close')
        return
      }

      setCloseSubmitting(true)
      setCloseError(null)
      try {
        const payload = {
          tokenId,
          amount,
          price,
          side: sideForClose,
          orderType,
          confirm: true,
        }
        const response = await fetch('/api/polymarket/orders/place', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await response.json()
        if (!response.ok) {
          const errorMessage =
            typeof data?.error === 'string'
              ? data.error
              : typeof data?.message === 'string'
                ? data.message
                : typeof data?.snippet === 'string'
                  ? data.snippet
                  : typeof data?.raw === 'string'
                    ? data.raw
                    : JSON.stringify(data)
          throw new Error(errorMessage)
        }
        setCloseSuccess(`Close order submitted (${slippagePercent.toFixed(1)}% slippage)`)
        setCloseOrderId(data?.orderId ?? null)
        setCloseSubmittedAt(data?.submittedAt ?? null)
        await refreshOrders()
      } catch (err: any) {
        console.error('Close position error:', err)
        setCloseError(err?.message || 'Failed to close position')
      } finally {
        setCloseSubmitting(false)
      }
    },
    [refreshOrders, closeTarget]
  )

  useEffect(() => {
    if (loadingAuth || hasLoaded || !user) return
    setHasLoaded(true)
    fetchOrders()
  }, [loadingAuth, hasLoaded, user, fetchOrders])

  useEffect(() => {
    if (activeTab !== 'positions') return
    if (positionsLoaded) return
    fetchPositions()
  }, [activeTab, positionsLoaded, fetchPositions])

  const statusSummaryOrders =
    activeTab === 'openOrders'
      ? openOrdersOnly
      : activeTab === 'history'
        ? historyOrdersOnly
        : []

  const statusSummary = useMemo(() => {
    const summary: Record<OrderStatus, number> = {
      open: 0,
      partial: 0,
      filled: 0,
      canceled: 0,
      expired: 0,
      failed: 0,
    }
    statusSummaryOrders.forEach((order) => {
      summary[order.status] += 1
    })
    return summary
  }, [statusSummaryOrders])

  const orderLookups = useMemo(() => {
    const byTokenId = new Map<string, OrderRow>()
    const byMarketOutcome = new Map<string, OrderRow>()
    orders.forEach((order) => {
      const tokenId = extractTokenIdFromOrder(order)
      if (tokenId) {
        const key = tokenId.toLowerCase()
        const existing = byTokenId.get(key)
        byTokenId.set(key, selectPreferredOrder(existing, order))
      }
      const marketId = extractString(order.marketId)
      if (marketId) {
        const outcome = extractString(order.outcome) ?? ''
        const key = `${marketId.toLowerCase()}::${outcome.toLowerCase()}`
        const existing = byMarketOutcome.get(key)
        byMarketOutcome.set(key, selectPreferredOrder(existing, order))
      }
    })
    return { byTokenId, byMarketOutcome }
  }, [orders])

  const resolveOrderForPosition = useCallback(
    (position: PositionSummary): OrderRow | null => {
      const key = position.tokenId?.toLowerCase?.()
      if (!key) return null
      const tokenMatch = orderLookups.byTokenId.get(key) ?? null
      if (tokenMatch) return tokenMatch
      const marketId = extractString(position.marketId)
      if (!marketId) return null
      const outcome = extractString(position.outcome) ?? ''
      return orderLookups.byMarketOutcome.get(`${marketId.toLowerCase()}::${outcome.toLowerCase()}`) ?? null
    },
    [orderLookups]
  )

  return (
    <>
      <Navigation 
        user={user ? { id: user.id, email: user.email || '' } : null} 
        isPremium={isPremium}
        walletAddress={walletAddress}
        profileImageUrl={profileImageUrl}
      />
      <div className="min-h-screen bg-slate-50">
        <main className="mx-auto max-w-6xl px-4 py-8">
        {refreshing && !ordersLoading && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            Refreshing orders…
          </div>
        )}
        {activeTab === 'positions' && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            Showing trades executed via Polycopy only. Current value reflects live market pricing for these copied positions.
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
        {positionsError && activeTab === 'positions' && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 shadow-sm">
            {positionsError}
          </div>
        )}

        {ordersError && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-white p-4 text-sm text-rose-600 shadow-sm">
            {ordersError}
          </div>
        )}
        {cancelError && activeTab === 'openOrders' && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 shadow-sm">
            {cancelError}
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-700">
          {(['positions', 'openOrders', 'history'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-full px-4 py-2 ${
                activeTab === tab ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {tab === 'positions' ? 'Positions' : tab === 'openOrders' ? 'Open orders' : 'History'}
            </button>
          ))}
          {activeTab === 'history' && (
            <div className="ml-auto flex items-center gap-2 text-xs text-slate-600">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showFailedOrders}
                  onChange={(event) => setShowFailedOrders(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <span>Show failed</span>
              </label>
              {!showFailedOrders && hiddenFailedOrdersCount > 0 && (
                <span className="text-xs text-slate-500">
                  {hiddenFailedOrdersCount} failed hidden
                </span>
              )}
            </div>
          )}
        </div>

        {activeTab === 'positions' && (
            <PositionsList
              positions={positions}
              loading={positionsLoading}
              resolveOrderForPosition={resolveOrderForPosition}
              onSellPosition={(position) => {
                const order = resolveOrderForPosition(position)
                if (!order) return
                handleSellPosition(order)
              }}
              includeResolvedPositions={includeResolvedPositions}
              onToggleIncludeResolved={setIncludeResolvedPositions}
            />
        )}

        {activeTab === 'openOrders' && (
          <OrdersTable
            orders={openOrdersOnly}
            loading={ordersLoading}
            statusSummary={statusSummary}
            getPositionForOrder={resolvePositionForOrder}
            onSellPosition={handleSellPosition}
            showActions
            onCancelOrder={handleCancelOrder}
            cancelingOrderId={cancelingOrderId}
          />
        )}

        {activeTab === 'history' && (
          <OrdersTable
            orders={historyOrdersOnly}
            loading={ordersLoading}
            statusSummary={statusSummary}
            getPositionForOrder={resolvePositionForOrder}
            onSellPosition={handleSellPosition}
            showActions={false}
          />
        )}

        {closeTarget && (
          <ClosePositionModal
            key={`${closeTarget.order.orderId}-${closeTarget.position.tokenId}-${closeTarget.position.size}`}
            target={closeTarget}
            isSubmitting={closeSubmitting}
            submitError={closeError}
            onClose={() => {
              setCloseTarget(null)
              setCloseError(null)
              setCloseOrderId(null)
              setCloseSubmittedAt(null)
            }}
            onSubmit={handleConfirmClose}
            orderId={closeOrderId}
            submittedAt={closeSubmittedAt}
          />
        )}
        </main>
      </div>
    </>
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

function formatContracts(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value)
}

function formatSignedPercentCompact(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const needsDecimals = Math.abs(value % 1) > 1e-6
  const digits = needsDecimals ? 2 : 0
  const sign = value > 0 ? '+' : value < 0 ? '' : ''
  return `${sign}${value.toFixed(digits)}%`
}

function formatDateOpened(value: string | null | undefined) {
  if (!value) return '—'
  const asNumber = Number(value)
  const parsed = Number.isFinite(asNumber)
    ? asNumber > 1e12
      ? asNumber
      : asNumber * 1000
    : Date.parse(value)
  if (!Number.isFinite(parsed)) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
}

function deriveRemainingSize(order: OrderRow): number {
  const raw = order.raw ?? {}
  const candidates = [
    raw.remaining_size,
    raw.remainingSize,
    raw.size_remaining,
    (order.size ?? null) - (order.filledSize ?? 0),
  ]
  for (const candidate of candidates) {
    const numeric = typeof candidate === 'number' ? candidate : Number(candidate)
    if (Number.isFinite(numeric)) {
      return numeric
    }
  }
  return 0
}

function getPnlColorClass(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'text-slate-600'
  if (value > 0) return 'text-emerald-600'
  if (value < 0) return 'text-rose-600'
  return 'text-slate-600'
}

function normalizeTimeInForce(order: OrderRow): string | null {
  const raw = order.raw ?? {}
  const candidates = [
    (order as any).timeInForce,
    (order as any).orderType,
    raw.time_in_force,
    raw.timeInForce,
    raw.order_type,
    raw.orderType,
    raw.time_in_force_code,
  ]
  const mapNumeric = (value: string) => {
    const numeric = Number(value)
    if (!Number.isNaN(numeric)) {
      switch (numeric) {
        case 0:
          return 'GTC'
        case 1:
          return 'FOK'
        case 2:
          return 'GTD'
        case 3:
          return 'FAK'
        default:
          return null
      }
    }
    return null
  }

  for (const candidate of candidates) {
    if (!candidate) continue
    const normalized = String(candidate).trim().toUpperCase()
    if (normalized === 'IOC') return 'FAK'
    if (normalized === 'GTC' || normalized === 'FOK' || normalized === 'GTD' || normalized === 'FAK') {
      return normalized
    }
    const mapped = mapNumeric(normalized)
    if (mapped) return mapped
  }
  return null
}

function deriveConditionId(tokenId: string | null | undefined, marketId?: string | null): string | null {
  const candidates = [marketId, tokenId].filter(Boolean) as string[]
  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    if (!trimmed.startsWith('0x')) continue
    if (trimmed.length >= 66) {
      return trimmed.slice(0, 66)
    }
  }
  return null
}

function computePositionPnl(position: PositionSummary, entryPrice: number | null, currentPrice: number | null): { pnl: number; pct: number } | null {
  if (!Number.isFinite(entryPrice ?? NaN) || !Number.isFinite(currentPrice ?? NaN)) return null
  const size = position.size
  if (!Number.isFinite(size) || size <= 0) return null
  const isShort = position.side === 'SELL'
  const delta = isShort ? (entryPrice! - currentPrice!) : (currentPrice! - entryPrice!)
  const pnl = delta * size
  const base = entryPrice! * size
  const pct = base !== 0 ? (pnl / base) * 100 : 0
  return { pnl, pct }
}

function abbreviateWallet(wallet: string | null | undefined): string | null {
  if (!wallet) return null
  const trimmed = wallet.trim()
  if (!trimmed) return null
  if (trimmed.length <= 10) return trimmed
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`
}

function abbreviateHex(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length <= 12) return trimmed
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`
}

function truncateLabel(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  if (maxLength <= 3) return value.slice(0, maxLength)
  return `${value.slice(0, maxLength - 3)}...`
}

function getCopiedTraderDisplay(order: OrderRow): { label: string; full: string } {
  const raw = (order && typeof order === 'object' && order.raw) ? order.raw : {}
  const candidates = [
    raw.copiedTraderUsername,
    raw.copied_trader_username,
    raw.copiedTraderHandle,
    raw.copied_trader_handle,
    raw.copied_trader_name,
    raw.copiedTraderName,
    order?.traderName,
  ]
  let full = ''
  for (const candidate of candidates) {
    const text = extractString(candidate)
    if (text) {
      full = text
      break
    }
  }

  const wallet =
    extractString(order?.copiedTraderWallet) ??
    extractString(order?.traderWallet) ??
    ''

  if (!full && wallet) {
    return { label: abbreviateWallet(wallet) ?? wallet, full: wallet }
  }

  if (!full) {
    return { label: '—', full: '' }
  }

  const isWalletLike = full.startsWith('0x') && full.length > 12
  const label = isWalletLike
    ? abbreviateWallet(full) ?? full
    : truncateLabel(full, 16)
  return { label, full }
}

function selectPreferredOrder(current: OrderRow | undefined, candidate: OrderRow): OrderRow {
  if (!current) return candidate
  const currentHasCopied = orderHasCopiedTrader(current)
  const candidateHasCopied = orderHasCopiedTrader(candidate)
  if (candidateHasCopied && !currentHasCopied) return candidate
  if (currentHasCopied && !candidateHasCopied) return current
  const currentTs = getOrderTimestamp(current)
  const candidateTs = getOrderTimestamp(candidate)
  if (candidateTs > currentTs) return candidate
  return current
}

function orderHasCopiedTrader(order: OrderRow): boolean {
  if (order.copiedTraderId || order.copiedTraderWallet) return true
  const raw = order?.raw ?? {}
  return Boolean(
    raw.copiedTraderUsername ||
      raw.copied_trader_username ||
      raw.copiedTraderHandle ||
      raw.copied_trader_handle ||
      raw.copied_trader_name ||
      raw.copiedTraderName
  )
}

function getOrderTimestamp(order: OrderRow): number {
  const updated = Date.parse(order.updatedAt ?? '')
  if (Number.isFinite(updated)) return updated
  const created = Date.parse(order.createdAt ?? '')
  if (Number.isFinite(created)) return created
  return 0
}

type PositionsListProps = {
  positions: PositionSummary[]
  loading: boolean
  resolveOrderForPosition: (position: PositionSummary) => OrderRow | null
  onSellPosition: (position: PositionSummary) => void
  includeResolvedPositions: boolean
  onToggleIncludeResolved: (value: boolean) => void
}

function PositionsList({
  positions,
  loading,
  resolveOrderForPosition,
  onSellPosition,
  includeResolvedPositions,
  onToggleIncludeResolved,
}: PositionsListProps) {
  const [marketMeta, setMarketMeta] = useState<
    Map<
      string,
      {
        title: string | null
        image: string | null
        open: boolean | null
        prices?: Map<string, number>
      }
    >
  >(new Map())
  const [metaLoading, setMetaLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const idsToFetch = Array.from(
      new Set(
        positions
          .map((p) => deriveConditionId(p.tokenId, p.marketId))
          .filter((id): id is string => Boolean(id))
      )
    ).filter((id) => !marketMeta.has(id))

    if (idsToFetch.length === 0) {
      setMetaLoading(false)
      return
    }

    const fetchMeta = async () => {
      setMetaLoading(true)
      const entries: Array<
        [
          string,
          {
            title: string | null
            image: string | null
            open: boolean | null
            prices?: Map<string, number>
          },
        ]
      > = []
      await Promise.allSettled(
        idsToFetch.map(async (conditionId) => {
          try {
            const resp = await fetch(`/api/polymarket/market?conditionId=${encodeURIComponent(conditionId)}`, {
              cache: 'no-store',
            })
            if (!resp.ok) return
            const data = await resp.json()
            const openStatus =
              typeof data?.acceptingOrders === 'boolean'
                ? data.acceptingOrders
                : typeof data?.closed === 'boolean'
                  ? !data.closed
                  : typeof data?.resolved === 'boolean'
                    ? !data.resolved
                    : null
            const prices = new Map<string, number>()
            if (Array.isArray(data?.tokens)) {
              data.tokens.forEach((token: any) => {
                const tid = typeof token?.token_id === 'string' ? token.token_id.toLowerCase() : null
                const p =
                  typeof token?.price === 'number'
                    ? token.price
                    : typeof token?.price === 'string'
                      ? Number(token.price)
                      : null
                if (tid && Number.isFinite(p)) {
                  prices.set(tid, p as number)
                }
              })
            }
            entries.push([
              conditionId,
              {
                title: data?.question ?? null,
                image: data?.icon ?? data?.image ?? null,
                open: openStatus,
                prices,
              },
            ])
          } catch {
            /* ignore fetch errors */
          }
        })
      )
      if (!cancelled && entries.length > 0) {
        setMarketMeta((prev) => {
          const next = new Map(prev)
          entries.forEach(([id, meta]) => next.set(id, meta))
          return next
        })
      }
      if (!cancelled) {
        setMetaLoading(false)
      }
    }

    fetchMeta()
    return () => {
      cancelled = true
    }
  }, [positions, marketMeta])

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="animate-pulse rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="mb-2 h-4 w-48 rounded-full bg-slate-200" />
            <div className="grid gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((__, i) => (
                <div key={i} className="h-3 rounded-full bg-slate-200" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!positions || positions.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        No open positions yet.
      </div>
    )
  }

  const visiblePositions = positions.filter((position) => {
    const order = resolveOrderForPosition(position)
    const state = order?.positionState ?? null
    const isClosed = state === 'closed'
    const conditionId = deriveConditionId(position.tokenId, position.marketId)
    const meta = conditionId ? marketMeta.get(conditionId) : null
    const marketResolved =
      order?.marketIsOpen === false ||
      meta?.open === false
    const isResolved = isClosed || marketResolved
    if (includeResolvedPositions) return true
    return !isResolved
  })

  const needsMarketMeta = visiblePositions.some((position) => {
    const conditionId = deriveConditionId(position.tokenId, position.marketId)
    return conditionId ? !marketMeta.has(conditionId) : false
  })

  if (metaLoading && needsMarketMeta) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="animate-pulse rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="mb-2 h-4 w-48 rounded-full bg-slate-200" />
            <div className="grid gap-2 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((__, i) => (
                <div key={i} className="h-3 rounded-full bg-slate-200" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (visiblePositions.length === 0) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        No positions matching filters.
        <label className="ml-3 inline-flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={includeResolvedPositions}
            onChange={(e) => onToggleIncludeResolved(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
          />
          <span>Include resolved positions</span>
        </label>
      </div>
    )
  }

  const positionRows = visiblePositions.map((position) => {
    const order = resolveOrderForPosition(position)
    const conditionId = deriveConditionId(position.tokenId, position.marketId)
    const meta = conditionId ? marketMeta.get(conditionId) : null
    const rawMarketTitle =
      order?.marketTitle ??
      meta?.title ??
      position.marketId ??
      position.tokenId ??
      'Market'
    const marketTitle =
      order?.marketTitle || meta?.title
        ? rawMarketTitle
        : abbreviateHex(rawMarketTitle) ?? rawMarketTitle
    const marketImage = order?.marketImageUrl ?? meta?.image ?? null
    const outcomeLabel = extractString(position.outcome) ?? extractString(order?.outcome) ?? '—'
    const amountUsd =
      Number.isFinite(position.size) && Number.isFinite(position.avgEntryPrice ?? NaN)
        ? position.size * (position.avgEntryPrice ?? 0)
        : null
    const tokenIdLower = position.tokenId?.toLowerCase?.()
    const metaPrice =
      tokenIdLower && meta?.prices?.has(tokenIdLower) ? meta.prices.get(tokenIdLower) ?? null : null
    const currentPrice = order?.currentPrice ?? metaPrice ?? null
    const entryPrice = position.avgEntryPrice ?? order?.priceOrAvgPrice ?? null
    const openedAt = position.firstTradeAt ?? position.lastTradeAt ?? order?.createdAt ?? null
    const inferredMarketOpen =
      order?.marketIsOpen ??
      meta?.open ??
      (currentPrice !== null
        ? currentPrice > 0.05 && currentPrice < 0.95
          ? true
          : false
        : null)
    const marketStatusLabel =
      order?.positionState === 'closed'
        ? 'Market sold'
        : inferredMarketOpen === false
          ? 'Resolved'
          : 'Open'
    const statusDot =
      order?.positionState === 'closed'
        ? 'bg-slate-400'
        : inferredMarketOpen === false
          ? 'bg-rose-500'
          : 'bg-emerald-500'
    const statusPill =
      order?.positionState === 'closed'
        ? 'bg-slate-100 text-slate-600'
        : inferredMarketOpen === false
          ? 'bg-amber-50 text-amber-700'
          : 'bg-emerald-50 text-emerald-700'
    const canSell = order?.positionState === 'closed' ? false : inferredMarketOpen !== false
    const traderDisplay = order ? getCopiedTraderDisplay(order) : { label: '—', full: '' }
    const pnlCalc = computePositionPnl(position, entryPrice, currentPrice)
    const pnlValue = pnlCalc?.pnl ?? order?.pnlUsd ?? null
    const currentValue =
      Number.isFinite(position.size) && Number.isFinite(currentPrice ?? NaN)
        ? position.size * (currentPrice ?? 0)
        : null
    const displayPct =
      currentValue === 0 && Number.isFinite(entryPrice ?? NaN) && (entryPrice ?? 0) > 0
        ? -100
        : pnlCalc?.pct ?? null
    const contractsCount = Number.isFinite(position.size) ? position.size : 0

    return {
      key: `${position.tokenId}-${position.size}`,
      position,
      marketTitle,
      marketImage,
      outcomeLabel,
      amountUsd,
      currentPrice,
      entryPrice,
      openedAt,
      marketStatusLabel,
      statusDot,
      statusPill,
      canSell,
      traderDisplay,
      pnlCalc,
      pnlValue,
      currentValue,
      displayPct,
      contractsCount,
    }
  })

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Positions</h2>
            <p className="text-xs text-slate-500">{visiblePositions.length} positions shown</p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={includeResolvedPositions}
              onChange={(e) => onToggleIncludeResolved(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
            />
            <span>Include resolved positions</span>
          </label>
        </div>

      <div className="hidden md:block">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200 text-xs tracking-wider">
              <th className="py-2 pr-3 font-medium w-[12%] lg:w-[12%]">Status</th>
              <th className="py-2 pr-3 font-medium w-[44%] lg:w-[28%]">Market/Outcome</th>
              <th className="py-2 pr-3 font-medium w-[14%] lg:w-[10%]">Amount</th>
              <th className="py-2 pr-3 font-medium w-[16%] lg:w-[12%]">Date opened</th>
              <th className="py-2 pr-3 font-medium hidden lg:table-cell lg:w-[13%]">Entry → Now</th>
              <th className="py-2 pr-3 font-medium hidden lg:table-cell lg:w-[12%]">Current value</th>
              <th className="py-2 pr-3 font-medium hidden lg:table-cell lg:w-[10%]">Copied Trader</th>
              <th className="py-2 pr-3 font-medium w-[14%] lg:w-[13%] text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {positionRows.map((row) => (
              <tr key={row.key} className="border-b border-slate-100">
                <td className="py-3 pr-3 align-top text-sm text-slate-700">
                  <span className="inline-flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${row.statusDot}`} />
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${row.statusPill}`}>
                      {row.marketStatusLabel}
                    </span>
                  </span>
                </td>
                <td className="py-3 pr-3 align-top">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-100">
                      {row.marketImage ? (
                        <img src={row.marketImage} alt={row.marketTitle} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
                          {row.marketTitle.charAt(0)}
                        </span>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <p className="truncate text-sm font-semibold text-slate-900">{row.marketTitle}</p>
                      <p className="truncate text-xs text-slate-500">{row.outcomeLabel}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 pr-3 align-top text-sm text-slate-700">
                  {formatCurrency(row.amountUsd)}
                  <div className="text-xs text-slate-500">{formatContracts(row.contractsCount)}</div>
                </td>
                <td className="py-3 pr-3 align-top text-sm text-slate-700 whitespace-nowrap">
                  {formatDateOpened(row.openedAt)}
                </td>
                <td className="py-3 pr-3 align-top text-sm text-slate-700 hidden lg:table-cell">
                  {formatCurrency(row.entryPrice)} → {formatCurrency(row.currentPrice)}
                </td>
                <td className="py-3 pr-3 align-top hidden lg:table-cell">
                  <div className="text-sm font-semibold text-slate-900">
                    {formatCurrency(row.currentValue)}
                  </div>
                  <div className={`text-xs ${getPnlColorClass(row.displayPct)}`}>
                    {formatSignedPercentCompact(row.displayPct)}
                  </div>
                </td>
                <td className="py-3 pr-3 align-top text-sm text-slate-700 hidden lg:table-cell">
                  <span className="block max-w-[140px] truncate" title={row.traderDisplay.full || undefined}>
                    {row.traderDisplay.label}
                  </span>
                </td>
                <td className="py-3 pr-3 align-top text-sm text-right">
                  <button
                    type="button"
                    onClick={() => onSellPosition(row.position)}
                    disabled={!row.canSell}
                    className={`rounded-full px-4 py-2 text-xs font-semibold shadow-sm transition ${
                      row.canSell
                        ? 'bg-rose-500 text-white hover:bg-rose-400'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    Sell
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {positionRows.map((row) => (
          <article key={row.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-slate-100">
                  {row.marketImage ? (
                    <img src={row.marketImage} alt={row.marketTitle} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
                      {row.marketTitle.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{row.marketTitle}</p>
                  <p className="truncate text-xs text-slate-500">{row.outcomeLabel}</p>
                </div>
              </div>
              <div className="shrink-0">
                <span className={`inline-flex items-center gap-2 rounded-full px-2 py-1 text-xs font-semibold ${row.statusPill}`}>
                  <span className={`h-2 w-2 rounded-full ${row.statusDot}`} />
                  {row.marketStatusLabel}
                </span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Amount</p>
                <p className="text-sm font-semibold text-slate-900">{formatCurrency(row.amountUsd)}</p>
                <p className="text-[11px] text-slate-500">{formatContracts(row.contractsCount)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Opened</p>
                <p className="text-sm font-semibold text-slate-900">{formatDateOpened(row.openedAt)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Entry → Now</p>
                <p className="text-sm font-semibold text-slate-900">
                  {formatCurrency(row.entryPrice)} → {formatCurrency(row.currentPrice)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Current value</p>
                <p className="text-sm font-semibold text-slate-900">
                  {formatCurrency(row.currentValue)}
                </p>
                <p className={`text-[11px] ${getPnlColorClass(row.displayPct)}`}>
                  {formatSignedPercentCompact(row.displayPct)}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Copied Trader</p>
                <p className="truncate text-sm font-semibold text-slate-900" title={row.traderDisplay.full || undefined}>
                  {row.traderDisplay.label}
                </p>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => onSellPosition(row.position)}
                disabled={!row.canSell}
                className={`rounded-full px-4 py-2 text-xs font-semibold shadow-sm transition ${
                  row.canSell
                    ? 'bg-rose-500 text-white hover:bg-rose-400'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                Sell
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
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
