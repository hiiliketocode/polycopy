'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserActivityEvent, UserProfile } from './types'
import AdminDashboardClient from '../content-data/AdminDashboardClient'
import type { DashboardData } from '../content-data/data'
import { ArrowLeft } from 'lucide-react'

type Tab = 'activity' | 'users' | 'content-data' | 'wish-copied'

const TAB_LABELS: Record<Tab, string> = {
  activity: 'User Activity',
  users: 'User Directory',
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

type AdminUsersConsoleProps = {
  users: UserProfile[]
  events: UserActivityEvent[]
  contentData: DashboardData | null
}

export default function AdminUsersConsole({ users, events, contentData }: AdminUsersConsoleProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('activity')

  const summary = useMemo(() => {
    const premiumCount = users.filter((u) => u.isPremium).length
    const adminCount = users.filter((u) => u.isAdmin).length
    const walletCount = users.filter((u) => Boolean(u.wallet)).length
    return { premiumCount, adminCount, walletCount }
  }, [users])

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

        <div className="grid gap-4 md:grid-cols-4">
          <div className="border border-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-400 uppercase">Total users</p>
            <p className="text-2xl font-semibold">{users.length}</p>
          </div>
          <div className="border border-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-400 uppercase">Premium</p>
            <p className="text-2xl font-semibold">{summary.premiumCount}</p>
          </div>
          <div className="border border-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-400 uppercase">Wallets linked</p>
            <p className="text-2xl font-semibold">{summary.walletCount}</p>
          </div>
          <div className="border border-white/10 rounded-xl p-4">
            <p className="text-xs text-slate-400 uppercase">Admins</p>
            <p className="text-2xl font-semibold">{summary.adminCount}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {(['activity', 'users', 'content-data', 'wish-copied'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
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
        ) : activeTab === 'content-data' ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            {contentData ? (
              <AdminDashboardClient data={contentData} />
            ) : (
              <div className="p-8 text-slate-300">
                Content data is unavailable right now.
              </div>
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
