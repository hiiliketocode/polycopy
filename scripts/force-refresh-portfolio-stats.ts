/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

const envPath = path.join(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) dotenv.config({ path: envPath })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Get user ID from command line or use default
const USER_ID = process.argv[2] || process.env.USER_ID || '490723a6-e0be-4a7a-9796-45d4d09aa1bd'

async function forceRefreshPortfolioStats() {
  console.log(`🔄 Force refreshing portfolio stats for user: ${USER_ID}\n`)

  // First, check current cache
  const { data: beforeSummary } = await supabase
    .from('user_portfolio_summary')
    .select('*')
    .eq('user_id', USER_ID)
    .maybeSingle()

  if (beforeSummary) {
    console.log('📊 Current cached summary:')
    console.log(`  Total PnL: $${Number(beforeSummary.total_pnl).toFixed(2)}`)
    console.log(`  Realized PnL: $${Number(beforeSummary.realized_pnl).toFixed(2)}`)
    console.log(`  Unrealized PnL: $${Number(beforeSummary.unrealized_pnl).toFixed(2)}`)
    console.log(`  Last updated: ${beforeSummary.last_updated_at}`)
    console.log('')
  } else {
    console.log('📊 No cached summary found\n')
  }

  // Delete cache entry to force recalculation
  console.log('🗑️  Deleting cache entry...')
  const { error: deleteError } = await supabase
    .from('user_portfolio_summary')
    .delete()
    .eq('user_id', USER_ID)

  if (deleteError) {
    console.error('❌ Error deleting cache:', deleteError)
    return
  }
  console.log('✅ Cache deleted\n')

  console.log('✅ Cache cleared! The next time you load the portfolio page,')
  console.log('   it will recalculate fresh stats and save them to the cache.\n')
  console.log('💡 To trigger recalculation now, refresh your portfolio page at:')
  console.log(`   https://polycopy.app/portfolio`)
  console.log('   or your preview URL\n')
}

forceRefreshPortfolioStats()
  .then(() => {
    console.log('✅ Done!')
    process.exit(0)
  })
  .catch((e) => {
    console.error('\n❌ Error:', e)
    process.exit(1)
  })
