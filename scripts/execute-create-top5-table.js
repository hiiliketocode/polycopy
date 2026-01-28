#!/usr/bin/env node
'use strict'

/**
 * Execute SQL to create top5_traders_trades table
 * Uses the migration SQL and executes it via Supabase
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

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
  
  // Read the migration SQL
  const migrationPath = path.join(__dirname, '../supabase/migrations/20260126_create_top5_traders_trades.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')
  
  // Since we can't execute DDL via JS client, we'll use the simplified approach
  // Get top 5 traders first
  console.log('\n📊 Getting top 5 traders...')
  const { data: rankings } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address')
    .eq('window_key', 'ALL')
    .order('rank', { ascending: true })
    .limit(5)
  
  if (!rankings || rankings.length === 0) {
    console.log('❌ No traders found')
    return
  }
  
  const wallets = rankings.map(r => r.wallet_address?.toLowerCase()).filter(Boolean)
  console.log(`✅ Found ${wallets.length} traders`)
  
  // Output the SQL to execute
  console.log('\n📋 Execute this SQL in Supabase SQL Editor:\n')
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
  console.log('\n💡 Since DDL cannot be executed via the Supabase JS client,')
  console.log('   please copy the SQL above and run it in Supabase SQL Editor.')
  console.log('   Or use: supabase db push (if project is linked)')
}

main().catch(err => {
  console.error('❌ Error:', err)
  process.exit(1)
})
