'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Navigation } from '@/components/polycopy/navigation'
import { AutoCopyConfig, AutoCopyLog, TraderSummary } from './types'
import { ArrowLeft } from 'lucide-react'

type Props = {
  traders: TraderSummary[]
  configs: AutoCopyConfig[]
  adminUser: User
}

type ConfigFormState = {
  traderUsername: string
  traderProfileImageUrl: string
  minTradeUsd: string
  maxTradeUsd: string
  minPrice: string
  maxPrice: string
  allocationUsd: string
  maxTradesPerDay: string
  riskTolerancePct: string
  timeWindowStart: string
  timeWindowEnd: string
  notes: string
}

type SimulationFormState = {
  marketTitle: string
  outcome: string
  side: 'buy' | 'sell'
  size: string
  price: string
  notes: string
}

const DEFAULT_FORM_STATE: ConfigFormState = {
  traderUsername: '',
  traderProfileImageUrl: '',
  minTradeUsd: '10',
  maxTradeUsd: '500',
  minPrice: '',
  maxPrice: '',
  allocationUsd: '500',
  maxTradesPerDay: '10',
  riskTolerancePct: '5',
  timeWindowStart: '',
  timeWindowEnd: '',
  notes: ''
}

const DEFAULT_SIMULATION_STATE: SimulationFormState = {
  marketTitle: 'Auto copy test',
  outcome: 'Outcome',
  side: 'buy',
  size: '1',
  price: '2',
  notes: ''
}

const formatCurrency = (value: number | null | undefined) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '$0.00'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value)
}

const formatPercent = (value: number | null | undefined) => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '--'
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

const toInputDatetime = (value: string | null | undefined) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

