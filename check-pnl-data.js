/**
 * Check PnL data for a specific trader
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const wallet = process.argv[2]?.toLowerCase().trim()

if (!wallet) {
  console.error('Usage: node check-pnl-data.js <wallet_address>')
  process.exit(1)
}

async function checkPnLData() {
  console.log(`🔍 Checking PnL data for: ${wallet}\n`)
  
  // Check traders table
  const { data: trader } = await supabase
    .from('traders')
    .select('wallet_address, pnl, volume, roi')
    .eq('wallet_address', wallet)
    .single()
  
  console.log('📊 Traders Table (Polymarket Leaderboard Data):')
  if (trader) {
    console.log(`   PnL: $${trader.pnl?.toLocaleString() ?? 'N/A'}`)
    console.log(`   Volume: $${trader.volume?.toLocaleString() ?? 'N/A'}`)
    console.log(`   ROI: ${trader.roi ?? 'N/A'}%`)
  } else {
    console.log('   Not found')
  }
  
  // Check realized PnL daily table
  const { data: pnlRows, error } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('date, realized_pnl, pnl_to_date')
    .eq('wallet_address', wallet)
    .order('date', { ascending: true })
  
  console.log('\n📈 Wallet Realized PnL Daily Table:')
  if (error) {
    console.error('   Error:', error.message)
  } else if (!pnlRows || pnlRows.length === 0) {
    console.log('   No data found')
  } else {
    console.log(`   Total rows: ${pnlRows.length}`)
    console.log(`   Date range: ${pnlRows[0]?.date} to ${pnlRows[pnlRows.length - 1]?.date}`)
    
    // Calculate totals
    const totalRealized = pnlRows.reduce((sum, row) => sum + (Number(row.realized_pnl) || 0), 0)
    const latestCumulative = pnlRows[pnlRows.length - 1]?.pnl_to_date 
      ? Number(pnlRows[pnlRows.length - 1].pnl_to_date) 
      : null
    
    console.log(`   Sum of realized_pnl: $${totalRealized.toFixed(2)}`)
    console.log(`   Latest pnl_to_date: ${latestCumulative !== null ? `$${latestCumulative.toFixed(2)}` : 'N/A'}`)
    
    // Show first and last 5 rows
    console.log('\n   First 5 rows:')
    pnlRows.slice(0, 5).forEach((row, idx) => {
      console.log(`     ${idx + 1}. ${row.date}: realized=${Number(row.realized_pnl).toFixed(2)}, cumulative=${row.pnl_to_date ? Number(row.pnl_to_date).toFixed(2) : 'N/A'}`)
    })
    
    if (pnlRows.length > 10) {
      console.log('   ...')
      console.log('   Last 5 rows:')
      pnlRows.slice(-5).forEach((row, idx) => {
        console.log(`     ${pnlRows.length - 4 + idx}. ${row.date}: realized=${Number(row.realized_pnl).toFixed(2)}, cumulative=${row.pnl_to_date ? Number(row.pnl_to_date).toFixed(2) : 'N/A'}`)
      })
    }
    
    // Check for gaps
    const dates = pnlRows.map(r => r.date).sort()
    const startDate = new Date(dates[0])
    const endDate = new Date(dates[dates.length - 1])
    const expectedDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
    console.log(`\n   Expected days: ${expectedDays}, Actual rows: ${pnlRows.length}`)
    if (expectedDays > pnlRows.length) {
      console.log(`   ⚠️  Missing ${expectedDays - pnlRows.length} days of data`)
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('💡 Analysis:')
  if (trader && pnlRows && pnlRows.length > 0) {
    const traderPnL = trader.pnl ?? 0
    const realizedSum = pnlRows.reduce((sum, row) => sum + (Number(row.realized_pnl) || 0), 0)
    const latestCumulative = pnlRows[pnlRows.length - 1]?.pnl_to_date 
      ? Number(pnlRows[pnlRows.length - 1].pnl_to_date) 
      : null
    
    console.log(`   Traders table PnL: $${traderPnL.toFixed(2)}`)
    console.log(`   Sum of realized_pnl: $${realizedSum.toFixed(2)}`)
    console.log(`   Latest cumulative: ${latestCumulative !== null ? `$${latestCumulative.toFixed(2)}` : 'N/A'}`)
    
    if (Math.abs(traderPnL - realizedSum) > 100) {
      console.log(`\n   ⚠️  MISMATCH: Traders table shows $${traderPnL.toFixed(2)} but sum of realized_pnl is $${realizedSum.toFixed(2)}`)
      console.log(`   This suggests the realized PnL data is incomplete or starts from a later date.`)
      if (latestCumulative !== null && Math.abs(traderPnL - latestCumulative) < 100) {
        console.log(`   ✅ However, latest cumulative (${latestCumulative.toFixed(2)}) matches traders table`)
        console.log(`   The issue is that we're summing realized_pnl instead of using pnl_to_date`)
      }
    } else {
      console.log(`   ✅ Values match`)
    }
  }
}

checkPnLData().catch(console.error)
