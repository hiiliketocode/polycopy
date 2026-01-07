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
  const [cancelingOrderId, setCancelingOrderId] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'positions' | 'openOrders' | 'history'>('positions')
  const [showClosedPositions, setShowClosedPositions] = useState(false)
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
      orderType: 'IOC' | 'GTC'
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
        setCloseTarget(null)
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
    if (loadingAuth || hasLoaded) return
    setHasLoaded(true)
    refreshOrders()
  }, [loadingAuth, hasLoaded, refreshOrders])

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

  const orderByTokenId = useMemo(() => {
    const map = new Map<string, OrderRow>()
    orders.forEach((order) => {
      const tokenId = extractTokenIdFromOrder(order)
      if (tokenId) {
        map.set(tokenId.toLowerCase(), order)
      }
    })
    return map
  }, [orders])

  const resolveOrderForPosition = useCallback(
    (position: PositionSummary): OrderRow | null => {
      const key = position.tokenId?.toLowerCase?.()
      if (!key) return null
      return orderByTokenId.get(key) ?? null
    },
    [orderByTokenId]
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
            showClosedPositions={showClosedPositions}
            onToggleShowClosed={setShowClosedPositions}
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
            }}
            onSubmit={handleConfirmClose}
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

function formatPercentCompact(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  const needsDecimals = Math.abs(value % 1) > 1e-6
  const digits = needsDecimals ? 2 : 0
  return `${value.toFixed(digits)}%`
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
    if (normalized === 'GTC' || normalized === 'FOK' || normalized === 'GTD' || normalized === 'FAK' || normalized === 'IOC') {
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

function getCopiedTraderLabel(order: OrderRow): string {
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
  for (const candidate of candidates) {
    const text = extractString(candidate)
    if (text) return text
  }
  const walletLabel =
    abbreviateWallet(order?.copiedTraderWallet) ??
    abbreviateWallet(order?.traderWallet) ??
    null
  return walletLabel ?? '—'
}

type PositionsListProps = {
  positions: PositionSummary[]
  loading: boolean
  resolveOrderForPosition: (position: PositionSummary) => OrderRow | null
  onSellPosition: (position: PositionSummary) => void
  showClosedPositions: boolean
  onToggleShowClosed: (value: boolean) => void
}

function PositionsList({
  positions,
  loading,
  resolveOrderForPosition,
  onSellPosition,
  showClosedPositions,
  onToggleShowClosed,
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
    return showClosedPositions ? true : !isClosed
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
            checked={showClosedPositions}
            onChange={(e) => onToggleShowClosed(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
          />
          <span>Show closed/lost/redeemed</span>
        </label>
      </div>
    )
  }

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
            checked={showClosedPositions}
            onChange={(e) => onToggleShowClosed(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
          />
          <span>Show closed / lost / redeemed</span>
        </label>
      </div>

          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-200 text-xs tracking-wider">
                  <th className="py-2 pr-3 font-medium w-[120px]">Status</th>
                  <th className="py-2 pr-3 font-medium w-[240px]">Market</th>
                  <th className="py-2 pr-3 font-medium w-[130px]">Outcome</th>
                  <th className="py-2 pr-3 font-medium w-[120px]">Amount</th>
                  <th className="py-2 pr-3 font-medium w-[120px]">Entry → Now</th>
                  <th className="py-2 pr-3 font-medium w-[110px]">P/L</th>
                  <th className="py-2 pr-3 font-medium w-[140px]">Copied Trader</th>
                  <th className="py-2 pr-3 font-medium w-[90px] text-right">Action</th>
                </tr>
              </thead>
          <tbody>
            {visiblePositions.map((position) => {
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
              const sideLabel = position.side === 'SELL' ? 'Sell' : 'Buy'
              const outcomeLabel = extractString(position.outcome) ?? extractString(order?.outcome) ?? '—'
              const outcomeDisplay = outcomeLabel !== '—' ? `${sideLabel} ${outcomeLabel}` : sideLabel
              const pnlLabel =
                order?.pnlUsd !== null && order?.pnlUsd !== undefined
                  ? formatCurrency(order.pnlUsd)
                  : '—'
              const amountUsd =
                Number.isFinite(position.size) && Number.isFinite(position.avgEntryPrice ?? NaN)
                  ? position.size * (position.avgEntryPrice ?? 0)
                  : null
              const tokenIdLower = position.tokenId?.toLowerCase?.()
              const metaPrice =
                tokenIdLower && meta?.prices?.has(tokenIdLower) ? meta.prices.get(tokenIdLower) ?? null : null
              const currentPrice = order?.currentPrice ?? metaPrice ?? null
              const entryPrice = position.avgEntryPrice ?? order?.priceOrAvgPrice ?? null
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
                  ? 'Closed'
                  : inferredMarketOpen === false
                    ? 'Ended'
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
              const traderHandle = order ? getCopiedTraderLabel(order) : null
              const pnlCalc = computePositionPnl(position, entryPrice, currentPrice)
              const contractsCount = Number.isFinite(position.size) ? position.size : 0
              return (
                <tr key={`${position.tokenId}-${position.size}`} className="border-b border-slate-100">
                  <td className="py-3 pr-3 align-top text-sm text-slate-700">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${statusDot}`} />
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusPill}`}>{marketStatusLabel}</span>
                    </span>
                  </td>
                  <td className="py-3 pr-3 align-top">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-100">
                        {marketImage ? (
                          <img src={marketImage} alt={marketTitle} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
                            {marketTitle.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="flex min-w-0 flex-col">
                        <p className="truncate text-sm font-semibold text-slate-900">{marketTitle}</p>
                        <p className="truncate text-xs text-slate-500">{outcomeLabel}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-3 align-top text-sm font-semibold text-slate-900">
                    {outcomeDisplay}
                  </td>
                  <td className="py-3 pr-3 align-top text-sm text-slate-700">
                    {formatCurrency(amountUsd)}
                    <div className="text-xs text-slate-500">{formatContracts(contractsCount)}</div>
                  </td>
                  <td className="py-3 pr-3 align-top text-sm text-slate-700">
                    {formatCurrency(entryPrice)} → {formatCurrency(currentPrice)}
                  </td>
                  <td className="py-3 pr-3 align-top">
                    <span className={`text-sm font-semibold ${getPnlColorClass(pnlCalc?.pnl ?? order?.pnlUsd)}`}>
                      {pnlCalc
                        ? `${formatCurrency(pnlCalc.pnl)} (${formatPercentCompact(pnlCalc.pct)})`
                        : pnlLabel}
                    </span>
                  </td>
                  <td className="py-3 pr-3 align-top text-sm text-slate-700">{traderHandle}</td>
                  <td className="py-3 pr-3 align-top text-sm text-right">
                    <button
                      type="button"
                      onClick={() => onSellPosition(position)}
                      disabled={!canSell}
                      className={`rounded-full px-4 py-2 text-xs font-semibold shadow-sm transition ${
                        canSell
                          ? 'bg-rose-500 text-white hover:bg-rose-400'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      Sell
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
