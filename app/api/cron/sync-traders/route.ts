import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncTrader } from '@/lib/ingestion/syncTrader'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const BATCH_LIMIT = 50
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
      console.error('[sync-traders] worker error:', err)
    }
    await next()
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next())
  await Promise.all(workers)
  return results
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const limitParam = parseInt(url.searchParams.get('limit') || '', 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : BATCH_LIMIT

  const { data: traders, error } = await supabase
    .from('traders')
    .select('id, wallet_address')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[sync-traders] failed to load traders', error)
    return NextResponse.json({ error: 'Failed to load traders' }, { status: 500 })
  }

  if (!traders || traders.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No active traders' })
  }

  let ordersUpserted = 0
  let fillsUpserted = 0
  let refreshedOrders = 0

  const results = await runWithConcurrency(
    traders,
    CONCURRENCY,
    async (trader) => {
      const res = await syncTrader({ traderId: trader.id, wallet: trader.wallet_address })
      ordersUpserted += res.ordersUpserted
      fillsUpserted += res.fillsUpserted
      refreshedOrders += res.refreshedOrders
      return res
    }
  )

  return NextResponse.json({
    processed: results.length,
    ordersUpserted,
    fillsUpserted,
    refreshedOrders
  })
}
