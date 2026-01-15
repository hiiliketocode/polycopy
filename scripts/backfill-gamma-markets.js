#!/usr/bin/env node
'use strict'

/**
 * Backfill Gamma market metadata into public.markets and track state in
 * public.market_fetch_queue.
 *
 * Env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env:
 *   BATCH_SIZE (default 200)
 *   CONCURRENCY (default 5)
 *   SLEEP_MS (default 200)
 *   SEED_FROM_TRADES (default true)
 *   SEED_PAGE_SIZE (default 10000)
 *   SEED_MAX_PAGES (optional)
 *   INSERT_BATCH_SIZE (default 1000)
 *   MAX_RETRIES (default 3)
 *   REQUEST_TIMEOUT_MS (default 30000)
 *   RETRY_BASE_MS (default 60000)
 *   MAX_RETRY_DELAY_MS (default 1800000)
 *   MAX_MARKETS (optional)
 *   GAMMA_BASE_URL (default https://gamma-api.polymarket.com/markets)
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

function toNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const BATCH_SIZE = Math.max(1, toNumber(process.env.BATCH_SIZE) || 200)
const CONCURRENCY = Math.max(1, toNumber(process.env.CONCURRENCY) || 5)
const SLEEP_MS = Math.max(0, toNumber(process.env.SLEEP_MS) || 200)
const SEED_FROM_TRADES = process.env.SEED_FROM_TRADES !== 'false'
const SEED_PAGE_SIZE = Math.max(100, toNumber(process.env.SEED_PAGE_SIZE) || 500)
const SEED_PAGE_LIMIT = Math.min(SEED_PAGE_SIZE, 1000)
const SEED_USE_PAGED_RPC = process.env.SEED_USE_PAGED_RPC !== 'false'
const SKIP_SEED_WHEN_QUEUE_HAS_PENDING = process.env.SKIP_SEED_WHEN_QUEUE_HAS_PENDING !== 'false'
const SEED_MAX_PAGES = toNumber(process.env.SEED_MAX_PAGES)
const INSERT_BATCH_SIZE = Math.max(100, toNumber(process.env.INSERT_BATCH_SIZE) || 1000)
const MAX_RETRIES = Math.max(1, toNumber(process.env.MAX_RETRIES) || 3)
const REQUEST_TIMEOUT_MS = Math.max(1000, toNumber(process.env.REQUEST_TIMEOUT_MS) || 30000)
const RETRY_BASE_MS = Math.max(1000, toNumber(process.env.RETRY_BASE_MS) || 60000)
const MAX_RETRY_DELAY_MS = Math.max(RETRY_BASE_MS, toNumber(process.env.MAX_RETRY_DELAY_MS) || 1800000)
const MAX_MARKETS = toNumber(process.env.MAX_MARKETS)
const GAMMA_BASE_URL = process.env.GAMMA_BASE_URL || 'https://gamma-api.polymarket.com/markets'

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(url, options, attempt = 1) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    if (!res.ok) {
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('retry-after') || 0)
        const delay = Math.max(retryAfter * 1000, RETRY_BASE_MS * Math.pow(2, attempt - 1))
        await sleep(Math.min(delay, MAX_RETRY_DELAY_MS))
        return fetchWithRetry(url, options, attempt + 1)
      }
      const body = await res.text()
      throw new Error(`Request failed (${res.status}): ${body || res.statusText}`)
    }
    return res
  } catch (error) {
    if (error.name === 'AbortError' && attempt < MAX_RETRIES) {
      const delay = Math.min(RETRY_BASE_MS * Math.pow(2, attempt - 1), MAX_RETRY_DELAY_MS)
      await sleep(delay)
      return fetchWithRetry(url, options, attempt + 1)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function seedQueueFromTradesLegacy() {
  let pages = 0
  let totalRows = 0
  let totalInserted = 0
  let lastConditionId = null

  console.log('🌱 Seeding market_fetch_queue from trades...')

  while (true) {
    let query = supabase
      .from('trades')
      .select('condition_id')
      .not('condition_id', 'is', null)
      .order('condition_id', { ascending: true })
      .limit(SEED_PAGE_LIMIT)

    if (lastConditionId) {
      query = query.gt('condition_id', lastConditionId)
    }

    const { data, error } = await query

    if (error) throw error
    if (!data || data.length === 0) break

    totalRows += data.length
    lastConditionId = data[data.length - 1]?.condition_id || lastConditionId
    const uniqueIds = Array.from(new Set(data.map((row) => row.condition_id).filter(Boolean)))

    for (let i = 0; i < uniqueIds.length; i += INSERT_BATCH_SIZE) {
      const chunk = uniqueIds.slice(i, i + INSERT_BATCH_SIZE).map((conditionId) => ({
        condition_id: conditionId
      }))
      const { error: upsertError, count } = await supabase
        .from('market_fetch_queue')
        .upsert(chunk, {
          onConflict: 'condition_id',
          ignoreDuplicates: true,
          count: 'exact'
        })

      if (upsertError) throw upsertError
      totalInserted += count ?? 0
    }

    pages += 1
    if (data.length < SEED_PAGE_LIMIT) break
    if (SEED_MAX_PAGES && pages >= SEED_MAX_PAGES) break
  }

  console.log(`🌱 Queue seed complete. pages=${pages} rows=${totalRows} inserted=${totalInserted}`)
}

async function seedQueueFromTrades() {
  if (SEED_USE_PAGED_RPC) {
    const ok = await seedQueueFromTradesPagedRpc()
    if (ok) return
  }

  console.log('🌱 Seeding market_fetch_queue from trades (DB-side)...')
  const { data, error } = await supabase.rpc('enqueue_market_fetch_queue_from_trades')

  if (error) {
    console.warn(`⚠️  RPC seed failed (${error.message}); falling back to client-side seed`)
    return seedQueueFromTradesLegacy()
  }

  console.log(`🌱 Queue seed complete. inserted=${data ?? 0}`)
}

async function seedQueueFromTradesPagedRpc() {
  console.log('🌱 Seeding market_fetch_queue from trades (paged RPC)...')
  let pages = 0
  let totalInserted = 0
  let lastConditionId = null

  while (true) {
    const { data, error } = await supabase.rpc(
      'enqueue_market_fetch_queue_from_trades_page',
      {
        p_after_condition_id: lastConditionId,
        p_limit: SEED_PAGE_LIMIT
      }
    )

    if (error) {
      console.warn(`⚠️  Paged RPC seed failed (${error.message}); falling back`)
      return false
    }

    const row = Array.isArray(data) ? data[0] : data
    const inserted = Number(row?.inserted_count || 0)
    const nextCursor = row?.last_condition_id || null

    totalInserted += inserted
    pages += 1

    if (!nextCursor || nextCursor === lastConditionId) {
      break
    }

    lastConditionId = nextCursor

    if (SEED_MAX_PAGES && pages >= SEED_MAX_PAGES) {
      break
    }
  }

  console.log(`🌱 Queue seed complete. pages=${pages} inserted=${totalInserted}`)
  return true
}

function canAttempt(row, nowMs) {
  if (!row.last_attempt) return true
  const lastAttempt = new Date(row.last_attempt).getTime()
  const errorCount = Math.max(0, Number(row.error_count || 0))
  const delay = Math.min(MAX_RETRY_DELAY_MS, RETRY_BASE_MS * Math.pow(2, Math.min(errorCount, 6)))
  return nowMs - lastAttempt >= delay
}

async function pickQueueBatch(limit) {
  const sampleSize = Math.max(limit * 5, limit)
  const { data, error } = await supabase
    .from('market_fetch_queue')
    .select('condition_id, error_count, last_attempt')
    .eq('fetched', false)
    .order('last_attempt', { ascending: true, nullsFirst: true })
    .limit(sampleSize)

  if (error) throw error
  if (!data || data.length === 0) return []

  const nowMs = Date.now()
  const selected = []

  for (const row of data) {
    if (selected.length >= limit) break
    if (row?.condition_id && canAttempt(row, nowMs)) {
      selected.push(row.condition_id)
    }
  }

  if (selected.length > 0) {
    const nowIso = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('market_fetch_queue')
      .update({ last_attempt: nowIso })
      .in('condition_id', selected)

    if (updateError) throw updateError
  }

  return Array.from(new Set(selected))
}

async function fetchGammaMarket(conditionId) {
  const url = new URL(GAMMA_BASE_URL)
  url.searchParams.set('condition_id', conditionId)

  const res = await fetchWithRetry(url.toString(), {
    headers: { Accept: 'application/json' }
  })
  const data = await res.json()
  if (!Array.isArray(data) || data.length === 0) return null
  return data[0]
}

function mapGammaToRow(conditionId, market) {
  return {
    condition_id: conditionId,
    gamma_market_id: market?.id ?? market?.market_id ?? null,
    slug: market?.slug ?? null,
    question: market?.question ?? market?.title ?? null,
    description: market?.description ?? null,
    category: market?.category ?? null,
    tags: market?.tags ?? null,
    outcomes: market?.outcomes ?? null,
    outcome_prices: market?.outcomePrices ?? market?.outcome_prices ?? null,
    volume: market?.volume ?? null,
    liquidity: market?.liquidity ?? null,
    active: market?.active ?? null,
    closed: market?.closed ?? null,
    start_date: market?.startDate ?? market?.start_date ?? null,
    end_date: market?.endDate ?? market?.end_date ?? null,
    twitter_card_image: market?.twitterCardImage ?? market?.twitter_card_image ?? null,
    icon: market?.icon ?? null,
    raw_gamma: market,
    updated_at: new Date().toISOString()
  }
}

async function upsertMarket(row) {
  const { error } = await supabase
    .from('markets')
    .upsert(row, { onConflict: 'condition_id' })
  if (error) throw error
}

async function markFetched(conditionId) {
  const { error } = await supabase
    .from('market_fetch_queue')
    .update({ fetched: true, last_attempt: new Date().toISOString(), error_count: 0 })
    .eq('condition_id', conditionId)
  if (error) throw error
}

async function markError(conditionId) {
  const { data, error } = await supabase
    .from('market_fetch_queue')
    .select('error_count')
    .eq('condition_id', conditionId)
    .single()
  if (error) throw error

  const nextCount = Math.max(0, Number(data?.error_count || 0)) + 1

  const { error: updateError } = await supabase
    .from('market_fetch_queue')
    .update({ last_attempt: new Date().toISOString(), error_count: nextCount })
    .eq('condition_id', conditionId)
  if (updateError) throw updateError
}

async function runWithConcurrency(items, limit, handler) {
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex++
      if (index >= items.length) break
      await handler(items[index], index)
    }
  })
  await Promise.all(workers)
}

async function main() {
  console.log('🚀 Starting Gamma market backfill')

  if (SEED_FROM_TRADES) {
    if (SKIP_SEED_WHEN_QUEUE_HAS_PENDING) {
      const { count, error } = await supabase
        .from('market_fetch_queue')
        .select('condition_id', { count: 'exact', head: true })
        .eq('fetched', false)
      if (error) throw error

      if (count && count > 0) {
        console.log(`ℹ️  Queue already has ${count} pending rows; skipping seed`)
      } else {
        await seedQueueFromTrades()
      }
    } else {
      await seedQueueFromTrades()
    }
  } else {
    console.log('ℹ️  Skipping queue seed (SEED_FROM_TRADES=false)')
  }

  let totalSuccess = 0
  let totalFailed = 0
  let totalAttempted = 0
  let batchCount = 0

  while (true) {
    if (MAX_MARKETS && totalAttempted >= MAX_MARKETS) {
      console.log(`🛑 MAX_MARKETS reached (${MAX_MARKETS}), stopping`)
      break
    }

    const remaining = MAX_MARKETS ? Math.max(0, MAX_MARKETS - totalAttempted) : BATCH_SIZE
    const batchSize = Math.min(BATCH_SIZE, remaining || BATCH_SIZE)
    const conditionIds = await pickQueueBatch(batchSize)

    if (conditionIds.length === 0) {
      console.log('✅ No more queued markets to process')
      break
    }

    batchCount += 1
    console.log(`\n📦 Batch ${batchCount}: ${conditionIds.length} markets`)

    let batchSuccess = 0
    let batchFailed = 0

    await runWithConcurrency(conditionIds, CONCURRENCY, async (conditionId) => {
      try {
        const market = await fetchGammaMarket(conditionId)
        if (!market) {
          throw new Error('Gamma returned empty response')
        }
        const row = mapGammaToRow(conditionId, market)
        await upsertMarket(row)
        await markFetched(conditionId)
        batchSuccess += 1
      } catch (error) {
        batchFailed += 1
        await markError(conditionId)
        console.warn(`   ⚠️  ${conditionId}: ${error.message}`)
      } finally {
        totalAttempted += 1
        if (SLEEP_MS > 0) {
          await sleep(SLEEP_MS)
        }
      }
    })

    totalSuccess += batchSuccess
    totalFailed += batchFailed

    console.log(
      `📊 Batch ${batchCount} done. success=${batchSuccess} failed=${batchFailed} totalSuccess=${totalSuccess} totalFailed=${totalFailed}`
    )
  }

  console.log('\n✨ Gamma market backfill complete')
  console.log(`✅ totalSuccess=${totalSuccess} ❌ totalFailed=${totalFailed}`)
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  process.exit(1)
})
