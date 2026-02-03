'use client'

import { useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { AdminUserSummary, TradeActivitySummary, UserActivityEvent, UserProfile } from './types'
import AdminDashboardClient from '../content-data/AdminDashboardClient'
import AdminContentDataLoader from '../content-data/AdminContentDataLoader'
import type { DashboardData } from '../content-data/data'
import { ArrowLeft } from 'lucide-react'

type Tab = 'activity' | 'users' | 'trade-activity' | 'content-data' | 'wish-copied'

const TAB_LABELS: Record<Tab, string> = {
  activity: 'User Activity',
  users: 'User Directory',
  'trade-activity': 'Trade Activity',
  'content-data': 'Content Data',
  'wish-copied': 'Wish I Copied'
}

const TYPE_LABELS: Record<UserActivityEvent['type'], string> = {
  account_created: 'New account',
  went_premium: 'Premium upgrade',
  wallet_added: 'Wallet added',
  private_key_imported: 'Private key import'
}

const TYPE_STYLES: Record<UserActivityEvent['type'], string> = {
  account_created: 'text-emerald-400',
  went_premium: 'text-amber-300',
  wallet_added: 'text-sky-300',
  private_key_imported: 'text-rose-300'
}

const formatDateTime = (value: string | null) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

const formatDate = (value: string | null) => {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const formatNumber = (value: number | null) => {
  if (value === null) return '--'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

const formatCurrency = (value: number | null) => {
  if (value === null) return '--'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value)
}

type AdminUsersConsoleProps = {
  users: UserProfile[]
  events: UserActivityEvent[]
  tradeActivity: TradeActivitySummary[]
  contentData?: DashboardData | null
  summary?: AdminUserSummary
}

export default function AdminUsersConsole({ users, events, tradeActivity, contentData, summary: summaryOverride }: AdminUsersConsoleProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeTab = useMemo<Tab>(() => {
    const tabParam = searchParams.get('tab')
    const isValidTab = (['activity', 'users', 'trade-activity', 'content-data', 'wish-copied'] as Tab[]).includes(
      tabParam as Tab
    )
    return isValidTab ? (tabParam as Tab) : 'activity'
  }, [searchParams])

  const updateTab = (tab: Tab) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.set('tab', tab)
    router.push(`${pathname}?${nextParams.toString()}`)
  }

  const computedSummary = useMemo(() => {
    // Fallback computation if no summary provided (shouldn't happen in normal flow)
    const premiumCount = users.filter((u) => u.isPremium).length
    const walletsConnected = users.filter((u) => Boolean(u.wallet)).length
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    
    const signUps24h = users.filter((u) => {
      if (!u.createdAt) return false
      return new Date(u.createdAt) >= twentyFourHoursAgo
    }).length
    
    const premiumUpgrades24h = users.filter((u) => {
      if (!u.premiumSince) return false
      return new Date(u.premiumSince) >= twentyFourHoursAgo
    }).length
    
    return { 
      totalSignUps: users.length, 
      totalCopies: 0,
      manualCopies: 0,
      quickCopies: 0,
      premiumCount, 
      walletsConnected, 
      signUps24h,
      premiumUpgrades24h,
      manualCopies24h: 0,
      quickCopies24h: 0
    }
  }, [users])
  
  // Ensure summary always has all required fields with fallback to 0
  const summary = summaryOverride ? {
    totalSignUps: summaryOverride.totalSignUps ?? 0,
    totalCopies: summaryOverride.totalCopies ?? 0,
    manualCopies: summaryOverride.manualCopies ?? 0,
    quickCopies: summaryOverride.quickCopies ?? 0,
    premiumCount: summaryOverride.premiumCount ?? 0,
    walletsConnected: summaryOverride.walletsConnected ?? 0,
    signUps24h: summaryOverride.signUps24h ?? 0,
    premiumUpgrades24h: summaryOverride.premiumUpgrades24h ?? 0,
    manualCopies24h: summaryOverride.manualCopies24h ?? 0,
    quickCopies24h: summaryOverride.quickCopies24h ?? 0
  } : computedSummary

  return (
    <div className="min-h-screen bg-[#05070E] text-white p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-slate-300 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm font-medium">Back</span>
        </button>
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.3em] text-[#94a3b8]">Admin Console</p>
          <h1 className="text-3xl font-semibold">Users & Change States</h1>
          <p className="text-slate-300">
            Track new accounts, premium upgrades, wallet imports, and private key activity.
          </p>
        </header>

        <div className="space-y-6">
          {/* Row 1: Last 24 Hours */}
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[#94a3b8] mb-3">Last 24 Hours</h2>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase">Sign Ups (24h)</p>
                <p className="text-2xl font-semibold">{summary.signUps24h}</p>
              </div>
              <div className="border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase">Premium Upgrades (24h)</p>
                <p className="text-2xl font-semibold">{summary.premiumUpgrades24h}</p>
              </div>
              <div className="border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase">Manual Copies (24h)</p>
                <p className="text-2xl font-semibold">{summary.manualCopies24h}</p>
              </div>
              <div className="border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase">Quick Copies (24h)</p>
                <p className="text-2xl font-semibold">{summary.quickCopies24h}</p>
              </div>
            </div>
          </div>

          {/* Row 2: Cumulative Totals */}
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[#94a3b8] mb-3">Cumulative Totals</h2>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase">Total Sign Ups</p>
                <p className="text-2xl font-semibold">{summary.totalSignUps}</p>
              </div>
              <div className="border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase">Total Copies</p>
                <p className="text-2xl font-semibold">{summary.totalCopies}</p>
              </div>
              <div className="border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase">Manual Copies</p>
                <p className="text-2xl font-semibold">{summary.manualCopies}</p>
              </div>
              <div className="border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase">Quick Copies</p>
                <p className="text-2xl font-semibold">{summary.quickCopies}</p>
              </div>
            </div>
          </div>

          {/* Row 3: Premium & Wallets */}
          <div>
            <h2 className="text-xs uppercase tracking-[0.3em] text-[#94a3b8] mb-3">Premium & Wallets</h2>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase">Premium Subscribers</p>
                <p className="text-2xl font-semibold">{summary.premiumCount}</p>
              </div>
              <div className="border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 uppercase">Wallets Connected</p>
                <p className="text-2xl font-semibold">{summary.walletsConnected}</p>
              </div>
              <div className="border border-white/10 rounded-xl p-4 opacity-40">
                <p className="text-xs text-slate-400 uppercase">—</p>
                <p className="text-2xl font-semibold">—</p>
              </div>
              <div className="border border-white/10 rounded-xl p-4 opacity-40">
                <p className="text-xs text-slate-400 uppercase">—</p>
                <p className="text-2xl font-semibold">—</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {(['activity', 'users', 'trade-activity', 'content-data', 'wish-copied'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => updateTab(tab)}
              className={`flex-1 rounded-2xl border px-4 py-2 font-medium transition ${
                activeTab === tab
                  ? 'border-[#FDB022] bg-[#FDB022]/20 text-white'
                  : 'border-white/10 text-slate-300 hover:border-white/40'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {activeTab === 'activity' ? (
          <section className="space-y-4">
            {events.length === 0 && (
              <p className="text-slate-400">No recent user activity was detected.</p>
            )}
            {events.map((event) => (
              <div
                key={event.id}
                className="border border-white/10 rounded-2xl bg-white/5 p-4 space-y-1 shadow-[0_0_25px_rgba(255,255,255,0.02)]"
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
                  <span className={TYPE_STYLES[event.type]}>{TYPE_LABELS[event.type]}</span>
                  <span>{formatDateTime(event.timestamp)}</span>
                </div>
                <div className="text-lg font-semibold text-white">
                  {event.email || event.userId || 'Unknown user'}
                </div>
                <p className="text-sm text-slate-200">{event.detail}</p>
                {event.extra && (
                  <p className="text-xs text-slate-400">{event.extra}</p>
                )}
              </div>
            ))}
          </section>
        ) : activeTab === 'users' ? (
          <section className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-4">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.3em] text-slate-400">
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Premium</th>
                  <th className="px-3 py-2">Wallet</th>
                  <th className="px-3 py-2">Admin</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Updated</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-white/5">
                    <td className="px-3 py-3" title={user.email || user.id}>
                      <p className="font-medium text-white">
                        {user.email || user.id}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest" style={{ backgroundColor: user.isPremium ? 'rgba(253,193,34,0.2)' : 'rgba(148,163,184,0.2)', color: user.isPremium ? '#FDB022' : '#94A3B8' }}>
                        {user.isPremium ? 'Premium' : 'Free'}
                      </span>
                      {user.premiumSince && (
                        <div className="text-[11px] text-slate-400 mt-1">
                          {formatDate(user.premiumSince)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-sm text-slate-200">{user.wallet || '—'}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest ${
                          user.isAdmin ? 'bg-emerald-500/10 text-emerald-300' : 'bg-white/5 text-slate-300'
                        }`}
                      >
                        {user.isAdmin ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {formatDate(user.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : activeTab === 'trade-activity' ? (
          <section className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 p-4">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.3em] text-slate-400">
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">User type</th>
                  <th className="px-3 py-2">Sign-up date</th>
                  <th className="px-3 py-2">Premium date</th>
                  <th className="px-3 py-2">Trade volume</th>
                  <th className="px-3 py-2">Trade count</th>
                  <th className="px-3 py-2">PnL</th>
                  <th className="px-3 py-2">Follows</th>
                  <th className="px-3 py-2">Days active</th>
                </tr>
              </thead>
              <tbody>
                {tradeActivity.map((row) => (
                  <tr key={row.id} className="border-t border-white/5">
                    <td className="px-3 py-3" title={row.email || row.id}>
                      <p className="font-medium text-white">
                        {row.email || row.id}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest ${
                          row.userType === 'Admin'
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : row.userType === 'Premium'
                              ? 'bg-amber-500/10 text-amber-300'
                              : 'bg-white/5 text-slate-300'
                        }`}
                      >
                        {row.userType}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {formatDate(row.signUpDate)}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {formatDate(row.premiumDate)}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {formatCurrency(row.tradeVolume)}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {formatNumber(row.tradeCount)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={row.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                        {formatCurrency(row.pnl)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {formatNumber(row.followsCount)}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {formatNumber(row.activeDays)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : activeTab === 'content-data' ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            {contentData ? (
              <AdminDashboardClient data={contentData} />
            ) : (
              <AdminContentDataLoader />
            )}
          </section>
        ) : (
          <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <iframe
              title="Wish I Copied Feed"
              src="/admin/i-wish-id-copied-that?embed=1"
              className="w-full h-[80vh] bg-[#0f172a]"
            />
          </section>
        )}
      </div>
    </div>
  )
}
