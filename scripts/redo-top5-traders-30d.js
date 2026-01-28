#!/usr/bin/env node
'use strict'

/**
 * Redo top5_traders_trades table with 30D window traders
 * 1. Delete existing table
 * 2. Get top 5 traders by 30D window
 * 3. Backfill their trades
 * 4. Backfill their markets
 * 5. Create the new table
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('='.repeat(60))
  console.log('🔄 Redoing top5_traders_trades with 30D window traders')
  console.log('='.repeat(60))
  
  // Step 1: Delete existing table
  console.log('\n🗑️  Step 1: Deleting existing top5_traders_trades table...')
  console.log('📋 Run this SQL in Supabase SQL Editor:')
  console.log('='.repeat(60))
  console.log('DROP TABLE IF EXISTS public.top5_traders_trades;')
  console.log('='.repeat(60))
  console.log('\n⚠️  Please run the SQL above, then press Enter to continue...')
  
  // Wait for user confirmation (in a real scenario, we'd use readline)
  // For now, we'll just show what needs to be done
  
  // Step 2: Get top 5 traders by 30D
  console.log('\n📊 Step 2: Getting top 5 traders by 30D window...')
  const { data: rankings, error: rankingsError } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address, rank, pnl_sum')
    .eq('window_key', '30D')
    .order('rank', { ascending: true })
    .limit(5)
  
  if (rankingsError) throw rankingsError
  
  if (!rankings || rankings.length === 0) {
    console.log('❌ No traders found')
    return
  }
  
  const wallets = rankings.map(r => r.wallet_address?.toLowerCase()).filter(Boolean)
  console.log(`✅ Found ${wallets.length} traders:`)
  rankings.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.wallet_address} - Rank: ${t.rank}, PnL: $${Number(t.pnl_sum).toFixed(2)}`)
  })
  
  // Step 3: Backfill trades
  console.log('\n📥 Step 3: Backfilling trades for these traders...')
  console.log('💡 Run: node scripts/backfill-top5-traders-latest-trades.js --window=30D')
  
  // Step 4: Create table SQL
  console.log('\n🔨 Step 4: SQL to create the new table:')
  console.log('='.repeat(60))
  console.log(`
-- Create top5_traders_trades table with 30D window traders
DROP TABLE IF EXISTS public.top5_traders_trades;

CREATE TABLE public.top5_traders_trades AS
SELECT t.*
FROM public.trades t
WHERE LOWER(t.wallet_address) IN (${wallets.map(w => `'${w}'`).join(', ')});

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_wallet_timestamp 
ON public.top5_traders_trades (wallet_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_condition_id 
ON public.top5_traders_trades (condition_id)
WHERE condition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_market_slug 
ON public.top5_traders_trades (market_slug)
WHERE market_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_top5_traders_trades_timestamp 
ON public.top5_traders_trades (timestamp DESC);

-- Add comment
COMMENT ON TABLE public.top5_traders_trades IS
  'Copy of trades table containing only top 5 traders by realized PnL rank (30-day window).';

-- Show stats
SELECT 
  COUNT(*) as total_trades,
  COUNT(DISTINCT wallet_address) as unique_traders,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade
FROM public.top5_traders_trades;
  `)
  console.log('='.repeat(60))
  
  console.log('\n✅ Summary:')
  console.log('  1. Delete existing table (SQL above)')
  console.log('  2. Backfill trades: node scripts/backfill-top5-traders-latest-trades.js --window=30D')
  console.log('  3. Create new table (SQL above)')
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
