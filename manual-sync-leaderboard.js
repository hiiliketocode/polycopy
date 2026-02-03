/**
 * Manually trigger the sync-trader-leaderboard cron job
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CRON_SECRET = process.env.CRON_SECRET
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase env vars')
  process.exit(1)
}

if (!CRON_SECRET) {
  console.error('❌ Missing CRON_SECRET env var')
  process.exit(1)
}

async function triggerSync() {
  console.log('🚀 Triggering sync-trader-leaderboard cron job...\n')
  
  const url = `${SITE_URL}/api/cron/sync-trader-leaderboard`
  console.log(`📡 Calling: ${url}`)
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`HTTP ${response.status}: ${text}`)
    }

    const result = await response.json()
    
    console.log('\n✅ Sync completed successfully!\n')
    console.log('📊 Results:')
    console.log(`   Fetched: ${result.fetched} traders`)
    console.log(`   Upserted: ${result.upserted} traders`)
    console.log(`   New wallets: ${result.newWallets}`)
    if (result.newWalletList && result.newWalletList.length > 0) {
      console.log(`\n   Sample new wallets:`)
      result.newWalletList.slice(0, 10).forEach((wallet, idx) => {
        console.log(`     ${idx + 1}. ${wallet}`)
      })
    }
    console.log(`\n   Parameters:`)
    console.log(`     timePeriod: ${result.timePeriod}`)
    console.log(`     orderBy: ${result.orderBy}`)
    console.log(`     category: ${result.category}`)
    console.log(`     limit: ${result.limit}`)
    console.log(`     pages: ${result.pages}`)
    
  } catch (error) {
    console.error('\n❌ Error triggering sync:', error.message)
    if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
      console.error('\n💡 Tip: Make sure your Next.js dev server is running (npm run dev)')
      console.error('   Or use the production URL by setting NEXT_PUBLIC_SITE_URL')
    }
    process.exit(1)
  }
}

triggerSync()
