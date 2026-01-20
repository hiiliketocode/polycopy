/**
 * @deprecated This endpoint is deprecated in favor of Fly.io workers (workers/worker-hot.js and workers/worker-cold.js)
 * 
 * The new system provides:
 * - Hot workers: Near real-time polling (1-3s) for actively followed traders
 * - Cold workers: Hourly polling for all other traders with job locking
 * - Position tracking and reconciliation
 * - Better rate limiting and restart safety
 * 
 * See workers/README.md for details.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncPublicTrades } from '@/lib/ingestion/syncPublicTrades'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'Supabase env vars missing for public trade sync (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)'
  )
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const CONCURRENCY = 5

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let index = 0

  async function next() {
    if (index >= items.length) return
    const current = index++
    const item = items[current]
    try {
      const result = await worker(item)
      results.push(result)
    } catch (err) {
      console.error('[sync-public-trades] worker error:', err)
    }
    await next()
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next())
  await Promise.all(workers)
  return results
}

type TraderRow = {
  id: string
  wallet_address: string
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const limitParam = parseInt(url.searchParams.get('limit') || '', 10)
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT

  const { data: traders, error } = await supabase
    .from('traders')
    .select('id, wallet_address')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[sync-public-trades] failed to load traders', error)
    return NextResponse.json({ error: 'Failed to load traders' }, { status: 500 })
  }

  if (!traders || traders.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No active traders' })
  }

  let tradesUpserted = 0
  let pagesFetched = 0

  const results = await runWithConcurrency(
    traders,
    CONCURRENCY,
    async (trader: TraderRow) => {
      const res = await syncPublicTrades({ traderId: trader.id })
      tradesUpserted += res.tradesUpserted
      pagesFetched += res.pagesFetched
      console.log(
        `[sync-public-trades] ${trader.wallet_address}: ${res.tradesUpserted} trades across ${res.pagesFetched} pages`
      )
      return res
    }
  )

  return NextResponse.json({
    processed: results.length,
    requested: traders.length,
    tradesUpserted,
    pagesFetched,
    failures: traders.length - results.length,
    limit
  })
}
