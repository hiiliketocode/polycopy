#!/usr/bin/env node
'use strict'

/**
 * Create a copy of trades table with only top N traders' trades.
 * 
 * This creates a much smaller table that's easier to work with for ML modeling.
 * 
 * Usage:
 *   node scripts/create-top-traders-trades-table.js --top-n 20 --window ALL
 *   node scripts/create-top-traders-trades-table.js --top-n 20 --window ALL --table-name top20_traders_trades
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const TOP_N = parseInt(process.argv.find(arg => arg.startsWith('--top-n='))?.split('=')[1] || '20')
const WINDOW = process.argv.find(arg => arg.startsWith('--window='))?.split('=')[1] || 'ALL'
const TABLE_NAME = process.argv.find(arg => arg.startsWith('--table-name='))?.split('=')[1] || `top${TOP_N}_traders_trades`

function toNumber(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function getTopTradersByROI(limit, window) {
  console.log(`📊 Fetching top ${limit} traders by realized ROI (window: ${window})...`)
  
  const { data: rankings, error: rankingsError } = await supabase
    .from('wallet_realized_pnl_rankings')
    .select('wallet_address, pnl_sum, rank')
    .eq('window_key', window)
    .order('rank', { ascending: true })
    .limit(limit * 2)
  
  if (rankingsError) throw rankingsError
  
  const wallets = (rankings || []).map(r => r.wallet_address?.toLowerCase()).filter(Boolean)
  if (wallets.length === 0) return []
  
  const { data: dailyData, error: dailyError } = await supabase
    .from('wallet_realized_pnl_daily')
    .select('wallet_address, notional_total')
    .in('wallet_address', wallets)
  
  if (dailyError) throw dailyError
  
  const volumeMap = new Map()
  ;(dailyData || []).forEach(row => {
    const wallet = row.wallet_address?.toLowerCase()
    if (!wallet) return
    const vol = toNumber(row.notional_total) || 0
    volumeMap.set(wallet, (volumeMap.get(wallet) || 0) + vol)
  })
  
  const tradersWithROI = (rankings || [])
    .map(r => {
      const wallet = r.wallet_address?.toLowerCase()
      const pnl = toNumber(r.pnl_sum) || 0
      const volume = volumeMap.get(wallet) || 0
      const roi = volume > 0 ? (pnl / volume) * 100 : 0
      return { wallet, pnl, volume, roi, rank: r.rank }
    })
    .filter(t => t.volume > 0)
    .sort((a, b) => b.roi - a.roi)
    .slice(0, limit)
  
  console.log(`✅ Found ${tradersWithROI.length} traders`)
  return tradersWithROI
}

async function getTradeCount(wallets) {
  const { count, error } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true })
    .in('wallet_address', wallets)
  
  if (error) throw error
  return count || 0
}

async function createTableSQL(tableName, wallets) {
  const walletsList = wallets.map(w => `'${w.toLowerCase()}'`).join(',')
  
  return `
-- Create table with top ${TOP_N} traders' trades
-- Created: ${new Date().toISOString()}
-- Traders: ${wallets.length}

DROP TABLE IF EXISTS public.${tableName};

CREATE TABLE public.${tableName} AS
SELECT * 
FROM public.trades
WHERE LOWER(wallet_address) IN (${walletsList});

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_${tableName}_wallet_timestamp 
ON public.${tableName} (wallet_address, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_${tableName}_condition_id 
ON public.${tableName} (condition_id)
WHERE condition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_${tableName}_market_slug 
ON public.${tableName} (market_slug)
WHERE market_slug IS NOT NULL;

-- Add comment
COMMENT ON TABLE public.${tableName} IS
  'Copy of trades table containing only top ${TOP_N} traders by realized ROI (window: ${WINDOW}). Created ${new Date().toISOString()}.';

-- Show stats
SELECT 
  COUNT(*) as total_trades,
  COUNT(DISTINCT wallet_address) as unique_traders,
  MIN(timestamp) as earliest_trade,
  MAX(timestamp) as latest_trade
FROM public.${tableName};
`
}

async function createTableViaSQL(tableName, wallets) {
  const sql = await createTableSQL(tableName, wallets)
  
  // Execute via RPC if available, otherwise return SQL for manual execution
  const { error } = await supabase.rpc('exec_sql', { sql })
  
  if (error) {
    if (error.message.includes('exec_sql') || error.message.includes('does not exist')) {
      // Return SQL for manual execution
      return { sql, needsManualExecution: true }
    }
    throw error
  }
  
  return { sql, needsManualExecution: false }
}

async function createTableViaInsert(tableName, wallets) {
  console.log(`\n📦 Creating table via INSERT (this may take a while)...`)
  
  // First, create empty table with same structure
  const { error: createError } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE TABLE IF NOT EXISTS public.${tableName} (LIKE public.trades INCLUDING ALL);
      TRUNCATE TABLE public.${tableName};
    `
  })
  
  if (createError && !createError.message.includes('exec_sql')) {
    throw createError
  }
  
  // If exec_sql doesn't work, we'll need to do it differently
  if (createError && createError.message.includes('exec_sql')) {
    return { needsManualExecution: true, sql: await createTableSQL(tableName, wallets) }
  }
  
  // Insert trades in batches
  const BATCH_SIZE = 10000
  let offset = 0
  let totalInserted = 0
  
  while (true) {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .in('wallet_address', wallets)
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)
    
    if (error) throw error
    if (!data || data.length === 0) break
    
    // Insert batch
    const { error: insertError } = await supabase
      .from(tableName)
      .insert(data)
    
    if (insertError) throw insertError
    
    totalInserted += data.length
    console.log(`  ✅ Inserted ${totalInserted.toLocaleString()} trades...`)
    
    offset += BATCH_SIZE
    if (data.length < BATCH_SIZE) break
  }
  
  return { totalInserted, needsManualExecution: false }
}

async function main() {
  console.log('='.repeat(60))
  console.log('📊 Creating top traders trades table')
  console.log('='.repeat(60))
  console.log(`👥 Top N: ${TOP_N}`)
  console.log(`📅 Window: ${WINDOW}`)
  console.log(`📋 Table name: ${TABLE_NAME}`)
  console.log('')
  
  try {
    // Get top traders
    const traders = await getTopTradersByROI(TOP_N, WINDOW)
    
    if (traders.length === 0) {
      console.log('❌ No traders found')
      return
    }
    
    const wallets = traders.map(t => t.wallet.toLowerCase())
    
    console.log('\n📋 Top traders:')
    traders.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.wallet} - ROI: ${t.roi.toFixed(2)}%, PnL: $${t.pnl.toFixed(2)}, Volume: $${t.volume.toFixed(2)}`)
    })
    
    // Get trade count
    const tradeCount = await getTradeCount(wallets)
    console.log(`\n📊 Total trades: ${tradeCount.toLocaleString()}`)
    
    if (tradeCount === 0) {
      console.log('❌ No trades found for these traders')
      return
    }
    
    // Try to create table via SQL (fastest)
    console.log(`\n🔨 Creating table: ${TABLE_NAME}...`)
    const result = await createTableViaSQL(TABLE_NAME, wallets)
    
    if (result.needsManualExecution) {
      console.log('\n⚠️  Cannot execute SQL directly. Please run this SQL manually:')
      console.log('\n' + '='.repeat(60))
      console.log(result.sql)
      console.log('='.repeat(60))
      console.log('\nOr use Supabase SQL editor to execute the above SQL.')
      return
    }
    
    // Get final stats
    const { data: stats, error: statsError } = await supabase
      .from(TABLE_NAME)
      .select('*', { count: 'exact', head: true })
    
    if (!statsError && stats) {
      console.log('\n' + '='.repeat(60))
      console.log('✅ Table created successfully!')
      console.log('='.repeat(60))
      console.log(`📋 Table: ${TABLE_NAME}`)
      console.log(`📊 Rows: ${(stats.count || 0).toLocaleString()}`)
      console.log(`👥 Traders: ${traders.length}`)
      console.log('')
      console.log('📝 Usage:')
      console.log(`   SELECT * FROM ${TABLE_NAME} LIMIT 10;`)
      console.log(`   SELECT wallet_address, COUNT(*) FROM ${TABLE_NAME} GROUP BY wallet_address;`)
      console.log('='.repeat(60))
    }
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
