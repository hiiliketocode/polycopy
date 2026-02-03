/**
 * Test the realized PnL API endpoint directly
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase env vars')
  process.exit(1)
}

const wallet = process.argv[2]?.toLowerCase().trim()

if (!wallet) {
  console.error('Usage: node test-realized-pnl-api.js <wallet_address>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function testApi() {
  console.log(`🔍 Testing realized PnL API for: ${wallet}\n`)
  
  const normalizedWallet = wallet.toLowerCase()
  
  // Fetch all rows using pagination (Supabase default limit is 1000)
  let allRows = []
  let offset = 0
  const pageSize = 1000
  let hasMore = true
  
  while (hasMore) {
    const { data: pageRows, error: pageError } = await supabase
      .from('wallet_realized_pnl_daily')
      .select('date, realized_pnl, pnl_to_date')
      .eq('wallet_address', normalizedWallet)
      .order('date', { ascending: true })
      .range(offset, offset + pageSize - 1)
    
    if (pageError) {
      console.error('❌ Query error:', pageError)
      return
    }
    
    if (!pageRows || pageRows.length === 0) {
      hasMore = false
    } else {
      allRows.push(...pageRows)
      offset += pageSize
      if (pageRows.length < pageSize) {
        hasMore = false
      }
    }
  }
  
  const rows = allRows
  console.log(`✅ Found ${rows.length} rows\n`)
  
  if (rows && rows.length > 0) {
    console.log('📊 Latest 5 rows:')
    rows.slice(-5).forEach((row, i) => {
      console.log(`  ${rows.length - 4 + i}. ${row.date}: realized=${row.realized_pnl}, pnl_to_date=${row.pnl_to_date}`)
    })
    
    const latest = rows[rows.length - 1]
    console.log(`\n📈 Latest row:`)
    console.log(`   Date: ${latest.date}`)
    console.log(`   Realized PnL: ${latest.realized_pnl}`)
    console.log(`   PnL to Date: ${latest.pnl_to_date}`)
    
    // Simulate API processing
    const parsed = []
    for (const row of rows) {
      if (!row?.date) continue
      const realized = Number(row.realized_pnl ?? 0)
      if (!Number.isFinite(realized)) continue
      const cumulative = row.pnl_to_date === null || row.pnl_to_date === undefined
        ? null
        : Number(row.pnl_to_date)
      parsed.push({
        date: row.date,
        realized_pnl: realized,
        pnl_to_date: Number.isFinite(cumulative ?? 0) ? cumulative : null
      })
    }
    
    console.log(`\n🔨 After processing:`)
    console.log(`   Total parsed rows: ${parsed.length}`)
    if (parsed.length > 0) {
      const latestParsed = parsed[parsed.length - 1]
      console.log(`   Latest parsed: date=${latestParsed.date}, realized=${latestParsed.realized_pnl}, pnl_to_date=${latestParsed.pnl_to_date}`)
      
      // Test All Time calculation
      if (latestParsed.pnl_to_date !== null && Number.isFinite(latestParsed.pnl_to_date)) {
        console.log(`\n✅ All Time P&L would be: $${latestParsed.pnl_to_date.toFixed(2)}`)
      } else {
        console.log(`\n⚠️  Latest row has null/invalid pnl_to_date`)
        const sum = parsed.reduce((acc, row) => acc + (row.realized_pnl || 0), 0)
        console.log(`   Fallback sum: $${sum.toFixed(2)}`)
      }
    }
  } else {
    console.log('⚠️  No rows found')
  }
}

testApi().catch(console.error)
