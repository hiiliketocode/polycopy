'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '../components/Header'
import OrdersTable from '@/components/orders/OrdersTable'
import { supabase } from '@/lib/supabase'
import type { OrderRow, OrderStatus } from '@/lib/orders/types'

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

  const fetchOrders = useCallback(async () => {
    setOrdersLoading(true)
    setOrdersError(null)
    try {
      const response = await fetch('/api/orders', { cache: 'no-store' })
      const data = await response.json()

      if (response.status === 401) {
        router.push('/login')
        return
      }

      if (!response.ok) {
        setOrdersError(data.error || 'Failed to load orders')
        return
      }

      setOrders(data.orders || [])
    } catch (err) {
      console.error('Orders load error:', err)
      setOrdersError('Failed to load orders')
    } finally {
      setOrdersLoading(false)
    }
  }, [router])

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
      await fetchCashBalance()
      setRefreshing(false)
    }
  }, [fetchOrders, router])

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

  useEffect(() => {
    if (loadingAuth || hasLoaded) return
    setHasLoaded(true)
    refreshOrders()
  }, [loadingAuth, hasLoaded, refreshOrders])

  useEffect(() => {
    if (loadingAuth) return
    fetchCashBalance()
  }, [loadingAuth, fetchCashBalance])

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

        <OrdersTable orders={orders} loading={ordersLoading} statusSummary={statusSummary} />
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
