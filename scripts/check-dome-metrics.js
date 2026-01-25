#!/usr/bin/env node

/**
 * Check wallet metrics from Dome API.
 * Usage: node scripts/check-dome-metrics.js 0xd82079c0d6b837bad90abf202befc079da5819f6
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
  console.error('Usage: node scripts/check-dome-metrics.js <wallet_address>')
  process.exit(1)
}

const normalized = wallet.toLowerCase().trim()

async function checkDomeMetrics() {
  console.log(`\n🔍 Checking Dome API metrics for: ${normalized}\n`)

  const url = new URL(`${BASE_URL}/polymarket/wallet`)
  url.searchParams.set('eoa', normalized)
  url.searchParams.set('with_metrics', 'true')

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
    
    console.log('📊 Wallet Metrics from Dome API:')
    console.log(JSON.stringify(json, null, 2))

    if (json.metrics) {
      console.log('\n📈 Key Metrics:')
      console.log(`   - Volume: ${json.metrics.volume ?? json.metrics.vol ?? 'N/A'}`)
      console.log(`   - Total Trades: ${json.metrics.total_trades ?? json.metrics.totalTrades ?? 'N/A'}`)
      console.log(`   - Markets Traded: ${json.metrics.markets_traded ?? json.metrics.marketsTraded ?? 'N/A'}`)
      console.log(`   - PnL: ${json.metrics.pnl ?? 'N/A'}`)
      console.log(`   - Win Rate: ${json.metrics.win_rate ?? json.metrics.winRate ?? 'N/A'}`)
    }

  } catch (err) {
    console.error('❌ Error:', err.message)
    if (err.stack) console.error(err.stack)
    process.exit(1)
  }
}

checkDomeMetrics().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
