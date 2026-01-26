#!/usr/bin/env node
'use strict'

/**
 * Backfill markets that are in orders but missing resolved pricing (winning_side/resolved_outcome).
 * This ensures we can calculate correct PnL for resolved markets.
 *
 * Usage: node scripts/backfill-markets-missing-pricing.js
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DOME_API_KEY = process.env.DOME_API_KEY || null

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DOME_BASE_URL = process.env.DOME_BASE_URL || 'https://api.domeapi.io/v1'
const BATCH_SIZE = 50 // Dome API limit is 100, but we'll use 50 for safety
const SLEEP_MS = 150

function trim(s) {
  return typeof s === 'string' ? s.trim() : ''
}

function hasResolvedPricing(m) {
  const ws = trim(m.winning_side)
  const ro = trim(m.resolved_outcome)
  return (ws !== '') || (ro !== '')
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
    raw_dome: market ?? {},
    updated_at: new Date().toISOString(),
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchMarketsByConditionIds(conditionIds) {
  const url = new URL(`${DOME_BASE_URL}/polymarket/markets`)
  conditionIds.forEach((id) => url.searchParams.append('condition_id', id))
  url.searchParams.set('limit', String(Math.min(100, conditionIds.length)))

  const headers = { Accept: 'application/json' }
  if (DOME_API_KEY) {
    headers.Authorization = `Bearer ${DOME_API_KEY}`
  }

  const res = await fetch(url.toString(), { headers })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Dome request failed (${res.status}): ${body || res.statusText}`)
  }
  const json = await res.json()
  return Array.isArray(json?.markets) ? json.markets : []
}

async function upsertMarkets(rows) {
  if (rows.length === 0) return
  const { error } = await supabase
    .from('markets')
    .upsert(rows, { onConflict: 'condition_id' })
  if (error) throw error
}

async function findMarketsNeedingPricing() {
  console.log('Finding markets in orders without resolved pricing...\n')
  
  // Get all markets
  const markets = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('markets')
      .select('condition_id, winning_side, resolved_outcome')
      .order('condition_id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || !data.length) break
    markets.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  const marketsWithPricing = new Set(
    markets.filter(hasResolvedPricing).map((m) => m.condition_id)
  )

  // Get distinct market_ids from orders
  const orders = []
  from = 0
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('market_id')
      .order('order_id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || !data.length) break
    orders.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  const orderMarketIds = new Set(
    orders.map((o) => trim(o.market_id)).filter(Boolean)
  )

  // Find markets in orders but without pricing
  const needingPricing = Array.from(orderMarketIds).filter(
    (id) => !marketsWithPricing.has(id)
  )

  console.log(`Found ${needingPricing.length} markets needing resolved pricing\n`)
  return needingPricing
}

async function processBatch(batchNumber, conditionIds) {
  console.log(`📦 Batch ${batchNumber}: fetching ${conditionIds.length} markets...`)

  try {
    const markets = await fetchMarketsByConditionIds(conditionIds)
    const rows = markets.map(mapDomeMarket).filter((row) => row.condition_id)
    const returnedIds = new Set(rows.map((row) => row.condition_id))
    const missingIds = conditionIds.filter((id) => !returnedIds.has(id))

    await upsertMarkets(rows)

    const gotWinningSide = rows.filter((r) => trim(r.winning_side) !== '').length
    const gotResolvedOutcome = rows.filter((r) => trim(r.resolved_outcome) !== '').length

    console.log(
      `✅ Batch ${batchNumber} done. success=${rows.length} missing=${missingIds.length} ` +
      `(winning_side=${gotWinningSide}, resolved_outcome=${gotResolvedOutcome})`
    )

    return { success: rows.length, missing: missingIds.length, gotWinningSide }
  } catch (error) {
    console.error(`❌ Batch ${batchNumber} failed: ${error.message}`)
    return { success: 0, missing: conditionIds.length, gotWinningSide: 0 }
  } finally {
    if (SLEEP_MS > 0) {
      await sleep(SLEEP_MS)
    }
  }
}

async function main() {
  console.log('🚀 Backfilling markets missing resolved pricing\n')

  const conditionIds = await findMarketsNeedingPricing()

  if (conditionIds.length === 0) {
    console.log('✅ All markets in orders already have resolved pricing!')
    return
  }

  let totalSuccess = 0
  let totalMissing = 0
  let totalGotWinningSide = 0
  let batchCount = 0

  // Process in batches
  for (let i = 0; i < conditionIds.length; i += BATCH_SIZE) {
    const batch = conditionIds.slice(i, i + BATCH_SIZE)
    batchCount += 1

    const result = await processBatch(batchCount, batch)
    totalSuccess += result.success
    totalMissing += result.missing
    totalGotWinningSide += result.gotWinningSide

    console.log(
      `📊 Progress: success=${totalSuccess} missing=${totalMissing} ` +
      `got_winning_side=${totalGotWinningSide}/${totalSuccess}`
    )
  }

  console.log('\n✨ Backfill complete')
  console.log(`✅ Fetched ${totalSuccess} markets`)
  console.log(`❌ Missing from Dome: ${totalMissing}`)
  console.log(`🎯 Got winning_side: ${totalGotWinningSide} (${totalSuccess > 0 ? Math.round((totalGotWinningSide / totalSuccess) * 100) : 0}%)`)
}

main().catch((error) => {
  console.error('❌ Fatal error:', error.message)
  if (error.stack) console.error(error.stack)
  process.exit(1)
})
