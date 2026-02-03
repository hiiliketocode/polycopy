#!/usr/bin/env node
/**
 * Detailed check for January 17 P&L data to determine if it was from the cron job or backfilled
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

async function checkDetailed() {
  // Check Jan 17, 2025
  const targetDate = '2025-01-17'
  
  console.log(`\n🔍 Detailed analysis for ${targetDate}...\n`)

  // Get all records for Jan 17 with their updated_at timestamps
  const { data, error } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('wallet_address, date, realized_pnl, pnl_to_date, updated_at')
    .eq('date', targetDate)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  if (!data || data.length === 0) {
    console.log(`❌ No records found for ${targetDate}`)
    return
  }

  console.log(`Total records: ${data.length}\n`)

  // Group by updated_at to see when they were inserted/updated
  const byUpdatedAt = {}
  data.forEach(record => {
    const updatedDate = record.updated_at.substring(0, 10) // YYYY-MM-DD
    if (!byUpdatedAt[updatedDate]) {
      byUpdatedAt[updatedDate] = []
    }
    byUpdatedAt[updatedDate].push(record)
  })

  console.log('📅 Records grouped by updated_at date:')
  Object.keys(byUpdatedAt).sort().forEach(date => {
    console.log(`   ${date}: ${byUpdatedAt[date].length} records`)
  })

  // Check for records updated on Jan 17 itself (indicating cron ran that day)
  const jan17Updated = byUpdatedAt['2025-01-17'] || []
  const jan18Updated = byUpdatedAt['2025-01-18'] || []
  
  console.log('\n📊 Analysis:')
  console.log(`   Records with date=${targetDate}: ${data.length}`)
  console.log(`   Records updated on 2025-01-17: ${jan17Updated.length}`)
  console.log(`   Records updated on 2025-01-18: ${jan18Updated.length}`)

  // The cron job runs at 2 AM UTC, so Jan 17 data would be inserted around Jan 18 2 AM UTC
  // or could be inserted on Jan 17 if backfilled
  const cronWindowStart = '2025-01-18T02:00:00'
  const cronWindowEnd = '2025-01-18T03:00:00'
  
  const recordsInCronWindow = data.filter(r => {
    const updated = r.updated_at
    return updated >= cronWindowStart && updated < cronWindowEnd
  })

  console.log(`   Records updated in cron window (${cronWindowStart} - ${cronWindowEnd}): ${recordsInCronWindow.length}`)

  // Check surrounding days for comparison
  console.log('\n📅 Comparison with surrounding days:')
  
  for (const checkDate of ['2025-01-16', '2025-01-17', '2025-01-18']) {
    const { count } = await supabase
      .from('wallet_realized_pnl_daily')
      .select('*', { count: 'exact', head: true })
      .eq('date', checkDate)
    
    const { data: sampleData } = await supabase
      .from('wallet_realized_pnl_daily')
      .select('updated_at')
      .eq('date', checkDate)
      .limit(1)
    
    const sampleUpdated = sampleData && sampleData[0] ? sampleData[0].updated_at.substring(0, 10) : 'N/A'
    
    console.log(`   ${checkDate}: ${count || 0} records (sample updated: ${sampleUpdated})`)
  }

  // Final verdict
  console.log('\n' + '='.repeat(60))
  if (jan17Updated.length > 0 || recordsInCronWindow.length > 0) {
    console.log('✅ VERDICT: Data appears to have been inserted on or near Jan 17/18')
    console.log('   The cron job likely ran successfully.')
  } else {
    const mostRecentUpdate = Object.keys(byUpdatedAt).sort().pop()
    console.log(`⚠️  VERDICT: Records were updated on ${mostRecentUpdate}`)
    console.log('   This suggests the data may have been backfilled after the outage.')
    console.log('   The cron job may not have run on Jan 17 itself.')
  }
  console.log('='.repeat(60) + '\n')
}

// Also check if user meant Jan 17, 2026
async function checkBothYears() {
  console.log('Checking both 2025-01-17 and 2026-01-17...\n')
  
  for (const year of [2025, 2026]) {
    const date = `${year}-01-17`
    const { count } = await supabase
      .from('wallet_realized_pnl_daily')
      .select('*', { count: 'exact', head: true })
      .eq('date', date)
    
    if (count > 0) {
      const { data: sample } = await supabase
        .from('wallet_realized_pnl_daily')
        .select('updated_at')
        .eq('date', date)
        .limit(1)
      
      const sampleUpdated = sample && sample[0] ? sample[0].updated_at.substring(0, 10) : 'N/A'
      console.log(`   ${date}: ${count} records (sample updated: ${sampleUpdated})`)
    }
  }
  console.log('')
}

checkBothYears()
  .then(() => checkDetailed())
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
