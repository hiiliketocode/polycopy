#!/usr/bin/env node
'use strict'

/**
 * Check markets table: how many have resolved pricing for correct PnL.
 * Uses Supabase client; run against your project DB.
 *
 * Final price for PnL = 1 if your outcome matches winner, 0 otherwise.
 * We need either winning_side (Dome) or resolved_outcome (our cache).
 *
 * Usage: node scripts/check-markets-resolved-pricing.js
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PAGE = 1000

function trim(s) {
  return typeof s === 'string' ? s.trim() : ''
}

function hasResolvedPricing(m) {
  const ws = trim(m.winning_side)
  const ro = trim(m.resolved_outcome)
  return (ws !== '') || (ro !== '')
}

async function fetchAll(table, select, orderBy = 'condition_id') {
  const out = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderBy)
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || !data.length) break
    out.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

async function run() {
  console.log('Fetching markets...\n')
  const markets = await fetchAll('markets', 'condition_id, winning_side, resolved_outcome, status, closed')
  const total = markets.length

  let hasWinningSide = 0
  let hasResolvedOutcome = 0
  let hasEither = 0
  const byStatus = Object.create(null)
  const byClosed = Object.create(null)

  for (const m of markets) {
    const ws = trim(m.winning_side)
    const ro = trim(m.resolved_outcome)
    if (ws !== '') hasWinningSide++
    if (ro !== '') hasResolvedOutcome++
    if (ws !== '' || ro !== '') hasEither++

    const st = m.status == null ? 'NULL' : String(m.status)
    byStatus[st] = (byStatus[st] || 0) + 1
    const cl = m.closed == null ? 'NULL' : String(m.closed)
    byClosed[cl] = (byClosed[cl] || 0) + 1
  }

  console.log('=== Markets resolved pricing (PnL final price) ===\n')
  console.log('Total markets:                    ', total)
  console.log('Has winning_side (Dome API):      ', hasWinningSide)
  console.log('Has resolved_outcome (our cache): ', hasResolvedOutcome)
  console.log('Has EITHER (resolved pricing):    ', hasEither)
  console.log('')

  console.log('By status:')
  const statusEntries = Object.entries(byStatus).sort((a, b) => b[1] - a[1])
  for (const [k, v] of statusEntries) {
    console.log(`  ${k}: ${v}`)
  }
  console.log('')
  console.log('By closed:')
  for (const [k, v] of Object.entries(byClosed).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`)
  }

  console.log('\nFetching distinct market_ids from orders...')
  const orders = await fetchAll('orders', 'market_id', 'order_id')
  const orderMarketIds = new Set(
    orders.map((o) => trim(o.market_id)).filter(Boolean)
  )
  const marketIdsWithPricing = new Set(
    markets.filter(hasResolvedPricing).map((m) => m.condition_id)
  )
  let inOrdersWithoutPricing = 0
  for (const id of orderMarketIds) {
    if (!marketIdsWithPricing.has(id)) inOrdersWithoutPricing++
  }

  console.log('\nMarkets in orders WITHOUT resolved pricing:', inOrdersWithoutPricing)
  console.log('(These can cause wrong or missing PnL if the market is resolved.)\n')
}

run().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
