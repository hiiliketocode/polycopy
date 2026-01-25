#!/usr/bin/env node

/**
 * Check if a wallet appears in Polymarket leaderboard.
 * Usage: node scripts/check-leaderboard-wallet.js 0xd82079c0d6b837bad90abf202befc079da5819f6
 */

const wallet = process.argv[2]
if (!wallet) {
  console.error('Usage: node scripts/check-leaderboard-wallet.js <wallet_address>')
  process.exit(1)
}

const normalized = wallet.toLowerCase().trim()

async function checkLeaderboard() {
  console.log(`\n🔍 Checking Polymarket leaderboard for: ${normalized}\n`)

  // Check top 1000 (5 pages × 200)
  for (let page = 0; page < 5; page++) {
    const offset = page * 200
    const url = `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=PNL&limit=200&offset=${offset}&category=overall`
    
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)' },
        cache: 'no-store'
      })

      if (!response.ok) {
        console.error(`❌ Error fetching page ${page + 1}: ${response.status}`)
        continue
      }

      const entries = await response.json()
      if (!Array.isArray(entries)) {
        console.error(`❌ Invalid response format on page ${page + 1}`)
        continue
      }

      const found = entries.find(entry => 
        entry.proxyWallet?.toLowerCase() === normalized
      )

      if (found) {
        console.log(`✅ Found in leaderboard (page ${page + 1}, rank ${found.rank || 'N/A'}):`)
        console.log(`   - User Name: ${found.userName || 'N/A'}`)
        console.log(`   - PnL: ${found.pnl || 0}`)
        console.log(`   - Volume: ${found.vol || 0}`)
        console.log(`   - Total Trades: ${found.totalTrades || found.total_trades || 'N/A'}`)
        return
      }

      if (entries.length < 200) break
    } catch (err) {
      console.error(`❌ Error on page ${page + 1}:`, err.message)
    }
  }

  console.log('❌ Wallet NOT found in top 1000 leaderboard')
  console.log('\n💡 This wallet may:')
  console.log('   1. Not be in the top 1000 traders')
  console.log('   2. Have zero or negative PnL')
  console.log('   3. Not have enough trading activity')
}

checkLeaderboard().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
