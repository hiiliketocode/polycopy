#!/usr/bin/env node
'use strict'

/**
 * Ensure all markets referenced in trades are present in the markets table.
 * Finds condition_ids in trades that are not in markets, fetches them from Dome,
 * and upserts to markets. Works without any RPC (uses direct Supabase queries).
 *
 * Env:
 *   DOME_API_KEY (optional but recommended)
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/match-markets-from-trades.js [--batch 50] [--sleep 150]
 */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.resolve(process.cwd(), '.env.local')
dotenv.config(fs.existsSync(envPath) ? { path: envPath } : {})

const DOME_API_KEY = process.env.DOME_API_KEY || null
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOME_BASE_URL = process.env.DOME_BASE_URL || 'https://api.domeapi.io/v1'

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

function parseArgs() {
  const args = process.argv.slice(2)
  const out = { batch: 50, sleep: 150 }
  for (const arg of args) {
    if (arg.startsWith('--batch=')) out.batch = Math.max(1, Math.min(100, parseInt(arg.split('=')[1], 10) || 50))
    if (arg.startsWith('--sleep=')) out.sleep = Math.max(0, parseInt(arg.split('=')[1], 10) || 150)
  }
  return out
}

const opts = parseArgs()
const BATCH_SIZE = opts.batch
const SLEEP_MS = opts.sleep
const PAGE_SIZE = 1000
const REQUEST_TIMEOUT_MS = 30000
const MAX_RETRIES = 3
const RETRY_BASE_MS = 1500

function toNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWithRetry(url, options, attempt = 1) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal })
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
  } catch (e) {
    if (e.name === 'AbortError' && attempt < MAX_RETRIES) {
      await sleep(RETRY_BASE_MS * Math.pow(2, attempt - 1))
      return fetchWithRetry(url, options, attempt + 1)
    }
    throw e
  } finally {
    clearTimeout(t)
  }
}

/** Collect all distinct condition_ids from trades (paginated). */
async function collectTradeConditionIds() {
  const seen = new Set()
  let lastId = null
  let pages = 0
  while (true) {
    let q = supabase
      .from('trades')
      .select('condition_id')
      .not('condition_id', 'is', null)
      .order('condition_id', { ascending: true })
      .limit(PAGE_SIZE)
    if (lastId) q = q.gt('condition_id', lastId)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    for (const row of data) {
      if (row.condition_id) seen.add(String(row.condition_id).trim())
    }
    lastId = data[data.length - 1]?.condition_id
    pages += 1
    if (pages % 10 === 0) console.log(`   📄 Trades: ${pages} pages, ${seen.size} distinct condition_ids`)
    if (data.length < PAGE_SIZE) break
  }
  return seen
}

/** Collect all condition_ids from markets (paginated). */
async function collectMarketConditionIds() {
  const seen = new Set()
  let from = 0
  let pages = 0
  while (true) {
    const { data, error } = await supabase
      .from('markets')
      .select('condition_id')
      .order('condition_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const row of data) {
      if (row.condition_id) seen.add(String(row.condition_id).trim())
    }
    from += data.length
    pages += 1
    if (pages % 10 === 0) console.log(`   📄 Markets: ${pages} pages, ${seen.size} condition_ids`)
    if (data.length < PAGE_SIZE) break
  }
  return seen
}

/** Yield batches of size batchSize from array arr. */
function* batched(arr, batchSize) {
  for (let i = 0; i < arr.length; i += batchSize) {
    yield arr.slice(i, i + batchSize)
  }
}

