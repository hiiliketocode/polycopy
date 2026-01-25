import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * Trigger a backfill for a single wallet if it should be tracked.
 * This runs asynchronously and doesn't block the API response.
 */
async function triggerWalletBackfillIfNeeded(
  supabase: any,
  wallet: string
): Promise<void> {
  try {
    // Check if wallet exists in any backfill source
    const [traderResult, followResult, tradesResult, ordersResult] = await Promise.all([
      supabase.from('traders').select('wallet_address').eq('wallet_address', wallet).maybeSingle(),
      supabase.from('follows').select('trader_wallet').eq('trader_wallet', wallet).limit(1).maybeSingle(),
      (async () => {
        try {
          const { data } = await supabase.rpc('get_distinct_trader_wallets_from_trades_public')
          const wallets = Array.isArray(data) ? data : []
          return wallets.some((w: { wallet: string }) => w.wallet?.toLowerCase() === wallet) ? {} : null
        } catch {
          return null
        }
      })(),
      (async () => {
        try {
          const { data } = await supabase.rpc('get_distinct_copied_trader_wallets_from_orders')
          const wallets = Array.isArray(data) ? data : []
          return wallets.some((w: { wallet: string }) => w.wallet?.toLowerCase() === wallet) ? {} : null
        } catch {
          return null
        }
      })()
    ])

    const shouldBackfill = traderResult?.data || followResult?.data || tradesResult || ordersResult

    if (shouldBackfill) {
      // Use the shared utility function
      const { triggerWalletPnlBackfill } = await import('@/lib/backfill/trigger-wallet-pnl-backfill')
      triggerWalletPnlBackfill(wallet).catch((err) => {
        console.error(`[realized-pnl] Failed to trigger backfill for ${wallet}:`, err)
      })
    }
  } catch (err) {
    console.error(`[realized-pnl] Error checking backfill eligibility for ${wallet}:`, err)
  }
}

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

  // If no PnL data exists, trigger an async backfill for this wallet
  // This ensures wallets viewed on trader pages get backfilled even if not in cron sources
  if (!rows || rows.length === 0) {
    // Trigger backfill asynchronously without blocking the response
    triggerWalletBackfillIfNeeded(supabase, normalizedWallet).catch((err) => {
      console.error(`[realized-pnl] Error triggering backfill for ${normalizedWallet}:`, err)
    })
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

  const shiftDate = (dateStr: string, days: number) => {
    const date = new Date(`${dateStr}T00:00:00Z`)
    if (Number.isNaN(date.getTime())) return dateStr
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const yesterdayStr = shiftDate(todayStr, -1)
  const lastDateStr = parsed.length > 0 ? parsed[parsed.length - 1].date : null
  let shiftDays = 0
  if (lastDateStr) {
    const lastMs = Date.parse(`${lastDateStr}T00:00:00Z`)
    const yesterdayMs = Date.parse(`${yesterdayStr}T00:00:00Z`)
    if (Number.isFinite(lastMs) && Number.isFinite(yesterdayMs) && lastMs > yesterdayMs) {
      shiftDays = Math.round((yesterdayMs - lastMs) / (24 * 60 * 60 * 1000))
    }
  }

  const normalizedRows = shiftDays !== 0
    ? parsed.map((row) => ({
        ...row,
        date: shiftDate(row.date, shiftDays)
      }))
    : parsed

  let anchorIndex = normalizedRows.length - 1
  if (anchorIndex >= 0 && normalizedRows[anchorIndex].date === todayStr && normalizedRows.length > 1) {
    anchorIndex -= 1
  }
  const anchorDate = anchorIndex >= 0
    ? new Date(`${normalizedRows[anchorIndex].date}T00:00:00Z`)
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
      ? normalizedRows.filter((row) => {
          const rowDate = new Date(`${row.date}T00:00:00Z`)
          return rowDate >= cutoff
        })
      : normalizedRows

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
  const toNumber = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  }
  for (const row of (rankRows as RankRow[] | null | undefined) ?? []) {
    rankMap.set(row.window_key, {
      window_key: row.window_key,
      rank: toNumber(row.rank),
      total_traders: toNumber(row.total_traders),
    })
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
    daily: normalizedRows,
    summaries,
    volume,
    rankings
  })
}
