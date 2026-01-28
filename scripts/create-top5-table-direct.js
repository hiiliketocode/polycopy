#!/usr/bin/env node
'use strict'

/**
 * Create top5_traders_trades table directly by fetching all trades
 * and creating the table structure
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
  console.log('🔨 Creating top5_traders_trades table')
  console.log('='.repeat(60))
  
  // Step 1: Get top 5 traders
  console.log('\n📊 Getting top 5 traders...')
  const { data: rankings, error: rankingsError } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address')
    .eq('window_key', 'ALL')
    .order('rank', { ascending: true })
    .limit(5)
  
  if (rankingsError) throw rankingsError
  
  if (!rankings || rankings.length === 0) {
    console.log('❌ No traders found')
    return
  }
  
  const wallets = rankings.map(r => r.wallet_address?.toLowerCase()).filter(Boolean)
  console.log(`✅ Found ${wallets.length} traders: ${wallets.join(', ')}`)
  
  // Step 2: Get trade count
  console.log('\n📊 Counting trades...')
  const { count, error: countError } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true })
    .in('wallet_address', wallets)
  
  if (countError) throw countError
  console.log(`✅ Total trades: ${count?.toLocaleString() || 0}`)
  
  if (!count || count === 0) {
    console.log('❌ No trades found for these traders')
    return
  }
  
  // Step 3: Since we can't create tables via JS client, output SQL to run
  console.log('\n📋 SQL to execute in Supabase SQL Editor:')
  console.log('='.repeat(60))
  console.log(`
-- Create top5_traders_trades table
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
  'Copy of trades table containing only top 5 traders by realized PnL rank (ALL window).';

-- Show stats
SELECT 
  COUNT(*) as total_trades,
  COUNT(DISTINCT wallet_address) as unique_traders,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade
FROM public.top5_traders_trades;
  `)
  console.log('='.repeat(60))
  console.log('\n💡 Copy and paste the SQL above into Supabase SQL Editor to create the table.')
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
