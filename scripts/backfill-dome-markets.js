#!/usr/bin/env node
'use strict'

/**
 * Backfill Dome market metadata into public.markets and track state in
 * public.market_fetch_queue.
 *
 * Env:
 *   DOME_API_KEY (optional but recommended)
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional env:
 *   BATCH_SIZE (default 50, max 100)
 *   SLEEP_MS (default 150)
 *   SEED_FROM_TRADES (default true)
 *   SEED_PAGE_SIZE (default 500)
 *   SEED_MAX_PAGES (optional)
 *   MAX_MARKETS (optional)
 *   REQUEST_TIMEOUT_MS (default 30000)
 *   MAX_RETRIES (default 3)
 *   RETRY_BASE_MS (default 1500)
 *   DOME_BASE_URL (default https://api.domeapi.io/v1)
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOME_API_KEY = process.env.DOME_API_KEY || null

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

const BATCH_SIZE = Math.min(100, Math.max(1, toNumber(process.env.BATCH_SIZE) || 100))
const CONCURRENCY = Math.max(1, toNumber(process.env.CONCURRENCY) || 4)
const SLEEP_MS = Math.max(0, toNumber(process.env.SLEEP_MS) || 0)
const SEED_FROM_TRADES = process.env.SEED_FROM_TRADES !== 'false'
const SEED_PAGE_SIZE = Math.max(100, toNumber(process.env.SEED_PAGE_SIZE) || 500)
const SEED_MAX_PAGES = toNumber(process.env.SEED_MAX_PAGES)
const MAX_MARKETS = toNumber(process.env.MAX_MARKETS)
const REQUEST_TIMEOUT_MS = Math.max(1000, toNumber(process.env.REQUEST_TIMEOUT_MS) || 30000)
const MAX_RETRIES = Math.max(1, toNumber(process.env.MAX_RETRIES) || 3)
const RETRY_BASE_MS = Math.max(500, toNumber(process.env.RETRY_BASE_MS) || 1500)
const DOME_BASE_URL = process.env.DOME_BASE_URL || 'https://api.domeapi.io/v1'

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
        await sleep(delay)
        return fetchWithRetry(url, options, attempt + 1)
      }
      const body = await res.text()
      throw new Error(`Request failed (${res.status}): ${body || res.statusText}`)
    }
    return res
  } catch (error) {
    if (error.name === 'AbortError' && attempt < MAX_RETRIES) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1)
      await sleep(delay)
      return fetchWithRetry(url, options, attempt + 1)
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
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
        p_limit: SEED_PAGE_SIZE
      }
    )

    if (error) throw error

    const row = Array.isArray(data) ? data[0] : data
    const inserted = Number(row?.inserted_count || 0)
    const nextCursor = row?.last_condition_id || null

    totalInserted += inserted
    pages += 1

    if (!nextCursor || nextCursor === lastConditionId) break
    lastConditionId = nextCursor
    if (SEED_MAX_PAGES && pages >= SEED_MAX_PAGES) break
  }

  console.log(`🌱 Queue seed complete. pages=${pages} inserted=${totalInserted}`)
}

async function claimQueueBatch(limit) {
  const { data, error } = await supabase.rpc('claim_market_fetch_queue_batch', {
    p_limit: limit
  })
  if (error) throw error
  if (!data || data.length === 0) return []
  return Array.from(new Set(data.map((row) => row.condition_id).filter(Boolean)))
}

async function fetchMarketsByConditionIds(conditionIds) {
  const url = new URL(`${DOME_BASE_URL}/polymarket/markets`)
  conditionIds.forEach((id) => url.searchParams.append('condition_id', id))
  url.searchParams.set('limit', String(Math.min(100, conditionIds.length)))

  const headers = { Accept: 'application/json' }
  if (DOME_API_KEY) {
    headers.Authorization = `Bearer ${DOME_API_KEY}`
  }

  const res = await fetchWithRetry(url.toString(), { headers })
  const json = await res.json()
  return Array.isArray(json?.markets) ? json.markets : []
}

function toIsoFromUnix(seconds) {
  if (!Number.isFinite(seconds)) return null
  return new Date(seconds * 1000).toISOString()
}

function toIsoFromGameStart(raw) {
  if (!raw || typeof raw !== 'string') return null
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const withZone = normalized.endsWith('Z') ? normalized : `${normalized}Z`
  const parsed = new Date(withZone)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function mapDomeMarket(market) {
  const startIso = toIsoFromUnix(market?.start_time)
  const endIso = toIsoFromUnix(market?.end_time)
  const completedIso = toIsoFromUnix(market?.completed_time)
  const closeIso = toIsoFromUnix(market?.close_time)
  const gameStartIso = toIsoFromGameStart(market?.game_start_time)

  return {
    condition_id: market?.condition_id ?? null,
    market_slug: market?.market_slug ?? null,
    event_slug: market?.event_slug ?? null,
    title: market?.title ?? null,
    start_time_unix: Number.isFinite(market?.start_time) ? market.start_time : null,
    end_time_unix: Number.isFinite(market?.end_time) ? market.end_time : null,
    completed_time_unix: Number.isFinite(market?.completed_time) ? market.completed_time : null,
    close_time_unix: Number.isFinite(market?.close_time) ? market.close_time : null,
    game_start_time_raw: market?.game_start_time ?? null,
    start_time: startIso,
    end_time: endIso,
    completed_time: completedIso,
    close_time: closeIso,
    game_start_time: gameStartIso,
    tags: market?.tags ?? null,
    volume_1_week: market?.volume_1_week ?? null,
    volume_1_month: market?.volume_1_month ?? null,
    volume_1_year: market?.volume_1_year ?? null,
    volume_total: market?.volume_total ?? null,
    resolution_source: market?.resolution_source ?? null,
    image: market?.image ?? null,
    description: market?.description ?? null,
    negative_risk_id: market?.negative_risk_id ?? null,
    side_a: market?.side_a ?? null,
    side_b: market?.side_b ?? null,
    winning_side: market?.winning_side ?? null,
    status: market?.status ?? null,
    extra_fields: market?.extra_fields ?? null,
    raw_dome: market,
    updated_at: new Date().toISOString()
  }
}

async function upsertMarkets(rows) {
  if (rows.length === 0) return
  const { error } = await supabase
    .from('markets')
    .upsert(rows, { onConflict: 'condition_id' })
  if (error) throw error
}

async function markFetched(conditionIds) {
  if (conditionIds.length === 0) return
  const { error } = await supabase
    .from('market_fetch_queue')
    .update({ fetched: true, last_attempt: new Date().toISOString(), error_count: 0 })
    .in('condition_id', conditionIds)
  if (error) throw error
}

async function markErrors(conditionIds) {
  for (const conditionId of conditionIds) {
    const { error } = await supabase.rpc('increment_market_fetch_queue_error', {
      p_condition_id: conditionId
    })
    if (error) throw error
  }
}

async function processBatch(batchNumber, conditionIds) {
  console.log(`\n📦 Batch ${batchNumber}: ${conditionIds.length} markets`)

  try {
    const markets = await fetchMarketsByConditionIds(conditionIds)
    const rows = markets.map(mapDomeMarket).filter((row) => row.condition_id)
    const returnedIds = new Set(rows.map((row) => row.condition_id))
    const missingIds = conditionIds.filter((id) => !returnedIds.has(id))

    await upsertMarkets(rows)
    await markFetched(Array.from(returnedIds))
    if (missingIds.length > 0) {
      await markErrors(missingIds)
    }

    console.log(
      `📊 Batch ${batchNumber} done. success=${rows.length} missing=${missingIds.length}`
    )

    return { success: rows.length, missing: missingIds.length, attempted: conditionIds.length }
  } catch (error) {
    await markErrors(conditionIds)
    console.error(`❌ Batch ${batchNumber} failed: ${error.message}`)
    return { success: 0, missing: conditionIds.length, attempted: conditionIds.length }
  } finally {
    if (SLEEP_MS > 0) {
      await sleep(SLEEP_MS)
    }
  }
}

async function main() {
  console.log('🚀 Starting Dome market backfill')

  if (SEED_FROM_TRADES) {
    await seedQueueFromTradesPagedRpc()
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

    const batchPromises = []
    for (let i = 0; i < CONCURRENCY; i += 1) {
      const remaining = MAX_MARKETS ? Math.max(0, MAX_MARKETS - totalAttempted) : BATCH_SIZE
      const batchSize = Math.min(BATCH_SIZE, remaining || BATCH_SIZE)
      if (batchSize <= 0) break

      const conditionIds = await claimQueueBatch(batchSize)
      if (conditionIds.length === 0) break

      batchCount += 1
      batchPromises.push(processBatch(batchCount, conditionIds))
    }

    if (batchPromises.length === 0) {
      console.log('✅ No more queued markets to process')
      break
    }

    const results = await Promise.all(batchPromises)
    for (const result of results) {
      totalSuccess += result.success
      totalFailed += result.missing
      totalAttempted += result.attempted
    }

    console.log(
      `📊 Progress: totalSuccess=${totalSuccess} totalMissing=${totalFailed} totalAttempted=${totalAttempted}`
    )
  }

  console.log('\n✨ Dome market backfill complete')
  console.log(`✅ totalSuccess=${totalSuccess} ❌ totalMissing=${totalFailed}`)
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  process.exit(1)
})
