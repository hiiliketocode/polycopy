#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function addPolymarketPnlColumns() {
  console.log('🔧 Adding Polymarket P&L columns to orders table')
  console.log('=' .repeat(80))

  try {
    // Add columns using raw SQL
    const { error } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS polymarket_realized_pnl NUMERIC,
        ADD COLUMN IF NOT EXISTS polymarket_avg_price NUMERIC,
        ADD COLUMN IF NOT EXISTS polymarket_total_bought NUMERIC,
        ADD COLUMN IF NOT EXISTS polymarket_synced_at TIMESTAMPTZ;
      `
    })

    if (error) {
      console.error('❌ Error:', error)
      console.log('\n💡 Trying alternative approach...')
      
      // Try updating a test record to trigger schema update
      const { error: testError } = await supabase
        .from('orders')
        .update({
          polymarket_realized_pnl: null,
          polymarket_avg_price: null,
          polymarket_total_bought: null,
          polymarket_synced_at: null
        })
        .eq('order_id', 'test-id-that-does-not-exist')

      if (testError && !testError.message.includes('violates')) {
        console.error('Alternative approach also failed:', testError)
        console.log('\n⚠️  You may need to add these columns manually in Supabase dashboard:')
        console.log('   1. polymarket_realized_pnl (numeric)')
        console.log('   2. polymarket_avg_price (numeric)')
        console.log('   3. polymarket_total_bought (numeric)')
        console.log('   4. polymarket_synced_at (timestamptz)')
      } else {
        console.log('✅ Columns may already exist or were added')
      }
    } else {
      console.log('✅ Columns added successfully')
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error)
  }

  console.log('\n' + '='.repeat(80))
}

addPolymarketPnlColumns().catch(console.error)
