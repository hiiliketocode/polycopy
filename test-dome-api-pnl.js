/**
 * Test Dome API PnL endpoint directly for a specific wallet
 */

import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const DOME_API_KEY = process.env.DOME_API_KEY
const BASE_URL = 'https://api.domeapi.io/v1'

if (!DOME_API_KEY) {
  console.error('❌ Missing DOME_API_KEY')
  process.exit(1)
}

const wallet = process.argv[2]?.toLowerCase().trim()

if (!wallet) {
  console.error('Usage: node test-dome-api-pnl.js <wallet_address>')
  process.exit(1)
}

async function testDomePnL() {
  console.log(`🔍 Testing Dome API PnL endpoint for: ${wallet}\n`)
  
  // Calculate date range (from Jan 1 2023 to now)
  const HISTORICAL_BASELINE = Date.UTC(2023, 0, 1) / 1000 // Jan 1 2023 UTC
  const endTime = Math.floor(Date.now() / 1000)
  const startTime = HISTORICAL_BASELINE
  
  console.log(`📅 Date range: ${new Date(startTime * 1000).toISOString()} to ${new Date(endTime * 1000).toISOString()}`)
  console.log(`   Start: ${startTime} (${new Date(startTime * 1000).toLocaleDateString()})`)
  console.log(`   End: ${endTime} (${new Date(endTime * 1000).toLocaleDateString()})\n`)
  
  // Fetch PnL series from Dome API
  const url = new URL(`${BASE_URL}/polymarket/wallet/pnl/${wallet}`)
  url.searchParams.set('granularity', 'day')
  url.searchParams.set('start_time', String(startTime))
  url.searchParams.set('end_time', String(endTime))
  
  console.log(`📡 Fetching from Dome API:`)
  console.log(`   ${url.toString()}\n`)
  
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${DOME_API_KEY}`
      }
    })
    
    if (!response.ok) {
      const text = await response.text()
      console.error(`❌ Dome API error ${response.status}:`)
      console.error(text)
      return
    }
    
    const data = await response.json()
    
    console.log('✅ Dome API Response:')
    console.log(`   Response keys: ${Object.keys(data).join(', ')}`)
    
    if (data.pnl_over_time && Array.isArray(data.pnl_over_time)) {
      const series = data.pnl_over_time
      console.log(`\n📊 PnL Series Data:`)
      console.log(`   Total data points: ${series.length}`)
      
      if (series.length > 0) {
        console.log(`\n   First 5 entries:`)
        series.slice(0, 5).forEach((entry, idx) => {
          const date = entry.timestamp ? new Date(entry.timestamp * 1000).toISOString().slice(0, 10) : 'N/A'
          console.log(`     ${idx + 1}. Date: ${date}, timestamp: ${entry.timestamp}, pnl_to_date: ${entry.pnl_to_date ?? 'N/A'}`)
        })
        
        if (series.length > 10) {
          console.log(`   ...`)
          console.log(`   Last 5 entries:`)
          series.slice(-5).forEach((entry, idx) => {
            const date = entry.timestamp ? new Date(entry.timestamp * 1000).toISOString().slice(0, 10) : 'N/A'
            console.log(`     ${series.length - 4 + idx}. Date: ${date}, timestamp: ${entry.timestamp}, pnl_to_date: ${entry.pnl_to_date ?? 'N/A'}`)
          })
        }
        
        // Calculate totals
        const latestEntry = series[series.length - 1]
        const latestPnL = latestEntry?.pnl_to_date ?? null
        
        console.log(`\n📈 Summary:`)
        console.log(`   Latest pnl_to_date: ${latestPnL !== null ? `$${latestPnL.toFixed(2)}` : 'N/A'}`)
        console.log(`   Date range: ${series[0]?.timestamp ? new Date(series[0].timestamp * 1000).toISOString().slice(0, 10) : 'N/A'} to ${latestEntry?.timestamp ? new Date(latestEntry.timestamp * 1000).toISOString().slice(0, 10) : 'N/A'}`)
        
        // Calculate daily changes (realized_pnl)
        if (series.length > 1) {
          let prevPnL = series[0].pnl_to_date ?? 0
          const dailyChanges = []
          for (let i = 1; i < series.length; i++) {
            const currentPnL = series[i].pnl_to_date ?? 0
            const dailyChange = currentPnL - prevPnL
            dailyChanges.push(dailyChange)
            prevPnL = currentPnL
          }
          
          const sumOfDailyChanges = dailyChanges.reduce((sum, change) => sum + change, 0)
          console.log(`   Sum of daily changes: $${sumOfDailyChanges.toFixed(2)}`)
          console.log(`   Latest cumulative: $${latestPnL !== null ? latestPnL.toFixed(2) : 'N/A'}`)
          
          if (Math.abs(sumOfDailyChanges - (latestPnL ?? 0)) > 0.01) {
            console.log(`   ⚠️  Sum of daily changes doesn't match latest cumulative!`)
          } else {
            console.log(`   ✅ Sum matches latest cumulative`)
          }
        }
      } else {
        console.log(`   ⚠️  No PnL data returned`)
      }
    } else {
      console.log(`   ⚠️  Unexpected response format:`)
      console.log(JSON.stringify(data, null, 2))
    }
    
    // Also check metrics endpoint
    console.log(`\n📊 Fetching wallet metrics...`)
    const metricsUrl = new URL(`${BASE_URL}/polymarket/wallet`)
    metricsUrl.searchParams.set('eoa', wallet)
    metricsUrl.searchParams.set('with_metrics', 'true')
    
    const metricsResponse = await fetch(metricsUrl.toString(), {
      headers: { 'Authorization': `Bearer ${DOME_API_KEY}` }
    })
    
    if (metricsResponse.ok) {
      const metricsData = await metricsResponse.json()
      if (metricsData.metrics) {
        console.log(`✅ Wallet Metrics:`)
        console.log(`   PnL: ${metricsData.metrics.pnl ?? 'N/A'}`)
        console.log(`   Volume: ${metricsData.metrics.volume ?? 'N/A'}`)
        console.log(`   ROI: ${metricsData.metrics.roi ?? 'N/A'}`)
      } else {
        console.log(`   ⚠️  No metrics in response`)
      }
    } else {
      console.log(`   ⚠️  Metrics endpoint returned ${metricsResponse.status}`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  }
}

testDomePnL().catch(console.error)