export default function AutoCopyAdminConsole({ traders, configs, adminUser }: Props) {
  const [configList, setConfigList] = useState<AutoCopyConfig[]>(configs)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedTrader, setSelectedTrader] = useState<TraderSummary | null>(null)
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null)
  const [formState, setFormState] = useState<ConfigFormState>(DEFAULT_FORM_STATE)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [logs, setLogs] = useState<AutoCopyLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [selectedLogConfigId, setSelectedLogConfigId] = useState<string>('all')
  const [simulateForm, setSimulateForm] = useState<SimulationFormState>(DEFAULT_SIMULATION_STATE)
  const [simulateConfigId, setSimulateConfigId] = useState<string | null>(configList[0]?.id ?? null)
  const [runningSimulationFor, setRunningSimulationFor] = useState<string | null>(null)
  const [pendingConfigId, setPendingConfigId] = useState<string | null>(null)

  useEffect(() => {
    if (!simulateConfigId && configList.length > 0) {
      setSimulateConfigId(configList[0].id)
    }
  }, [configList, simulateConfigId])

  const fetchLogs = async () => {
    setLogsLoading(true)
    setLogError(null)
    try {
      const response = await fetch('/api/admin/auto-copy/logs', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to load logs')
      }
      setLogs(data.logs ?? [])
    } catch (err: any) {
      console.error('[auto-copy console] failed to load logs', err)
      setLogError(err?.message ?? 'Failed to load logs')
    } finally {
      setLogsLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  const openConfigModal = (trader: TraderSummary) => {
    const normalizedWallet = trader.wallet.toLowerCase()
    const existing = configList.find((item) => item.trader_wallet?.toLowerCase() === normalizedWallet)
    setSelectedTrader(trader)
    setSelectedConfigId(existing?.id ?? null)
    setFormState({
      traderUsername: existing?.trader_username ?? trader.username ?? '',
      traderProfileImageUrl: existing?.trader_profile_image_url ?? trader.profileImage ?? '',
      minTradeUsd: existing?.min_trade_usd?.toString() ?? DEFAULT_FORM_STATE.minTradeUsd,
      maxTradeUsd: existing?.max_trade_usd?.toString() ?? DEFAULT_FORM_STATE.maxTradeUsd,
      minPrice: existing?.min_price?.toString() ?? DEFAULT_FORM_STATE.minPrice,
      maxPrice: existing?.max_price?.toString() ?? DEFAULT_FORM_STATE.maxPrice,
      allocationUsd: existing?.allocation_usd?.toString() ?? DEFAULT_FORM_STATE.allocationUsd,
      maxTradesPerDay: existing?.max_trades_per_day?.toString() ?? DEFAULT_FORM_STATE.maxTradesPerDay,
      riskTolerancePct: existing?.risk_tolerance_pct?.toString() ?? DEFAULT_FORM_STATE.riskTolerancePct,
      timeWindowStart: toInputDatetime(existing?.time_window_start),
      timeWindowEnd: toInputDatetime(existing?.time_window_end),
      notes: existing?.notes ?? ''
    })
    setConfigError(null)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setSelectedTrader(null)
    setSelectedConfigId(null)
  }

  const upsertConfigInState = (config: AutoCopyConfig) => {
    setConfigList((prev) => {
      const next = prev.filter((item) => item.id !== config.id)
      return [config, ...next]
    })
  }

  const handleSaveConfig = async () => {
    if (!selectedTrader) {
      setConfigError('Choose a trader before saving')
      return
    }
    setConfigError(null)
    setSavingConfig(true)

    const payload: Record<string, unknown> = {
      traderWallet: selectedTrader.wallet,
      traderUsername: formState.traderUsername.trim() || null,
      traderProfileImageUrl: formState.traderProfileImageUrl.trim() || null,
      minTradeUsd: Number(formState.minTradeUsd) || 0,
      maxTradeUsd: Number(formState.maxTradeUsd) || 0,
      minPrice: formState.minPrice ? Number(formState.minPrice) : null,
      maxPrice: formState.maxPrice ? Number(formState.maxPrice) : null,
      allocationUsd: Number(formState.allocationUsd) || 0,
      maxTradesPerDay: Number(formState.maxTradesPerDay) || 0,
      riskTolerancePct: Number(formState.riskTolerancePct) || 0,
      timeWindowStart: formState.timeWindowStart
        ? new Date(formState.timeWindowStart).toISOString()
        : null,
      timeWindowEnd: formState.timeWindowEnd
        ? new Date(formState.timeWindowEnd).toISOString()
        : null,
      notes: formState.notes.trim() || null
    }

    const method = selectedConfigId ? 'PATCH' : 'POST'
    if (selectedConfigId) {
      payload.configId = selectedConfigId
    }

    try {
      const response = await fetch('/api/admin/auto-copy/configs', {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to save configuration')
      }
      if (data?.config) {
        upsertConfigInState(data.config)
        setSelectedConfigId(data.config.id)
      }
      closeModal()
    } catch (err: any) {
      console.error('[auto copy] config save failed', err)
      setConfigError(err?.message ?? 'Unable to save configuration')
    } finally {
      setSavingConfig(false)
    }
  }

  const handlePauseToggle = async (config: AutoCopyConfig) => {
    setPendingConfigId(config.id)
    try {
      const response = await fetch('/api/admin/auto-copy/configs', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          configId: config.id,
          paused: !config.paused
        })
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to update configuration')
      }
      if (data?.config) {
        upsertConfigInState(data.config)
      } else {
        setConfigList((prev) =>
          prev.map((item) => (item.id === config.id ? { ...item, paused: !item.paused } : item))
        )
      }
    } catch (err) {
      console.error('[auto copy] pause toggle failed', err)
    } finally {
      setPendingConfigId(null)
    }
  }

  const handleRunSimulation = async () => {
    if (!simulateConfigId) {
      setLogError('Select a config before running a simulation')
      return
    }
    setRunningSimulationFor(simulateConfigId)
    setLogError(null)
    try {
      const response = await fetch('/api/admin/auto-copy/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          configId: simulateConfigId,
          marketTitle: simulateForm.marketTitle,
          outcome: simulateForm.outcome,
          side: simulateForm.side,
          size: Number(simulateForm.size),
          price: Number(simulateForm.price),
          notes: simulateForm.notes.trim() || undefined
        })
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'Simulation failed')
      }
      await fetchLogs()
      setSimulateForm(DEFAULT_SIMULATION_STATE)
    } catch (err: any) {
      console.error('[auto copy] simulation failed', err)
      setLogError(err?.message ?? 'Simulation request failed')
    } finally {
      setRunningSimulationFor(null)
    }
  }

  const filteredLogs = useMemo(() => {
    if (selectedLogConfigId === 'all') return logs
    return logs.filter((log) => log.config_id === selectedLogConfigId)
  }, [logs, selectedLogConfigId])

  const displayedLogs = filteredLogs.slice(0, 12)

  const router = useRouter()

  return (
    <>
      <Navigation
        user={adminUser ? { id: adminUser.id, email: adminUser.email ?? '' } : null}
        isPremium={false}
        walletAddress={null}
        profileImageUrl={null}
      />
      <main className="bg-gradient-to-b from-white to-slate-50 pb-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 space-y-10">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm font-medium">Back</span>
          </button>
          <header className="space-y-2">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Auto Copy</p>
            <h1 className="text-3xl font-semibold text-slate-900">Auto Copy Simulator</h1>
            <p className="text-slate-600 max-w-3xl">
              Preview and tweak automated copy strategies for the traders you are following. Set
              limits, time windows, and allocations before you push the logic into production.
            </p>
          </header>

          <section className="rounded-3xl border border-slate-200 bg-white shadow">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Traders you copy</p>
                <h2 className="text-2xl font-semibold text-slate-900">Auto Copy candidates</h2>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                {traders.length} traders
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.3em] text-slate-500">
                  <tr>
                    <th className="px-6 py-3 text-left">Trader</th>
                    <th className="px-6 py-3 text-center">Copies</th>
                    <th className="px-6 py-3 text-center">ROI</th>
                    <th className="px-6 py-3 text-center">Last copy</th>
                    <th className="px-6 py-3 text-center">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {traders.map((trader) => {
                    const roiLabel =
                      trader.avgRoi === null ? '—' : formatPercent(trader.avgRoi)
                    const roiClass =
                      trader.avgRoi === null
                        ? 'text-slate-500'
                        : trader.avgRoi >= 0
                          ? 'text-emerald-600'
                          : 'text-rose-600'

                    return (
                      <tr key={trader.wallet} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                              Wallet
                            </p>
                            <p className="font-mono text-sm text-slate-600">{trader.wallet}</p>
                            <p className="text-lg font-semibold text-slate-900">
                              {trader.username || `${trader.wallet.slice(0, 6)}…${trader.wallet.slice(-4)}`}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <p className="text-sm font-semibold text-slate-900">{trader.copyCount}</p>
                          <p className="text-xs text-slate-400">copies</p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <p className={`text-sm font-semibold ${roiClass}`}>{roiLabel}</p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <p className="text-sm text-slate-600">{formatDateTime(trader.lastActivity)}</p>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge
                            variant="secondary"
                            className={`px-3 py-1 text-[11px] tracking-[0.3em] ${
                              trader.followed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {trader.followed ? 'Followed' : 'New'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button
                            size="sm"
                            className="bg-amber-500 text-slate-900 hover:bg-amber-400"
                            onClick={() => openConfigModal(trader)}
                          >
                            Configure Auto Copy
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                  {traders.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-sm text-slate-500">
                        No trading history yet. Follow a trader to unlock auto copy scenarios.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white shadow">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Configurations</p>
                  <h2 className="text-xl font-semibold text-slate-900">Auto Copy configs</h2>
                </div>
                <span className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  {configList.length} live
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-[0.3em] text-slate-500">
                    <tr>
                      <th className="px-6 py-3 text-left">Trader</th>
                      <th className="px-6 py-3 text-center">Trade $</th>
                      <th className="px-6 py-3 text-center">Allocation</th>
                      <th className="px-6 py-3 text-center">Trades/day</th>
                      <th className="px-6 py-3 text-center">Risk</th>
                      <th className="px-6 py-3 text-center">Window</th>
                      <th className="px-6 py-3 text-center">Status</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {configList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-6 text-center text-sm text-slate-500">
                          No configs yet. Create one from the table above.
                        </td>
                      </tr>
                    ) : (
                      configList.map((config) => (
                        <tr key={config.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4">
                            <p className="font-semibold text-slate-900 text-sm">
                              {config.trader_username || 'Anonymous'}
                            </p>
                            <p className="text-xs tracking-[0.3em] text-slate-400 uppercase">
                              {config.trader_wallet}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="space-y-1">
                              <p className="text-sm font-semibold text-slate-900">
                                {formatCurrency(config.min_trade_usd ?? 0)} - {formatCurrency(config.max_trade_usd ?? 0)}
                              </p>
                              {(config.min_price !== null && config.min_price !== undefined) ||
                              (config.max_price !== null && config.max_price !== undefined) ? (
                                <p className="text-xs text-slate-500">
                                  Price {config.min_price ?? '0'} - {config.max_price ?? '1'}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <p className="text-sm font-semibold text-slate-900">
                              {formatCurrency(config.allocation_usd ?? 0)}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-center text-slate-600">
                            {config.max_trades_per_day ?? '∞'}
                          </td>
                          <td className="px-6 py-4 text-center text-slate-600">
                            {config.risk_tolerance_pct ?? 0}%
                          </td>
                          <td className="px-6 py-4 text-center">
                            <p className="text-sm text-slate-900">
                              {config.time_window_start
                                ? formatDateTime(config.time_window_start)
                                : 'Anytime'}
                            </p>
                            <p className="text-xs text-slate-400">
                              →{' '}
                              {config.time_window_end
                                ? formatDateTime(config.time_window_end)
                                : 'Open-ended'}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Badge
                              variant="secondary"
                              className={`px-3 py-1 text-[11px] tracking-[0.3em] ${
                                config.paused ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {config.paused ? 'Paused' : 'Live'}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                size="sm"
                                className="bg-white text-slate-900 border border-slate-200 hover:bg-slate-50"
                                onClick={() => {
                                  const trader = traders.find(
                                    (item) => item.wallet.toLowerCase() === config.trader_wallet.toLowerCase()
                                  )
                                  if (trader) {
                                    openConfigModal(trader)
                                  } else {
                                    openConfigModal({
                                      wallet: config.trader_wallet,
                                      username: config.trader_username,
                                      profileImage: config.trader_profile_image_url,
                                      copyCount: 0,
                                      avgRoi: null,
                                      totalInvested: 0,
                                      lastActivity: null,
                                      followed: true
                                    })
                                  }
                                }}
                              >
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={pendingConfigId === config.id}
                                onClick={() => handlePauseToggle(config)}
                              >
                                {config.paused ? 'Resume' : 'Pause'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={runningSimulationFor === config.id}
                                onClick={() => {
                                  setSimulateConfigId(config.id)
                                  handleRunSimulation()
                                }}
                              >
                                {runningSimulationFor === config.id ? 'Running…' : 'Run auto copy'}
                              </Button>
                            </div>
                            <p className="mt-2 text-[11px] text-slate-400">
                              Last run: {formatDateTime(config.last_simulation_at)}
                            </p>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white/90 shadow px-5 py-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Logs</p>
                    <h3 className="text-lg font-semibold text-slate-900">Auto copy log</h3>
                  </div>
                  <Button size="sm" variant="ghost" onClick={fetchLogs} disabled={logsLoading}>
                    Refresh
                  </Button>
                </div>
                <div className="mt-4 space-y-3">
                  <div>
                    <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                      Filter
                    </Label>
                    <select
                      className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700"
                      value={selectedLogConfigId}
                      onChange={(event) => setSelectedLogConfigId(event.target.value)}
                    >
                      <option value="all">All configs</option>
                      {configList.map((config) => (
                        <option key={config.id} value={config.id}>
                          {config.trader_wallet} ({config.paused ? 'Paused' : 'Live'})
                        </option>
                      ))}
                    </select>
                  </div>
                  {logError && <p className="text-xs text-rose-500">{logError}</p>}
                  <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                    {logsLoading ? (
                      <p className="text-sm text-slate-500">Loading logs…</p>
                    ) : displayedLogs.length === 0 ? (
                      <p className="text-sm text-slate-500">No logs yet.</p>
                    ) : (
                      displayedLogs.map((log) => (
                        <div
                          key={log.id}
                          className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-semibold text-slate-900">
                              {log.market_title || 'Auto copy trade'}
                            </p>
                            <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.3em]">
                              {log.status ?? 'executed'}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(log.executed_at)} · Amount {formatCurrency(log.amount_usd ?? 0)}
                          </p>
                          <p className="text-xs text-slate-500">
                            Trader: {log.trader_wallet} · Outcome: {log.outcome || 'Outcome'} · Side: {log.side || 'buy'}
                          </p>
                          {log.notes && <p className="mt-2 text-xs text-slate-500">{log.notes}</p>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/90 shadow px-5 py-5 space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Simulation</p>
                  <h3 className="text-lg font-semibold text-slate-900">Trigger auto copy</h3>
                </div>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                        Config
                      </Label>
                      <select
                        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700"
                        value={simulateConfigId ?? ''}
                        onChange={(event) => setSimulateConfigId(event.target.value || null)}
                      >
                        <option value="">Select configuration</option>
                        {configList.map((config) => (
                          <option key={config.id} value={config.id}>
                            {config.trader_wallet}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                        Side
                      </Label>
                      <select
                        className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700"
                        value={simulateForm.side}
                        onChange={(event) =>
                          setSimulateForm((prev) => ({ ...prev, side: event.target.value as 'buy' | 'sell' }))
                        }
                      >
                        <option value="buy">Buy</option>
                        <option value="sell">Sell</option>
                      </select>
                    </div>
                  </div>
                  <Input
                    placeholder="Market title"
                    value={simulateForm.marketTitle}
                    onChange={(event) =>
                      setSimulateForm((prev) => ({ ...prev, marketTitle: event.target.value }))
                    }
                  />
                  <Input
                    placeholder="Outcome (e.g. YES)"
                    value={simulateForm.outcome}
                    onChange={(event) =>
                      setSimulateForm((prev) => ({ ...prev, outcome: event.target.value }))
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      type="number"
                      placeholder="Size"
                      value={simulateForm.size}
                      onChange={(event) =>
                        setSimulateForm((prev) => ({ ...prev, size: event.target.value }))
                      }
                    />
                    <Input
                      type="number"
                      placeholder="Price"
                      value={simulateForm.price}
                      onChange={(event) =>
                        setSimulateForm((prev) => ({ ...prev, price: event.target.value }))
                      }
                    />
                  </div>
                  <Textarea
                    placeholder="Notes (optional)"
                    value={simulateForm.notes}
                    onChange={(event) =>
                      setSimulateForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                    className="min-h-[88px]"
                  />
                  <Button
                    size="sm"
                    className="w-full bg-slate-900 text-white hover:bg-slate-800"
                    onClick={handleRunSimulation}
                    disabled={runningSimulationFor !== null || !simulateConfigId}
                  >
                    {runningSimulationFor ? 'Simulating…' : 'Trigger auto copy log'}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-950/80 px-4 py-4">
                <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-400">Log file</Label>
                <pre className="mt-2 max-h-[220px] overflow-auto text-xs text-slate-200">
                  {JSON.stringify(filteredLogs.slice(0, 8), null, 2)}
                </pre>
              </div>
            </div>
          </section>
        </div>
      </main>

      <Dialog open={isModalOpen} onOpenChange={(open) => setIsModalOpen(open)}>
        <DialogContent className="bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>Configure Auto Copy</DialogTitle>
            <DialogDescription>
              {selectedTrader
                ? `Target trader wallet ${selectedTrader.wallet}`
                : 'Pick a trader to simulate auto copy trades'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Trader display name (optional)
              </Label>
              <Input
                value={formState.traderUsername}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, traderUsername: event.target.value }))
                }
              />
            </div>

            <div>
              <Label className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Profile image URL
              </Label>
              <Input
                value={formState.traderProfileImageUrl}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, traderProfileImageUrl: event.target.value }))
                }
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                  Min trade ($)
                </Label>
                <Input
                  type="number"
                  value={formState.minTradeUsd}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, minTradeUsd: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                  Max trade ($)
                </Label>
                <Input
                  type="number"
                  value={formState.maxTradeUsd}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, maxTradeUsd: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                  Allocation USD
                </Label>
                <Input
                  type="number"
                  value={formState.allocationUsd}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, allocationUsd: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                  Min price (optional)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={formState.minPrice}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, minPrice: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                  Max price (optional)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={formState.maxPrice}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, maxPrice: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                  Max trades/day
                </Label>
                <Input
                  type="number"
                  value={formState.maxTradesPerDay}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, maxTradesPerDay: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                  Risk tolerance %
                </Label>
                <Input
                  type="number"
                  value={formState.riskTolerancePct}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, riskTolerancePct: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                  Time window start
                </Label>
                <Input
                  type="datetime-local"
                  value={formState.timeWindowStart}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, timeWindowStart: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                  Time window end
                </Label>
                <Input
                  type="datetime-local"
                  value={formState.timeWindowEnd}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, timeWindowEnd: event.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
                Notes
              </Label>
              <Textarea
                value={formState.notes}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, notes: event.target.value }))
                }
                className="min-h-[80px]"
              />
            </div>

            {configError && <p className="text-xs text-rose-500">{configError}</p>}
          </div>

          <DialogFooter className="mt-2">
            <Button
              variant="secondary"
              onClick={closeModal}
              className="bg-slate-100 text-slate-900 hover:bg-slate-200"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="bg-amber-500 text-slate-900 hover:bg-amber-400"
            >
              {savingConfig ? 'Saving…' : 'Save configuration'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
