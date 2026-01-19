'use client'

import { useCallback, useEffect, useState } from 'react'
import AdminDashboardClient from './AdminDashboardClient'
import type { DashboardData } from './data'

type LoadState = {
  data: DashboardData | null
  error: string | null
  loading: boolean
}

async function fetchContentData(force: boolean) {
  const url = new URL('/api/admin/content-data', window.location.origin)
  if (force) {
    url.searchParams.set('force', '1')
  }

  const res = await fetch(url.toString(), {
    cache: 'no-store'
  })

  if (!res.ok) {
    throw new Error('Failed to load admin content data')
  }

  return (await res.json()) as DashboardData
}

export default function AdminContentDataLoader() {
  const [state, setState] = useState<LoadState>({
    data: null,
    error: null,
    loading: true
  })

  const load = useCallback(async (force: boolean) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const data = await fetchContentData(force)
      setState({ data, error: null, loading: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load admin data'
      setState({ data: null, error: message, loading: false })
    }
  }, [])

  useEffect(() => {
    load(false)
  }, [load])

  if (state.loading && !state.data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-300">
        Loading admin dashboard data...
      </div>
    )
  }

  if (state.error && !state.data) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-slate-300">
        <p>{state.error}</p>
        <button
          onClick={() => load(true)}
          className="rounded-full border border-white/20 px-4 py-2 text-sm text-white hover:border-white/40"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!state.data) {
    return null
  }

  return <AdminDashboardClient data={state.data} onRefresh={() => load(true)} />
}
