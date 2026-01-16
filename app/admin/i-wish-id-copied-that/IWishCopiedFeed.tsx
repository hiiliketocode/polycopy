"use client"

import { useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { Navigation } from '@/components/polycopy/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink, RefreshCw } from 'lucide-react'

type RuleSet = {
  lookbackHours: number
  lateWindowMinutes: number
  highRoiThreshold: number
  hugeRoiThreshold: number
  contrarianPriceMax: number
  bigTicketUsd: number
}

type TweetCandidate = {
  id: string
  wallet: string
  marketTitle: string
  marketSlug: string | null
  conditionId: string | null
  outcome: string
  price: number
  shares: number
  investedUsd: number
  timestamp: string
  currentPrice: number | null
  roiPct: number | null
  lateWindowMinutes: number | null
  reason: string
  reasonTags: string[]
  category: string | null
  marketEndDate: string | null
  marketClosed: boolean | null
  marketVolume: number | null
  marketIcon: string | null
  twitterCardImage: string | null
  score: number
}

type Props = {
  adminUser: User
  candidates: TweetCandidate[]
  rules: RuleSet
}

const formatCurrency = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value)
}

const formatPercent = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '--'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

const formatPrice = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '--'
  return `$${value.toFixed(2).replace(/\.00$/, '')}`
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

const formatWallet = (value: string) => {
  if (!value) return '--'
  const trimmed = value.trim()
  if (trimmed.length <= 12) return trimmed
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`
}

const formatMarketVolume = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '--'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`
  return `$${value.toFixed(0)}`
}

export default function IWishCopiedFeed({ adminUser, candidates, rules }: Props) {
  const summary = useMemo(() => {
    const highRoi = candidates.filter((trade) => (trade.roiPct ?? 0) >= rules.highRoiThreshold).length
    const late = candidates.filter((trade) => trade.lateWindowMinutes !== null).length
    const contrarian = candidates.filter((trade) => trade.price <= rules.contrarianPriceMax).length
    return { highRoi, late, contrarian }
  }, [candidates, rules])

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation
        user={{ id: adminUser.id, email: adminUser.email ?? '' }}
        isPremium={false}
        walletAddress={null}
        profileImageUrl={null}
      />
      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">I wish I&apos;d copied that</h1>
            <p className="text-slate-600 mt-2 max-w-2xl">
              Deterministic feed of trades from the last {rules.lookbackHours} hours that look tweet-worthy:
              high ROI moves, late swings before market close, and contrarian big-ticket buys.
            </p>
          </div>
          <Button
            onClick={() => window.location.reload()}
            variant="outline"
            className="gap-2 border-slate-200 bg-white"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">High ROI</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{summary.highRoi}</div>
            <div className="text-sm text-slate-500">ROI at least {rules.highRoiThreshold}%</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Late Swings</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{summary.late}</div>
            <div className="text-sm text-slate-500">Inside {rules.lateWindowMinutes} minutes of end</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-xs uppercase tracking-wide text-slate-500">Contrarian</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{summary.contrarian}</div>
            <div className="text-sm text-slate-500">Bought below {(rules.contrarianPriceMax * 100).toFixed(0)}% odds</div>
          </div>
        </div>

        <div className="mt-8 space-y-4">
          {candidates.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-600">
              No trade candidates matched the deterministic rules in the last {rules.lookbackHours} hours.
            </div>
          ) : (
            candidates.map((trade) => {
              const marketUrl = trade.marketSlug
                ? `https://polymarket.com/market/${trade.marketSlug}`
                : trade.conditionId
                  ? `https://polymarket.com/market/${trade.conditionId}`
                  : null
              const roiClass =
                trade.roiPct !== null
                  ? trade.roiPct >= rules.highRoiThreshold
                    ? 'text-emerald-600'
                    : trade.roiPct <= -rules.highRoiThreshold
                      ? 'text-rose-600'
                      : 'text-slate-700'
                  : 'text-slate-500'

              return (
                <div key={trade.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-wide text-slate-500">
                        {formatDateTime(trade.timestamp)}
                        {trade.category ? ` • ${trade.category}` : ''}
                      </div>
                      <div className="flex items-center gap-3">
                        {trade.marketIcon ? (
                          <img
                            src={trade.marketIcon}
                            alt=""
                            className="h-10 w-10 rounded-full border border-slate-200 object-cover"
                          />
                        ) : null}
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900">{trade.marketTitle}</h3>
                          <p className="text-sm text-slate-600">
                            Buy {trade.outcome} at {formatPrice(trade.price)} • {formatCurrency(trade.investedUsd)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`text-2xl font-semibold ${roiClass}`}>
                        {formatPercent(trade.roiPct)}
                      </div>
                      <div className="text-xs text-slate-500">ROI vs current price</div>
                      <div className="mt-2 text-sm text-slate-600">
                        Now {formatPrice(trade.currentPrice)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {trade.reasonTags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="bg-slate-100 text-slate-700">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <div className="mt-3 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">Why tweet:</span> {trade.reason}
                  </div>

                  <div className="mt-4 flex flex-col gap-3 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-wrap items-center gap-3">
                      <span>Trader {formatWallet(trade.wallet)}</span>
                      {trade.marketVolume !== null ? (
                        <span>Market volume {formatMarketVolume(trade.marketVolume)}</span>
                      ) : null}
                      {trade.lateWindowMinutes !== null ? (
                        <span>Entered {trade.lateWindowMinutes}m before end</span>
                      ) : null}
                    </div>
                    {marketUrl ? (
                      <Button asChild variant="ghost" className="h-auto px-0 text-xs text-slate-600">
                        <a href={marketUrl} target="_blank" rel="noreferrer">
                          View market
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </main>
    </div>
  )
}