async function fetchMarketsByConditionIds(ids) {
  if (!ids.length) return []
  const url = new URL(`${DOME_BASE_URL}/polymarket/markets`)
  ids.forEach((id) => url.searchParams.append('condition_id', id))
  url.searchParams.set('limit', String(Math.min(100, ids.length)))
  const headers = { Accept: 'application/json' }
  if (DOME_API_KEY) headers.Authorization = `Bearer ${DOME_API_KEY}`

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
  const n = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const z = n.endsWith('Z') ? n : `${n}Z`
  const d = new Date(z)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function mapDomeMarket(m) {
  return {
    condition_id: m?.condition_id ?? null,
    market_slug: m?.market_slug ?? null,
    event_slug: m?.event_slug ?? null,
    title: m?.title ?? null,
    start_time_unix: toNumber(m?.start_time) ?? null,
    end_time_unix: toNumber(m?.end_time) ?? null,
    completed_time_unix: toNumber(m?.completed_time) ?? null,
    close_time_unix: toNumber(m?.close_time) ?? null,
    game_start_time_raw: m?.game_start_time ?? null,
    start_time: toIsoFromUnix(m?.start_time),
    end_time: toIsoFromUnix(m?.end_time),
    completed_time: toIsoFromUnix(m?.completed_time),
    close_time: toIsoFromUnix(m?.close_time),
    game_start_time: toIsoFromGameStart(m?.game_start_time),
    tags: m?.tags ?? null,
    volume_1_week: m?.volume_1_week ?? null,
    volume_1_month: m?.volume_1_month ?? null,
    volume_1_year: m?.volume_1_year ?? null,
    volume_total: m?.volume_total ?? null,
    resolution_source: m?.resolution_source ?? null,
    image: m?.image ?? null,
    description: m?.description ?? null,
    negative_risk_id: m?.negative_risk_id ?? null,
    side_a: m?.side_a ?? null,
    side_b: m?.side_b ?? null,
    winning_side: m?.winning_side ?? null,
    status: m?.status ?? null,
    extra_fields: m?.extra_fields ?? null,
    raw_dome: m ?? {},
    updated_at: new Date().toISOString()
  }
}

async function upsertMarkets(rows) {
  if (!rows.length) return
  const { error } = await supabase.from('markets').upsert(rows, { onConflict: 'condition_id' })
  if (error) throw error
}

async function main() {
  console.log('🚀 Match markets from trades: ensure all trade condition_ids exist in markets\n')
  console.log(`   Batch size: ${BATCH_SIZE}  Sleep: ${SLEEP_MS}ms\n`)

  console.log('📥 Collecting condition_ids from trades...')
  const tradeIds = await collectTradeConditionIds()
  console.log(`   Found ${tradeIds.size} distinct condition_ids in trades.\n`)

  console.log('📥 Collecting condition_ids from markets...')
  const marketIds = await collectMarketConditionIds()
  console.log(`   Found ${marketIds.size} condition_ids in markets.\n`)

  const missing = [...tradeIds].filter((id) => !marketIds.has(id))
  console.log(`   Missing (in trades, not in markets): ${missing.length}\n`)

  if (missing.length === 0) {
    console.log('✅ All trades are already matched. Nothing to do.\n')
    return
  }

  let batchNum = 0
  let totalUpserted = 0
  const batches = batched(missing, BATCH_SIZE)

  for (const batch of batches) {
    batchNum += 1
    console.log(`📦 Batch ${batchNum}: ${batch.length} missing condition_ids`)

    try {
      const markets = await fetchMarketsByConditionIds(batch)
      const rows = markets.map(mapDomeMarket).filter((r) => r.condition_id)
      const fetchedIds = new Set(rows.map((r) => r.condition_id))
      const notFound = batch.filter((id) => !fetchedIds.has(id))

      await upsertMarkets(rows)
      totalUpserted += rows.length

      if (notFound.length) {
        console.log(`   ⚠️  ${notFound.length} not returned by Dome (may be delisted/old)`)
      }
      console.log(`   ✅ Upserted ${rows.length} markets`)
    } catch (err) {
      console.error(`   ❌ Batch ${batchNum} failed:`, err.message)
      throw err
    }

    if (SLEEP_MS > 0) await sleep(SLEEP_MS)
  }

  console.log('\n✨ Done.')
  console.log(`   Total missing: ${missing.length}`)
  console.log(`   Total upserted: ${totalUpserted}`)
}

main().catch((e) => {
  console.error('❌ Fatal:', e.message)
  process.exit(1)
})
