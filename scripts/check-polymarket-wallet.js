#!/usr/bin/env node

/**
 * Check wallet data directly from Polymarket API.
 * Usage: node scripts/check-polymarket-wallet.js 0xd82079c0d6b837bad90abf202befc079da5819f6
 */

const wallet = process.argv[2]
if (!wallet) {
  console.error('Usage: node scripts/check-polymarket-wallet.js <wallet_address>')
  process.exit(1)
}

const normalized = wallet.toLowerCase().trim()

async function checkPolymarketWallet() {
  console.log(`\n🔍 Checking Polymarket API for: ${normalized}\n`)

  // 1. Check positions
  console.log('1️⃣ Checking positions...')
  try {
    const positionsUrl = `https://data-api.polymarket.com/positions?user=${normalized}`
    const positionsRes = await fetch(positionsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)' },
      cache: 'no-store'
    })

    if (positionsRes.ok) {
      const positions = await positionsRes.json()
      console.log(`   ✅ Found ${Array.isArray(positions) ? positions.length : 0} positions`)
      if (Array.isArray(positions) && positions.length > 0) {
        console.log('   Sample position:', JSON.stringify(positions[0], null, 2))
      }
    } else {
      console.log(`   ❌ Error (${positionsRes.status}): ${await positionsRes.text()}`)
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`)
  }

  // 2. Check trades (data-api)
  console.log('\n2️⃣ Checking trades (data-api)...')
  try {
    const tradesUrl = `https://data-api.polymarket.com/trades?user=${normalized}&limit=50`
    const tradesRes = await fetch(tradesUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)' },
      cache: 'no-store'
    })

    if (tradesRes.ok) {
      const trades = await tradesRes.json()
      const tradesArray = Array.isArray(trades) ? trades : []
      console.log(`   ✅ Found ${tradesArray.length} trades`)
      
      if (tradesArray.length > 0) {
        // Calculate PnL from trades
        let totalPnL = 0
        let profitableTrades = 0
        let totalTrades = tradesArray.length
        
        tradesArray.forEach(trade => {
          const pnl = Number(trade.pnl || trade.realizedPnl || 0)
          totalPnL += pnl
          if (pnl > 0) profitableTrades++
        })

        console.log(`   📊 Trade Stats:`)
        console.log(`      - Total Trades: ${totalTrades}`)
        console.log(`      - Total PnL: ${totalPnL.toFixed(2)}`)
        console.log(`      - Profitable Trades: ${profitableTrades}`)
        console.log(`      - Win Rate: ${totalTrades > 0 ? ((profitableTrades / totalTrades) * 100).toFixed(1) : 0}%`)
        
        console.log(`   📋 Sample trades (first 3):`)
        tradesArray.slice(0, 3).forEach((trade, i) => {
          console.log(`      ${i + 1}. ${trade.market_title || trade.marketTitle || 'N/A'}`)
          console.log(`         PnL: ${Number(trade.pnl || trade.realizedPnl || 0).toFixed(2)}`)
          console.log(`         Timestamp: ${trade.timestamp || trade.trade_timestamp || 'N/A'}`)
        })
      } else {
        console.log('   ⚠️  No trades found')
      }
    } else {
      console.log(`   ❌ Error (${tradesRes.status}): ${await tradesRes.text()}`)
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`)
  }

  // 3. Check CLOB trades
  console.log('\n3️⃣ Checking trades (CLOB API)...')
  try {
    const clobUrl = `https://clob.polymarket.com/trades?user=${normalized}&limit=50`
    const clobRes = await fetch(clobUrl, {
      headers: { 'User-Agent': 'Polycopy' },
      cache: 'no-store'
    })

    if (clobRes.ok) {
      const clobData = await clobRes.json()
      const clobTrades = clobData.data || clobData.trades || (Array.isArray(clobData) ? clobData : [])
      console.log(`   ✅ Found ${clobTrades.length} CLOB trades`)
      
      if (clobTrades.length > 0) {
        console.log(`   📋 Sample CLOB trade:`, JSON.stringify(clobTrades[0], null, 2))
      }
    } else {
      console.log(`   ❌ Error (${clobRes.status}): ${await clobRes.text()}`)
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`)
  }

  // 4. Check leaderboard (with user filter)
  console.log('\n4️⃣ Checking leaderboard (user filter)...')
  try {
    const leaderboardUrl = `https://data-api.polymarket.com/v1/leaderboard?timePeriod=all&orderBy=PNL&limit=1&offset=0&category=overall&user=${normalized}`
    const leaderboardRes = await fetch(leaderboardUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Polycopy/1.0)' },
      cache: 'no-store'
    })

    if (leaderboardRes.ok) {
      const leaderboard = await leaderboardRes.json()
      const entries = Array.isArray(leaderboard) ? leaderboard : []
      
      if (entries.length > 0) {
        const entry = entries[0]
        console.log(`   ✅ Found in leaderboard:`)
        console.log(`      - Rank: ${entry.rank || 'N/A'}`)
        console.log(`      - User Name: ${entry.userName || 'N/A'}`)
        console.log(`      - PnL: ${entry.pnl || 0}`)
        console.log(`      - Volume: ${entry.vol || 0}`)
        console.log(`      - Total Trades: ${entry.totalTrades || entry.total_trades || 'N/A'}`)
        console.log(`      - Markets Traded: ${entry.marketsTraded || entry.markets_traded || 'N/A'}`)
      } else {
        console.log('   ❌ Not found in leaderboard (or not in top rankings)')
      }
    } else {
      console.log(`   ❌ Error (${leaderboardRes.status}): ${await leaderboardRes.text()}`)
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`)
  }

  // 5. Check our trader-stats API endpoint
  console.log('\n5️⃣ Checking via our trader-stats API...')
  try {
    // This would require running the server, so we'll skip it or note it
    console.log('   ℹ️  To check via /api/polymarket/trader-stats, run the Next.js server and call:')
    console.log(`      GET http://localhost:3000/api/polymarket/trader-stats?wallet=${normalized}`)
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`)
  }

  console.log('\n')
}

checkPolymarketWallet().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
