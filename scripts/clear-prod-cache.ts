#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function clearProductionCache() {
  console.log('🗑️  Clearing Production Portfolio Cache')
  console.log('=' .repeat(80))

  // Delete from user_portfolio_summary table
  const { error } = await supabase
    .from('user_portfolio_summary')
    .delete()
    .eq('user_id', USER_ID)

  if (error) {
    console.error('❌ Error clearing cache:', error)
    return
  }

  console.log('✅ Cache cleared successfully!')
  console.log('\n💡 Next steps:')
  console.log('   1. Hard refresh the portfolio page (Cmd+Shift+R or Ctrl+Shift+R)')
  console.log('   2. Or visit: https://polycopy.com/portfolio')
  console.log('   3. The page will recalculate P&L with the fixed prices')
  
  console.log('\n' + '='.repeat(80))
}

clearProductionCache().catch(console.error)
