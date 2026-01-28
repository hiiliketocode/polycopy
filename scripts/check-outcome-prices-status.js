#!/usr/bin/env node
'use strict'

/**
 * Check current status of outcome_prices in resolved markets
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function trim(s) {
  return typeof s === 'string' ? s.trim() : ''
}

function hasOutcomePrices(m) {
  if (!m.outcome_prices) return false
  const op = m.outcome_prices
  const outcomes = op.outcomes || op.labels || op.choices || []
  const prices = op.outcomePrices || op.prices || op.probabilities || []
  return Array.isArray(outcomes) && outcomes.length > 0 && Array.isArray(prices) && prices.length > 0
}

function isResolved(m) {
  const hasResolutionData = trim(m.winning_side) !== '' || trim(m.resolved_outcome) !== ''
  return trim(m.status) === 'resolved' || hasResolutionData
}

async function checkStatus() {
  console.log('📊 Checking outcome_prices status for resolved markets...\n')

  // Get all markets
  const markets = []
  let from = 0
  const PAGE = 1000

  while (true) {
    const { data, error } = await supabase
      .from('markets')
      .select('condition_id, closed, status, winning_side, resolved_outcome, outcome_prices')
      .order('condition_id')
      .range(from, from + PAGE - 1)

    if (error) throw error
    if (!data || !data.length) break
    markets.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  console.log(`Total markets in database: ${markets.length}\n`)

  // Count resolved markets
  const resolved = markets.filter(isResolved)
  console.log(`Resolved markets: ${resolved.length}`)

  // Count resolved with outcome_prices
  const resolvedWithPrices = resolved.filter(hasOutcomePrices)
  console.log(`Resolved markets WITH outcome_prices: ${resolvedWithPrices.length}`)

  // Count resolved without outcome_prices
  const resolvedWithoutPrices = resolved.filter((m) => !hasOutcomePrices(m))
  console.log(`Resolved markets MISSING outcome_prices: ${resolvedWithoutPrices.length}\n`)

  // Breakdown by resolution source
  const withWinningSide = resolved.filter((m) => trim(m.winning_side) !== '')
  const withResolvedOutcome = resolved.filter((m) => trim(m.resolved_outcome) !== '')
  const withStatus = resolved.filter((m) => trim(m.status) === 'resolved')

  console.log('Resolution data breakdown:')
  console.log(`  - Has winning_side: ${withWinningSide.length}`)
  console.log(`  - Has resolved_outcome: ${withResolvedOutcome.length}`)
  console.log(`  - Has status='resolved': ${withStatus.length}\n`)

  // Show percentage
  if (resolved.length > 0) {
    const percentage = ((resolvedWithPrices.length / resolved.length) * 100).toFixed(2)
    console.log(`✅ Coverage: ${percentage}% of resolved markets have outcome_prices`)
  }

  if (resolvedWithoutPrices.length > 0) {
    console.log(`\n⚠️  Still missing outcome_prices for ${resolvedWithoutPrices.length} resolved markets`)
    console.log('\nSample of markets missing outcome_prices:')
    resolvedWithoutPrices.slice(0, 10).forEach((m) => {
      console.log(`  - ${m.condition_id} (status: ${m.status || 'null'}, winning_side: ${m.winning_side || 'null'})`)
    })
  } else {
    console.log('\n🎉 All resolved markets have outcome_prices!')
  }
}

checkStatus()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error.message)
    if (error.stack) console.error(error.stack)
    process.exit(1)
  })
