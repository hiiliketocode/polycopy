#!/usr/bin/env node

/**
 * Check PnL data for a wallet directly from Dome API.
 * Usage: node scripts/check-dome-pnl.js 0xd82079c0d6b837bad90abf202befc079da5819f6
 */

require('dotenv').config({ path: '.env.local' })

const DOME_API_KEY = process.env.DOME_API_KEY
const BASE_URL = 'https://api.domeapi.io/v1'

if (!DOME_API_KEY) {
  console.error('Missing DOME_API_KEY')
  process.exit(1)
}

const wallet = process.argv[2]
if (!wallet) {
  console.error('Usage: node scripts/check-dome-pnl.js <wallet_address>')
  process.exit(1)
}

const normalized = wallet.toLowerCase().trim()

async function checkDomePnl() {
  console.log(`\n🔍 Checking Dome API PnL for: ${normalized}\n`)

  // Calculate time range (last 2 years)
  const endTime = Math.floor(Date.now() / 1000)
  const startTime = Math.floor(Date.UTC(2023, 0, 1) / 1000) // Jan 1 2023

  const url = new URL(`${BASE_URL}/polymarket/wallet/pnl/${normalized}`)
  url.searchParams.set('granularity', 'day')
  url.searchParams.set('start_time', String(startTime))
  url.searchParams.set('end_time', String(endTime))

  console.log(`📡 Fetching from: ${url.toString()}\n`)

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${DOME_API_KEY}`
      }
    })

    if (!response.ok) {
      const text = await response.text()
      console.error(`❌ Dome API error (${response.status}): ${text}`)
      process.exit(1)
    }

    const json = await response.json()
    const series = Array.isArray(json?.pnl_over_time) ? json.pnl_over_time : []

    if (series.length === 0) {
      console.log('❌ No PnL data returned from Dome API')
      console.log('Response:', JSON.stringify(json, null, 2))
      return
    }

    console.log(`✅ Found ${series.length} data points from Dome API\n`)

    // Sort by timestamp
    const sorted = [...series].sort((a, b) => Number(a.timestamp) - Number(b.timestamp))

    // Show first 10 and last 10
    console.log('📊 First 10 data points:')
    sorted.slice(0, 10).forEach((point, i) => {
      const date = new Date(Number(point.timestamp) * 1000).toISOString().slice(0, 10)
      const pnl = Number(point.pnl_to_date ?? point.pnlToDate ?? 0)
      console.log(`   ${i + 1}. ${date}: pnl_to_date = ${pnl.toFixed(2)}`)
    })

    if (sorted.length > 20) {
      console.log('\n   ... (showing last 10) ...\n')
    }

    console.log('📊 Last 10 data points:')
    sorted.slice(-10).forEach((point, i) => {
      const date = new Date(Number(point.timestamp) * 1000).toISOString().slice(0, 10)
      const pnl = Number(point.pnl_to_date ?? point.pnlToDate ?? 0)
      console.log(`   ${sorted.length - 9 + i}. ${date}: pnl_to_date = ${pnl.toFixed(2)}`)
    })

    // Calculate realized PnL deltas
    console.log('\n📈 Realized PnL (daily deltas):')
    let prev = null
    let nonZeroCount = 0
    let totalRealized = 0

    for (let i = 0; i < sorted.length; i++) {
      const point = sorted[i]
      const ts = Number(point.timestamp)
      const cumulative = Number(point.pnl_to_date ?? point.pnlToDate ?? NaN)

      if (!Number.isFinite(ts) || !Number.isFinite(cumulative)) continue

      if (prev === null) {
        prev = cumulative
        continue
      }

      const realized = cumulative - prev
      prev = cumulative
      const date = new Date(ts * 1000).toISOString().slice(0, 10)

      if (Math.abs(realized) > 0.01) {
        nonZeroCount++
        totalRealized += realized
        if (nonZeroCount <= 20) {
          console.log(`   ${date}: ${realized > 0 ? '+' : ''}${realized.toFixed(2)}`)
        }
      }
    }

    console.log(`\n📊 Summary:`)
    console.log(`   - Total data points: ${sorted.length}`)
    console.log(`   - Days with non-zero realized PnL: ${nonZeroCount}`)
    console.log(`   - Total realized PnL: ${totalRealized > 0 ? '+' : ''}${totalRealized.toFixed(2)}`)
    console.log(`   - Latest cumulative PnL: ${prev !== null ? prev.toFixed(2) : 'N/A'}`)

    // Check if all are zeros
    if (nonZeroCount === 0) {
      console.log('\n⚠️  WARNING: All realized PnL values are zero or near-zero!')
      console.log('   This could mean:')
      console.log('   1. The wallet has no trading activity')
      console.log('   2. The wallet has only break-even trades')
      console.log('   3. There is an issue with Dome API data for this wallet')
    }

  } catch (err) {
    console.error('❌ Error:', err.message)
    if (err.stack) console.error(err.stack)
    process.exit(1)
  }
}

checkDomePnl().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
