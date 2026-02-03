#!/usr/bin/env node
/**
 * Final check for January 17, 2026 (assuming that's the date in question)
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

async function checkJan17_2026() {
  const targetDate = '2026-01-17'
  
  console.log(`\n🔍 Checking January 17, 2026 P&L data...\n`)
  console.log('   (Assuming "yesterday" refers to 2026-01-17)\n')

  // Check target date
  const { count: count17, error: countError } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('*', { count: 'exact', head: true })
    .eq('date', targetDate)

  if (countError) {
    console.error('❌ Error:', countError)
    return
  }

  // Get sample to see updated_at pattern
  const { data: sample17 } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('wallet_address, date, realized_pnl, pnl_to_date, updated_at')
    .eq('date', targetDate)
    .order('updated_at', { ascending: false })
    .limit(10)

  // Group by updated_at date
  const byUpdatedAt = {}
  if (sample17) {
    sample17.forEach(r => {
      const date = r.updated_at.substring(0, 10)
      byUpdatedAt[date] = (byUpdatedAt[date] || 0) + 1
    })
  }

  // Check surrounding dates for comparison
  const dates = ['2026-01-16', '2026-01-17', '2026-01-18', '2026-01-19']
  const results = {}

  for (const date of dates) {
    const { count } = await supabase
      .from('wallet_realized_pnl_daily')
      .select('*', { count: 'exact', head: true })
      .eq('date', date)
    
    const { data: sample } = await supabase
      .from('wallet_realized_pnl_daily')
      .select('updated_at')
      .eq('date', date)
      .limit(1)
      .order('updated_at', { ascending: false })
    
    results[date] = {
      count: count || 0,
      sampleUpdated: sample && sample[0] ? sample[0].updated_at.substring(0, 10) : null
    }
  }

  console.log('📊 Record counts by date:')
  console.log('')
  for (const [date, info] of Object.entries(results)) {
    const marker = date === targetDate ? ' ⬅️ TARGET' : ''
    console.log(`   ${date}: ${info.count} records (sample updated: ${info.sampleUpdated || 'N/A'})${marker}`)
  }

  console.log('')
  console.log('='.repeat(60))
  
  if (count17 === 0) {
    console.log('❌ ISSUE FOUND: No P&L data for January 17, 2026!')
    console.log('')
    console.log('   The cron job likely did NOT run on Jan 17, 2026.')
    console.log('   Recommendation: Run the backfill script manually.')
  } else {
    console.log(`✅ Data found for January 17, 2026: ${count17} records`)
    console.log('')
    
    // Check if data was updated on or after Jan 17
    const updatedDates = Object.keys(byUpdatedAt)
    const latestUpdate = updatedDates.sort().pop()
    
    if (latestUpdate && latestUpdate >= '2026-01-17') {
      console.log(`   ✅ Records were updated on ${latestUpdate}`)
      console.log('   The cron job appears to have run successfully.')
    } else if (latestUpdate) {
      console.log(`   ⚠️  Records were last updated on ${latestUpdate}`)
      console.log('   This may indicate the data was backfilled, but the job did run.')
    }
    
    // Compare with surrounding days
    const count16 = results['2026-01-16'].count
    const count18 = results['2026-01-18'].count
    
    if (count16 > 0 && count18 > 0) {
      const avg = Math.round((count16 + count18) / 2)
      if (count17 < avg * 0.8) {
        console.log(`   ⚠️  Warning: Record count (${count17}) is lower than surrounding days (avg: ${avg})`)
        console.log('   This might indicate some wallets were missed.')
      } else {
        console.log(`   ✅ Record count (${count17}) is consistent with surrounding days`)
      }
    }
  }
  
  console.log('='.repeat(60))
  console.log('')
}

checkJan17_2026()
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
