#!/usr/bin/env node
/**
 * Check if P&L data exists for January 17, 2025
 * This checks if the daily cron job ran successfully after the database outage
 */

require('dotenv').config({ path: '.env.local' })

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkPnlDataForDate(date) {
  console.log(`\n📊 Checking P&L data for ${date}...\n`)

  // Check total records for this date
  const { count, error: countError } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('*', { count: 'exact', head: true })
    .eq('date', date)

  if (countError) {
    console.error('❌ Error counting records:', countError)
    return null
  }

  console.log(`   Total records for ${date}: ${count || 0}`)

  // Get sample records to see actual data
  const { data, error } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('wallet_address, date, realized_pnl, pnl_to_date, updated_at')
    .eq('date', date)
    .order('updated_at', { ascending: false })
    .limit(5)

  if (error) {
    console.error('❌ Error fetching sample records:', error)
    return null
  }

  if (data && data.length > 0) {
    console.log(`\n   Sample records (showing first 5):`)
    data.forEach((record, idx) => {
      console.log(`   ${idx + 1}. Wallet: ${record.wallet_address.substring(0, 10)}...`)
      console.log(`      Date: ${record.date}`)
      console.log(`      Realized PnL: ${record.realized_pnl}`)
      console.log(`      PnL to Date: ${record.pnl_to_date}`)
      console.log(`      Updated At: ${record.updated_at}`)
      console.log('')
    })
  } else {
    console.log(`   ⚠️  No records found for ${date}`)
  }

  return count || 0
}

async function compareDates() {
  const jan17 = '2025-01-17'
  const jan16 = '2025-01-16'
  const jan18 = '2025-01-18'

  console.log('🔍 Checking P&L data for January 17, 2025 and surrounding days...')
  console.log('   This will help determine if the cron job missed Jan 17th\n')

  const [count17, count16, count18] = await Promise.all([
    checkPnlDataForDate(jan17),
    checkPnlDataForDate(jan16),
    checkPnlDataForDate(jan18)
  ])

  console.log('\n' + '='.repeat(60))
  console.log('📈 Summary:')
  console.log('='.repeat(60))
  console.log(`   January 16, 2025: ${count16 || 0} records`)
  console.log(`   January 17, 2025: ${count17 || 0} records ⬅️ TARGET DATE`)
  console.log(`   January 18, 2025: ${count18 || 0} records`)
  console.log('')

  if (count17 === 0) {
    console.log('❌ ISSUE FOUND: No P&L data found for January 17, 2025!')
    console.log('   The daily cron job likely did not run or failed on that date.')
    console.log('')
    
    if (count16 > 0 && count18 > 0) {
      console.log('   ⚠️  Data exists for both Jan 16 and Jan 18, indicating a gap on Jan 17.')
      console.log('   Recommendation: Run the backfill script manually for Jan 17.')
    } else if (count16 > 0) {
      console.log('   ⚠️  Data exists for Jan 16 but not Jan 18 either.')
    }
  } else {
    console.log('✅ Data found for January 17, 2025!')
    console.log(`   The cron job appears to have run successfully (${count17} records).`)
    
    if (count16 && count18) {
      const avg = Math.round((count16 + count18) / 2)
      if (Math.abs(count17 - avg) > avg * 0.2) {
        console.log(`   ⚠️  Warning: Record count (${count17}) differs significantly from surrounding days (avg: ${avg})`)
      }
    }
  }

  console.log('')
}

compareDates()
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
