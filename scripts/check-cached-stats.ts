#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = '5478cb0a-c638-4b40-8afc-bf44eb9092db'

async function checkCachedStats() {
  console.log('🔍 Checking cached portfolio summary for user:', USER_ID.substring(0, 8))
  console.log('=' .repeat(80))

  // Get cached portfolio summary
  const { data: cached, error } = await supabase
    .from('user_portfolio_summary')
    .select('*')
    .eq('user_id', USER_ID)
    .maybeSingle()

  if (error) {
    console.error('Error:', error)
    return
  }

  if (!cached) {
    console.log('❌ No cached summary found')
    return
  }

  console.log('\n📊 Cached Portfolio Summary:')
  console.log(`  - Total P&L: $${Number(cached.total_pnl || 0).toFixed(2)}`)
  console.log(`  - Realized P&L: $${Number(cached.realized_pnl || 0).toFixed(2)}`)
  console.log(`  - Unrealized P&L: $${Number(cached.unrealized_pnl || 0).toFixed(2)}`)
  console.log(`  - Total Volume: $${Number(cached.total_volume || 0).toFixed(2)}`)
  console.log(`  - ROI: ${Number(cached.roi || 0).toFixed(2)}%`)
  console.log(`  - Win Rate: ${Number(cached.win_rate || 0).toFixed(1)}%`)
  console.log(`  - Total Trades: ${cached.total_trades || 0}`)
  console.log(`  - Open Positions: ${cached.open_positions || 0}`)
  console.log(`  - Closed Positions: ${cached.closed_positions || 0}`)
  console.log(`  - Winning Positions: ${cached.winning_positions || 0}`)
  console.log(`  - Losing Positions: ${cached.losing_positions || 0}`)
  console.log(`  - Last Updated: ${cached.last_updated_at}`)
  console.log(`  - Calculation Version: ${cached.calculation_version}`)

  console.log('\n' + '='.repeat(80))
}

checkCachedStats().catch(console.error)
