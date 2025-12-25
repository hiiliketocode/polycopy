'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '../components/Header'
import OrdersTable from '@/components/orders/OrdersTable'
import { supabase } from '@/lib/supabase'
import type { OrderRow, OrderStatus } from '@/lib/orders/types'

type RefreshSummary = {
  insertedCount: number
  updatedCount: number
  total: number
}

export default function OrdersPage() {
  const router = useRouter()
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null)
  const [refreshSummary, setRefreshSummary] = useState<RefreshSummary | null>(null)
  const [hasLoaded, setHasLoaded] = useState(false)

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
      } else {
        setLastRefreshedAt(data.refreshedAt || new Date().toISOString())
        setRefreshSummary({
          insertedCount: Number(data.insertedCount || 0),
          updatedCount: Number(data.updatedCount || 0),
          total: Number(data.total || 0),
        })
      }
    } catch (err) {
      console.error('Orders refresh error:', err)
      setRefreshError('Failed to refresh orders')
    } finally {
      await fetchOrders()
      setRefreshing(false)
    }
  }, [fetchOrders, router])

  useEffect(() => {
    if (loadingAuth || hasLoaded) return
    setHasLoaded(true)
    refreshOrders()
  }, [loadingAuth, hasLoaded, refreshOrders])

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

  const insertedText = refreshSummary ? refreshSummary.insertedCount : '--'
  const updatedText = refreshSummary ? refreshSummary.updatedCount : '--'

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Polycogy Orders</h1>
            <p className="text-sm text-slate-500">
              Only orders placed through Polycogy are shown here.
            </p>
          </div>
          <div>
            <button
              onClick={refreshOrders}
              disabled={refreshing}
              className="rounded-lg bg-[#0F0F0F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm md:grid-cols-3">
          <div>
            <p className="text-xs text-slate-400">Last refreshed</p>
            <p className="text-base text-slate-900">
              {lastRefreshedAt ? formatDate(lastRefreshedAt) : '--'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">n new</p>
            <p className="text-base text-slate-900">{insertedText}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">n updated</p>
            <p className="text-base text-slate-900">{updatedText}</p>
          </div>
        </div>

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

        <OrdersTable orders={orders} loading={ordersLoading} statusSummary={statusSummary} />
      </main>
    </div>
  )
}

function formatDate(value: string | null | undefined) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
