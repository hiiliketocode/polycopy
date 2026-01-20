import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type PnlRow = {
  date: string
  realized_pnl: number | string | null
  pnl_to_date: number | string | null
}

type RankRow = {
  window_key: string
  rank: number | null
  total_traders: number | null
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables for realized PnL route')
}

// TypeScript: After the check above, these are guaranteed to be strings
const supabaseUrl: string = SUPABASE_URL
const supabaseKey: string = SUPABASE_SERVICE_ROLE_KEY

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  const { wallet } = await params

  if (!wallet) {
    return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const normalizedWallet = wallet.toLowerCase()

  const [{ data: traderRow }] = await Promise.all([
    supabase
      .from('traders')
      .select('volume')
      .eq('wallet_address', normalizedWallet)
      .maybeSingle()
  ])

  const { data: rows, error } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('date, realized_pnl, pnl_to_date')
    .eq('wallet_address', normalizedWallet)
    .order('date', { ascending: true })

  if (error) {
    console.error('Failed to load realized PnL rows:', error)
    return NextResponse.json({ error: 'Failed to load realized PnL' }, { status: 500 })
  }

  const parsed: { date: string; realized_pnl: number; pnl_to_date: number | null }[] = []
  for (const row of ((rows as PnlRow[] | null | undefined) ?? [])) {
    if (!row?.date) continue
    const realized = Number(row.realized_pnl ?? 0)
    if (!Number.isFinite(realized)) continue
    const cumulative = row.pnl_to_date === null || row.pnl_to_date === undefined
      ? null
      : Number(row.pnl_to_date)
    parsed.push({
      date: row.date,
      realized_pnl: realized,
      pnl_to_date: Number.isFinite(cumulative ?? 0) ? cumulative : null
    })
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  let anchorIndex = parsed.length - 1
  if (anchorIndex >= 0 && parsed[anchorIndex].date === todayStr && parsed.length > 1) {
    anchorIndex -= 1
  }
  const anchorDate = anchorIndex >= 0
    ? new Date(`${parsed[anchorIndex].date}T00:00:00Z`)
    : new Date()
  const startOfAnchor = Date.UTC(
    anchorDate.getUTCFullYear(),
    anchorDate.getUTCMonth(),
    anchorDate.getUTCDate()
  )
  const cutoffDate = (days: number | null) => {
    if (days === null) return null
    const d = new Date(startOfAnchor)
    d.setUTCDate(d.getUTCDate() - (days - 1))
    return d
  }

  const volume = traderRow?.volume !== null && traderRow?.volume !== undefined
    ? Number(traderRow.volume)
    : null

  const periods: { label: string; days: number | null }[] = [
    { label: '1D', days: 1 },
    { label: '7D', days: 7 },
    { label: '30D', days: 30 },
    { label: '90D', days: 90 },
    { label: '1Y', days: 365 },
    { label: 'ALL', days: null }
  ]

  const summaries = periods.map(({ label, days }) => {
    const cutoff = cutoffDate(days)
    const windowRows = cutoff
      ? parsed.filter((row) => {
          const rowDate = new Date(`${row.date}T00:00:00Z`)
          return rowDate >= cutoff
        })
      : parsed

    const pnl = windowRows.reduce((acc, row) => acc + (row.realized_pnl || 0), 0)
    const returnPct = volume && volume !== 0 ? (pnl / volume) * 100 : null
    const cumulative = windowRows.length > 0 ? windowRows[windowRows.length - 1].pnl_to_date : null

    return {
      label,
      days,
      pnl,
      returnPct,
      cumulative,
      windowStart: windowRows.length > 0 ? windowRows[0].date : null,
      windowEnd: windowRows.length > 0 ? windowRows[windowRows.length - 1].date : null
    }
  })

  const currentKeys = ['1D', '7D', '30D', '3M', '6M', 'ALL']
  const prevKeys = ['1D_PREV', '7D_PREV', '30D_PREV', '3M_PREV', '6M_PREV']
  const rankKeys = [...currentKeys, ...prevKeys]
  const { data: rankRows } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('window_key, rank, total_traders')
    .eq('wallet_address', normalizedWallet)
    .in('window_key', Array.from(new Set(rankKeys)))

  const rankMap = new Map<string, RankRow>()
  for (const row of (rankRows as RankRow[] | null | undefined) ?? []) {
    rankMap.set(row.window_key, row)
  }

  const rankings = currentKeys.reduce<Record<string, {
    rank: number | null;
    total: number | null;
    delta: number | null;
    previousRank: number | null;
  }>>(
    (acc, key) => {
      const current = rankMap.get(key)
      const prev = rankMap.get(`${key}_PREV`)
      const currentRank = typeof current?.rank === 'number' ? current.rank : null
      const prevRank = typeof prev?.rank === 'number' ? prev.rank : null
      const delta = currentRank !== null && prevRank !== null ? prevRank - currentRank : null
      acc[key] = {
        rank: currentRank,
        total: typeof current?.total_traders === 'number' ? current.total_traders : null,
        delta,
        previousRank: prevRank,
      }
      return acc
    },
    {}
  )

  return NextResponse.json({
    daily: parsed,
    summaries,
    volume,
    rankings
  })
}
